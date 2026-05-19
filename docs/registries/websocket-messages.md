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

## Summary

| Type | Direction | Status |
|------|-----------|--------|
| `get-config` | client → server | ⚠ orphan server handler |
| `get-history` | client → server | ⚠ orphan server handler |
| `get-pre-build-check-status` | client → server | ⚠ orphan server handler |
| `ping` | client → server | ⚠ orphan server handler |
| *(all other ~96 types)* | both | ✓ |
