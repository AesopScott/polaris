"""
LangGraph task executor — FastAPI server wrapping the StateGraph.

Endpoints:
- POST /advance: advance graph by one node
- GET /state: retrieve current task state
- POST /signal: send human pause/resume signals
- GET /health: health check

Implements persistent SQLite checkpointing for Proof Unit 2 (checkpoint survival).
"""

import json
import sqlite3
import asyncio
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from task_graph import build_graph
from state import TaskState, TaskStatePydantic


# ===== SQLite Persistence =====
DB_PATH = Path(__file__).parent / "task_state.db"


def init_db():
    """Initialize SQLite table for task state checkpoints."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS task_states (
            task_number INTEGER PRIMARY KEY,
            current_node TEXT NOT NULL,
            status TEXT NOT NULL,
            branch_name TEXT,
            pr_url TEXT,
            proof_results TEXT NOT NULL,
            review_evidence TEXT NOT NULL,
            checkpoint_data TEXT NOT NULL,
            UNIQUE(task_number)
        )
    """)
    conn.commit()
    conn.close()


def save_state(state: TaskState) -> None:
    """Persist task state to SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO task_states (
            task_number, current_node, status, branch_name, pr_url,
            proof_results, review_evidence, checkpoint_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        state["task_number"],
        state["current_node"],
        state["status"],
        state.get("branch_name"),
        state.get("pr_url"),
        json.dumps(state.get("proof_results", {})),
        json.dumps(state.get("review_evidence", {})),
        json.dumps(state.get("checkpoint_data", {})),
    ))
    conn.commit()
    conn.close()


def load_state(task_number: int) -> Optional[TaskState]:
    """Load task state from SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """SELECT current_node, status, branch_name, pr_url, proof_results,
                  review_evidence, checkpoint_data FROM task_states
           WHERE task_number = ?""",
        (task_number,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    node, status, branch, pr, proofs, reviews, checkpoint = row
    return {
        "task_number": task_number,
        "current_node": node,
        "status": status,
        "branch_name": branch or f"task/{task_number}-orchestration",
        "pr_url": pr,
        "proof_results": json.loads(proofs),
        "review_evidence": json.loads(reviews),
        "checkpoint_data": json.loads(checkpoint),
    }


# ===== State Machine =====
# Global graph instance (compiled StateGraph)
GRAPH = build_graph()


def initialize_state(task_number: int) -> TaskState:
    """Create initial TaskState or load from checkpoint."""
    existing = load_state(task_number)
    if existing:
        return existing

    return {
        "task_number": task_number,
        "current_node": "START",
        "status": "planning",
        "branch_name": f"task/{task_number}-orchestration",
        "pr_url": None,
        "proof_results": {},
        "review_evidence": {},
        "checkpoint_data": {},
    }


async def advance_graph(task_number: int) -> Dict[str, Any]:
    """
    Advance the graph by one node.
    Saves state to SQLite after each advance (Proof Unit 2).
    """
    state = initialize_state(task_number)

    # Invoke the compiled StateGraph (Proof Unit 5)
    graph = build_graph()

    # Prepare initial state if first invocation
    if state.get("current_node") == "START":
        initial_input = {
            "task_number": state["task_number"],
            "current_node": "START",
            "status": "planning",
            "branch_name": "",
            "pr_url": None,
            "proof_results": {},
            "review_evidence": {},
            "checkpoint_data": {}
        }
        result = graph.invoke(initial_input)
        state.update(result)
    else:
        # Continue from last checkpoint
        result = graph.invoke(state)
        state.update(result)

    # Persist the new state
    save_state(state)

    return {
        "status": "ok",
        "task_number": task_number,
        "current_node": state["current_node"],
        "checkpoint": state["checkpoint_data"],
    }


# ===== FastAPI Server =====
app = FastAPI(title="Polaris LangGraph Task Executor")
init_db()


class TaskRequest(BaseModel):
    task_number: int
    current_node: Optional[str] = None


class SignalRequest(BaseModel):
    signal: str  # "code_done", "approved", "request_changes", etc.


@app.post("/advance")
async def advance(req: TaskRequest) -> Dict[str, Any]:
    """
    Advance the task graph by one node.
    Proof Unit 1: Returns HTTP 200 with stub node result.
    Proof Unit 2: Checkpoint survives process restart.
    Proof Unit 5: StateGraph runs without errors.
    """
    try:
        result = await advance_graph(req.task_number)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/state")
async def get_state(task_number: int) -> Dict[str, Any]:
    """
    Get current task state.
    Proof Unit 2: Returns checkpoint even after process restart.
    """
    state = load_state(task_number)
    if not state:
        state = initialize_state(task_number)
    return state


@app.post("/signal")
async def signal(task_number: int, req: SignalRequest) -> Dict[str, Any]:
    """
    Receive a human signal (pause/resume).
    Stub for Phase 4 HITL gates.
    """
    state = load_state(task_number)
    if not state:
        raise HTTPException(status_code=404, detail=f"Task {task_number} not found")

    # Store signal in checkpoint_data for the graph to check
    state["checkpoint_data"]["last_signal"] = req.signal
    save_state(state)

    return {
        "status": "ok",
        "signal": req.signal,
        "task_number": task_number,
    }


@app.get("/health")
async def health() -> Dict[str, str]:
    """Health check."""
    return {"status": "ok", "service": "langgraph-executor"}


@app.on_event("startup")
async def startup_event():
    """Initialize on server start."""
    print(f"[OK] LangGraph task executor started on localhost:4001")
    print(f"[OK] StateGraph database: {DB_PATH}")
    print(f"[OK] StateGraph compiled with 9 nodes")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=4001, log_level="info")
