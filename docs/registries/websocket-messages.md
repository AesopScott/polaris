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

## Zod Schema Coverage (tasks #37, #40)

All ~50 WebSocket message types that transit the Polaris WS boundary have corresponding Zod schemas in `src/contracts/ws-messages.ts`. Task #37 defined the schemas; task #40 added a Vitest test consumer that validates valid and invalid payloads for all major types. Runtime consumers (server.js receive-side validation) are pending task #38.

**Schema location:** `src/contracts/ws-messages.ts`
**Barrel export:** `src/contracts/index.ts`
**Test consumer:** `test/contracts/ws-messages.test.ts` — 59 tests covering all major schemas and the `AnyClientMessage` discriminated union ✓
**Runtime consumer:** none yet (task #38)

Notable exports:
- `LaunchMessage`, `ResumeMessage`, `StopMessage`, `CloseSessionMessage` — session lifecycle
- `CrossCheckDecisionMessage`, `InstallerPermissionDecisionMessage` — agent interaction
- `AddBacklogTaskMessage`, `UpdateBacklogTaskMessage` — backlog mutations
- `AnyClientMessage` — discriminated union over all ~50 types (replaces `AnyClientMessage` interface in `src/runtime/contracts.ts` when task #38 wires it)

**⚠ Divergence risk:** `AnyClientMessage` union type also exists in `src/runtime/contracts.ts:611` as a TypeScript interface union. Currently maintained separately. Task #38 should derive the runtime union from the Zod discriminated union. See also `docs/registries/zod-contracts.md` for the full contract module registry.

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
