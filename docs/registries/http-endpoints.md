# HTTP Endpoints Registry

Endpoints exposed by Polaris server and the Python LangGraph executor for cross-process communication. For each: producer (client), consumer (handler), method, path, payload shape, response shape.

**Boundary A — Polaris server (server.js):** HTTP POST/GET requests from external processes (Python sidecar, agents) → server.js endpoint handlers → JSON responses.

**Boundary B — Python executor (task_executor.py):** HTTP POST/GET requests from test suite and operator tooling → FastAPI handlers → JSON responses.

---

## Documented Endpoints

### `/dispatch-agent`

Invoke a UI-selected agent from within a Python LangGraph node.

**Method:** `POST`  
**Producer:** Python task_executor.py nodes (Phases 4+)  
**Consumer:** server.js HTTP handler (spawnMaxChat or runDirectAgent wrapper)

**Request Payload:**
```json
{
  "agent": "max" | "claude" | "sonnet" | "codex",
  "prompt": "string — the prompt to send to the agent",
  "task_number": number
}
```

**Response Payload (Success):**
```json
{
  "response": "string — agent's text output",
  "tokens": number,
  "model": "string",
  "agent": "string"
}
```

**Response Payload (Error):**
```json
{
  "error": "string — error message",
  "status": 400 | 500
}
```

**Status:** ✓ Documented (Task #24)
**Audit Trail:** Task #24 Phase 2, commit 42bfb1d (feat: LangGraph sidecar spike), commit a81318 (feat: /lang skill and /dispatch-agent handler)

---

## Executor Endpoints (task_executor.py FastAPI — `http://localhost:4001`)

### `POST /advance`

Advance the task graph. Suspends at HITL interrupt nodes (build gate, review gate); returns immediately on completion or pause. Per-task asyncio.Lock prevents concurrent calls from corrupting state.

**Producer:** `agents/test_executor.py` — test suite calls with `{"task_number": N}`
**Consumer:** `agents/task_executor.py:416` — FastAPI handler; calls `advance_graph(req.task_number)`

**Request Payload:**
```json
{ "task_number": number }
```

**Response Payload (completed):**
```json
{
  "status": "ok", "task_number": number, "current_node": "string",
  "task_status": "string", "sync_warning": "string | null"
}
```

**Response Payload (paused at HITL gate):**
```json
{
  "status": "paused", "task_number": number, "current_node": "string",
  "task_status": "string", "sync_warning": "string | null"
}
```

**Response Payload (transition precondition failed):**
```json
{
  "status": "precondition_failed", "task_number": number, "current_node": "string",
  "task_status": "string", "failures": ["string"]
}
```

**Status:** ✓ Balanced producer/consumer (task #26)

---

### `GET /state`

Retrieve current persisted task state from SQLite checkpoint.

**Producer:** `agents/test_executor.py:46` — test suite calls with `?task_number=N`
**Consumer:** `agents/task_executor.py:194` — FastAPI handler; calls `load_state(task_number)`

**Request:** Query param `task_number=N`

**Response Payload:**
```json
{
  "task_number": number, "current_node": "string", "status": "string",
  "branch_name": "string", "pr_url": "string | null",
  "proof_results": {}, "review_evidence": {}, "checkpoint_data": {}
}
```

**Status:** ✓ Balanced producer/consumer

---

### `POST /signal`

Send a human resume signal to unblock a paused HITL node. Delivers `Command(resume=signal)` to LangGraph; if the graph pauses again at another HITL gate, clears `human_gate_signal` and restarts the stall watchdog for the new gate. Per-task asyncio.Lock prevents concurrent mutations.

**Producer:** No automated caller — manual operator or `/lang` skill
**Consumer:** `agents/task_executor.py:432` — FastAPI handler; delivers `Command(resume=req.signal)` via `_GRAPH.invoke()`

**Request Payload:**
```json
{ "signal": "string — e.g. code_done, approved, request_changes" }
```
**Query param:** `task_number=N`

**Response Payload (graph completed after signal):**
```json
{
  "status": "ok", "signal": "string", "task_number": number,
  "current_node": "string", "task_status": "string", "sync_warning": "string | null"
}
```

**Response Payload (graph paused at next HITL gate):**
```json
{
  "status": "ok", "signal": "string", "task_number": number,
  "current_node": "string", "task_status": "string",
  "advance": { "status": "paused", ... } | { "status": "precondition_failed", ... } | null
}
```

**Status:** ✓ Implemented (task #26) — intentional orphan producer (signals come from human operator)

---

### `GET /health`

Health check for the executor process.

**Producer:** ⚠ No documented consumer — operator/monitoring tooling only
**Consumer:** `agents/task_executor.py:227` — FastAPI handler

**Response Payload:**
```json
{ "status": "ok", "service": "langgraph-executor" }
```

**Status:** ⚠ orphan producer — intentional; no automated client needed

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T00:00:00Z (post-fix update for task #26 second Codex review)

**Task:** #26 — Make task orchestration an explicit state machine

**Boundaries checked:** HTTP endpoints on both server.js (Boundary A) and task_executor.py FastAPI (Boundary B)

**Evidence recorded:**
- 5 entries with complete producer/consumer pairs ✓ (/dispatch-agent, /advance, /state, /signal, /recover)
- 2 intentional orphan producers (/signal manual-only, /health monitoring-only) ⚠
- 4 planned/future entries (/branch-state, /reserve-merge-slot, /release-merge-slot, /dry-run-merge) ⚠
- 0 shape mismatches between paired endpoints
- `/sync-state` promoted from planned → implemented; executor `_sync_status_safe()` calls on all node transitions
- `/recover` promoted from planned → implemented; `agents/task_executor.py:518`
- `/advance` response shape updated: added `task_status`, `sync_warning`, paused/precondition-failed variants
- `/signal` behavior updated: now delivers `Command(resume=...)` with per-task lock, clears `human_gate_signal` on new gates

**Gaps identified:**
- `/signal` and `/health` have no automated consumers (intentional — operator/monitoring use)
- `/branch-state`, `/reserve-merge-slot`, `/release-merge-slot`, `/dry-run-merge` remain planned (task #36)

**Status:** ✓ Audit current — all task #26 planned endpoints implemented and documented

---

### `/sync-state`

Receive a canonical status update from the LangGraph executor and write it to `backlog.json`, then broadcast a `backlogs-data` WebSocket event to refresh the UI.

**Method:** `POST`
**Producer:** `agents/task_executor.py` — `_sync_status_safe()` calls after every node transition (both completed and HITL pause paths)
**Consumer:** `server.js` HTTP handler → `updateBacklogTaskStatus('global', ...)` + `backlogs-data` broadcast

**Request Payload:**
```json
{
  "task_number": number,
  "status": "string — one of VALID_BACKLOG_STATUSES",
  "current_node": "string — name of the node just completed"
}
```

**Response Payload (Success):**
```json
{ "ok": true }
```

**Response Payload (Error):**
```json
{ "error": "string — error message" }
```

**Status:** ✓ Implemented (task #26) — executor calls implemented; sync failures are surfaced as `sync_warning` in response rather than silently swallowed

---

### `/recover`

Query the LangGraph executor for a stalled or failed task's last checkpoint, and offer resume vs. restart.

**Method:** `GET`
**Producer:** `agents/task_executor.py:518` — FastAPI handler
**Consumer:** `/lang` skill, external operator tooling

**Query params:** `task_number=N`

**Response Payload:**
```json
{
  "task_number": number,
  "status": "stalled" | "failed",
  "last_node": "string",
  "paused_at_timestamp": number | null,
  "can_resume": true | false,
  "resume_signal": "string — signal to send to /signal to resume"
}
```

**Status:** ✓ Implemented (task #26)

---

### `GET /branch-state`

Returns current branch/worktree state for all active sessions in a project.

**Method:** `GET`
**Producer:** `server.js` HTTP handler — queries git + OrchestratorRegistry (task #36, Phase 1)
**Consumer:** `resources/mockup.html` — orchestrator panel polls on interval

**Response Payload:**
```json
{
  "featureBranches": {
    "task/N-slug": {
      "head": "string — HEAD SHA",
      "worktreePath": "string",
      "filesChanged": ["string"],
      "contention": ["string — files touched by multiple sessions"]
    }
  }
}
```

**Status:** ⚠ planned (task #36, Task 1.2) — not yet implemented

---

### `POST /reserve-merge-slot`

Acquire or queue a merge slot for a task promoting to a target branch. Serializes concurrent promotions.

**Method:** `POST`
**Producer:** `resources/mockup.html` — Push Git button handler (task #36, Phase 4)
**Consumer:** `server.js` — FIFO merge slot queue manager

**Request Payload:**
```json
{ "taskNumber": number, "targetBranch": "string", "timeout": number }
```

**Response Payload:**
```json
{ "status": "acquired" | "queued", "slotId": "string", "position": number }
```

**Status:** ⚠ planned (task #36, Task 1.3) — not yet implemented

---

### `POST /release-merge-slot`

Release a held merge slot after push completes or is cancelled.

**Method:** `POST`
**Producer:** `resources/mockup.html` — push completion handler (task #36, Phase 4)
**Consumer:** `server.js` — FIFO merge slot queue manager

**Request Payload:**
```json
{ "slotId": "string", "status": "success" | "failed" }
```

**Response Payload:**
```json
{ "released": true, "nextInQueue": { "taskNumber": number } | null }
```

**Status:** ⚠ planned (task #36, Task 1.3) — not yet implemented

---

### `POST /dry-run-merge`

Attempt merge on a throwaway branch to detect conflicts before any real merge.

**Method:** `POST`
**Producer:** `resources/mockup.html` — push flow (task #36, Phase 4)
**Consumer:** `server.js` — creates throwaway branch, runs `git merge --no-commit --no-ff`, cleans up

**Request Payload:**
```json
{ "sourceBranch": "string", "targetBranch": "string", "cleanup": boolean }
```

**Response Payload (clean):**
```json
{ "status": "clean" }
```

**Response Payload (conflict):**
```json
{ "status": "conflict", "conflictFiles": ["string"] }
```

**Status:** ⚠ planned (task #36, Task 1.4 stub → Task 2.3 full impl) — not yet implemented

---

## Maintenance Rule

Every PR that adds, removes, or modifies an HTTP endpoint **must update this registry in the same commit**. Changes include:
- New endpoints (add entry)
- Renamed endpoints (update path)
- Payload shape changes (update Request/Response sections)
- Producer/Consumer changes (update entries)

Update the Audit Trail with the relevant task number, commit hash, and brief description.
