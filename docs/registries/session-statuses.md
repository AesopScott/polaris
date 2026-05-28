# Session Status Registry

Every live session status string used in Polaris. For each: where it is produced (set/broadcast) and where it is consumed (read/rendered). Update whenever a status is added, removed, or its UI rendering changes.

**Boundary:** `session.status = 'X'` and `broadcast({ type: 'session-status', status: 'X' })` in server.js → status badge, card class, and stripe color in `resources/mockup.html`.

---

## `running`

Session is actively executing — agent loop in progress or CLI process alive.

**Producers**
- `server.js:6390` — set at session launch
- `server.js:1478` — set on resume from error
- `agentRuntime.ts:114` — resumeSession stub

**Consumers**
- `mockup.html:6533` — card class `status-running-card`
- `mockup.html:6542` — statusClass map `running: 'status-running'`
- `server.js:1064` — `s.status === 'running' ? 'done' : s.status` transition on persist

**Status:** ✓

---

## `done`

Session completed successfully — agent returned a final response.

**Producers**
- `server.js:6596` — end of run completion path
- `server.js:6607` — `termStatus = s.status === 'waiting' ? 'waiting' : 'done'`
- `agentRuntime.ts:129` — `session.status = 'done'` + broadcast

**Consumers**
- `mockup.html:6574` — STATUS_STRIPE map `done: '#22c55e'`
- `mockup.html:728` — `.status-done { color: #22c55e }`
- `server.js:1064` — terminal status check for persistence

**Status:** ✓

---

## `waiting`

Session paused — agent asked a question or called `SetStatus('waiting')`; awaiting user reply.

**Producers**
- `server.js:3906` — inferred from agent output (waitingPhrases match)
- `server.js` — `toolSetStatus({ status: 'waiting' }, sessionId)` called by agent

**Consumers**
- `mockup.html:6534` — card class `status-waiting-card`
- `mockup.html:6542` — statusClass map `waiting: 'status-waiting'`
- `mockup.html:1659` — stat-waiting counter in status row

**Status:** ✓

---

## `test`

Session delivered work requiring verification — agent committed code or called `SetStatus('test')`.

**Producers**
- `server.js:3897` — `toolSetStatus({ status: 'test' }, sessionId)` on git commit detection
- `server.js:6604` — inferred from commit/push detected during run

**Consumers**
- `mockup.html:6535` — card class `status-test-card`
- `mockup.html:6542` — statusClass map `test: 'status-test'`
- `mockup.html:409` — `.card.status-test-card { animation: cardTestPulse }` — purple pulsing animation

**Status:** ✓

---

## `error`

Session terminated abnormally — API error, unhandled exception, or retry exhaustion.

**Producers**
- `server.js:6250` — `broadcast({ type: 'session-status', sessionId, status: 'error' })`
- `server.js:6495` — `session.status = 'error'` on unrecoverable error
- `agentRuntime.ts:142` — `session.status = 'error'` + broadcast

**Consumers**
- `mockup.html:6542` — statusClass map `error: 'status-error'`
- `mockup.html:729` — `.status-error { color: #ef4444 }`
- `server.js:1477` — `s.status === 'error'` check before resume decision

**Status:** ✓

---

## `paused`

Session suspended pending user action (e.g., token approval gate).

**Producers**
- ⚠ No active producer found — appears in type union and error handling but never explicitly set via broadcast

**Consumers**
- `sessionStore.ts:56` — `SessionRecord.status` union type includes `'paused'`
- `server.js:1478` — referenced in resume guard but never explicitly set to `'paused'`

**Status:** ⚠ orphan consumer — in type union but no active setter. Likely reserved for the token approval gate flow (`session.paused = true` sets a flag, not `session.status`). Acceptable if token approval uses a separate flag; should be removed from the type union or wired if the paused visual state is needed.

---

## `closed`

Session fully removed from active state.

**Producers**
- ⚠ No active producer found — never explicitly set via `session.status = 'closed'`

**Consumers**
- `server.js:1325` — `if (!session || session.status === 'closed') return;` guard
- `server.js:5921` — `s.status !== 'closed'` filter

**Status:** ⚠ orphan consumer — checked but never produced. Guards reference a state that is never written. `closed` sessions appear to be removed from the session map entirely rather than transitioned to a `closed` status. Safe to remove the checks or write the status on `close-session`.

---

## Summary

| Status | Produces | Consumes | Status |
|--------|----------|----------|--------|
| `running` | server.js:6390, agentRuntime.ts:114 | mockup.html:6533, 6542 | ✓ |
| `done` | server.js:6596, agentRuntime.ts:129 | mockup.html:6574, 728 | ✓ |
| `waiting` | server.js:3906, toolSetStatus | mockup.html:6534, 6542, 1659 | ✓ |
| `test` | server.js:3897, 6604 | mockup.html:6535, 6542, 409 | ✓ |
| `error` | server.js:6250, 6495, agentRuntime.ts:142 | mockup.html:6542, 729 | ✓ |
| `paused` | *(none)* | sessionStore.ts:56 | ⚠ orphan consumer |
| `closed` | *(none)* | server.js:1325, 5921 | ⚠ orphan consumer |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-28T00:00:00Z (by /cross-boundary-audit for task #31)

**Task audited:** #31 — Make trust, proof, cost, and recovery visible in the product

**Boundaries checked:** Session status strings in server.js (producers) ↔ resources/mockup.html (consumers), sessionStore.ts, agentRuntime.ts

**Evidence recorded:**
- 7 status values in type union
- 5 entries with complete producer/consumer pairs ✓
- 2 orphan consumers: `paused` and `closed` (never explicitly set via session.status)
- 0 new session statuses introduced by task #31
- Registries match current code diff: yes

**Gaps identified:**
- `paused` — orphan consumer; token approval sets `session.paused = true` flag, not `session.status`; recommend removing from type union or wiring
- `closed` — orphan consumer; sessions removed from map rather than transitioned; guards reference a state that never exists

**Status:** Audit complete
