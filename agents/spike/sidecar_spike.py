"""
Minimal LangGraph sidecar spike — FastAPI server with stub StateGraph nodes.
Validates the Python HTTP bridge pattern before full node implementation.

Proof Unit 1: POST /advance responds with HTTP 200 + stub result.
Proof Unit 2: SQLite checkpoint survives process restart.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException
import uvicorn
import sys

# Add parent directory to path to import state.py
sys.path.insert(0, str(Path(__file__).parent.parent))
from state import TaskStatePydantic as TaskState

# ===== SQLite Checkpoint =====
DB_PATH = Path(__file__).parent / "task_checkpoint.db"


def init_db():
    """Initialize SQLite checkpoint database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS checkpoints (
            task_number INTEGER PRIMARY KEY,
            node_name TEXT NOT NULL,
            status TEXT NOT NULL,
            checkpoint_data TEXT NOT NULL,
            UNIQUE(task_number)
        )
    """)
    conn.commit()
    conn.close()


def save_checkpoint(task_number: int, node: str, status: str, data: Dict[str, Any]):
    """Persist task state to SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO checkpoints (task_number, node_name, status, checkpoint_data)
        VALUES (?, ?, ?, ?)
    """, (task_number, node, status, json.dumps(data)))
    conn.commit()
    conn.close()


def load_checkpoint(task_number: int) -> Optional[Dict[str, Any]]:
    """Restore task state from SQLite."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT node_name, status, checkpoint_data FROM checkpoints WHERE task_number = ?",
        (task_number,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    node_name, status, checkpoint_data = row
    return {
        "current_node": node_name,
        "status": status,
        "checkpoint": json.loads(checkpoint_data)
    }


# ===== FastAPI Server =====
app = FastAPI(title="Polaris LangGraph Sidecar Spike")
init_db()


@app.post("/advance")
async def advance(request: TaskState) -> Dict[str, Any]:
    """
    Advance the task graph by one node.

    Proof Unit 1: Returns HTTP 200 with stub node result.
    """
    # Load checkpoint if it exists, otherwise start fresh
    checkpoint = load_checkpoint(request.task_number)
    if checkpoint:
        current_node = checkpoint["current_node"]
        status = checkpoint["status"]
    else:
        current_node = "START"
        status = "planning"

    # Stub node logic: advance from START → plan_node → build_node → ...
    node_map = {
        "START": "plan_node",
        "plan_node": "start_build_node",
        "start_build_node": "build_node",
        "build_node": "finish_build_node",
    }

    next_node = node_map.get(current_node, current_node)

    # Save checkpoint
    save_checkpoint(
        request.task_number,
        next_node,
        "in_progress",
        {"advanced_from": current_node}
    )

    return {
        "status": "ok",
        "node": next_node,
        "task_number": request.task_number,
        "previous_node": current_node
    }


@app.get("/state")
async def get_state(task_number: int) -> Dict[str, Any]:
    """
    Get the current state of a task.

    Proof Unit 2: Returns checkpoint even after process restart.
    """
    checkpoint = load_checkpoint(task_number)

    if not checkpoint:
        return {
            "task_number": task_number,
            "current_node": "START",
            "status": "planning",
            "checkpoint": {}
        }

    return {
        "task_number": task_number,
        **checkpoint
    }


@app.post("/signal")
async def signal(task_number: int, signal: str) -> Dict[str, Any]:
    """
    Receive a human signal (pause/resume).
    Stub for Phase 3 HITL gates.
    """
    return {
        "status": "ok",
        "signal_received": signal,
        "task_number": task_number
    }


@app.on_event("startup")
async def startup_event():
    """Initialize on server start."""
    print(f"[OK] LangGraph sidecar spike started on localhost:4001")
    print(f"[OK] Checkpoint database: {DB_PATH}")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=4001, log_level="info")
