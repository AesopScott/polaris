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

