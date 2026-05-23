# Python Module Registry (agents/)

Every export from the `agents/` Python package used across module boundaries. For each: producer (definition site), consumers (import sites), and status. Update whenever a module adds, removes, or renames a public symbol used by another module.

**Boundary:** `agents/state.py` exports → `agents/task_graph.py`, `agents/task_executor.py` import; `agents/task_executor.py` exports via FastAPI → test suite and Polaris operator tooling.

---

## `state.TaskState`

TypedDict for LangGraph StateGraph shared state. All graph nodes read and return this shape.

**Schema / shape:**
```python
class TaskState(TypedDict):
    task_number: int
    current_node: str
    status: Literal[...]   # see agent-state-schema.md for full enum
    branch_name: str
    pr_url: Optional[str]
    proof_results: Dict[str, bool]   # proof_unit_number (str) → passed (bool)
    review_evidence: Dict[str, Any]
    checkpoint_data: Dict[str, Any]
    # Planned by task #26 (not yet present):
    # proof_units: List[Dict]
    # human_gate_signal: Optional[str]
    # retry_count: int
    # error_log: List[str]
```

**Producers (define)**
- `agents/state.py:13` — class definition (TypedDict)

**Consumers (import)**
- `agents/task_graph.py:11` — `from state import TaskState` — used as StateGraph type param and node return type
- `agents/task_executor.py:22` — `from state import TaskState, TaskStatePydantic` — used in save_state, load_state, initialize_state, advance_graph

**Status:** ✓ Balanced — definition and both consumers aligned

---

## `state.TaskStatePydantic`

Pydantic BaseModel mirror of TaskState for FastAPI HTTP response serialization.

**Schema / shape:**
```python
class TaskStatePydantic(BaseModel):
    task_number: int
    current_node: str = "START"
    status: str = "planning"
    branch_name: str = ""
    pr_url: Optional[str] = None
    proof_results: Dict[str, bool] = {}
    review_evidence: Dict[str, Any] = {}
    checkpoint_data: Dict[str, Any] = {}
    # NOTE: Missing branch_name, pr_url compared to TypedDict — diverged
```

**Producers (define)**
- `agents/state.py:26` — class definition (Pydantic BaseModel)

**Consumers (import)**
- `agents/task_executor.py:22` — imported but not used directly in any handler response type

**Status:** ⚠ orphan producer — imported but not used in any endpoint's response_model. Pre-existing.

---

## `task_graph.build_graph`

Factory function that compiles the LangGraph StateGraph with 9 stub nodes.

**Schema / shape:**
```python
def build_graph() -> StateGraph:
    # Returns a compiled LangGraph StateGraph
    # Entry point: "plan" node
    # Exit: END after promote_prod
```

**Producers (define)**
- `agents/task_graph.py:96` — function definition

**Consumers (call)**
- `agents/task_executor.py:21` — `from task_graph import build_graph` — module-level import
- `agents/task_executor.py:104` — `GRAPH = build_graph()` — compiled at module load
- `agents/task_executor.py:133` — `graph = build_graph()` — called inside `advance_graph()` (redundant rebuild — pre-existing)
- `agents/test_executor.py:103` — `from task_graph import build_graph; graph = build_graph()` — Proof Unit 5

**Status:** ✓ Balanced

---

## `transitions.validate_transition`

Precondition validator for state machine transitions. Returns `(ok: bool, failures: List[str])`.

**Schema / shape (planned):**
```python
def validate_transition(
    from_status: str,
    to_status: str,
    state: TaskState
) -> tuple[bool, List[str]]:
    ...
```

**Producers (define)**
- `agents/transitions.py` — ⚠ **FILE DOES NOT EXIST** (task #26, Phase 2 build target)

**Consumers (call)**
- `agents/task_executor.py` — planned: called inside `advance_graph()` before any node execution (task #26, Phase 2)
- `agents/task_graph.py` — planned: node guard in `finish_build_node` (task #26, Phase 4)

**Status:** ⚠ planned (task #26, Phase 2) — file not yet created

---

## `backlog_sync.sync_status`

Writes canonical task status to backlog.json via POST /sync-state on Polaris server. Called after every node transition.

**Schema / shape (planned):**
```python
def sync_status(task_number: int, status: str, current_node: str) -> None:
    # POST http://localhost:PORT/sync-state
    # { task_number, status, current_node }
```

**Producers (define)**
- `agents/backlog_sync.py` — ⚠ **FILE DOES NOT EXIST** (task #26, Phase 6 build target)

**Consumers (call)**
- `agents/task_executor.py` — planned: called inside `advance_graph()` after `save_state()` (task #26, Phase 6)

**Status:** ⚠ planned (task #26, Phase 6) — file not yet created

---

## Summary

| Symbol | Producer | Consumers | Status |
|--------|----------|-----------|--------|
| `state.TaskState` | state.py:13 | task_graph.py:11, task_executor.py:22 | ✓ |
| `state.TaskStatePydantic` | state.py:26 | task_executor.py:22 | ⚠ orphan producer |
| `task_graph.build_graph` | task_graph.py:96 | task_executor.py:21,104,133; test_executor.py:103 | ✓ |
| `transitions.validate_transition` | transitions.py (missing) | task_executor.py, task_graph.py (planned) | ⚠ planned |
| `backlog_sync.sync_status` | backlog_sync.py (missing) | task_executor.py (planned) | ⚠ planned |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T20:00:00Z (by /cross-boundary-audit for task #26)

**Task:** #26 — Make task orchestration an explicit state machine

**Boundaries checked:** Python module exports and imports within `agents/` package

**Evidence recorded:**
- 5 entries documented
- 2 entries with complete producer/consumer pairs ✓
- 1 pre-existing orphan producer (TaskStatePydantic — imported, unused in handlers)
- 2 entries planned/pending ⚠ (transitions.py, backlog_sync.py)
- 0 shape mismatches between paired producer/consumer
- New identifiers introduced on task #26: `transitions.validate_transition`, `backlog_sync.sync_status`
- Registries match current code diff: yes (planned entries marked as such)

**Gaps identified:**
- `TaskStatePydantic` imported but not used as a response_model — pre-existing, low risk
- `transitions.py` and `backlog_sync.py` are Phase 2 and Phase 6 build targets respectively

**Status:** Audit complete
