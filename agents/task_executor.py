"""
LangGraph task executor — FastAPI server wrapping the StateGraph.

Endpoints:
- POST /advance: advance graph by one node (suspends at HITL gates)
- GET /state: retrieve current task state
- POST /signal: send human pause/resume signal to unblock a HITL node
- GET /recover: return checkpoint for a stalled/failed task
- GET /health: health check

Persistent SQLite checkpointing. HITL nodes suspend until /signal is called
or STALL_TIMEOUT_SECONDS elapses (sets status=stalled).
"""

import asyncio
import functools
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from task_graph import build_graph, HITL_NODES
from state import TaskState, TaskStatePydantic
from transitions import validate_transition


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "task_state.db"
STALL_TIMEOUT_SECONDS = int(os.environ.get("STALL_TIMEOUT_SECONDS", "3600"))


# ─────────────────────────────────────────────────────────────────────────────
# SQLite persistence — schema migration preserves existing rows
# ─────────────────────────────────────────────────────────────────────────────

_NEW_COLUMNS: List[Tuple[str, str]] = [
    ("proof_units",        "TEXT NOT NULL DEFAULT '[]'"),
    ("human_gate_signal",  "TEXT"),
    ("retry_count",        "INTEGER NOT NULL DEFAULT 0"),
    ("error_log",          "TEXT NOT NULL DEFAULT '[]'"),
    ("paused_at",          "INTEGER"),
]


def init_db() -> None:
    """Create table if absent; add new columns without dropping existing rows."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_states (
            task_number       INTEGER PRIMARY KEY,
            current_node      TEXT NOT NULL,
            status            TEXT NOT NULL,
            branch_name       TEXT,
            pr_url            TEXT,
            proof_results     TEXT NOT NULL DEFAULT '{}',
            review_evidence   TEXT NOT NULL DEFAULT '{}',
            checkpoint_data   TEXT NOT NULL DEFAULT '{}',
            UNIQUE(task_number)
        )
    """)
    existing = {row[1] for row in cur.execute("PRAGMA table_info(task_states)")}
    for col_name, col_def in _NEW_COLUMNS:
        if col_name not in existing:
            cur.execute(f"ALTER TABLE task_states ADD COLUMN {col_name} {col_def}")
    conn.commit()
    conn.close()


def save_state(state: TaskState) -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        INSERT OR REPLACE INTO task_states (
            task_number, current_node, status, branch_name, pr_url,
            proof_results, review_evidence, checkpoint_data,
            proof_units, human_gate_signal, retry_count, error_log
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        state["task_number"],
        state["current_node"],
        state["status"],
        state.get("branch_name"),
        state.get("pr_url"),
        json.dumps(state.get("proof_results", {})),
        json.dumps(state.get("review_evidence", {})),
        json.dumps(state.get("checkpoint_data", {})),
        json.dumps(state.get("proof_units", [])),
        state.get("human_gate_signal"),
        state.get("retry_count", 0),
        json.dumps(state.get("error_log", [])),
    ))
    conn.commit()
    conn.close()


def load_state(task_number: int) -> Optional[TaskState]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT current_node, status, branch_name, pr_url,
               proof_results, review_evidence, checkpoint_data,
               proof_units, human_gate_signal, retry_count, error_log
        FROM task_states WHERE task_number = ?
    """, (task_number,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    node, status, branch, pr, proofs, reviews, checkpoint, \
        proof_units, gate_signal, retry_count, error_log = row
    return {
        "task_number":       task_number,
        "current_node":      node,
        "status":            status,
        "branch_name":       branch or f"task/{task_number}-orchestration",
        "pr_url":            pr,
        "proof_results":     json.loads(proofs),
        "review_evidence":   json.loads(reviews),
        "checkpoint_data":   json.loads(checkpoint),
        "proof_units":       json.loads(proof_units) if proof_units else [],
        "human_gate_signal": gate_signal,
        "retry_count":       retry_count or 0,
        "error_log":         json.loads(error_log) if error_log else [],
    }


def _set_paused_at(task_number: int, epoch: Optional[int]) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE task_states SET paused_at = ? WHERE task_number = ?",
        (epoch, task_number)
    )
    conn.commit()
    conn.close()


def _get_paused_at(task_number: int) -> Optional[int]:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT paused_at FROM task_states WHERE task_number = ?",
        (task_number,)
    ).fetchone()
    conn.close()
    return row[0] if row else None


# ─────────────────────────────────────────────────────────────────────────────
# @safe_node — failure recovery decorator (Phase 5)
# ─────────────────────────────────────────────────────────────────────────────

def safe_node(fn: Callable) -> Callable:
    """Wrap a graph node: on unhandled exception set status=failed, log error."""
    @functools.wraps(fn)
    def wrapper(state: TaskState) -> TaskState:
        try:
            return fn(state)
        except Exception as exc:
            error_log: List[str] = list(state.get("error_log", []))
            error_log.append(f"{fn.__name__}: {exc}")
            failed_state: TaskState = {
                **state,
                "status":      "failed",
                "error_log":   error_log,
                "retry_count": state.get("retry_count", 0) + 1,
            }
            save_state(failed_state)
            return failed_state
    return wrapper


# ─────────────────────────────────────────────────────────────────────────────
# Stall-timeout watchdog (Phase 3)
# ─────────────────────────────────────────────────────────────────────────────

_watchdog_tasks: Dict[int, asyncio.Task] = {}


async def _stall_watchdog(task_number: int, timeout: int) -> None:
    """Wait timeout seconds, then mark the task stalled if still paused."""
    await asyncio.sleep(timeout)
    state = load_state(task_number)
    if state and state.get("human_gate_signal") is None:
        stalled: TaskState = {**state, "status": "stalled"}
        save_state(stalled)
        _set_paused_at(task_number, None)
        try:
            from backlog_sync import sync_status
            sync_status(task_number, "stalled", state["current_node"])
        except Exception:
            pass


def _start_watchdog(task_number: int, timeout: Optional[int] = None) -> None:
    loop = asyncio.get_running_loop()
    if task_number in _watchdog_tasks:
        _watchdog_tasks[task_number].cancel()
    actual_timeout = timeout if timeout is not None else STALL_TIMEOUT_SECONDS
    task = loop.create_task(_stall_watchdog(task_number, actual_timeout))
    _watchdog_tasks[task_number] = task


def _cancel_watchdog(task_number: int) -> None:
    t = _watchdog_tasks.pop(task_number, None)
    if t:
        t.cancel()


# ─────────────────────────────────────────────────────────────────────────────
# Graph advancement with HITL pause
# ─────────────────────────────────────────────────────────────────────────────

def initialize_state(task_number: int) -> TaskState:
    existing = load_state(task_number)
    if existing:
        return existing
    return {
        "task_number":       task_number,
        "current_node":      "START",
        "status":            "planned",
        "branch_name":       f"task/{task_number}-orchestration",
        "pr_url":            None,
        "proof_units":       [],
        "proof_results":     {},
        "human_gate_signal": None,
        "retry_count":       0,
        "error_log":         [],
        "review_evidence":   {},
        "checkpoint_data":   {},
    }


async def advance_graph(task_number: int) -> Dict[str, Any]:
    """Advance by one node. Suspends at HITL gates until /signal is called."""
    state = initialize_state(task_number)

    # If currently paused at a HITL gate with no signal, stay paused
    if state["current_node"] in HITL_NODES and state.get("human_gate_signal") is None:
        return {
            "status":       "paused",
            "task_number":  task_number,
            "current_node": state["current_node"],
            "message":      f"Waiting for human signal at '{state['current_node']}' gate",
        }

    old_status = state["status"]
    graph = build_graph()
    if state["current_node"] == "START":
        result = graph.invoke({**state})
    else:
        result = graph.invoke({**state, "human_gate_signal": None})

    new_state: TaskState = {**state, **result, "human_gate_signal": None}

    # Validate the transition that just occurred against the formal table
    new_status = new_state["status"]
    if new_status != old_status:
        ok, failures = validate_transition(old_status, new_status, new_state)
        if not ok:
            return {
                "status":       "precondition_failed",
                "task_number":  task_number,
                "current_node": state["current_node"],
                "task_status":  old_status,
                "failures":     failures,
            }

    save_state(new_state)
    _cancel_watchdog(task_number)

    # Arm stall watchdog if we landed on a HITL node
    if new_state["current_node"] in HITL_NODES:
        _set_paused_at(task_number, int(time.time()))
        _start_watchdog(task_number)
        return {
            "status":       "paused",
            "task_number":  task_number,
            "current_node": new_state["current_node"],
            "message":      f"Paused at HITL gate '{new_state['current_node']}'. POST /signal to resume.",
        }

    try:
        from backlog_sync import sync_status
        sync_status(task_number, new_state["status"], new_state["current_node"])
    except Exception:
        pass

    return {
        "status":       "ok",
        "task_number":  task_number,
        "current_node": new_state["current_node"],
        "task_status":  new_state["status"],
        "checkpoint":   new_state["checkpoint_data"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Polaris LangGraph Task Executor")
init_db()


class TaskRequest(BaseModel):
    task_number: int
    current_node: Optional[str] = None


class SignalRequest(BaseModel):
    signal: str


@app.post("/advance")
async def advance(req: TaskRequest) -> Dict[str, Any]:
    try:
        return await advance_graph(req.task_number)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/state")
async def get_state(task_number: int) -> Dict[str, Any]:
    state = load_state(task_number)
    if not state:
        state = initialize_state(task_number)
    return state


@app.post("/signal")
async def signal(task_number: int, req: SignalRequest) -> Dict[str, Any]:
    """Deliver a human gate signal and immediately advance the graph."""
    state = load_state(task_number)
    if not state:
        raise HTTPException(status_code=404, detail=f"Task {task_number} not found")
    if state["current_node"] not in HITL_NODES:
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_number} is not at a HITL gate (current: {state['current_node']})"
        )
    signalled_state = {**state, "human_gate_signal": req.signal}
    save_state(signalled_state)
    _cancel_watchdog(task_number)
    result = await advance_graph(task_number)
    return {"status": "ok", "signal": req.signal, "task_number": task_number, "advance": result}


@app.get("/recover")
async def recover(task_number: int) -> Dict[str, Any]:
    """Return checkpoint for a stalled/failed task with resume guidance."""
    state = load_state(task_number)
    if not state:
        raise HTTPException(status_code=404, detail=f"Task {task_number} not found")
    if state["status"] not in ("stalled", "failed"):
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_number} is '{state['status']}', not stalled or failed"
        )
    paused_at = _get_paused_at(task_number)
    can_resume = state["current_node"] in HITL_NODES
    return {
        "task_number":         task_number,
        "status":              state["status"],
        "last_node":           state["current_node"],
        "paused_at_timestamp": paused_at,
        "can_resume":          can_resume,
        "resume_signal":       "code_done" if can_resume else None,
        "error_log":           state.get("error_log", []),
    }


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "service": "langgraph-executor"}


@app.on_event("startup")
async def startup_event() -> None:
    print(f"[OK] LangGraph task executor started on localhost:4001")
    print(f"[OK] SQLite: {DB_PATH}")
    print(f"[OK] HITL nodes: {HITL_NODES}")
    print(f"[OK] Stall timeout: {STALL_TIMEOUT_SECONDS}s")
    # Re-arm stall watchdogs for tasks that were paused before this restart
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT task_number, paused_at FROM task_states "
        "WHERE paused_at IS NOT NULL AND human_gate_signal IS NULL"
    ).fetchall()
    conn.close()
    for tn, paused_at in rows:
        elapsed = int(time.time()) - paused_at
        remaining = max(STALL_TIMEOUT_SECONDS - elapsed, 1)
        _start_watchdog(tn, remaining)
    if rows:
        print(f"[OK] Re-armed {len(rows)} stall watchdog(s) from prior session")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=4001, log_level="info")
