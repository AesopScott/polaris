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

**TypedDict:** `status: StatusLiteral` (`state.py:30`) — see StatusLiteral section for full enum
**SQLite:** `status TEXT NOT NULL` (`task_executor.py:61`) — no enum constraint (validated at transition time)
**Pydantic:** `status: str = "planned"` (`state.py:47`) — no enum constraint
**server.js:** `VALID_BACKLOG_STATUSES` set at `server.js:3222`

**Status:** ✓ Aligned — StatusLiteral values match VALID_BACKLOG_STATUSES (task #26 fix)

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

## Field: `proof_units`

Full array of proof unit specs loaded from backlog.json when a task starts.

**TypedDict:** `proof_units: List[Dict[str, Any]]` (`state.py:33`)
**SQLite:** `proof_units TEXT NOT NULL DEFAULT '[]'` (JSON-serialized, added via ALTER TABLE in task #26)
**Pydantic:** `proof_units: List[Dict[str, Any]] = []` (`state.py:50`)

**Status:** ✓ Implemented (task #26)

---

## Field: `human_gate_signal`

Signal received from POST /signal that unblocks a HITL pause node. None when no signal pending.

**TypedDict:** `human_gate_signal: Optional[str]` (`state.py:35`)
**SQLite:** `human_gate_signal TEXT` (nullable, added via ALTER TABLE in task #26)
**Pydantic:** `human_gate_signal: Optional[str] = None` (`state.py:52`)

**Status:** ✓ Implemented (task #26)

---

## Field: `retry_count`

Number of times the current node has been retried after failure.

**TypedDict:** `retry_count: int` (`state.py:36`)
**SQLite:** `retry_count INTEGER NOT NULL DEFAULT 0` (added via ALTER TABLE in task #26)
**Pydantic:** `retry_count: int = 0` (`state.py:53`)

**Status:** ✓ Implemented (task #26)

---

## Field: `error_log`

Ordered list of exception messages captured by the @safe_node decorator.

**TypedDict:** `error_log: List[str]` (`state.py:37`)
**SQLite:** `error_log TEXT NOT NULL DEFAULT '[]'` (JSON-serialized, added via ALTER TABLE in task #26)
**Pydantic:** `error_log: List[str] = []` (`state.py:54`)

**Status:** ✓ Implemented (task #26)

---

## StatusLiteral Alignment

The `status` field written by the executor must be accepted by `updateBacklogTaskStatus()` in server.js, which validates against `VALID_BACKLOG_STATUSES` (server.js:3222).

### Current state.py StatusLiteral (state.py:13–22, task #26)
```
"planned", "build-started", "build-finished", "cba-complete",
"staged", "production", "stalled", "failed"
```

### Current VALID_BACKLOG_STATUSES (server.js:3222)
```
"backlog", "planned", "build-started", "build-finished", "cba-complete", "review-blocked",
"staged", "production", "failed-smoke-test", "stalled", "failed",
"blocked", "on-hold", "cancelled"
(+ legacy: "ready", "in-progress", "complete", "pr-reviewed", "cba-half-complete", "smoke-tested")
```

### Alignment

| Status value | In state.py Literal | In VALID_BACKLOG_STATUSES | Notes |
|---|---|---|---|
| `"planned"` | ✓ | ✓ | ✓ Aligned (task #26 fix) |
| `"build-started"` | ✓ | ✓ | ✓ Aligned |
| `"build-finished"` | ✓ | ✓ | ✓ Aligned |
| `"cba-complete"` | ✓ | ✓ | ✓ Aligned (task #26 fix — was "reviewed") |
| `"staged"` | ✓ | ✓ | ✓ Aligned |
| `"production"` | ✓ | ✓ | ✓ Aligned |
| `"stalled"` | ✓ | ✓ | ✓ Aligned (task #26 addition) |
| `"failed"` | ✓ | ✓ | ✓ Aligned |

**Status:** ✓ All StatusLiteral values align with VALID_BACKLOG_STATUSES. Phantom values "planning" and "reviewed" removed in task #26.

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
| `proof_units` | ✓ | ✓ | ✓ | ✓ |
| `human_gate_signal` | ✓ | ✓ | ✓ | ✓ |
| `retry_count` | ✓ | ✓ | ✓ | ✓ |
| `error_log` | ✓ | ✓ | ✓ | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-23T03:50:00Z (post-build update by /review-pr for task #26)

**Task:** #26 — Make task orchestration an explicit state machine

**Boundaries checked:** TaskState TypedDict (state.py), SQLite schema (task_executor.py), Pydantic model (state.py), StatusLiteral vs VALID_BACKLOG_STATUSES (server.js:3222)

**Evidence recorded:**
- 12 field entries documented
- 12 entries aligned across TypedDict/SQLite/Pydantic ✓
- 0 shape mismatches
- StatusLiteral fully aligned — phantom "planning" and "reviewed" removed; "planned", "stalled", "cba-complete" added

**Gaps identified:**
- None — all planned fields from pre-build baseline are now implemented

**Status:** ✓ Audit current — all fields shipped in task #26
