# Backlog Task Fields Registry

Every field on a backlog task object stored in docs/backlog.json or project docs/backlog.json files. For each: producer, consumer, and validation rules.

---

## `number`

Task identifier — auto-incremented integer, unique within scope (global or per-project).

**Schema / shape:** Integer, unique within scope, auto-assigned

**Producers (write)**
- `server.js:2701` — `_nextBacklogTaskNumber()` computes next number
- `server.js:2712` — `addBacklogTask()` assigns number when creating

**Consumers (read)**
- `server.js:2887` — `updateBacklogTaskStatus()` matches task by number
- `server.js:2931` — `updateBacklogTask()` matches task by number
- `resources/mockup.html:9094` — Row click handler reads task number
- `resources/mockup.html:9110` — Edit button passes task number

**Status:** ✓ Balanced

---

## `title`

Human-readable task name.

**Schema / shape:** String, required, non-empty

**Producers (write)**
- `server.js:2713` — `addBacklogTask()` stores title (required, validated)
- `server.js:2943` — `updateBacklogTask()` updates title

**Consumers (read)**
- `resources/mockup.html:9170` — Table renders title
- `resources/mockup.html:2061` — Edit modal displays title
- `resources/mockup.html:2018` — Add modal field

**Status:** ✓ Balanced

---

## `description`

Long-form task context, requirements, and constraints.

**Schema / shape:** String, optional

**Producers (write)**
- `server.js:2714` — `addBacklogTask()` stores description
- `server.js:2944` — `updateBacklogTask()` updates description

**Consumers (read)**
- `resources/mockup.html:2064` — Edit modal displays description
- `resources/mockup.html:2023` — Add modal field

**Status:** ✓ Balanced

---

## `category`

Classification of work type (feature, fix, debt, infrastructure, etc.).

**Schema / shape:** String, optional, defaults to "feature"

**Producers (write)**
- `server.js:2715` — `addBacklogTask()` stores category (defaults to 'feature')
- `server.js:2945` — `updateBacklogTask()` updates category

**Consumers (read)**
- `resources/mockup.html:9174` — Table renders category with color coding
- `resources/mockup.html:2072` — Edit modal displays category
- `resources/mockup.html:2031` — Add modal field with datalist

**Status:** ✓ Balanced

---

## `priority`

Numeric priority for ordering tasks (1-200 typical range).

**Schema / shape:** Integer, optional, defaults to 50

**Producers (write)**
- `server.js:2716` — `addBacklogTask()` stores priority (defaults to 50)
- `server.js:2946` — `updateBacklogTask()` updates priority

**Consumers (read)**
- `resources/mockup.html:9176` — Table renders priority
- `resources/mockup.html:2069` — Edit modal displays priority
- `resources/mockup.html:2028` — Add modal field
- `resources/mockup.html:9159` — renderBacklogSection sorts by priority descending

**Status:** ✓ Balanced

---

## `status`

Current lifecycle state of the task (backlog, planned, build-started, in-review, production, etc.).

**Schema / shape:** String, validated enum, defaults to "backlog"

**Producers (write)**
- `server.js:2717` — `addBacklogTask()` sets status to 'backlog'
- `server.js:2879` — `updateBacklogTaskStatus()` validates and updates status
- `server.js:2914` — Sets completed_at when status is terminal
- `src/contracts/backlog.ts:3` — Zod enum `BacklogStatus` (20 values: 14 active + 6 legacy; schema producer only — no consumers until task #38 wires validators)

**Consumers (read)**
- `resources/mockup.html:9172` — Table renders status badge with styling
- `resources/mockup.html:9103` — Status picker displays current status
- `resources/mockup.html:3395` — BACKLOG_STATUS_OPTIONS defines valid values

**Validation:** VALID_BACKLOG_STATUSES set at server.js:3194 — backlog, planned, build-started, build-finished, cba-complete, review-blocked, staged, production, failed-smoke-test, stalled, failed, blocked, on-hold, cancelled. Legacy (deprecated): ready, in-progress, complete, pr-reviewed, cba-half-complete, smoke-tested. **CRITICAL: `in-review` is NOT valid. Correct workflow: backlog → planned (/plan-task) → build-started (/start-build) → build-finished (/finish-build) → cba-complete (/codex-review) → staged (/promote-stage) → production (/promote-to-prod).** `stalled` and `failed` are written by the LangGraph executor (task #26) when a human gate times out or a node throws an unhandled exception.

**⚠ Divergence risk — BacklogStatus defined independently in three places:**
- `src/contracts/backlog.ts:3` — Zod enum (20 values: 14 active + 6 legacy, task #37; fixed in /review-pr)
- `src/runtime/backlog.ts:30` — `VALID_BACKLOG_STATUSES` Set (14 active + 6 legacy = 20 values)
- `src/runtime/backlog.ts:53` — TypeScript union type (20 values)
All three now in sync. Maintained separately — drift possible. Task #38 should consolidate to derive runtime validation from the Zod enum.

**Status:** ✓ Balanced (validation enforced server-side) — ⚠ three-way status enum divergence risk (see above)

---

## `created_at`

ISO 8601 date when task was created.

**Schema / shape:** String (YYYY-MM-DD format), auto-assigned

**Producers (write)**
- `server.js:2718` — `addBacklogTask()` auto-assigns current date

**Consumers (read)**
- (not currently rendered in UI, but persisted in backlog.json)

**Status:** ✓ Single producer, minimal consumption

---

## `completed_at`

ISO 8601 date when task moved to terminal status, null otherwise.

**Schema / shape:** String (YYYY-MM-DD format) or null, auto-assigned

**Producers (write)**
- `server.js:2719` — `addBacklogTask()` sets to null initially
- `server.js:2915` — `updateBacklogTaskStatus()` sets date when status becomes terminal
- `server.js:2917` — Clears to null when status moves away from terminal

**Consumers (read)**
- `resources/mockup.html:9204` — Archive section renders completed_at
- (backend uses for archival logic)

**Status:** ✓ Balanced

---

## `dependencies`

Array of task numbers that must complete before this task can start.

**Schema / shape:** Array of Integers, optional, defaults to []

**Producers (write)**
- `server.js:2720` — `addBacklogTask()` initializes as empty array
- (updates not yet supported in updateBacklogTask)

**Consumers (read)**
- `resources/mockup.html:9162` — Table renders dependency list as "#N, #M"
- (not yet enforced by workflow)

**Status:** ⚠ orphan producer — no update mechanism; dependencies can only be set at creation

---

## `plan`

Markdown narrative of the task's design, outline, and detailed implementation plan.

**Schema / shape:** String (markdown), optional, null initially

**Producers (write)**
- `server.js:2721` — `addBacklogTask()` initializes as null
- (updates not yet supported in updateBacklogTask; plans are written by /plan-task and committed separately)

**Consumers (read)**
- `/plan-task`, `/start-build` skills read plan from backlog.json to load task context
- `resources/mockup.html` does not display plan (it's skill-side context)

**Status:** ✓ Intentional: plan is written by skills, not UI mutations

---

## `proofUnits`

Array of structured proof specifications for TDD/proof verification.

**Schema / shape:**
```javascript
Array<{
  number: Integer,
  title: String,
  expectedBehavior: String,
  proofType: String (enum: failing-test, smoke-command, api-check, ui-check, registry-diff, manual-script, waiver),
  exactCommand: String,
  expectedInitialFailure: String,
  expectedPassingEvidence: String,
  waiverGuidance: String
}>
```
Optional, defaults to []

**Producers (write)**
- `server.js:2722` — `addBacklogTask()` initializes as empty array
- (updates not yet supported; proof units are written by /plan-task and committed separately)

**Consumers (read)**
- `/start-build` skill loads proof units to gate implementation
- `/finish-build` skill verifies proof units before merging
- `/review-pr` skill checks proof trail against proof units

**Status:** ✓ Intentional: proof units are written by skills, not UI mutations

---

## `branch`

Git branch name where work on this task is happening (null until build starts).

**Schema / shape:** String or null, assigned during `/start-build`

**Producers (write)**
- `server.js:2724` — `addBacklogTask()` initializes as null
- (updates not yet exposed; branch is written by /start-build and committed)

**Consumers (read)**
- (not currently used in UI or workflow)

**Status:** ⚠ orphan producer — field initialized but never updated or read

---

## `pr_url`

GitHub PR URL for the task's implementation (null until PR is opened).

**Schema / shape:** String (URL) or null, assigned during `/finish-build`

**Producers (write)**
- `server.js:2725` — `addBacklogTask()` initializes as null
- (updates not yet exposed; PR URL is written by /finish-build and committed)

**Consumers (read)**
- (not currently displayed in UI)

**Status:** ⚠ orphan producer — field initialized but never updated or read in current UI

---

## `impact`

Workflow significance: determines whether /plan-task is gated out (minor), required (major), or standard (default).

**Schema / shape:** String, enum: "minor" | "standard" | "major", optional, defaults to "standard". Server validates and coerces invalid values to "standard".

**Producers (write)**
- `server.js:2726` — `addBacklogTask()` stores impact via `_validImpact()` helper (defaults to 'standard')
- `server.js:2964` — `updateBacklogTask()` updates impact via `_validImpact()` helper (global scope)
- `server.js:2983` — `updateBacklogTask()` updates impact via `_validImpact()` helper (per-project scope)

**Consumers (read)**
- `resources/mockup.html:2052` — Add Task modal `<select id="backlog-add-impact">` (minor/standard/major)
- `resources/mockup.html:2097` — Edit Task modal `<select id="backlog-edit-impact">` (minor/standard/major)
- `resources/mockup.html:9182` — Edit button click handler passes `btn.dataset.impact` to openBacklogEditModal
- `resources/mockup.html:9219` — IMPACT column header in table
- `resources/mockup.html:9235` — Table row reads `t.impact` and applies color coding (green/minor, gray/standard, orange/major)
- `resources/mockup.html:9247` — Table row renders impact `<td>` cell
- `resources/mockup.html:9251` — Edit button carries `data-impact` attribute
- `resources/mockup.html:9389` — `openBacklogAddModal()` resets impact dropdown to 'standard'
- `resources/mockup.html:9421` — `openBacklogEditModal()` pre-populates impact dropdown from task value
- `/plan-task` skill (future) — reads impact to gate workflow
- `/start-build` skill (future) — reads impact to enforce /plan-task if needed

**Status:** ✓ Balanced — server persists, table displays, modals read/write, enum validated server-side

---

## `objective`

Structured goal contract written by `/plan-task` when planning a task. Contains the task's objective statement, success criteria, non-goals, proof map, and stop conditions. Only present on tasks that have been through `/plan-task`.

**Schema / shape:**
```javascript
{
  statement: String,            // One-sentence objective
  successCriteria: Array<String>,  // Each criterion mapped to a proof unit
  nonGoals: Array<String>,      // Explicitly out-of-scope items
  proofMap: Array<{
    criterion: String,
    proofUnit: Number           // Index into proofUnits[]
  }>,
  stopConditions: Array<String> // Hard blockers that abort the build
}
```
Optional, null initially.

**Producers (write)**
- `/plan-task` skill - writes `objective` block to `docs/backlog.json` after design discussion phase; committed directly to main branch on task branch or in planning commit
- `/write-plan` sub-skill - constructs the objective object as part of plan finalization
- Direct commit (build session) - may write objective manually alongside plan

**Consumers (read)**
- `/review-pr` skill - loads all sub-fields at Step 4a; verifies each `successCriteria` item against diff; checks for non-goal drift; flags missing fields as proof/planning gap
- `/codex-review` skill - reads same fields for independent Codex review comparison
- `/start-build` skill - loads `objective.successCriteria` and `objective.nonGoals` to gate implementation scope
- `/finish-build` skill - verifies build work maps to `objective.successCriteria`; flags out-of-scope drift against `objective.nonGoals`
- `/ship-task` orchestrator - displays objective statement and success criteria at each gate; stops if `objective` is missing on a non-backlog task

**Note:** `server.js` does not read or write this field - it lives purely in the skills layer and backlog.json. UI does not display it.

**Status:** Intentional skill-side field - pre-existing gap from task #36 now registered (2026-05-23)

---

## `current_node`

Active LangGraph node name for the task. Written by the executor via `/sync-state` after each node transition. Consumed by the UI to render LangGraph controls (Advance / Signal buttons) on task rows.

**Schema / shape:** String or absent (undefined/null if task has never been advanced through the LangGraph). Examples: `"plan"`, `"build"`, `"review"`, `"promote_prod"`.

**Producers (write)**
- `server.js:8464` — `/sync-state` POST handler calls `updateBacklogTaskStatus(scope, task_number, status, { current_node })`. `updateBacklogTaskStatus` applies `extraFields` via `Object.assign(task, extraFields)` — introduced as part of task #33 to pass `current_node` alongside `status`.

**Consumers (read)**
- `resources/mockup.html:10188` — `renderBacklogSection()` checks `t.current_node`; if present, renders LangGraph controls div with Advance button, Signal input, Signal button, and `@{current_node}` badge. Controls hidden when `current_node` is absent/falsy.

**Status:** ✓ Balanced (task #33) — producer and consumer paired; field optional on tasks not yet graph-driven

---

## Summary

| Field | Producers | Consumers | Status |
|-------|-----------|-----------|--------|
| `number` | 2 (auto) | 4 (lookup) | ✓ |
| `title` | 2 (create/update) | 3 (display) | ✓ |
| `description` | 2 (create/update) | 2 (display) | ✓ |
| `category` | 2 (create/update) | 3 (display/sort) | ✓ |
| `priority` | 2 (create/update) | 4 (display/sort) | ✓ |
| `status` | 4 (create/status-update/Zod) | 3 (display/validate) | ✓ ⚠ 3-way enum divergence |
| `created_at` | 1 (auto) | 0 (stored) | ✓ |
| `completed_at` | 2 (auto-update) | 1 (display) | ✓ |
| `dependencies` | 1 (create) | 1 (display) | ⚠ orphan producer |
| `plan` | 1 (null init) | 3 (skills read) | ✓ intentional |
| `proofUnits` | 1 (null init) | 3 (skills read) | ✓ intentional |
| `objective` | 1 (/plan-task skill) | 3+ (skills read) | ✓ intentional |
| `branch` | 1 (null init) | 0 (never read) | ⚠ orphan producer |
| `pr_url` | 1 (null init) | 0 (never read) | ⚠ orphan producer |
| `impact` | 3 (create/update) | 5 (display/modal/skills) | ✓ |
| `current_node` | server.js:8464 (/sync-state) | mockup.html:10188 (LangGraph controls) | ✓ (task #33) |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit for task #29 planning)

**Task:** #29 — Replace regex-heavy tool safety with capability policies

**Boundaries checked:** Backlog task schema fields across server.js, UI (mockup.html), skills, and docs/backlog.json

**Evidence recorded:**
- 15 entries documented (14 previous + `objective` added)
- 12 entries with complete producer/consumer pairs ✓
- 3 entries with intentional skill-side wiring (plan, proofUnits, objective) ✓
- 3 entries with orphan producers (dependencies, branch, pr_url) ⚠ pre-existing, deferred
- 0 entries with shape mismatches
- New identifiers introduced on task #29 planning: `objective` field registered (pre-existing gap from task #36)
- Registries match current code diff: yes

**Gaps identified:** Pre-existing orphan producers (dependencies, branch, pr_url) remain deferred. `objective` gap from task #36 now resolved.

**Status:** Audit complete — registries valid for task #29 planning scope.

---

**Last audit:** 2026-05-22T00:00:00Z (by /cross-boundary-audit for task #36)

**Task:** #36 — Add a ship task orchestration capability

**Boundaries checked:** Backlog task schema fields across server.js, UI (mockup.html), skills, and docs/backlog.json

**Evidence recorded:**

- 15 entries documented (14 prior + 1 new)
- 11 entries with complete producer/consumer pairs ✓
- 2 entries with intentional skill-side wiring (plan, proofUnits) ✓
- 4 entries with orphan producers (dependencies, branch, pr_url, objective) ⚠
  - dependencies/branch/pr_url: pre-existing, deferred
  - objective: newly registered; intentionally skill-written, not UI-editable
- 0 shape mismatches
- New identifiers introduced on task #36: `objective` field (with sub-fields statement, successCriteria, nonGoals, proofMap, stopConditions) — present in backlog.json task #36, consumed by /review-pr and /codex-review skills
- Registries match current code diff: yes

**Gaps identified:** `objective` was unregistered — now added. Pre-existing orphan producers (dependencies, branch, pr_url) unchanged.

**Status:** Audit complete — objective field registered for task #36 scope.

---

**Last audit:** 2026-05-22T00:00:00Z (by /cross-boundary-audit for task #37)

**Task:** #37 — Contracts foundation: Zod schemas in src/contracts/

**Boundaries checked:** `status` field — new Zod schema producer in `src/contracts/backlog.ts`

**Evidence recorded:**
- New producer: `src/contracts/backlog.ts:3` — `BacklogStatus` Zod enum (20 values: 14 active + 6 legacy)
- Orphan producer: intentional — no consumers until task #38 wires runtime validators
- Three independent `BacklogStatus` definitions exist; now aligned after /review-pr fixes:
  - `src/contracts/backlog.ts:3` — Zod enum (20 values: all 14 active + 6 legacy; `review-blocked` in active group)
  - `src/runtime/backlog.ts:30` — `VALID_BACKLOG_STATUSES` Set (14 active + 6 legacy = 20 values)
  - `src/runtime/backlog.ts:53` — TypeScript union type (same 20 values)

**Gaps identified:** Three-way status enum divergence risk — definitions now in sync after review fixes (`stalled`, `failed` added; `review-blocked` moved to active group). Task #38 consolidation opportunity remains.

**Status:** Audit complete — registries valid for task #37 scope.

---

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit for task #33)

**Task:** #33 — LangGraph: Node Implementation + HITL (Phases 4-5)

**Boundaries checked:** Backlog task schema fields across server.js, UI (mockup.html), skills, and docs/backlog.json

**Evidence recorded:**
- 16 entries (15 previous + 1 new)
- 13 entries with complete producer/consumer pairs ✓
- 3 entries with intentional skill-side wiring (plan, proofUnits, objective) ✓
- 3 entries with orphan producers (dependencies, branch, pr_url) ⚠ pre-existing, deferred
- 0 shape mismatches
- New identifier introduced on task #33: `current_node` — written by server.js:8464 `/sync-state` handler via `updateBacklogTaskStatus(scope, taskNum, status, { current_node })`; consumed by mockup.html:10188 to render LangGraph Advance/Signal controls
- Duplicate `objective` row in summary table removed (was listed twice: once as "✓ intentional" and once as "⚠ UI orphan (intentional)"; consolidated to single "✓ intentional" row)

**Gaps identified:**
- `current_node` field was unregistered — now added
- Duplicate summary row for `objective` — now removed

**Status:** ✓ Audit current — all task #33 backlog field changes registered
