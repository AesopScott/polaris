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
- `agents/task_graph.py:22` — `from state import TaskState` — used as StateGraph type param and node return type
- `agents/task_executor.py:33` — `from state import TaskState, TaskStatePydantic` — used in save_state, load_state, initialize_state, advance_graph

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
- `agents/task_executor.py:33` — imported but not used directly in any handler response type

**Status:** ⚠ orphan producer — imported but not used in any endpoint's response_model. Pre-existing.

---

## `node_utils.safe_node`

Decorator that wraps a graph node: on unhandled exception returns failed state instead of raising. Re-raises LangGraph control-flow exceptions (GraphInterrupt/NodeInterrupt) so HITL suspension works correctly. Also short-circuits if `state["status"] == "failed"` on entry, preventing later unconditional-edge nodes from overwriting the failed status.

**Schema / shape:**
```python
def safe_node(fn: Callable) -> Callable:
    # Returns a wrapper that: passes through if status==failed,
    # re-raises GraphInterrupt/NodeInterrupt, catches other exceptions
    # and returns {status: "failed", error_log: [...], retry_count: n+1}
```

**Producers (define)**
- `agents/node_utils.py:15` — function definition

**Consumers (import)**
- `agents/task_graph.py:23` — `from node_utils import safe_node` — used as `@safe_node` decorator on all 10 graph nodes
- `agents/test_task26_proof.py:132` — `from node_utils import safe_node` — used in PU6 proof harness

**Status:** ✓ Implemented (task #26)

---

## `task_graph.dispatch_agent`

Helper that calls the Polaris server's `/dispatch-agent` HTTP endpoint to run a real agent session from within a LangGraph node. Used by all 6 automation nodes (task #33).

**Schema / shape:**
```python
def dispatch_agent(task_number: int, prompt: str, agent: str = "sonnet", timeout: int = 300) -> str:
    # POST http://localhost:{SERVER_PORT}/dispatch-agent
    # { agent, prompt, task_number }
    # Returns: response text string
    # Raises: RuntimeError if ok=false or HTTP error
```

**Producers (define)**
- `agents/task_graph.py:35` — function definition (task #33)

**Consumers (call)**
- `agents/task_graph.py:65` — `plan_node` → `/plan-task N` (sonnet)
- `agents/task_graph.py:80` — `start_build_node` → `/start-build N` (sonnet)
- `agents/task_graph.py:133` — `finish_build_node` → `/finish-build` (sonnet, after proof gate)
- `agents/task_graph.py:170` — `codex_review_node` → `/codex-review` (codex)
- `agents/task_graph.py:194` — `promote_stage_node` → `/promote-stage` (sonnet)
- `agents/task_graph.py:209` — `promote_prod_node` → `/promote-to-prod` (sonnet)

**Status:** ✓ Implemented (task #33)

---

## `task_graph.build_graph`

Factory function that compiles the LangGraph StateGraph with 10 nodes decorated with `@safe_node`.

**Schema / shape:**
```python
def build_graph(checkpointer=None) -> StateGraph:
    # Returns a compiled LangGraph StateGraph
    # Entry point: "plan" node
    # Exit: END after promote_prod
    # checkpointer=None → no persistence; pass MemorySaver() for HITL interrupt support
```

**Producers (define)**
- `agents/task_graph.py:255` — function definition (line ref updated task #33)

**Consumers (call)**
- `agents/task_executor.py:32` — `from task_graph import build_graph, HITL_NODES` — module-level import
- `agents/task_executor.py` — `_GRAPH = build_graph(checkpointer=_CHECKPOINTER)` — compiled at module load with MemorySaver
- `agents/test_executor.py:103` — `from task_graph import build_graph; graph = build_graph()` — Proof Unit 5

**Status:** ✓ Balanced

---

## `transitions.is_direct_transition`

Returns True if `(from_status, to_status)` is a single-hop in the transition table. Used to distinguish direct transitions (validate preconditions) from multi-hop graph completions (trust graph topology).

**Schema / shape:**
```python
def is_direct_transition(from_status: str, to_status: str) -> bool:
    ...
```

**Producers (define)**
- `agents/transitions.py:11` — function definition

**Consumers (call)**
- `agents/task_executor.py:34` — `from transitions import validate_transition, is_direct_transition` — import
- `agents/task_executor.py:265` — `_validate_if_direct()` helper calls `is_direct_transition()` to decide whether to validate

**Status:** ✓ Implemented (task #26)

---

## `transitions.validate_transition`

Precondition validator for state machine transitions. Returns `(ok: bool, failures: List[str])`.

**Schema / shape:**
```python
def validate_transition(
    from_status: str,
    to_status: str,
    state: Dict[str, Any],
) -> Tuple[bool, List[str]]:
    ...
```

**Producers (define)**
- `agents/transitions.py:23` — function definition

**Consumers (call)**
- `agents/task_graph.py:24` — `from transitions import validate_transition` — import; called directly in `finish_build_node`, `codex_review_node`, `promote_stage_node` to enforce preconditions
- `agents/task_executor.py:34` — `from transitions import validate_transition, is_direct_transition` — import
- `agents/task_executor.py:265` — called inside `_validate_if_direct()` for direct transitions only (task #26)
- `agents/test_task26_proof.py:34` — `from transitions import validate_transition` — import for PU proof harness

**Status:** ✓ Implemented (task #26)

---

## `backlog_sync.sync_status`

Writes canonical task status to backlog.json via POST /sync-state on Polaris server. Called after every non-HITL node transition.

**Schema / shape:**
```python
def sync_status(task_number: int, status: str, current_node: str) -> None:
    # POST http://localhost:PORT/sync-state
    # { task_number, status, current_node }
```

**Producers (define)**
- `agents/backlog_sync.py:19` — function definition

**Consumers (call)**
- `agents/task_executor.py` — called inside `advance_graph()` after `save_state()` on non-HITL transitions (task #26)
- `agents/task_executor.py` — called inside `_stall_watchdog()` when stall timeout fires (task #26)

**Status:** ✓ Implemented (task #26)

---

## Summary

| Symbol | Producer | Consumers | Status |
|--------|----------|-----------|--------|
| `state.TaskState` | state.py:13 | task_graph.py:22, task_executor.py:33 | ✓ |
| `state.TaskStatePydantic` | state.py:26 | task_executor.py:33 | ⚠ orphan producer |
| `node_utils.safe_node` | node_utils.py:15 | task_graph.py:23, test_task26_proof.py:132 | ✓ |
| `task_graph.dispatch_agent` | task_graph.py:35 | task_graph.py:65,80,133,170,194,209 | ✓ (task #33) |
| `task_graph.build_graph` | task_graph.py:255 | task_executor.py:32; test_executor.py:103 | ✓ |
| `transitions.is_direct_transition` | transitions.py:11 | task_executor.py:34,265 | ✓ |
| `transitions.validate_transition` | transitions.py:23 | task_graph.py:24; task_executor.py:34,265; test_task26_proof.py:34 | ✓ |
| `backlog_sync.sync_status` | backlog_sync.py:19 | task_executor.py (_sync_status_safe wrapper) | ✓ |

**Note:** `test_task26_proof.py:91` imports `finish_build_node` directly from `task_graph` — this is an undocumented export used only in the PU6 proof harness. Not tracked as a registered symbol because it's test-internal; no production callers.

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T00:00:00Z (post-fix update for task #26 second Codex review)

**Task:** #26 — Make task orchestration an explicit state machine

**Boundaries checked:** Python module exports and imports within `agents/` package

**Evidence recorded:**
- 7 entries documented
- 6 entries with complete producer/consumer pairs ✓
- 1 pre-existing orphan producer (TaskStatePydantic — imported, unused in handlers)
- 0 planned/pending entries
- 0 shape mismatches between paired producer/consumer
- `transitions.is_direct_transition` added in second-pass fix (multi-hop transition collapse bug)
- `node_utils.safe_node` added as new registered symbol (was missing from registry)
- `build_graph` signature corrected: `checkpointer=None` param added, line refs updated

**Gaps identified:**
- `TaskStatePydantic` imported but not used as a response_model — pre-existing, low risk (scope: task #27 contracts)

**Status:** ✓ Audit current — all task #26 symbols registered with correct line refs

---

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit for task #33)

**Task:** #33 — LangGraph node implementation + HITL

**Boundaries checked:** Python module exports and imports within `agents/` package

**Evidence recorded:**
- 8 entries documented (7 previous + 1 new)
- 7 entries with complete producer/consumer pairs ✓
- 1 pre-existing orphan producer (TaskStatePydantic — unchanged)
- New identifier introduced: `task_graph.dispatch_agent` (task #33)
- Stale line ref corrected: `task_graph.build_graph` line ref updated 170 → 255 (new code inserted above it)
- All 6 automation nodes now call `dispatch_agent()` — registered as consumers

**Gaps identified:** None new. `TaskStatePydantic` orphan pre-existing.

**Status:** ✓ Audit current — task #33 additions registered

---

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit post task #33 build-finished)

**Task:** #33 — verification pass

**Boundaries checked:** Python module exports and imports within `agents/` package — full re-scan against committed code

**Evidence recorded:**
- 8 entries, 7 ✓ balanced, 1 ⚠ pre-existing orphan producer (TaskStatePydantic)
- 3 stale line refs corrected: `state.TaskState` consumers task_graph.py:11→22, task_executor.py:22→33; TaskStatePydantic consumer task_executor.py:22→33
- `node_utils.safe_node` consumers expanded: added exact line ref task_graph.py:23 and second consumer test_task26_proof.py:132
- `dispatch_agent` consumers expanded to exact call-site lines (65,80,133,170,194,209)
- `transitions.validate_transition` consumers expanded: added task_graph.py:24 (direct in-node calls) and test_task26_proof.py:34
- Undocumented export noted: `finish_build_node` imported by test_task26_proof.py:91 — test-internal only, not tracked as registered symbol

**Gaps identified:**
- 3 stale line refs (corrected above)
- `transitions.validate_transition` had missing consumers in task_graph.py and test harness (corrected above)
- `finish_build_node` undocumented export (test-internal, noted but not tracked)

**Status:** ✓ Audit current — all line refs verified against committed code on task/33-langgraph-node-implementation-hitl-phase
