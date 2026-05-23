"""
LangGraph task executor — FastAPI server wrapping the StateGraph.

Endpoints:
- POST /advance: advance graph by one node (suspends at HITL interrupt gates)
- GET /state: retrieve current task state
- POST /signal: send human resume signal to unblock a HITL interrupt node
- GET /recover: return checkpoint for a stalled/failed task
- GET /health: health check

SQLite persists task metadata across restarts. MemorySaver holds LangGraph
interrupt checkpoints in memory; after a restart, call /advance again to
re-run the graph to the first interrupt point (plan/start_build are no-op stubs).

HITL nodes suspend until /signal delivers Command(resume=...) or
STALL_TIMEOUT_SECONDS elapses (sets status=stalled).
"""

import asyncio
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from task_graph import build_graph, HITL_NODES
from state import TaskState, TaskStatePydantic
from transitions import validate_transition, is_direct_transition


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "task_state.db"
BACKLOG_PATH = Path(__file__).parent.parent / "docs" / "backlog.json"
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
# Backlog integration — load proof units at task initialization
# ─────────────────────────────────────────────────────────────────────────────

def _load_proof_units(task_number: int) -> List[Dict[str, Any]]:
    """Read proof units for task_number from backlog.json."""
    try:
        with open(BACKLOG_PATH, encoding="utf-8") as f:
            data = json.load(f)
        task = next((t for t in data.get("tasks", []) if t.get("number") == task_number), None)
        return task.get("proofUnits", []) if task else []
    except Exception as exc:
        print(f"[WARN] _load_proof_units failed for task {task_number}: {exc}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# LangGraph checkpointer + compiled graph (module-level singletons)
# ─────────────────────────────────────────────────────────────────────────────

_CHECKPOINTER = MemorySaver()
_GRAPH = build_graph(_CHECKPOINTER)


def _graph_config(task_number: int) -> dict:
    return {"configurable": {"thread_id": str(task_number)}}


def _get_snapshot(config: dict):
    """Return graph.get_state(config) or None on error / missing checkpoint."""
    try:
        return _GRAPH.get_state(config)
    except Exception:
        return None


def _sync_status_safe(task_number: int, status: str, current_node: str) -> Optional[str]:
    """Sync task status to server.js. Returns error string if failed, None if ok."""
    try:
        from backlog_sync import sync_status
        sync_status(task_number, status, current_node)
        return None
    except Exception as exc:
        msg = str(exc)
        print(f"[WARN] /sync-state failed for task {task_number}: {msg}")
        return msg


# ─────────────────────────────────────────────────────────────────────────────
# Per-task locking — prevents concurrent /advance + /signal mutations
# ─────────────────────────────────────────────────────────────────────────────

_task_locks: Dict[int, asyncio.Lock] = {}


def _get_task_lock(task_number: int) -> asyncio.Lock:
    if task_number not in _task_locks:
        _task_locks[task_number] = asyncio.Lock()
    return _task_locks[task_number]


# ─────────────────────────────────────────────────────────────────────────────
# Stall-timeout watchdog
# ─────────────────────────────────────────────────────────────────────────────

_watchdog_tasks: Dict[int, asyncio.Task] = {}


async def _stall_watchdog(task_number: int, timeout: int) -> None:
    """Wait timeout seconds, then mark the task stalled if still paused at a HITL gate."""
    await asyncio.sleep(timeout)
    # Hold the per-task lock while checking and saving so /signal cannot race past
    # the stalled status between the guard check and _cancel_watchdog().
    async with _get_task_lock(task_number):
        state = load_state(task_number)
        # Only stall if task is still waiting at a HITL gate with no signal received
        if (state
                and state.get("current_node") in HITL_NODES
                and state.get("human_gate_signal") is None):
            stalled: TaskState = {**state, "status": "stalled"}
            save_state(stalled)
            _set_paused_at(task_number, None)
            warning = _sync_status_safe(task_number, "stalled", state["current_node"])
            if warning:
                print(f"[WARN] stall watchdog sync failed for task {task_number}: {warning}")


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
# Transition validation helper
# ─────────────────────────────────────────────────────────────────────────────

def _validate_if_direct(
    old_status: str,
    new_status: str,
    new_state: TaskState,
    task_number: int,
    current_node: str,
) -> Optional[Dict[str, Any]]:
    """Validate a status transition, but only if it is a direct (single-hop) table entry.

    Multi-hop graph completions (e.g. build-finished → production after a resumed
    review gate) are trusted to have individually valid intermediate steps enforced
    by the graph topology. Returns a precondition_failed response dict on failure,
    or None if validation passed (or was skipped for multi-hop).
    """
    if new_status == old_status:
        return None
    if not is_direct_transition(old_status, new_status):
        return None  # multi-hop — trust graph topology
    ok, failures = validate_transition(old_status, new_status, new_state)
    if not ok:
        return {
            "status":       "precondition_failed",
            "task_number":  task_number,
            "current_node": current_node,
            "task_status":  old_status,
            "failures":     failures,
        }
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Graph advancement with LangGraph interrupt API
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
        "proof_units":       _load_proof_units(task_number),
        "proof_results":     {},
        "human_gate_signal": None,
        "retry_count":       0,
        "error_log":         [],
        "review_evidence":   {},
        "checkpoint_data":   {},
    }


async def advance_graph(task_number: int) -> Dict[str, Any]:
    """Advance the graph. Suspends at interrupt() HITL nodes until /signal."""
    async with _get_task_lock(task_number):
        state = initialize_state(task_number)
        config = _graph_config(task_number)

        # If already interrupted (in-memory checkpoint exists), stay paused
        snapshot = _get_snapshot(config)
        if snapshot and snapshot.next:
            interrupted_node = snapshot.next[0]
            return {
                "status":       "paused",
                "task_number":  task_number,
                "current_node": interrupted_node,
                "message":      f"Already paused at '{interrupted_node}'. POST /signal to resume.",
            }

        old_status = state["status"]
        _GRAPH.invoke({**state}, config=config)

        new_snapshot = _GRAPH.get_state(config)
        new_state: TaskState = {**state, **new_snapshot.values}

        # Graph hit an interrupt() — HITL gate suspended
        if new_snapshot.next:
            interrupted_node = new_snapshot.next[0]
            new_state["current_node"] = interrupted_node

            # Validate the status change that occurred before the interrupt
            # (must happen BEFORE save_state for atomicity)
            err = _validate_if_direct(
                old_status, new_state.get("status", old_status),
                new_state, task_number, interrupted_node
            )
            if err:
                return err

            save_state(new_state)
            _set_paused_at(task_number, int(time.time()))
            _start_watchdog(task_number)
            sync_warning = _sync_status_safe(
                task_number, new_state["status"], new_state["current_node"]
            )
            response: Dict[str, Any] = {
                "status":       "paused",
                "task_number":  task_number,
                "current_node": interrupted_node,
                "message":      f"Paused at HITL gate '{interrupted_node}'. POST /signal to resume.",
            }
            if sync_warning:
                response["sync_warning"] = sync_warning
            return response

        # Graph completed — validate the transition (direct hops only)
        err = _validate_if_direct(
            old_status, new_state.get("status", old_status),
            new_state, task_number, new_state.get("current_node", state["current_node"])
        )
        if err:
            return err

        save_state(new_state)
        _cancel_watchdog(task_number)

        sync_warning = _sync_status_safe(
            task_number, new_state["status"], new_state["current_node"]
        )
        response = {
            "status":       "ok",
            "task_number":  task_number,
            "current_node": new_state["current_node"],
            "task_status":  new_state["status"],
            "checkpoint":   new_state.get("checkpoint_data", {}),
        }
        if sync_warning:
            response["sync_warning"] = sync_warning
        return response


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
    """Deliver a human gate signal via Command(resume=...) and advance past the interrupt."""
    state = load_state(task_number)
    if not state:
        raise HTTPException(status_code=404, detail=f"Task {task_number} not found")

    # Guard: stalled/failed tasks cannot be resumed — the LangGraph checkpoint may
    # still have snapshot.next set even after the watchdog fired, so we must check
    # the persisted status first to avoid the stall/signal race.
    if state["status"] in ("stalled", "failed"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Task {task_number} is {state['status']} and cannot be resumed via /signal. "
                "Use /recover to check restart options."
            ),
        )

    config = _graph_config(task_number)
    snapshot = _get_snapshot(config)

    if not snapshot or not snapshot.next:
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_number} is not at a HITL gate (no interrupt pending)"
        )

    async with _get_task_lock(task_number):
        # Re-read inside lock to close race: _stall_watchdog also holds this lock
        # when it saves stalled state, so the state we act on is authoritative.
        state = load_state(task_number)
        if not state or state["status"] in ("stalled", "failed"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Task {task_number} became {state['status'] if state else 'not found'} "
                    "before signal could be delivered — signal rejected."
                ),
            )
        _cancel_watchdog(task_number)
        old_status = state["status"]

        _GRAPH.invoke(Command(resume=req.signal), config=config)
        new_snapshot = _GRAPH.get_state(config)
        # Merge: SQLite state as base, LangGraph accumulated values on top
        new_state: TaskState = {**state, **new_snapshot.values}

        # Hit another interrupt (e.g., review gate after build gate)
        if new_snapshot.next:
            next_node = new_snapshot.next[0]
            new_state["current_node"] = next_node
            # Clear signal so the watchdog correctly detects the new unpaired gate
            new_state["human_gate_signal"] = None

            # Validate the status change up to this new interrupt (before saving)
            err = _validate_if_direct(
                old_status, new_state.get("status", old_status),
                new_state, task_number, next_node
            )
            if err:
                return {"status": "ok", "signal": req.signal, "task_number": task_number,
                        "advance": err}

            save_state(new_state)
            _set_paused_at(task_number, int(time.time()))
            _start_watchdog(task_number)
            sync_warning = _sync_status_safe(
                task_number, new_state["status"], new_state["current_node"]
            )
            advance_result: Dict[str, Any] = {
                "status":       "paused",
                "task_number":  task_number,
                "current_node": next_node,
                "message":      f"Paused at HITL gate '{next_node}'. POST /signal to resume.",
            }
            if sync_warning:
                advance_result["sync_warning"] = sync_warning
            return {"status": "ok", "signal": req.signal, "task_number": task_number,
                    "advance": advance_result}

        # Graph completed after signal — validate direct transitions only
        err = _validate_if_direct(
            old_status, new_state.get("status", old_status),
            new_state, task_number, new_state.get("current_node", state["current_node"])
        )
        if err:
            return {"status": "ok", "signal": req.signal, "task_number": task_number,
                    "advance": err}

        save_state(new_state)

        sync_warning = _sync_status_safe(
            task_number, new_state["status"], new_state["current_node"]
        )
        advance_result = {
            "status":       "ok",
            "task_number":  task_number,
            "current_node": new_state["current_node"],
            "task_status":  new_state["status"],
            "checkpoint":   new_state.get("checkpoint_data", {}),
        }
        if sync_warning:
            advance_result["sync_warning"] = sync_warning

        return {"status": "ok", "signal": req.signal, "task_number": task_number,
                "advance": advance_result}


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
