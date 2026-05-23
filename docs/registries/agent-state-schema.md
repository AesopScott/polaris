# Agent State Schema Registry

Every field in `TaskState` (the LangGraph executor's shared state) and its three representations: Python TypedDict in `state.py`, Pydantic model in `state.py`, and SQLite columns in `task_executor.py`. Also tracks the `StatusLiteral` enum alignment with `VALID_BACKLOG_STATUSES` in `server.js`.

**Boundary:** `agents/state.py` TypedDict definition → `agents/task_executor.py` SQLite schema (task_states table) → `server.js:3222` VALID_BACKLOG_STATUSES. A status value written by the executor must be valid in all three representations.

---

## Field: `task_number`

Unique identifier of the backlog task being orchestrated.

**TypedDict:** `task_number: int` (`state.py:15`)
**SQLite:** `task_number INTEGER PRIMARY KEY` (`task_executor.py:35`)
**Pydantic:** `task_number: int` (`state.py:29`)

**Status:** ✓ Aligned across all three representations

---

## Field: `current_node`

Name of the graph node currently executing or last completed.

**TypedDict:** `current_node: str` (`state.py:16`)
**SQLite:** `current_node TEXT NOT NULL` (`task_executor.py:36`)
**Pydantic:** `current_node: str = "START"` (`state.py:30`)

**Status:** ✓ Aligned

---

## Field: `status`

Canonical task lifecycle status. Must match a value in VALID_BACKLOG_STATUSES (server.js:3222) when written to backlog.json via /sync-state.

**TypedDict:** `status: Literal["planning", "build-started", "build-finished", "reviewed", "staged", "production", "failed"]` (`state.py:17`)
**SQLite:** `status TEXT NOT NULL` (`task_executor.py:37`) — no enum constraint
**Pydantic:** `status: str = "planning"` (`state.py:31`) — no enum constraint
**server.js:** `VALID_BACKLOG_STATUSES` set at `server.js:3222`

**⚠ StatusLiteral alignment — see dedicated section below**

**Status:** ⚠ shape mismatch — state.py Literal is misaligned with VALID_BACKLOG_STATUSES (see StatusLiteral section)

---

## Field: `branch_name`

Git branch name for the task's work.

**TypedDict:** `branch_name: str` (`state.py:18`)
**SQLite:** `branch_name TEXT` (`task_executor.py:38`) — nullable, TEXT
**Pydantic:** `branch_name: str = ""` (`state.py:32`)

**Status:** ✓ Aligned (SQLite nullable vs TypedDict non-optional — acceptable, executor defaults to empty string)

---

## Field: `pr_url`

GitHub PR URL, null until PR is opened.

**TypedDict:** `pr_url: Optional[str]` (`state.py:19`)
**SQLite:** `pr_url TEXT` (`task_executor.py:39`) — nullable
**Pydantic:** `pr_url: Optional[str] = None` (`state.py:33`)

**Status:** ✓ Aligned

---

## Field: `proof_results`

Map of proof unit number (as string key) to pass/fail result.

**TypedDict:** `proof_results: Dict[str, bool]` (`state.py:20`)
**SQLite:** `proof_results TEXT NOT NULL` (`task_executor.py:40`) — JSON-serialized
**Pydantic:** `proof_results: Dict[str, bool] = {}` (`state.py:34`)

**Status:** ✓ Aligned (SQLite stores as JSON blob; round-trips correctly via `json.dumps` / `json.loads`)

---

## Field: `review_evidence`

Structured evidence from /review-pr and /codex-review steps.

**TypedDict:** `review_evidence: Dict[str, Any]` (`state.py:21`)
**SQLite:** `review_evidence TEXT NOT NULL` (`task_executor.py:41`) — JSON-serialized
**Pydantic:** `review_evidence: Dict[str, Any] = {}` (`state.py:35`)

**Status:** ✓ Aligned

---

## Field: `checkpoint_data`

Catch-all dict for node-specific intermediate state.

**TypedDict:** `checkpoint_data: Dict[str, Any]` (`state.py:22`)
**SQLite:** `checkpoint_data TEXT NOT NULL` (`task_executor.py:42`) — JSON-serialized
**Pydantic:** `checkpoint_data: Dict[str, Any] = {}` (`state.py:36`)

**Status:** ✓ Aligned

---

## Field: `proof_units` ⚠ PLANNED

Full array of proof unit specs loaded from backlog.json when a task starts.

**TypedDict:** ⚠ NOT PRESENT — task #26 Phase 1 adds `proof_units: List[Dict[str, Any]]`
**SQLite:** ⚠ NOT PRESENT — task #26 Phase 1 adds `proof_units TEXT` column (JSON-serialized)
**Pydantic:** ⚠ NOT PRESENT — task #26 Phase 1 adds `proof_units: List[Dict[str, Any]] = []`

**Status:** ⚠ planned (task #26, Phase 1)

---

## Field: `human_gate_signal` ⚠ PLANNED

Signal received from POST /signal that unblocks a HITL pause node. None when no signal pending.

**TypedDict:** ⚠ NOT PRESENT — task #26 Phase 3 adds `human_gate_signal: Optional[str]`
**SQLite:** ⚠ NOT PRESENT — task #26 Phase 3 adds `human_gate_signal TEXT` column (nullable)
**Pydantic:** ⚠ NOT PRESENT — task #26 Phase 3 adds `human_gate_signal: Optional[str] = None`

**Status:** ⚠ planned (task #26, Phase 3)

---

## Field: `retry_count` ⚠ PLANNED

Number of times the current node has been retried after failure.

**TypedDict:** ⚠ NOT PRESENT — task #26 Phase 5 adds `retry_count: int`
**SQLite:** ⚠ NOT PRESENT — task #26 Phase 5 adds `retry_count INTEGER NOT NULL DEFAULT 0`
**Pydantic:** ⚠ NOT PRESENT — task #26 Phase 5 adds `retry_count: int = 0`

**Status:** ⚠ planned (task #26, Phase 5)

---

## Field: `error_log` ⚠ PLANNED

Ordered list of exception messages captured by the @safe_node decorator.

**TypedDict:** ⚠ NOT PRESENT — task #26 Phase 5 adds `error_log: List[str]`
**SQLite:** ⚠ NOT PRESENT — task #26 Phase 5 adds `error_log TEXT NOT NULL DEFAULT '[]'` (JSON-serialized)
**Pydantic:** ⚠ NOT PRESENT — task #26 Phase 5 adds `error_log: List[str] = []`

**Status:** ⚠ planned (task #26, Phase 5)

---

## StatusLiteral Alignment

The `status` field written by the executor must be accepted by `updateBacklogTaskStatus()` in server.js, which validates against `VALID_BACKLOG_STATUSES` (server.js:3222).

### Current state.py Literal (state.py:17)
```
"planning", "build-started", "build-finished", "reviewed", "staged", "production", "failed"
```

### Current VALID_BACKLOG_STATUSES (server.js:3222)
```
"backlog", "planned", "build-started", "build-finished", "cba-complete", "review-blocked",
"staged", "production", "failed-smoke-test", "stalled", "failed",
"blocked", "on-hold", "cancelled"
(+ legacy: "ready", "in-progress", "complete", "pr-reviewed", "cba-half-complete", "smoke-tested")
```

### Gaps

| Status value | In state.py Literal | In VALID_BACKLOG_STATUSES | Notes |
|---|---|---|---|
| `"planning"` | ✓ | ✗ | **Phantom** — executor writes this but server would reject it via /sync-state. Not a real backlog status. |
| `"reviewed"` | ✓ | ✗ | **Phantom** — not a valid backlog status. Use `"cba-complete"` instead. |
| `"planned"` | ✗ | ✓ | **Missing** — executor must write this when graph enters plan node. Task #26 Phase 1 adds it. |
| `"stalled"` | ✗ | ✓ | **Missing** — stall timeout writes this. Task #26 Phase 3 adds it. |
| `"cba-complete"` | ✗ | ✓ | **Missing** — codex_review node writes this. Task #26 Phase 1 adds it. |
| `"build-started"` | ✓ | ✓ | ✓ Aligned |
| `"build-finished"` | ✓ | ✓ | ✓ Aligned |
| `"staged"` | ✓ | ✓ | ✓ Aligned |
| `"production"` | ✓ | ✓ | ✓ Aligned |
| `"failed"` | ✓ | ✓ | ✓ Aligned |

**Hard gap:** `"planning"` and `"reviewed"` in state.py do not exist in VALID_BACKLOG_STATUSES. If the executor writes either via /sync-state, the server will throw `Invalid status`. Task #26 Phase 1 must rename these to `"planned"` and `"cba-complete"` respectively.

---

## Summary

| Field | TypedDict | SQLite | Pydantic | Status |
|-------|-----------|--------|----------|--------|
| `task_number` | ✓ | ✓ | ✓ | ✓ |
| `current_node` | ✓ | ✓ | ✓ | ✓ |
| `status` | ✓ (wrong Literal) | ✓ | ✓ | ⚠ mismatch |
| `branch_name` | ✓ | ✓ | ✓ | ✓ |
| `pr_url` | ✓ | ✓ | ✓ | ✓ |
| `proof_results` | ✓ | ✓ | ✓ | ✓ |
| `review_evidence` | ✓ | ✓ | ✓ | ✓ |
| `checkpoint_data` | ✓ | ✓ | ✓ | ✓ |
| `proof_units` | ✗ | ✗ | ✗ | ⚠ planned |
| `human_gate_signal` | ✗ | ✗ | ✗ | ⚠ planned |
| `retry_count` | ✗ | ✗ | ✗ | ⚠ planned |
| `error_log` | ✗ | ✗ | ✗ | ⚠ planned |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T20:00:00Z (by /cross-boundary-audit for task #26)

**Task:** #26 — Make task orchestration an explicit state machine

**Boundaries checked:** TaskState TypedDict (state.py), SQLite schema (task_executor.py:34-43), Pydantic model (state.py:26-36), StatusLiteral vs VALID_BACKLOG_STATUSES (server.js:3222)

**Evidence recorded:**
- 12 field entries documented
- 7 entries aligned across TypedDict/SQLite/Pydantic ✓
- 1 entry with StatusLiteral mismatch (status field) ⚠
- 4 entries planned/pending (proof_units, human_gate_signal, retry_count, error_log) ⚠
- New identifiers introduced on task #26: proof_units, human_gate_signal, retry_count, error_log fields; StatusLiteral values "planned", "stalled", "cba-complete"
- Registries match current code diff: yes (planned fields marked; hard gap flagged)

**Gaps identified:**
- HARD GAP: state.py StatusLiteral contains "planning" and "reviewed" — not in VALID_BACKLOG_STATUSES. Executor writing either value via /sync-state would be rejected. Fix in task #26 Phase 1.
- 4 planned fields missing from all three representations — task #26 Phase 1, 3, 5 build targets.

**Status:** Audit complete — hard gap documented, fix required in Phase 1
