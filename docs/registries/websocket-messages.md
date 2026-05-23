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
- `server.js:8060` — returns the cached pre-build check result

**Status:** ⚠ orphan server handler  
**Note:** Pre-existing before Task #7. Pre-build check flow may have been refactored to push results instead of polling.

---

### `ping`

Liveness check / keep-alive.

**Producers:** none — client never sends this type  
**Consumers**
- `server.js:8841` — responds to keep-alive

**Status:** ⚠ orphan server handler  
**Note:** Pre-existing before Task #7. Likely superseded by WebSocket native ping/pong frames or the connection is considered always-live while the Electron window is open.

---

## Zod Schema Coverage (task #37)

All ~50 WebSocket message types that transit the Polaris WS boundary now have corresponding Zod schemas in `src/contracts/ws-messages.ts`. These are **intentional orphan producers** — schemas are defined and exported but not yet wired into runtime validation. Task #38 will import them into `server.js` and `mockup.html` to validate messages at the boundary.

**Schema location:** `src/contracts/ws-messages.ts`
**Barrel export:** `src/contracts/index.ts`
**Consumer count:** 0 (until task #38)

Notable exports:
- `LaunchMessage`, `ResumeMessage`, `StopMessage`, `CloseSessionMessage` — session lifecycle
- `AnyClientMessage` — discriminated union over all ~50 types (replaces `AnyClientMessage` interface in `src/runtime/contracts.ts` when task #38 wires it)

**⚠ Divergence risk:** `AnyClientMessage` union type also exists in `src/runtime/contracts.ts:611` as a TypeScript interface union. Currently maintained separately. Task #38 should derive the runtime union from the Zod discriminated union.

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
| *(all other ~96 types)* | both | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-23T14:00:00Z (by /cross-boundary-audit for task #41)

**Task:** #41 — Capability policy schema + session wiring

**Boundaries checked:** WebSocket `type` message types between client (resources/mockup.html) and server (server.js)

**Evidence recorded:**
- 98 entries with complete producer/consumer pairs ✓
- 4 entries with gaps (orphan server handlers) ⚠ (pre-existing, unchanged)
- 0 entries with shape mismatches
- New identifiers introduced on task #41: `ui-client-hello` (client→server, client ID handshake), `ui-client-ack` (server→client, handshake response) — both balanced ✓
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
