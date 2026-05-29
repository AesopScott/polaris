# Backlog Task Status Registry

Every task status value used in `docs/backlog.json` and the Polaris backlog lifecycle. For each: what it means, who sets it (producer), and where it is read or displayed (consumer). Update whenever a status is added, removed, or its lifecycle position changes.

**Canonical definition:** `src/runtime/backlog.ts:29-41` (`VALID_BACKLOG_STATUSES` array)
**Lifecycle authority:** `src/runtime/backlog.ts` — `updateBacklogTaskStatus()` validates all writes
**Storage:** `docs/backlog.json` (active tasks), `docs/backlog-archive.json` (production/cancelled)

---

## Lifecycle Statuses (ship-task pipeline)

These form the ordered pipeline progression for task #N through `/ship-task`.

### `backlog`

Task created but not yet planned.

**Producers**
- `src/runtime/backlog.ts:331` — `status: 'backlog'` default on new task creation

**Consumers**
- `server.js:3635` — TERMINAL_STATUSES check (not included — task must be planned first)
- Task Lane panel (task #31 pending) — step 0 in pipeline display

**Status:** ✓

---

### `planned`

`/plan-task` completed — plan, proof units, and objective written.

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'planned')` called by `/plan-task` on completion

**Consumers**
- `sessionStore.ts:121` — `BACKLOG_STATUS_TO_LAST_SKILL` map: `'planned': 'plan-task'`
- Task Lane panel (task #31 pending) — step 1 complete in pipeline display

**Status:** ✓

---

### `build-started`

`/start-build` completed — task branch created, objective loaded.

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'build-started')` called by `/start-build`

**Consumers**
- `sessionStore.ts:123` — map `'build-started': 'start-build'`
- Task Lane panel (task #31 pending) — step 2 in pipeline display

**Status:** ✓

---

### `build-finished`

`/finish-build` completed — code committed, PR opened.

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'build-finished')` called by `/finish-build`

**Consumers**
- `sessionStore.ts:125` — map `'build-finished': 'finish-build'`
- Task Lane panel (task #31 pending) — step 5 in pipeline display

**Status:** ✓

---

### `cba-complete`

`/codex-review` completed and approved.

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'cba-complete')` called by `/codex-review` on APPROVE

**Consumers**
- `sessionStore.ts` — inferred from status; no explicit map entry found
- Task Lane panel (task #31 pending) — step 7 in pipeline display

**Status:** ✓

---

### `review-blocked`

`/review-pr` or `/codex-review` surfaced hard issues blocking merge.

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'review-blocked')` called on hard-block verdict

**Consumers**
- `sessionStore.ts:127` — map `'review-blocked': 'codex-review'`
- Task Lane panel (task #31 pending) — shown as blocked step with recovery action

**Status:** ✓

---

### `staged`

`/promote-stage` completed — PR merged to stage (CareGuide only).

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'staged')` called by `/promote-stage`

**Consumers**
- `sessionStore.ts:129` — map `'staged': 'promote-stage'`

**Status:** ✓ (CareGuide-only path)

---

### `production`

`/promote-to-prod` completed — task shipped to production.

**Producers**
- `src/runtime/backlog.ts` — `updateBacklogTaskStatus(n, 'production')` called by `/promote-to-prod`

**Consumers**
- `src/runtime/backlog.ts:44` — `TERMINAL_STATUSES` set includes `'production'` — triggers archive move
- `sessionStore.ts:130` — map `'production': 'promote-to-prod'`

**Status:** ✓

---

## Failure / Hold Statuses

### `failed-smoke-test`

Production deployment passed but smoke tests failed afterward. Manual only — no skill sets this automatically.

**Producers**
- Manual set by Scott after discovering post-deploy test failures

**Consumers**
- `src/runtime/backlog.ts:34` — in `VALID_BACKLOG_STATUSES`

**Status:** ✓ (intentional manual-only)

---

### `stalled`

LangGraph executor timed out waiting at a human gate.

**Producers**
- `agents/task_executor.py` — `_stall_watchdog()` sets after `STALL_TIMEOUT_SECONDS`

**Consumers**
- `src/runtime/backlog.ts:36` — in `VALID_BACKLOG_STATUSES`

**Status:** ✓

---

### `failed`

Generic terminal failure before production.

**Producers**
- `agents/task_executor.py` — LangGraph executor on unrecoverable node failure

**Consumers**
- `src/runtime/backlog.ts:36` — in `VALID_BACKLOG_STATUSES`

**Status:** ✓

---

### `blocked`

Task cannot proceed due to an unresolved external dependency.

**Producers**
- Manual set

**Consumers**
- `src/runtime/backlog.ts:38` — in `VALID_BACKLOG_STATUSES`

**Status:** ✓ (intentional manual)

---

### `on-hold`

Task deliberately paused — no external block, just deferred.

**Producers**
- Manual set

**Consumers**
- `src/runtime/backlog.ts:38` — in `VALID_BACKLOG_STATUSES`

**Status:** ✓ (intentional manual)

---

### `cancelled`

Task abandoned.

**Producers**
- Manual set

**Consumers**
- `src/runtime/backlog.ts:44` — `TERMINAL_STATUSES` set — triggers archive move
- `server.js:3570` — `task.status === 'cancelled'` terminal check

**Status:** ✓

---

## Legacy UI Statuses (backward-compat only)

These values appear in `VALID_BACKLOG_STATUSES` for compatibility but are not used in new skill-driven workflows.

| Status | Replaced by | Notes |
|--------|------------|-------|
| `ready` | `planned` | Pre-skill-era label |
| `in-progress` | `build-started` | Pre-skill-era label |
| `complete` | `production` | Pre-skill-era label |
| `pr-reviewed` | `cba-complete` | Used in some older skill outputs |
| `cba-half-complete` | `build-finished` | Partial-review state, rarely set |
| `smoke-tested` | `production` (on success) | Post-deploy verification label |

---

## Summary

| Status | Phase | Producer | Terminal |
|--------|-------|----------|---------|
| `backlog` | 0 — unplanned | new task creation | No |
| `planned` | 1 — /plan-task done | plan-task skill | No |
| `build-started` | 2 — /start-build done | start-build skill | No |
| `build-finished` | 5 — /finish-build done | finish-build skill | No |
| `cba-complete` | 7 — /codex-review done | codex-review skill | No |
| `review-blocked` | 6/7 — review hard block | review-pr / codex-review | No |
| `staged` | 7.5 — stage merge | promote-stage skill | No |
| `production` | 8 — shipped | promote-to-prod skill | Yes |
| `failed-smoke-test` | post-prod | manual | No |
| `stalled` | any | LangGraph executor | No |
| `failed` | any | LangGraph executor | No |
| `blocked` | any | manual | No |
| `on-hold` | any | manual | No |
| `cancelled` | any | manual | Yes |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-28T00:00:00Z (by /cross-boundary-audit for task #31)

**Task audited:** #31 — Make trust, proof, cost, and recovery visible in the product

**Boundaries checked:** Backlog task status strings in src/runtime/backlog.ts (VALID_BACKLOG_STATUSES), server.js backlog handlers, sessionStore.ts BACKLOG_STATUS_TO_LAST_SKILL map

**Evidence recorded:**
- 20 status values in VALID_BACKLOG_STATUSES (14 active + 6 legacy)
- 14 entries documented with producer/consumer pairs ✓
- 6 legacy entries noted as backward-compat only
- 0 orphan consumers found — all statuses reachable
- 0 new backlog statuses introduced by task #31
- Task Lane panel (task #31) will consume these statuses to drive the 8-step progress indicator
- Registries match current code diff: yes

**Gaps identified:**
- `cba-complete` — added `'cba-complete': 'codex-review'` to `BACKLOG_STATUS_TO_LAST_SKILL` in `src/runtime/sessionStore.ts` (fixed in task #31)

**Status:** Audit complete
