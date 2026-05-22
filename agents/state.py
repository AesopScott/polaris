"""Canonical TaskState definition for LangGraph orchestration.

Used by both spike (sidecar_spike.py) and executor (task_executor.py).
TypedDict version for StateGraph; Pydantic BaseModel variants in implementations.
"""

from typing import Any, Dict, Optional, Literal
from typing_extensions import TypedDict
from pydantic import BaseModel


# ===== TypedDict for StateGraph =====
class TaskState(TypedDict):
    """Shared state flowing through the orchestration graph."""
    task_number: int
    current_node: str
    status: Literal["planning", "build-started", "build-finished", "reviewed", "staged", "production", "failed"]
    branch_name: str
    pr_url: Optional[str]
    proof_results: Dict[str, bool]  # proof_unit_number -> passed
    review_evidence: Dict[str, Any]
    checkpoint_data: Dict[str, Any]


# ===== Pydantic BaseModel for API serialization =====
class TaskStatePydantic(BaseModel):
    """Pydantic version of TaskState for HTTP responses."""
    task_number: int
    current_node: str = "START"
    status: str = "planning"
    branch_name: str = ""
    pr_url: Optional[str] = None
    proof_results: Dict[str, bool] = {}
    review_evidence: Dict[str, Any] = {}
    checkpoint_data: Dict[str, Any] = {}
