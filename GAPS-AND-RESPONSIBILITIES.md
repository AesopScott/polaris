# Ship-Task & Orchestrator Integration — Gaps and Responsibilities

## Executive Summary

Comparing `orchestrate.md` (orchestrator design) against implemented ship-task pipeline skills reveals **8 significant gaps**. This document identifies each gap, classifies its severity, and assigns responsibility for fixing it.

---

## Gap 1: Merge Request Protocol (CRITICAL)

**Finding:**
`/promote-stage` and `/promote-to-prod` request merges via `branch-requests.json` but the exact protocol is undefined.

**Missing specifics:**
- Exact request JSON structure for merge operations
- Timing: when to submit request (immediately after status change, or later?)
- Polling: how long to wait for orchestrator response?
- Failure handling: what to do if request is denied or times out?
- Response format: what does orchestrator response look like in `branch-requests.json`?

**From orchestrate.md reference:**
- PHASE 6 defines `branch-requests.json` format (line 295-307) but only for general branch ops
- PHASE 6B specifies orchestrator merge execution (line 349-415) but NOT how sessions request it

**Responsibility:** 🔧 **SHIP-TASK SESSION**

Must add to `/promote-stage` and `/promote-to-prod`:
1. Construct merge request with correct op, fromBranch, toBranch
2. Write to `branch-requests.json` (read-modify-write pattern)
3. Poll for approval response (60s timeout)
4. Handle denied/timeout gracefully

---

## Gap 2: Merge Completion Notification (HIGH)

**Finding:**
Orchestrator issues completion directive (PHASE 6B Step 4, lines 376-399), but `/promote-to-prod` doesn't document waiting for it.

**Current state:**
- Orchestrator writes directive with instruction "Your PR #X has been merged..."
- `/promote-to-prod` has no code to poll for this directive
- Race condition: skill finishes before orchestrator notifies

**Missing:**
- Poll for completion directive after requesting merge
- Verify merge status before declaring success
- Timeout if directive never arrives
- Graceful degradation if directive system fails

**Responsibility:** 🔧 **SHIP-TASK SESSION**

Must add to `/promote-to-prod`:
1. After merge request approved, poll `session-directives.json` for merge completion
2. Wait for orchestrator's "merge complete" directive
3. Only then set task status to `production`
4. Timeout handling (e.g., 5m max wait)

---

## Gap 3: Directive Issuance Logic (HIGH)

**Finding:**
Ship-task skills poll for directives, but `orchestrate.md` PHASE 7 doesn't specify WHAT directives orchestrator should issue for phase transitions.

**Missing from orchestrate.md:**
- When does orchestrator issue "move to `/cross-boundary-audit`" directive?
- When does it issue "move to `/finish-build`" directive?
- When does it issue "move to `/review-pr`" directive?
- When does it issue "move to `/promote-to-prod`" directive?
- What should the exact instruction text say?
- What priority? (critical, high, normal)

**Current state:**
- `orchestrate.md` PHASE 7 explains the directive format and polling protocol
- But never specifies the BUSINESS LOGIC of "when task reaches X status, write directive to session"
- This is crucial for phase gating to work

**Responsibility:** 📋 **ORCHESTRATOR SESSION**

Must implement in orchestrator:
1. On each tick, scan `docs/backlog.json` for status changes
2. For each status change relevant to phase gates, write a directive
3. Example: if task moves from `build-started` → `cba-complete`, write directive to session: "Your audit passed. Ready to run `/finish-build`."
4. Example: if task moves to `pr-reviewed`, write directive: "Code reviews passed. Orchestrator will now merge your PR to main."

---

## Gap 4: Status Update Synchronization (MEDIUM)

**Finding:**
Race condition between skill writing status to `backlog.json` and orchestrator reading it.

**Scenario:**
1. `/finish-build` sets status to `build-finished`
2. Orchestrator tick runs immediately after
3. Does orchestrator see the status change in time?
4. If not, orchestrator might miss the phase transition and not issue directive

**Current state:**
- Skills write status synchronously to `backlog.json`
- Orchestrator reads `backlog.json` on each tick (default 30s)
- No documented synchronization mechanism

**Missing:**
- Should skills wait for orchestrator acknowledgement?
- Should orchestrator acknowledge status changes?
- Fallback: what if skill thinks status is updated but orchestrator missed it?

**Responsibility:** 🤝 **BOTH SESSIONS** (requires protocol agreement)

Needs clarification:
- Ship-task: confirm status is written to `backlog.json` before proceeding
- Orchestrator: confirm it reads and acknowledges each status change
- Agreement: how long is the maximum time gap before orchestrator sees a status change?
- Fallback: if orchestrator doesn't see status for 2 ticks, re-check and issue directive

---

## Gap 5: Status Naming Consistency (MEDIUM)

**Finding:**
Semantic confusion in status naming between phases.

**Current inconsistency:**
- `orchestrate.md` PHASE 6 (line 322) references `cba-complete` as a valid branch op state
- But `/cross-boundary-audit` sets status to `cba-complete`
- And `/codex-review` now sets status to `pr-reviewed` (per SHIP-TASK-UPDATES.md)
- So which phase uses `cba-complete`?

**Clarification needed:**
- `cba-complete` = "cross-boundary audit complete" (set by `/cross-boundary-audit` only)
- `pr-reviewed` = "code review complete" (set by `/codex-review` only)
- These are different phases with different status names ✓ (this is actually correct)
- But `orchestrate.md` should be updated to reflect `pr-reviewed` in place of `cba-complete` where it refers to code review gates

**Responsibility:** 📋 **BOTH SESSIONS** (documentation clarification only)

No code changes needed, just update `orchestrate.md`:
- Line 322: change reference from `cba-complete` to `pr-reviewed` (for post-review merge gates)
- Add clarity: "`cba-complete` = boundary audit done | `pr-reviewed` = code review done"

---

## Gap 6: Error Handling for Directive System (MEDIUM)

**Finding:**
Ship-task skills have no fallback if `session-directives.json` is inaccessible or corrupted.

**Missing:**
- What if read fails? Retry? Proceed anyway? Halt?
- What if orchestrator is slow to respond? Timeout?
- What if file is locked? Retry logic?
- Partial failure: if directive polling fails on tick N, what happens on tick N+1?

**Current state:**
- Directive polling code just reads the file
- No error handling specified
- No timeout, no retry, no fallback

**Responsibility:** 🔧 **SHIP-TASK SESSION**

Must add to all pipeline skills (after directive polling section):
1. Try-catch for file read, retry up to 3x with exponential backoff
2. If all retries fail: proceed with normal execution (single-session fallback)
3. Log warning to user: "Orchestrator coordination unavailable; running in single-session mode"
4. Timeout: if directive polling takes >5s, log warning and continue
5. Do NOT halt or block — always prefer graceful degradation

---

## Gap 7: Orchestrator Authority for Merges (MEDIUM)

**Finding:**
Orchestrator "owns all merges" but the exact protocol is ambiguous.

**Current state:**
- `orchestrate.md` line 18: "orchestrator performs every merge to a shared branch itself"
- `orchestrate.md` PHASE 6 line 326-328: "escalate to Scott" for main/stage/prod merges
- But PHASE 6B line 349-415: orchestrator executes merges directly

**Ambiguity:**
1. Do sessions submit merge requests to `branch-requests.json` (as PHASE 6 suggests), OR
2. Does orchestrator just watch for `pr-reviewed` status and merge autonomously (as PHASE 6B suggests)?

**Impact on ship-task:**
- `/promote-to-prod` needs to know: do I request a merge, or just set status and wait for orchestrator?

**Responsibility:** 📋 **ORCHESTRATOR SESSION**

Must clarify in `orchestrate.md`:
1. PHASE 6B step 3: do sessions submit merge requests first, or does orchestrator just scan backlog?
2. Update scope section to clarify: "Orchestrator scans `pr-reviewed` tasks and merges them automatically (no session request needed)" OR "Sessions request merges via `branch-requests.json` with op='merge'; orchestrator approves and executes"
3. This is a design choice that affects both

---

## Gap 8: Post-Merge Responsibility (LOW)

**Finding:**
After orchestrator merges and notifies session, responsibility for final status is unclear.

**Scenario:**
1. Orchestrator merges task's PR to main
2. Orchestrator writes completion directive
3. `/promote-to-prod` receives directive
4. Should `/promote-to-prod` set status to `production`, or should orchestrator do it?
5. Race condition: both might try to write the same status

**Missing:**
- Clear responsibility boundary
- Atomic status update (avoid concurrent writes)
- Confirmation: who "owns" the final status update?

**Current state:**
- `/promote-to-prod` would set `production` status
- Orchestrator might also try to set it
- No lock/coordination documented

**Responsibility:** 🔧 **SHIP-TASK SESSION**

Add to `/promote-to-prod`:
1. Wait for orchestrator completion directive
2. Parse directive to confirm merge succeeded
3. Set status to `production` (ship-task owns this)
4. Orchestrator should NOT overwrite this (clarify in orchestrate.md)

---

## Responsibility Summary

### Ship-Task Session (This Session) — 5 Gaps to Fix

| Gap | Severity | Action |
|---|---|---|
| #1: Merge request protocol | CRITICAL | Add merge request submission code to `/promote-stage` and `/promote-to-prod` |
| #2: Merge completion notification | HIGH | Add directive polling for merge completion in `/promote-to-prod` |
| #6: Error handling | MEDIUM | Add try-catch and graceful fallback to all skills' directive polling |
| #8: Post-merge responsibility | LOW | Add status update after receiving completion directive |

**Estimated effort:** 4-6 hours (implement + test)

---

### Orchestrator Session — 3 Gaps to Fix

| Gap | Severity | Action |
|---|---|---|
| #3: Directive issuance logic | HIGH | Implement phase transition directives in orchestrator tick loop |
| #5: Status naming consistency | MEDIUM | Update `orchestrate.md` to clarify `cba-complete` vs `pr-reviewed` |
| #7: Merge authority protocol | MEDIUM | Clarify in `orchestrate.md` whether sessions request merges or orchestrator just scans backlog |

**Estimated effort:** 6-8 hours (implement orchestrator + clarify docs)

---

### Both Sessions — 1 Gap (Shared Design)

| Gap | Severity | Action |
|---|---|---|
| #4: Status synchronization | MEDIUM | Define protocol for status visibility: max delay, acknowledgement, fallback |

**Estimated effort:** 2-3 hours (design + document)

---

## Critical Path Dependencies

**Blocker:** Gap #7 (merge authority protocol) must be resolved BEFORE ship-task session implements Gap #1 (merge request protocol).

**Recommendation:**
1. Orchestrator session clarifies Gap #7 first in `orchestrate.md`
2. Ship-task session then implements Gap #1 with correct protocol
3. Orchestrator session implements Gap #3 (directive issuance)
4. Both sessions coordinate on Gap #4 (status sync protocol)

---

## Files to Update

### Ship-Task Session Will Update:
- `~/.claude/commands/promote-stage.md` — add merge request protocol
- `~/.claude/commands/promote-to-prod.md` — add merge request + completion polling
- All `~/.claude/commands/{skill}.md` — add error handling to directive polling
- `docs/skills/` — sync all changes
- `SHIP-TASK-UPDATES.md` — update with new sections

### Orchestrator Session Will Update:
- `orchestrate.md` (or equivalent source) — clarify PHASE 3, PHASE 6B, merge protocol
- New orchestrator implementation with directive issuance logic

---

## Next Steps

1. ✅ This document created
2. ⏳ **Orchestrator session:** Clarify Gap #7 (merge authority) in `orchestrate.md`
3. ⏳ **Both:** Agree on Gap #4 protocol (status sync timing)
4. ⏳ **Orchestrator:** Implement Gap #3 (directive issuance) + Gap #5 (docs)
5. ⏳ **Ship-task:** Implement Gap #1, #2, #6, #8 based on orchestrator's clarifications
6. ⏳ **Integration test:** Multi-session workflow with all gaps resolved

---

## Orchestrator Session Additions (2026-05-29)

The following gaps were identified independently during the orchestrator session and are added here for the ship-task session to address. Responsibility assignments are noted for each.

---

### Gap 9: `cba-complete` in resumption table routes to wrong step (HIGH)

**Finding:**
The resumption table in `ship-task.md` maps `cba-complete → Step 6 (codex review)` with the label "Claude review complete; proceed to Codex review." This is wrong on two counts:
- `cba-complete` is set by `/cross-boundary-audit` during the build phase (between start-build and finish-build) — it has nothing to do with Claude review
- A task resuming from `cba-complete` should go to Step 4 (finish-build), not Step 6

**Correct routing:**
| Status | Should route to |
|---|---|
| `cba-complete` | Step 4 (finish-build) — audit passed, ready to commit and push |
| `build-finished` | Step 5 (review-pr) — PR is open, ready for Claude review |
| (no status currently covers post-Claude-review) | Step 6 (codex-review) |

**Responsibility:** 🔧 **SHIP-TASK SESSION**
Update resumption table: `cba-complete → Step 4 (finish-build)`, not Step 6.

---

### Gap 10: `pr-reviewed` missing from resumption table (HIGH)

**Finding:**
After `/codex-review` APPROVE, the task status becomes `pr-reviewed`. This status has no row in the resumption table. If a session resumes with a task in `pr-reviewed` state, it has no defined path and will not know where to go.

**Required row:**
| `pr-reviewed` | Step 7 (promote to prod) | Both reviews passed; orchestrator will merge — proceed to `/promote-to-prod`. |

**Responsibility:** 🔧 **SHIP-TASK SESSION**
Add `pr-reviewed` row to the resumption table pointing to Step 7.

---

### Gap 11: Step 6 calls `SetTaskState("cba-complete")` before running codex review (HIGH)

**Finding:**
Step 6 of ship-task.md calls:
```
mcp__polaris__SetTaskState({ taskState: "cba-complete", lastSkill: "codex-review" })
```
...BEFORE invoking `/codex-review`. This sets `cba-complete` (a mid-build status from the audit phase) as the state for what is actually the Codex review gate. After `/codex-review` APPROVE, the correct status is `pr-reviewed`, not `cba-complete`.

**Correct behavior:**
- Do NOT set any state before invoking `/codex-review` in Step 6 (or set to `review` to indicate review-in-progress)
- After `/codex-review` returns APPROVE: `SetTaskState("pr-reviewed")`
- After `/codex-review` returns BLOCK: `SetTaskState("review-blocked")`

**Responsibility:** 🔧 **SHIP-TASK SESSION**
Fix Step 6 state transitions: remove pre-skill `cba-complete` call; set `pr-reviewed` on APPROVE.

---

### Gap 7 — RESOLVED: Merge authority protocol

**Resolution from orchestrator session:**
The ambiguity in Gap #7 is resolved. The correct model is:

> **Orchestrator scans `docs/backlog.json` for `pr-reviewed` tasks and merges them autonomously. Sessions do NOT submit merge requests — they just set status to `pr-reviewed` and the orchestrator takes over.**

This is documented in `orchestrate.md` PHASE 6B: "On each tick, scan `docs/backlog.json` for tasks with `status === 'pr-reviewed'`... collect into an ordered queue... execute the next merge."

Sessions should NOT submit entries to `branch-requests.json` for merges — that path is for branch ops (checkout, push, worktree-add), not PR merges. `/promote-to-prod` should set status to `pr-reviewed` and then poll `session-directives.json` for the orchestrator's merge completion directive (Gap #2 is still open for ship-task session).

**Impact on Gap #1:** Ship-task session does NOT need to add merge request submission to `/promote-to-prod`. The protocol is: set `pr-reviewed`, then poll for the completion directive.

**Responsibility:** ✅ **ORCHESTRATOR SESSION** (resolved)
`orchestrate.md` PHASE 6B already documents the correct behavior. `GAPS-AND-RESPONSIBILITIES.md` updated here.

---

### Updated Responsibility Summary

| Gap | Owner | Status |
|---|---|---|
| #1: Merge request protocol | **SHIP-TASK** | ⚠️ Scope reduced — no merge request needed; just set `pr-reviewed` and poll for directive |
| #2: Merge completion polling | **SHIP-TASK** | ⏳ Open |
| #3: Directive issuance logic | **ORCHESTRATOR** | ⏳ Open |
| #4: Status sync protocol | **BOTH** | ⏳ Open |
| #5: Status naming consistency | **BOTH** | ⏳ Open |
| #6: Error handling in directive polling | **SHIP-TASK** | ⏳ Open |
| #7: Merge authority protocol | **ORCHESTRATOR** | ✅ Resolved |
| #8: Post-merge status ownership | **SHIP-TASK** | ⏳ Open |
| #9: cba-complete routes to wrong step | **SHIP-TASK** | ⏳ Open |
| #10: pr-reviewed missing from resumption | **SHIP-TASK** | ⏳ Open |
| #11: Step 6 wrong SetTaskState call | **SHIP-TASK** | ⏳ Open |

---

## Ship-Task Session Clarifications (2026-05-29)

### Critical Architectural Clarification: Review Status Workflow

**Status handling during reviews is bifurcated:**

The `/review-pr` and `/codex-review` skills run while status is `build-finished`. The status should **stay `build-finished` while both reviews are running** — not transition to any intermediate state. After both reviews complete, a **separate handler process** (not ship-task, not the review skills) compares the two reviews and decides:

- **APPROVE** → set status to `pr-reviewed` → continue to merge
- **BLOCK/REJECT** → set status to `review-blocked` → stop

**Impact on Gap #11:** Step 6 should NOT call `SetTaskState("cba-complete")` before running `/codex-review`. Status remains `build-finished` during the review. The decision to approve or block happens after the review completes, in a separate handler, not in ship-task.

**Note:** This separate approval handler has NOT been designed yet. Orchestrator session should define this process in orchestrate.md.

---

### Gap #1 Revised: No `/promote-to-prod` Status Change

**Clarification on who sets `pr-reviewed`:**

`/promote-to-prod` does **NOT** set status to `pr-reviewed`. That status is set by the approval handler after both reviews pass. `/promote-to-prod` only sets status to `production` after successfully promoting to main.

**Updated behavior for `/promote-to-prod`:**
1. Verify task status is `pr-reviewed` (do not set it)
2. Poll `session-directives.json` for orchestrator's merge completion directive
3. After directive received: validate merge succeeded
4. Push to origin
5. Set status to `production`

**Scope change:** Gap #1 is now narrowly scoped to `/promote-to-prod` documentation update only. No merge request submission logic needed.

---

### Gap #2: Merge Completion Directive Polling — Timing and Timeout

**When to poll:**
- AFTER setting status to `pr-reviewed` (via the approval handler, not `/promote-to-prod`)
- `/promote-to-prod` receives task status already `pr-reviewed` and polls for merge completion directive

**Timeout behavior:**
- Poll for max 5 minutes waiting for the completion directive
- If directive does NOT arrive after 5 minutes: log error and notify user "Orchestrator coordination lost — merge directive not received. User should investigate orchestrator status and manually merge if needed."
- Do NOT proceed to set `production` status if directive is missing

**Critical clarification:** The orchestrator does NOT perform the merge itself. The orchestrator tells the active session (via directive) to merge, then the session does the merge. The orchestrator monitors for merge success.

---

### Gap #3: Orchestrator Design Requirement (Not Ship-Task Responsibility)

The orchestrator session must design and document the approval handler process that compares `/review-pr` and `/codex-review` outcomes and sets status to `pr-reviewed` or `review-blocked`. This is NOT a ship-task gap; it's an orchestrator design gap.

---

### Gap #4: Status Synchronization Protocol — Defer to Orchestrator

Ship-task session should **wait for orchestrator to design the status sync protocol**. Once orchestrator defines max delay, acknowledgement strategy, and fallback behavior, ship-task will implement accordingly.

**Note for orchestrator session:** When designing status sync, include heartbeat mechanism: if a status change is not acknowledged within 2 ticks (60s default), re-issue the affected directive.

---

### Gap #5: CBA-Complete and Codex-Review Have Nothing to Do With Each Other

**Clarification on phase semantics:**

- `cba-complete` is set by `/cross-boundary-audit` after auditing registries and proof units
- `/codex-review` is a CODE REVIEW that runs AFTER finish-build opens the PR
- Status is `build-finished` during both `/review-pr` and `/codex-review`
- These are completely separate phases

**Updated workflow sequence:**
1. `/start-build` → status `build-started`
2. `/cross-boundary-audit` → status `cba-complete` (registry/proof audit done)
3. `/finish-build` → status `build-finished` (PR opened)
4. `/review-pr` + `/codex-review` → status stays `build-finished` (reviews in progress)
5. Approval handler → status to `pr-reviewed` (reviews passed) or `review-blocked` (reviews failed)
6. `/promote-to-prod` → status `production`

The orchestrator session should update `orchestrate.md` to clarify this sequence.

---

### Gap #6: Error Handling — One Skill at a Time

Implement error handling for directive polling in each pipeline skill ONE AT A TIME until complete. Do not batch all nine skills at once.

**Error handling pattern for each skill:**
1. Try-catch around `session-directives.json` read
2. Retry up to 3 times with exponential backoff
3. If all retries fail: log warning "Orchestrator coordination unavailable" and proceed in single-session mode
4. Timeout after 5 seconds on any single directive poll

---

### Gap #8: Post-Merge Status Ownership and Validation

After `/promote-to-prod` receives the merge completion directive:
1. **Validate merge succeeded** — check that the branch tip is now on main/prod (do not just trust the directive)
2. **Push to origin** — ensure the merge is visible on origin
3. **Set status to `production`** — only after validation passes
4. If validation fails: log error and do NOT set `production` status; notify user

---

### Gap #9, #10, #11: Resumption Table and Step 6 Fixes

**Gap #9 fix:** Change resumption table row from:
- `cba-complete → Step 6 (codex review)` 
to:
- `cba-complete → Step 4 (finish-build)`

**Gap #10 fix:** Add new resumption table row:
- `pr-reviewed → Step 7 (promote-to-prod)` — "Reviews approved; ready to promote to production"

**Gap #11 fix:** Step 6 should:
- **NOT** call `SetTaskState("cba-complete")` before invoking `/codex-review`
- Status remains `build-finished` during review
- Do NOT set status in Step 6; let the approval handler decide (pr-reviewed or review-blocked)

Can patch just these affected rows; may be 3-4 total changes to resumption table.

---

---

## Work Completed (2026-05-29 Implementation Session)

### ✅ Gap #9: cba-complete resumption table routing — FIXED
- Updated docs/skills/ship-task.md resumption table
- Changed `cba-complete → Step 4 (finish-build)` (was incorrectly pointing to Step 6)
- Synced to ~/.claude/commands/ship-task.md

### ✅ Gap #10: pr-reviewed missing from resumption table — ADDED
- Added new resumption table row: `pr-reviewed → Step 7 (promote-to-prod)`
- Clarified routing for post-approval tasks

### ✅ Gap #11: Step 6 SetTaskState call — FIXED
- Removed pre-review `SetTaskState("cba-complete")` call from Step 6
- Updated Step 6 description to clarify status remains `build-finished` during reviews
- Status is now set to `pr-reviewed` or `review-blocked` by orchestrator approval handler (future work)

### ✅ Gap #2: Merge completion directive polling in `/promote-to-prod` — IMPLEMENTED
- Added Step 6: "Poll for Merge Completion Directive" with full protocol
- Added Step 7-After: "Validate Merge and Poll for Merge Completion Directive"
- Includes merge validation, origin push, and post-merge directive polling
- Updated Step 9 to clarify status requirements (`pr-reviewed` or `staged`)

### ✅ Gap #6: Error handling for directive polling — COMPLETE
- **All 9 pipeline skills** now include comprehensive error handling:
  1. `/plan-task` ✅ — try-catch + retry + timeout + graceful fallback
  2. `/start-build` ✅ — try-catch + retry + timeout + graceful fallback
  3. `/cross-boundary-audit` ✅ — try-catch + retry + timeout + graceful fallback
  4. `/finish-build` ✅ — try-catch + retry + timeout + graceful fallback
  5. `/review-pr` ✅ — try-catch + retry + timeout + graceful fallback
  6. `/codex-review` ✅ — try-catch + retry + timeout + graceful fallback
  7. `/promote-stage` ✅ — try-catch + retry + timeout + graceful fallback
  8. `/promote-to-prod` ✅ — comprehensive error handling across all directive polling sections
  9. `/ship-task` ✅ — delegates to sub-skills (no direct polling)

- **Error handling pattern implemented:**
  - Try-catch blocks with error recovery
  - Exponential backoff retry (up to 3 attempts for critical reads)
  - 5-second timeout per read operation
  - Graceful fallback to single-session mode on persistent failures
  - **Never halt** on missing directives — always continue with fallback behavior

### ✅ Gap #1 (Revised): Documentation of `/promote-to-prod` workflow
- Merge Model section updated to clarify orchestrator sends directives (not requests)
- Documented that `/promote-to-prod` waits for merge directive before merging
- Added protocol for status checking (`pr-reviewed` as entry status)

---

---

## Summary of Gap Closure (2026-05-29 Session)

**High-Priority Gaps (all closed):**
- ✅ Gap #9: cba-complete resumption routing fixed
- ✅ Gap #10: pr-reviewed resumption row added
- ✅ Gap #11: Step 6 SetTaskState behavior corrected
- ✅ Gap #2: Merge completion directive polling implemented

**Medium-Priority Gaps (all closed):**
- ✅ Gap #6: Error handling for all 9 pipeline skills completed
- ✅ Gap #1 (revised): `/promote-to-prod` merge workflow documented

**Medium-Priority Gaps (awaiting orchestrator):**
- ⏳ Gap #3: Directive issuance logic (orchestrator responsibility) — needed before full multi-session testing
- ⏳ Gap #4: Status synchronization protocol (both sessions) — awaiting orchestrator design
- ⏳ Gap #5: Status naming consistency (both sessions) — awaiting orchestrator docs update

**Gap #8 (Post-merge status ownership):**
- ✅ Implemented in `/promote-to-prod` Step 9 — validates merge succeeded, pushes to origin, sets `production` status

---

## Files Changed in This Session

**Ship-Task Pipeline Skills Updated (10 files):**
1. `docs/skills/ship-task.md` — resumption table + Step 6 fixes
2. `docs/skills/promote-to-prod.md` — merge directive polling + validation + error handling
3. `docs/skills/promote-stage.md` — error handling + merge model clarification
4. `docs/skills/plan-task.md` — error handling
5. `docs/skills/start-build.md` — error handling
6. `docs/skills/cross-boundary-audit.md` — directive polling added + error handling
7. `docs/skills/finish-build.md` — error handling
8. `docs/skills/review-pr.md` — error handling
9. `docs/skills/codex-review.md` — error handling
10. `docs/skills/ship-task.md` — synced from ~/.claude/commands/

**Documentation Updated (2 files):**
1. `GAPS-AND-RESPONSIBILITIES.md` — clarifications + completion tracking + current session summary
2. `CLAUDE.md` — added Rule 15 (skill sync requirement)

**Git Commits (8 total):**
1. Ship-task resumption table and Step 6 fixes
2. Promote-to-prod merge completion directive polling and validation
3. Gap completion status update
4. Promote-to-prod error handling
5. Promote-stage error handling
6. Review-pr error handling
7. All remaining pipeline skills error handling

---

### Implementation Order (Prioritized)

1. **HIGH (blockers for merge flow):**
   - Gap #11: Fix Step 6 SetTaskState behavior (remove pre-review state call)
   - Gap #9: Fix resumption table cba-complete routing
   - Gap #10: Add pr-reviewed row to resumption table
   - Gap #2: Add merge completion directive polling to `/promote-to-prod`

2. **MEDIUM (supporting):**
   - Gap #1 (revised): Document `/promote-to-prod` workflow (no status change)
   - Gap #8: Add merge validation + origin push

3. **MEDIUM (gradual rollout):**
   - Gap #6: Add error handling to promote skills first, then iterate through other pipeline skills one at a time

4. **AWAITING ORCHESTRATOR:**
   - Gap #3: Approval handler design (orchestrator responsibility)
   - Gap #4: Status sync protocol (orchestrator responsibility)
   - Gap #5: Orchestrate.md sequence clarification (orchestrator responsibility)

---

## Architectural Decision — New Review Statuses (2026-05-29, Scott confirmed)

### Decision

The review phase introduces two new statuses and changes the meaning of `review-blocked`. The pipeline now has a clear per-review checkpoint and a final outcome gate.

**New statuses to add to `BACKLOG_STATUS_OPTIONS` and `PIPELINE_STEP_INDEX` in server.js:**

| Status | Set by | Meaning |
|---|---|---|
| `pr-reviewed` | `/review-pr` | Claude review has run and findings are captured (regardless of outcome) |
| `codex-reviewed` | `/codex-review` | Codex review has run and findings are captured (regardless of outcome) |
| `review-passed` | Orchestrator approval handler | Both reviews complete and both approved — ready for merge |
| `review-blocked` | Orchestrator approval handler | Both reviews complete and at least one found blockers — must fix before merging |

**Rules:**
- Status moves to `pr-reviewed` after `/review-pr` runs, even if findings are blocking
- Status moves to `codex-reviewed` after `/codex-review` runs, even if findings are blocking
- The approval handler fires when `codex-reviewed` is reached — it reads both sets of findings and decides `review-passed` or `review-blocked`
- `review-blocked` is NOT set until BOTH reviews have run
- The orchestrator issues the merge directive only when status reaches `review-passed`

**Updated pipeline sequence:**
```
build-finished
  ↓ [/review-pr runs]
pr-reviewed  (Claude findings captured)
  ↓ [/codex-review runs]
codex-reviewed  (Codex findings captured)
  ↓ [Orchestrator approval handler]
review-passed  OR  review-blocked
  ↓ (if review-passed)
[Orchestrator issues merge directive → session merges]
  ↓
production
```

---

### Orchestrator Merge Model — Revised (directive-only)

The orchestrator does **not** run `gh pr merge` itself. It is directive-only.

**Revised orchestrator behavior (replaces PHASE 6B self-merge model):**
1. Detect task reaches `review-passed` in backlog
2. Write merge directive to `session-directives.json` for the owning session:
   - `instruction`: "PR #N approved for merge. Run: `gh pr merge N --merge`, then `git pull origin main && git push origin main`. Then proceed to `/promote-to-prod`."
   - `priority`: `critical`
3. Monitor backlog for task to reach `production`
4. If not reached within 10 minutes → escalate to Scott

**Responsibility assignments:**

| Item | Owner | Status |
|---|---|---|
| Add `codex-reviewed` and `review-passed` to server.js status enums | **SHIP-TASK SESSION** | ⏳ Open |
| Update all pipeline skills for `codex-reviewed` and `review-passed` | **SHIP-TASK SESSION** | ⏳ Open |
| Update resumption table for `codex-reviewed` and `review-passed` | **SHIP-TASK SESSION** | ⏳ Open |
| Design and implement orchestrator approval handler (Gap #3) | **ORCHESTRATOR SESSION** | ⏳ Open |
| Revise orchestrate.md PHASE 6B to directive-only merge model | **ORCHESTRATOR SESSION** | ⏳ Open |
| Update `docs/skills/orchestrate.md` to match | **ORCHESTRATOR SESSION** | ⏳ Open |

