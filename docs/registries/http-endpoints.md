# HTTP Endpoints Registry

Endpoints exposed by Polaris server for cross-process communication. For each: producer (client), consumer (handler), method, path, payload shape, response shape.

**Boundary:** HTTP POST/GET requests from external processes (Python sidecar, agents) → server.js endpoint handlers → JSON responses.

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

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T12:00:00Z (by /cross-boundary-audit for task #26)

**Task:** #26 — Make task orchestration an explicit state machine

**Boundaries checked:** HTTP endpoints between server.js and agents/task_executor.py

**Evidence recorded:**
- 1 existing entry fully documented ✓ (/dispatch-agent)
- 2 new entries pre-registered as planned ⚠ (/sync-state, /recover)
- 0 shape mismatches
- New identifiers introduced on task #26: `/sync-state` (server.js, Task 6.3), `/recover` (task_executor.py, Task 3.3)
- Registries match current code diff: yes (entries marked planned — not yet implemented)

**Gaps identified:** `/sync-state` and `/recover` are orphan consumers until task #26 build lands. Intentional — pre-registered so build session has contract to implement against.

**Status:** Audit complete — registries updated for task #26 scope.

---

### `/sync-state`

Receive a canonical status update from the LangGraph executor and write it to `backlog.json`, then broadcast a `backlogs-data` WebSocket event to refresh the UI.

**Method:** `POST`
**Producer:** `agents/task_executor.py` — calls after each successful node transition (task #26)
**Consumer:** `server.js` HTTP handler → `updateBacklogTaskStatus()` + `backlogs-data` broadcast

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

**Status:** ⚠ planned (task #26, Task 6.3) — not yet implemented in server.js

---

### `/recover`

Query the LangGraph executor for a stalled or failed task's last checkpoint, and offer resume vs. restart.

**Method:** `GET`
**Producer:** `agents/task_executor.py` FastAPI — exposes the endpoint (task #26)
**Consumer:** `/lang` skill, external operator tooling

**Query params:** `task_number=N`

**Response Payload:**
```json
{
  "task_number": number,
  "status": "stalled" | "failed",
  "last_node": "string",
  "paused_at_timestamp": number,
  "can_resume": true | false,
  "resume_signal": "string — signal to send to /signal to resume"
}
```

**Status:** ⚠ planned (task #26, Task 3.3) — not yet implemented in task_executor.py

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

**Status:** ✓ Implemented (task #36, Phase 1) — `server.js` `/branch-state` handler; groups active sessions by `projectName`, calls `getWorktreeBranchInfo()` per session, detects contention via `detectFileContention()`

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

**Status:** ✓ Implemented (task #36, Phase 1) — `server.js` FIFO merge slot queue; persisted to `orchestrator-state.json`

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

**Status:** ✓ Implemented (task #36, Phase 1) — `server.js` releases slot, promotes next queued request, persists state

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

**Status:** ✓ Implemented (task #36, Phase 2) — `server.js` creates throwaway branch, runs `git merge --no-commit --no-ff`, parses UU/AA/DD conflict markers, always aborts in `finally` block; optional `repoPath` in body

---

## Maintenance Rule

Every PR that adds, removes, or modifies an HTTP endpoint **must update this registry in the same commit**. Changes include:
- New endpoints (add entry)
- Renamed endpoints (update path)
- Payload shape changes (update Request/Response sections)
- Producer/Consumer changes (update entries)

Update the Audit Trail with the relevant task number, commit hash, and brief description.
