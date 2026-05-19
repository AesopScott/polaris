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
- `resources/mockup.html:9364` — `submitBacklogEdit()` sends updated task data from Edit Task modal

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

## Summary

| Event | Producers | Consumers | Status |
|-------|-----------|-----------|--------|
| `list-backlogs` | 1 (client) | 1 (server) | ✓ |
| `backlogs-data` | 5 (server) | 1 (client) | ✓ |
| `backlog-error` | 4 (server) | 1 (client) | ✓ |
| `add-backlog-task` | 1 (client) | 1 (server) | ✓ |
| `update-backlog-task` | 1 (client) | 1 (server) | ✓ |
| `update-backlog-task-status` | 1 (client) | 1 (server) | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-19T14:30:00Z (by /cross-boundary-audit for task #19)

**Boundaries checked:** WebSocket events (backlog feature, including add/update/status mutations)

**Evidence recorded:**
- 6 entries with complete producer/consumer pairs ✓
- 0 entries with gaps ✓
- 0 entries with shape mismatches ✓
- New identifiers introduced on this task: `impact` field in add-backlog-task and update-backlog-task payloads
- Registries match current code diff: pending (task #19 implementation will add impact field)

**Gaps identified:** None (task #19 implementation will complete the impact field wiring)

**Status:** Audit complete, ready for implementation
