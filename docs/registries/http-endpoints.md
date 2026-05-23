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

**Last audit:** 2026-05-22T00:00:00Z (by /cross-boundary-audit for task #36)

**Task:** #36 — Add a ship task orchestration capability

**Boundaries checked:** HTTP endpoints in server.js and consumers in resources/mockup.html

**Evidence recorded:**
- 9 entries total (3 pre-existing + 6 new task #36 endpoints)
- 7 entries with complete producer/consumer pairs ✓
- 2 entries planned/deferred ⚠ (/sync-state, /recover — task #26 scope, unchanged)
- 4 shape mismatches corrected:
  - `GET /branch-state`: response shape now reflects project-name top-level wrap, `sessionCount`, `sessionId`, `sessionName`, `timestamp`
  - `POST /reserve-merge-slot`: `position: 0` for acquired vs `1+` for queued now documented
  - `POST /release-merge-slot`: `nextInQueue.slotId` added to response shape
  - `POST /dry-run-merge`: optional `repoPath` request field added
- New identifiers introduced on task #36: `/branch-state`, `/reserve-merge-slot`, `/release-merge-slot`, `/dry-run-merge`, `/push-git`, `/push-obsidian`
- Registries match current code diff: yes (shapes corrected to match server.js:7825–8060)

**Gaps identified:** 4 shape mismatches corrected above. `/sync-state` and `/recover` remain planned (task #26 scope). `orchConflict` and `orchAmber` are fully wired (see websocket-events.md ✓).

**Status:** Audit complete — shape mismatches resolved for task #36 scope.

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

Returns current branch/worktree state for all active sessions grouped by project.

**Method:** `GET`
**Query params:** `project=string` (optional — filter to a single project name)
**Producer:** `server.js:7825` — groups `sessions` map by `projectName`, calls `getWorktreeBranchInfo()` per session, detects contention via `detectFileContention()`
**Consumer:** `resources/mockup.html:15185` — `fetchAndRenderBranchState()` polls every 5 s; `renderBranchState()` at line 15192 reads all fields below

**Response Payload:**
```json
{
  "[projectName]": {
    "sessionCount": "number — total active sessions for this project",
    "featureBranches": {
      "[branch | sessionId]": {
        "sessionId": "string",
        "sessionName": "string",
        "head": "string — HEAD SHA",
        "worktreePath": "string",
        "filesChanged": ["string"],
        "contention": ["string — files also modified by another session"]
      }
    },
    "contention": { "[filename]": true },
    "timestamp": "string — ISO 8601"
  }
}
```

**Status:** ✓ Implemented (task #36, Phase 1) — `server.js:7825`; shape corrected in audit (task #36) — previous registry omitted project-name top-level wrap, `sessionId`, `sessionName`, `sessionCount`, and `timestamp`

---

### `POST /reserve-merge-slot`

Acquire or queue a merge slot for a task promoting to a target branch. Serializes concurrent promotions.

**Method:** `POST`
**Producer:** `proof/task-36-orchestrator.proof.js` — PU2 direct call; also callable for manual resolution. Note: the UI calls `/push-git` which handles slot reservation internally — `mockup.html` does NOT call this endpoint directly.
**Consumer:** `server.js` — FIFO merge slot queue manager

**Request Payload:**
```json
{ "taskNumber": number, "targetBranch": "string", "timeout": number }
```

**Response Payload:**
```json
{ "status": "acquired" | "queued", "slotId": "string", "position": number }
```

**Position semantics:** `position: 0` when status is `acquired` (slot is immediately active); `position: 1+` when status is `queued` (1 = first in queue behind the active slot).

**Status:** ✓ Implemented (task #36, Phase 1) — `server.js:7877` FIFO merge slot queue; persisted to `orchestrator-state.json`

---

### `POST /release-merge-slot`

Release a held merge slot after push completes or is cancelled.

**Method:** `POST`
**Producer:** `proof/task-36-orchestrator.proof.js` — PU2b direct call; also callable for manual conflict resolution (e.g. after user resolves an `orchConflict` held slot). Note: `/push-git` handles slot release internally — `mockup.html` does NOT call this endpoint directly.
**Consumer:** `server.js` — FIFO merge slot queue manager

**Request Payload:**
```json
{ "slotId": "string", "status": "success" | "failed" }
```

**Response Payload:**
```json
{ "released": true, "status": "success" | "failed", "nextInQueue": { "taskNumber": number, "slotId": "string" } | null }
```

**Status:** ✓ Implemented (task #36, Phase 1) — `server.js:7912` releases slot, promotes next queued request, persists state; `nextInQueue.slotId` corrected in audit (was undocumented)

---

### `POST /dry-run-merge`

Attempt merge on a throwaway branch to detect conflicts before any real merge.

**Method:** `POST`
**Producer:** `resources/mockup.html` — push flow (task #36, Phase 4)
**Consumer:** `server.js` — creates throwaway branch, runs `git merge --no-commit --no-ff`, cleans up

**Request Payload:**
```json
{ "sourceBranch": "string", "targetBranch": "string", "repoPath": "string (optional)", "cleanup": boolean }
```

**`repoPath`:** Optional override for the git repo root. When absent, server falls back to `repoWorkDir` of any active session (`server.js:7963`).

**Response Payload (clean):**
```json
{ "status": "clean" }
```

**Response Payload (conflict):**
```json
{ "status": "conflict", "conflictFiles": ["string"] }
```

**Status:** ✓ Implemented (task #36, Phase 2) — `server.js` creates throwaway branch, runs `git merge --no-commit --no-ff`, parses UU/AA/DD conflict markers, always aborts in `finally` block; optional `repoPath` in body

---

### `POST /push-git`

Execute a full serialized push flow for a session: reserve slot → dry-run merge → git push → release slot. Broadcasts `orchConflict` on conflict (slot held); broadcasts `orchAmber` on push failure after retries.

**Method:** `POST`
**Producer:** `resources/mockup.html` — `orchPushGit()` called from "Push Git ↑" button in orchestrator panel
**Consumer:** `server.js` — inline slot/dry-run/push/release flow

**Request Payload:**
```json
{ "sessionId": "string", "targetBranch": "string (default: 'stage')", "slotId": "string (optional — pass when resuming via orchSlotReady to bypass re-queue)" }
```

**Response Payload (clean push):**
```json
{ "status": "success", "branch": "string", "targetBranch": "string" }
```

**Response Payload (queued — slot held by another push):**
```json
{ "status": "queued", "slotId": "string", "position": number }
```

**Response Payload (conflict — slot held, orchConflict broadcast):**
```json
{ "status": "conflict", "conflictFiles": ["string"], "slotId": "string" }
```

**Response Payload (push failed after retries — orchAmber broadcast):**
```json
{ "status": "error", "error": "string" }
```

**Status:** ✓ Implemented (task #36, Phase 4) — `server.js`; retries 3× with exponential backoff; slot always released unless conflict holds it for user resolution

---

### `POST /push-obsidian`

Append a timestamped session summary (branch, worktree, modified files, contention) to the project's Build Plan in the Obsidian vault.

**Method:** `POST`
**Producer:** `resources/mockup.html` — `orchPushObsidian()` called from "Push Obsidian →" button in orchestrator panel
**Consumer:** `server.js` — looks up project obsidianDir, locates `3-Build_Plan.md` or `Build Plan.md`, appends summary

**Request Payload:**
```json
{ "sessionId": "string" }
```

**Response Payload (success):**
```json
{ "ok": true, "filePath": "string — absolute path written" }
```

**Response Payload (error):**
```json
{ "error": "string" }
```

**Status:** ✓ Implemented (task #36, Phase 4) — `server.js`; candidate list: `3-Build-Plan.md`, `3-Build_Plan.md`, `Build Plan.md`, `Build-Plan.md`; creates Build folder if missing

---

## Maintenance Rule

Every PR that adds, removes, or modifies an HTTP endpoint **must update this registry in the same commit**. Changes include:
- New endpoints (add entry)
- Renamed endpoints (update path)
- Payload shape changes (update Request/Response sections)
- Producer/Consumer changes (update entries)

Update the Audit Trail with the relevant task number, commit hash, and brief description.
