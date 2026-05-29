# WebSocket Message Registry

Every WebSocket `type` string exchanged between the Polaris client (`resources/mockup.html`) and server (`server.js`). For each: producer (who sends it), consumer (who handles it), status. Update whenever a message type is added, removed, or its payload shape changes.

**Boundary:** `wsSend({ type: '...' })` in mockup.html → `if (type === '...')` in server.js, and server `ws.send(JSON.stringify({ type: '...' }))` → `case '...'` handlers in mockup.html.

**Total types detected:** ~100. All types not listed individually below are ✓ (paired, no shape gap found). Only gap entries are documented in full.

---

## Gaps

### `get-config`

Load the full Polaris config object.

**Producers:** none — client never sends this type  
**Consumers**
- `server.js:7710` — reads and returns `config.json`

**Status:** ⚠ orphan server handler  
**Note:** Pre-existing before Task #7. Likely a dead code path left over from an earlier settings flow. Safe to remove or wire up; no impact on current functionality.

---

### `get-history`

Retrieve session message history.

**Producers:** none — client never sends this type  
**Consumers**
- `server.js:7596` — returns stored message history for a session

**Status:** ⚠ orphan server handler  
**Note:** Pre-existing before Task #7. History may now be handled inline; worth verifying before removing.

---

### `get-pre-build-check-status`

Poll for the result of a pre-build check.

**Producers:** none — client never sends this type  
**Consumers**
- `server.js:9970` — returns the cached pre-build check result

**Status:** ⚠ orphan server handler  
**Note:** Pre-existing before Task #7. Pre-build check flow may have been refactored to push results instead of polling.

---

### `ping`

Liveness check / keep-alive.

**Producers:** none — client never sends this type  
**Consumers**
- `server.js:10751` — responds to keep-alive

**Status:** ⚠ orphan server handler  
**Note:** Pre-existing before Task #7. Likely superseded by WebSocket native ping/pong frames or the connection is considered always-live while the Electron window is open.

---

### `error` (INVALID_MSG variant)

Structured validation-failure response sent by server when a known client message type fails Zod schema validation. Added by task #38 Phase C via `WS_SCHEMA_REGISTRY` + gate in `handleMessage()`.

**Payload:** `{ type: 'error', code: 'INVALID_MSG', msgType: string, issues: ZodIssue[], text: string }`

**⚠ `text` field is required** — the existing `case 'error'` handler at `mockup.html:5886` renders `alert(\`Server error: ${msg.text}\`)`. Without `text`, the alert shows "Server error: undefined".

**Producers (server sends)**
- *(task #38 adding)* `server.js` — `handleMessage()` validation gate; fires when `WS_SCHEMA_REGISTRY.get(type)` returns a schema and `safeParse(msg).success === false`

**Consumers (client handles)**
- `resources/mockup.html:5886` — `case 'error'`: `alert(\`Server error: ${msg.text}\`)` + `pushDebugLog(...)`

**Status:** ⚠ producer pending (task #38 Phase C) — consumer already exists at mockup.html:5886

---

### `task-pipeline-state`

Live pipeline position update for a backlog task — step index, current status, and last gate result. Broadcast by server whenever a task's `backlog.json` status changes.

**Payload:** `{ type: 'task-pipeline-state', taskNumber: number, status: string, stepIndex: number, lastSkill: string | null, lastResult: string | null }`

**Producers (server sends)**
- `server.js:3942` — broadcast from `toolSetTaskState` whenever `taskState` changes

**Consumers (client handles)**
- `resources/mockup.html` — `case 'task-pipeline-state'`: patches `#pipeline-bar-{taskNumber}` step classes live

**Status:** ✓ Balanced (task #31)

---

## Zod Schema Coverage (tasks #37, #38, #40)

All ~75 WebSocket message types that transit the Polaris WS boundary have corresponding Zod schemas in `src/contracts/ws-messages.ts`. Task #37 defined the schemas; task #40 added a Vitest test consumer; task #38 is wiring receive-side validation in `handleMessage()` via `WS_SCHEMA_REGISTRY`.

**Schema location:** `src/contracts/ws-messages.ts`
**Barrel export:** `src/contracts/index.ts`
**Test consumer:** `test/contracts/ws-messages.test.ts` — 59 tests covering all major schemas and the `AnyClientMessage` discriminated union ✓
**Runtime consumer:** *(task #38 adding)* `server.js` — `WS_SCHEMA_REGISTRY` map + validation gate in `handleMessage()`

Notable exports:
- `LaunchMessage`, `ResumeMessage`, `StopMessage`, `CloseSessionMessage` — session lifecycle
- `CrossCheckDecisionMessage`, `InstallerPermissionDecisionMessage` — agent interaction
- `AddBacklogTaskMessage`, `UpdateBacklogTaskMessage` — backlog mutations
- `AnyClientMessage` — discriminated union over all ~75 types; `WS_SCHEMA_REGISTRY` is derived from it

**⚠ Divergence risk (task #38 consolidating):** `AnyClientMessage` union type also exists in `src/runtime/contracts.ts:611` as a TypeScript interface union. Task #38 derives the `WS_SCHEMA_REGISTRY` from the Zod discriminated union, making the TypeScript interface union redundant. See also `docs/registries/zod-contracts.md` for the full contract module registry.

---

## `get-memory-status`

Client request to fetch the current Obsidian memory index stats and recent retrieval history.

**Payload:** `{ type: 'get-memory-status', sessionId: string }`

**Producers (client sends)**
- `resources/mockup.html:13028` — `refreshMemoryPanel()` sends with `focusedSessionId`

**Consumers (server handles)**
- `server.js:10417` — reads `session.memoryIndex` stats and last 20 records from `memory-traces/traces.jsonl`; emits `memory-status` response

**Zod schema:** pending (task #38 consolidation)

**Status:** ✓ (added task #28)

---

## `memory-status`

Server response with Obsidian chunk index stats and last 20 retrieval events from the JSONL log.

**Payload:**
```javascript
{
  type: 'memory-status',
  stats: {
    chunkCount: number,      // Total chunks in index
    fileCount: number,       // Source Obsidian files indexed
    lastIndexed: string      // ISO 8601 timestamp of last indexing
  },
  history: Array<{
    ts: string,              // ISO 8601 timestamp
    query: string,           // Query text passed to QueryMemory
    topSources: string[],    // Top-3 source citations (file § heading)
    scores: number[]         // Composite scores for top-3
  }>                         // Last 20 entries from traces.jsonl
}
```

**Producers (server sends)**
- `server.js:10436` — `get-memory-status` handler; reads `session.memoryIndex` and `memory-traces/traces.jsonl`

**Consumers (client handles)**
- `resources/mockup.html:5290` — `case 'memory-status'`: calls `renderMemoryPanel(msg)`

**Zod schema:** pending (task #38 consolidation)

**Status:** ✓ (added task #28)

---

## Summary

| Type | Direction | Status |
|------|-----------|--------|
| `get-config` | client → server | ⚠ orphan server handler |
| `get-history` | client → server | ⚠ orphan server handler |
| `get-pre-build-check-status` | client → server | ⚠ orphan server handler |
| `ping` | client → server | ⚠ orphan server handler |
| `ui-client-hello` | client → server | ✓ (added task #41) |
| `ui-client-ack` | server → client | ✓ (added task #41) |
| `advance-task` | client → server | ✓ (added task #33) |
| `advance-task-result` | server → client | ✓ (added task #33) |
| `send-lang-signal` | client → server | ✓ (added task #33) |
| `lang-signal-result` | server → client | ✓ (added task #33) |
| `get-memory-status` | client → server | ✓ (added task #28) |
| `memory-status` | server → client | ✓ (added task #28) |
| *(all other ~96 types)* | both | ✓ |

---

## `advance-task`

Client request to advance the LangGraph task graph one step via the executor `/advance` endpoint.

**Payload:** `{ type: 'advance-task', taskNumber: number }`

**Producers (client sends)**
- `resources/mockup.html:10108` — Advance button click handler in LangGraph controls on task row

**Consumers (server handles)**
- `server.js:9519` — proxies to `POST localhost:4001/advance`, responds with `advance-task-result`

**Status:** ✓ Balanced (task #33)

---

## `advance-task-result`

Server response after proxying to executor `/advance`.

**Payload:** `{ type: 'advance-task-result', taskNumber: number, status: string, current_node: string, ... } | { error: string }`

**Producers (server sends)**
- `server.js:9532` — success path, spreads executor response
- `server.js:9534` — error path, error string

**Consumers (client handles)**
- `resources/mockup.html:5154` — `advance-task-result` WS case; re-enables button, pushes result to debug panel

**Status:** ✓ Balanced (task #33)

---

## `send-lang-signal`

Client request to deliver a human resume signal to an executor HITL gate.

**Payload:** `{ type: 'send-lang-signal', taskNumber: number, signal: string }`

**Producers (client sends)**
- `resources/mockup.html:10122` — Signal button click handler in LangGraph controls on task row

**Consumers (server handles)**
- `server.js:9539` — proxies to `POST localhost:4001/signal?task_number=N`, responds with `lang-signal-result`

**Status:** ✓ Balanced (task #33)

---

## `lang-signal-result`

Server response after proxying to executor `/signal`.

**Payload:** `{ type: 'lang-signal-result', taskNumber: number, signal: string, status: string, ... } | { error: string }`

**Producers (server sends)**
- `server.js:9552` — success path, spreads executor response
- `server.js:9554` — error path, error string

**Consumers (client handles)**
- `resources/mockup.html:5166` — `lang-signal-result` WS case; re-enables button, pushes result to debug panel

**Status:** ✓ Balanced (task #33)

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-25T00:00:00Z (by /cross-boundary-audit for task #38)

**Task audited:** #38 — Wire runtime validation: use compiled contracts in server.js

**Boundaries checked:** WebSocket `type` message types; new `error` INVALID_MSG shape; `WS_SCHEMA_REGISTRY` coverage

**Evidence recorded:**
- 0 new WS message types added to the schema yet (pre-implementation audit)
- New shape variant registered: `{ type: 'error', code: 'INVALID_MSG', msgType, issues, text }` — producer pending (task #38 Phase C), consumer exists at `mockup.html:5886`
- `text` field requirement confirmed: `mockup.html:5886` reads `msg.text` in the `case 'error'` handler
- Zod Schema Coverage section updated: task #38 adding `WS_SCHEMA_REGISTRY` runtime consumer
- `AnyClientMessage` divergence risk updated: task #38 consolidates via `WS_SCHEMA_REGISTRY`
- Registries match current code diff: yes (pre-implementation state)

**Gaps identified:**
- `error` (INVALID_MSG) producer pending task #38 Phase C ⚠ — intentional, pre-registered

**Status:** Audit complete

---

**Last audit:** 2026-05-24T00:00:00Z (by /cross-boundary-audit for task #40)

**Task audited:** #40 — Contract test suite: validate real payload samples

**Boundaries checked:** WebSocket `type` message types; Zod schema coverage for `src/contracts/ws-messages.ts`

**Evidence recorded:**
- No new WS message types introduced by task #40
- 2 stale line refs corrected: `get-pre-build-check-status` `:8060` → `:9970`; `ping` `:8841` → `:10751`
- Zod schema coverage section updated: `test/contracts/ws-messages.test.ts` (59 tests) added as test consumer
- Runtime consumer count unchanged: 0 (task #38 pending)
- Registries match current code diff: yes

**Gaps identified:**
- 4 pre-existing orphan server handlers (get-config, get-history, get-pre-build-check-status, ping) — unchanged
- `AnyClientMessage` maintained in both `src/contracts/ws-messages.ts` and `src/runtime/contracts.ts:611` — divergence risk, flagged for task #38 consolidation

**Status:** Audit complete

---

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit for task #33)

**Task:** #33 — LangGraph node implementation + HITL

**Boundaries checked:** WebSocket message types between client (resources/mockup.html) and server (server.js)

**Evidence recorded:**
- 4 new WS message types added and balanced: `advance-task`, `advance-task-result`, `send-lang-signal`, `lang-signal-result`
- All 4 have complete producer/consumer pairs ✓
- 0 shape mismatches
- Line references recorded for both server.js handlers and mockup.html case handlers

**Gaps identified:** None new. Pre-existing orphan handlers unchanged.

**Status:** ✓ Audit complete — task #33 additions registered

---

**Last audit:** 2026-05-23T14:00:00Z (by /cross-boundary-audit for task #42)

**Tasks audited:** #41 — Capability policy schema + session wiring; #42 — Command class registry for shell safety

**Boundaries checked:** WebSocket `type` message types between client (resources/mockup.html) and server (server.js)

**Evidence recorded:**
- 98 entries with complete producer/consumer pairs ✓
- 4 entries with gaps (orphan server handlers) ⚠ (pre-existing, unchanged)
- 0 entries with shape mismatches
- New identifiers introduced on task #41: `ui-client-hello` (client→server, client ID handshake), `ui-client-ack` (server→client, handshake response) — both balanced ✓
- New identifiers introduced on task #42: none (pure internal refactor — no WS messages added or removed)
- Registries match current code diff: yes

**Gaps identified:** 4 pre-existing orphan handlers (get-config, get-history, get-pre-build-check-status, ping) — unchanged since task #25.

**Status:** Audit complete

---

**Last audit:** 2026-05-22T00:00:00Z (by /cross-boundary-audit for task #37)

**Task:** #37 — Contracts foundation: Zod schemas in src/contracts/

**Boundaries checked:** WebSocket message type coverage against new Zod schemas in `src/contracts/ws-messages.ts`

**Evidence recorded:**
- ~50 WebSocket message types now have Zod schemas — all intentional orphan producers (no consumers until task #38)
- `AnyClientMessage` discriminated union exported from `src/contracts/ws-messages.ts`
- Divergence risk: `AnyClientMessage` also defined at `src/runtime/contracts.ts:611` — separately maintained

**Gaps identified:** Two-way `AnyClientMessage` divergence (Zod discriminated union vs TypeScript interface union) — pre-existing pattern, task #38 consolidation opportunity. No new broken pairs introduced.

**Status:** Audit complete — registries valid for task #37 scope.

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-28T00:00:00Z (by /cross-boundary-audit for task #31)

**Task audited:** #31 — Make trust, proof, cost, and recovery visible in the product

**Boundaries checked:** WebSocket message types in server.js (broadcast/sendTo) ↔ resources/mockup.html (case handlers)

**Evidence recorded:**
- ~161 message types detected total; all not listed individually are ✓ (paired, no shape gap)
- 4 pre-existing gap entries retained from task #7 audit (get-config, get-history, get-pre-build-check-status, ping)
- 1 entry resolved by task #31: `task-pipeline-state` — now ✓ (server.js `toolSetTaskState` + mockup.html `case 'task-pipeline-state'`)
- 1 existing entry retained: `error (INVALID_MSG)` — producer pending task #38
- Registries match current code diff: yes

**Gaps identified:**
- Pre-existing: get-config, get-history, get-pre-build-check-status, ping — orphan server handlers, pre-task-#7

---

**Last audit:** 2026-05-28T00:00:00Z (by /cross-boundary-audit for task #28)

**Task:** #28 — Upgrade project memory into ranked retrieval

**Boundaries checked:** WebSocket message types between client (resources/mockup.html) and server (server.js)

**Evidence recorded:**
- 2 new WS message types pre-registered: `get-memory-status` (client→server), `memory-status` (server→client)
- Both are intentional pending pairs — no code written yet (pre-implementation audit)
- Payload schemas defined in registry (source: task #28 plan)
- Zod schemas for both types pending (task #28 Phase 3)
- 0 shape mismatches
- 0 new breakages to existing pairs
- Registries match current code diff: yes (pre-implementation state)

**Gaps identified:**
- `get-memory-status` producer + consumer pending task #28 Phase 3 ⚠ — intentional, pre-registered
- `memory-status` producer + consumer pending task #28 Phase 3 ⚠ — intentional, pre-registered
- 4 pre-existing orphan server handlers (get-config, get-history, get-pre-build-check-status, ping) — unchanged

**Status:** Audit complete

---

**Last audit:** 2026-05-28T20:30:00Z (by /cross-boundary-audit for task #28 — post-implementation)

**Task:** #28 — Upgrade project memory into ranked retrieval

**Boundaries checked:** WebSocket message types between client (resources/mockup.html) and server (server.js)

**Evidence recorded:**
- 2 new WS message types confirmed implemented: `get-memory-status` (client→server), `memory-status` (server→client)
- `get-memory-status` producer: `resources/mockup.html:13028` ✓ consumer: `server.js:10417` ✓
- `memory-status` producer: `server.js:10436` ✓ consumer: `resources/mockup.html:5290` ✓
- Payload shape verified: `sessionId` field on client request; `stats` + `history` on server response — matches pre-registered schema
- Zod schemas still pending (task #38 consolidation scope, not task #28)
- 0 shape mismatches, 0 orphan producers, 0 orphan consumers
- Registry entries flipped from ⚠ pending → ✓; line references recorded
- Registries match current code diff: yes

**Gaps identified:** 4 pre-existing orphan server handlers (get-config, get-history, get-pre-build-check-status, ping) — unchanged.

**Status:** Audit complete
