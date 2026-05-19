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
- `resources/mockup.html:9334` — `submitBacklogAdd()` sends new task data from Add Task modal

**Consumers (Server receives)**
- `server.js:7773` — Handler receives and calls `addBacklogTask(scope, task)`

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
- `resources/mockup.html:9364` — `submitBacklogEdit()` sends updated task data from Edit Task modal

**Consumers (Server receives)**
- `server.js:7804` — Handler receives and calls `updateBacklogTask(scope, taskNumber, updates)`

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
- `server.js:7816` — Handler receives and calls `updateBacklogTaskStatus(scope, taskNumber, status)`

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
- `lib/debugUtil.js:37` — `emitDebugLogViaWebSocket()` sends via WebSocket when utility unavailable

**Consumers (Server receives)**
- `server.js:7850` — Handler receives and rebroadcasts as `debug-log` to all connected clients

**Status:** ✓ Balanced producer/consumer (task #20 C.1 implementation complete)

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
- `server.js:7855` — WebSocket broadcast handler rebroadcasts `emit-debug-log` messages to all connected clients

**Consumers (Client receives)**
- `resources/mockup.html:4069` — WebSocket message handler receives and renders in debug panel via `pushDebugLog()`

**Status:** ✓ Balanced producer/consumer (task #20 C.1/C.3 implementation complete)

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
| `emit-debug-log` | 1 (agent) | 1 (server) | ✓ |
| `debug-log` | 1 (server) | 1 (client) | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-19T23:30:00Z (by /cross-boundary-audit for task #20)

**Boundaries checked:** WebSocket events (all event types including task #19 impact field and task #20 debug logging)

**Evidence recorded:**
- 8 entries with complete producer/consumer pairs ✓
- 0 entries with gaps ✓
- 0 entries with shape mismatches ✓
- New identifiers verified on task #20: `emit-debug-log` and `debug-log` event types, `pushDebugLog()` and `emitDebugLogViaWebSocket()` utilities
- Registries match current code diff: yes (all implementations for task #20 complete)

**Gaps identified:** None

**Status:** Audit complete, task #20 debug logging fully implemented
