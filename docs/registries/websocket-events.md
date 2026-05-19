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

## Summary

| Event | Producers | Consumers | Status |
|-------|-----------|-----------|--------|
| `list-backlogs` | 1 (client) | 1 (server) | ✓ |
| `backlogs-data` | 5 (server) | 1 (client) | ✓ |
| `backlog-error` | 4 (server) | 1 (client) | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-19T05:15:00Z (by /cross-boundary-audit)

**Boundaries checked:** WebSocket events (backlog feature)

**Evidence recorded:**
- 3 entries with complete producer/consumer pairs ✓
- 0 entries with gaps ✓
- 0 entries with shape mismatches ✓
- New identifiers introduced on this task: none (task #16 is UI-only, no new messages)
- Registries match current code diff: yes

**Gaps identified:** None

**Status:** Audit complete
