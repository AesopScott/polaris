# WebSocket Events Registry

Every WebSocket event type used for client-server communication in Polaris. For each: producers, consumers, and status.

---

## `list-backlogs`

Request from client to server to refresh the backlog list.

**Schema / shape:** 
- Request: `{ type: 'list-backlogs' }`
- No additional payload

**Producers (Client sends)**
- `resources/mockup.html:8903` — `refreshBacklogPanel()` sends request
- `resources/mockup.html:8924` — same function

**Consumers (Server receives)**
- `server.js:7745` — Handler receives and loads backlog data from Obsidian + projects

**Status:** ✓ Balanced producer/consumer

---

## `backlogs-data`

Response from server with backlog content (global, project-specific, archived).

**Schema / shape:**
```javascript
{
  type: 'backlogs-data',
  global: Array<BacklogTask>,      // Global backlog items
  projects: Object<String, Array>,  // Per-project backlogs
  archive: Array<BacklogTask>       // Archived tasks
}
```

**Producers (Server sends)**
- `server.js:7748` — Vault backlog load
- `server.js:7760` — Vault + global backlog load
- `server.js:7779` — Archive load
- `server.js:7791` — All backlogs (vault + projects)
- `server.js:7803` — Project backlog load
- `server.js:/sync-state handler` — ⚠ planned (task #26, Task 6.3) — broadcast after executor pushes status update via POST /sync-state

**Consumers (Client receives)**
- `resources/mockup.html:4640` — Message handler calls `renderBacklog()` with payload

**Status:** ✓ Shape matches across all producers/consumers

---

## `backlog-error`

Error response from server when backlog loading fails.

**Schema / shape:**
```javascript
{
  type: 'backlog-error',
  error: String  // Human-readable error message
}
```

**Producers (Server sends on error)**
- `server.js:7750` — Vault backlog load error
- `server.js:7762` — Vault + global backlog error
- `server.js:7781` — Archive load error
- `server.js:7805` — Project backlog error

**Consumers (Client receives)**
- `resources/mockup.html:4645` — Message handler calls `showBacklogError()` with error string

**Status:** ✓ Shape matches across all producers/consumers

---

## `add-backlog-task`

Request from client to server to add a new backlog task.

**Schema / shape:**
```javascript
{
  type: 'add-backlog-task',
  scope: String,                    // 'global' or project name
  task: {
    title: String,                  // Task title (required)
    description: String,            // Task description (optional)
    priority: Number,               // Priority 1-200 (optional, defaults to 50)
    category: String,               // Category name (optional, defaults to 'feature')
    impact: String                  // Impact level: 'minor' | 'standard' | 'major' (optional, defaults to 'standard')
  }
}
```

**Producers (Client sends)**
- `resources/mockup.html:9409` — `submitBacklogAdd()` sends new task data from Add Task modal

**Consumers (Server receives)**
- `server.js:7769` — Handler receives and calls `addBacklogTask(scope, task)`

**Status:** ✓ Balanced producer/consumer (impact field added by task #19)

---

## `update-backlog-task`

Request from client to server to update an existing backlog task's fields.

**Schema / shape:**
```javascript
{
  type: 'update-backlog-task',
  scope: String,                    // 'global' or project name
  taskNumber: Number,               // Task number to update
  updates: {
    title: String,                  // New title (optional)
    description: String,            // New description (optional)
    priority: Number,               // New priority (optional)
    category: String,               // New category (optional)
    impact: String                  // New impact level (optional)
  }
}
```

**Producers (Client sends)**
- `resources/mockup.html:9441` — `submitBacklogEdit()` sends updated task data from Edit Task modal

**Consumers (Server receives)**
- `server.js:7800` — Handler receives and calls `updateBacklogTask(scope, taskNumber, updates)`

**Status:** ✓ Balanced producer/consumer (impact field added by task #19)

---

## `update-backlog-task-status`

Request from client to server to change a backlog task's status.

**Schema / shape:**
```javascript
{
  type: 'update-backlog-task-status',
  scope: String,                    // 'global' or project name
  taskNumber: Number,               // Task number to update
  status: String                    // New status value
}
```

**Producers (Client sends)**
- `resources/mockup.html:9438` — Status picker sends status change request

**Consumers (Server receives)**
- `server.js:7781` — Handler receives and calls `updateBacklogTaskStatus(scope, taskNumber, status)`

**Status:** ✓ Balanced producer/consumer

---

## `emit-debug-log`

Fallback message from agents/generated code to server when the `pushDebugLog()` utility is unavailable (e.g., in environments that cannot import the utility directly).

**Schema / shape:**
```javascript
{
  type: 'emit-debug-log',
  message: String,   // Debug log message
  isError: Boolean   // Whether this is an error (affects styling)
}
```

**Producers (Client/Agent sends)**
- (Task #20 C.2 implementation) — Generated code unable to import `pushDebugLog()` utility will call this via WebSocket as fallback

**Consumers (Server receives)**
- (Task #20 C.1 implementation) — `server.js` WebSocket handler receives and rebroadcasts as `debug-log` to all connected clients

**Status:** ⚠ **intentional orphan producer** — Producer code (C.2) will be added after consumer handler (C.1). Fallback infrastructure must be ready before agents attempt to call it.

---

## `debug-log`

Server broadcast of debug log entries to all connected UI clients. Produced by the server as a rebroadcast of `emit-debug-log` messages and internal debug events.

**Schema / shape:**
```javascript
{
  type: 'debug-log',
  message: String,         // Debug log message with optional [timestamp] prefix
  isError: Boolean         // Whether this is an error (affects styling)
}
```

**Producers (Server sends)**
- (Task #20 C.1 implementation) — `server.js` WebSocket broadcast handler rebroadcasts `emit-debug-log` messages and other debug events to all connected clients

**Consumers (Client receives)**
- (Task #20 C.3 implementation) — `resources/mockup.html` WebSocket message handler receives and renders in the debug panel via `pushDebugLog()`

**Status:** ⚠ **intentional orphan consumer** — Consumer UI code (C.3) will be added after producer broadcast (C.1). Broadcast infrastructure must be ready before UI adds the handler.

---

## `orchConflict`

Server broadcast when `POST /dry-run-merge` detects a merge conflict. Holds the merge slot until resolved.

**Schema / shape:**
```javascript
{
  type: 'orchConflict',
  sessionId: String,       // Session whose push triggered the conflict
  sourceBranch: String,
  targetBranch: String,
  conflictFiles: Array<String>,  // Files with conflict markers
  diffExcerpt: String,     // git diff --stat HEAD output (≤500 chars) captured before cleanup
  slotId: String           // Held merge slot — must be released after resolution
}
```

**Producers (Server sends)**
- `server.js` — `POST /push-git` handler broadcasts when dry-run detects conflict (task #36, Phase 4) ✓

**Consumers (Client receives)**
- `resources/mockup.html:4678` — `renderOrchConflict()` appends amber alert card and auto-opens orchestrator panel ✓

**Status:** ✓ Fully wired (task #36, Phase 4) — producer in `/push-git` handler; consumer in `orchConflict` WS case

---

## `orchAmber`

Server broadcast for permanent push failure or unresolvable conflict requiring Scott's decision.

**Schema / shape:**
```javascript
{
  type: 'orchAmber',
  sessionId: String,
  reason: String,          // Human-readable reason
  detail: String,          // Technical detail (error message, diff excerpt)
  retryCount: Number,      // How many retries were attempted
  slotId: String | null    // Held slot if applicable
}
```

**Producers (Server sends)**
- `server.js` — `POST /push-git` handler broadcasts after 3 failed push attempts (task #36, Phase 4) ✓

**Consumers (Client receives)**
- `resources/mockup.html:4688` — `renderOrchAmber()` appends red failure card and auto-opens orchestrator panel ✓

**Status:** ✓ Fully wired (task #36, Phase 4) — producer in `/push-git` retry-exhausted path; consumer in `orchAmber` WS case

---

## `orchSlotReady`

Server broadcast when a queued `/push-git` slot becomes active after the previous push completes. Triggers the UI to auto-retry the queued push without requiring user interaction.

**Schema / shape:**
```javascript
{
  type: 'orchSlotReady',
  sessionId: String,      // Session whose push is now ready to execute
  sourceBranch: String,   // Branch to push
  targetBranch: String,   // Merge target (e.g. 'stage')
  slotId: String          // Now-active slot ID
}
```

**Producers (Server sends)**
- `server.js` — `/push-git` handler broadcasts when slot is released and next queued push-git entry is promoted ✓
- `server.js` — `/release-merge-slot` handler broadcasts same when the promoted entry has a sessionId ✓

**Consumers (Client receives)**
- `resources/mockup.html` — `orchSlotReady` WS case calls `window.orchPushGit(sessionId, sourceBranch, targetBranch, slotId)` to auto-trigger ✓

**Status:** ✓ Fully wired (task #36, review fixes) — closes PU7 auto-trigger gap

---

## `tool-audit`

Server broadcast emitted for every `evaluatePolicy()` call that results in a block or an installer grant. Provides real-time visibility of privileged actions in the session card.

**Schema / shape:**
```javascript
{
  type: 'tool-audit',
  ts: String,              // ISO 8601 timestamp
  sessionId: String,       // Session that triggered the action
  action: String,          // 'shell-command' | 'file-write' | 'installer-exec'
  tool: String,            // 'Bash' | 'PowerShell' | 'Write' | 'Edit'
  allowed: Boolean,        // Whether the action was permitted
  reason: String | null,   // Block reason (present when allowed=false)
  commandSnippet: String   // First 120 chars of command or file path
}
```

**Producers (Server sends)**
- `server.js` — `evaluatePolicy()` emits on every block (`allowed=false`) and every installer grant (`action='installer-exec', allowed=true`) (task #44, planned)

**Consumers (Client receives)**
- `resources/mockup.html` — session card surfaces blocks/grants as inline audit badges (task #44, planned — exact line TBD)

**Note:** Allowed non-installer actions do NOT emit this event to avoid noise. Only blocks and explicit grants are broadcast.

**Status:** ⚠ planned (task #29/#44) — pre-registered so build session has contract to implement against

---

## Summary

| Event | Producers | Consumers | Status |
|-------|-----------|-----------|--------|
| `list-backlogs` | 1 (client) | 1 (server) | ✓ |
| `backlogs-data` | 5 (server) | 1 (client) | ✓ |
| `backlog-error` | 4 (server) | 1 (client) | ✓ |
| `add-backlog-task` | 1 (client) | 1 (server) | ✓ |
| `update-backlog-task` | 1 (client) | 1 (server) | ✓ |
| `update-backlog-task-status` | 1 (client) | 1 (server) | ✓ |
| `emit-debug-log` | 1 (agent) | 1 (server) | ⚠ (intentional) |
| `debug-log` | 1 (server) | 1 (client) | ⚠ (intentional) |
| `orchConflict` | 1 (server checked) | 1 (client checked) | fully wired (Phase 4) |
| `orchAmber` | 1 (server checked) | 1 (client checked) | fully wired (Phase 4) |
| `orchSlotReady` | 2 (server checked) | 1 (client checked) | fully wired (review fixes) |
| `tool-audit` | 1 (server, planned) | 1 (client, planned) | planned (task #29/#44) |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T00:00:00Z (by /cross-boundary-audit for task #36)

**Task:** #36 — Add a ship task orchestration capability

**Boundaries checked:** WebSocket event types between client (mockup.html) and server (server.js) for orchestrator events

**Evidence recorded:**
- 11 entries documented
- 9 entries with complete producer/consumer pairs ✓
- 2 entries with intentional orphan gaps ⚠ (emit-debug-log, debug-log — task #20 scope)
- 0 entries with partial gaps (orchConflict, orchAmber, orchSlotReady all fully wired in Phase 4)
- 0 shape mismatches
- New identifiers introduced on task #36: `orchConflict`, `orchAmber`, `orchSlotReady` (all fully wired in Phase 4)
- Registries match current code diff: yes — all orch events verified producer and consumer in Phase 4 + review fixes

**Gaps identified:** `backlogs-data` planned producer (task #26) still pending /sync-state implementation. All task #36 orch events are now fully wired.

**Status:** Audit complete — WS events registry verified for task #36 scope. All Phase 4 events fully wired.

---

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit for task #29 planning)

**Task:** #29 — Replace regex-heavy tool safety with capability policies

**Boundaries checked:** WebSocket event types between client (mockup.html) and server (server.js)

**Evidence recorded:**
- 11 entries documented (10 previous + `tool-audit` added)
- 6 entries with complete producer/consumer pairs ✓
- 2 entries with intentional orphan gaps ⚠ (emit-debug-log, debug-log for task #20)
- 2 entries planned/pending from task #36 (orchConflict, orchAmber) ⚠
- 1 new entry pre-registered as planned ⚠ (tool-audit, task #29/#44)
- 0 entries with shape mismatches
- New identifiers introduced on task #29: `tool-audit` event pre-registered
- Registries match current code diff: yes (new entry marked planned)

**Gaps identified:** `tool-audit` is an orphan producer until task #44 builds it. Intentional — pre-registered so build session has contract to implement against.

**Status:** Audit complete — registries updated for task #29 planning scope.
