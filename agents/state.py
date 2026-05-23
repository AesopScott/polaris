"""Canonical TaskState definition for LangGraph orchestration.

Used by both spike (sidecar_spike.py) and executor (task_executor.py).
TypedDict version for StateGraph; Pydantic BaseModel variants in implementations.
"""

from typing import Any, Dict, List, Optional, Literal
from typing_extensions import TypedDict
from pydantic import BaseModel


# Canonical status values — must align with server.js VALID_BACKLOG_STATUSES
StatusLiteral = Literal[
    "planned",
    "build-started",
    "build-finished",
    "cba-complete",
    "staged",
    "production",
    "stalled",   # written by stall-timeout watchdog
    "failed",    # written by @safe_node on unhandled exception
]


# ===== TypedDict for StateGraph =====
class TaskState(TypedDict):
    """Shared state flowing through the orchestration graph."""
    task_number: int
    current_node: str
    status: StatusLiteral
    branch_name: str
    pr_url: Optional[str]
    proof_units: List[Dict[str, Any]]    # loaded from backlog.json at task start
    proof_results: Dict[str, bool]       # str(proof_unit_number) → passed
    human_gate_signal: Optional[str]     # set by POST /signal to unblock HITL nodes
    retry_count: int                     # incremented by @safe_node on retry
    error_log: List[str]                 # exception messages captured by @safe_node
    review_evidence: Dict[str, Any]
    checkpoint_data: Dict[str, Any]


# ===== Pydantic BaseModel for API serialization =====
class TaskStatePydantic(BaseModel):
    """Pydantic version of TaskState for HTTP responses."""
    task_number: int
    current_node: str = "START"
    status: str = "planned"
    branch_name: str = ""
    pr_url: Optional[str] = None
    proof_units: List[Dict[str, Any]] = []
    proof_results: Dict[str, bool] = {}
    human_gate_signal: Optional[str] = None
    retry_count: int = 0
    error_log: List[str] = []
    review_evidence: Dict[str, Any] = {}
    checkpoint_data: Dict[str, Any] = {}
