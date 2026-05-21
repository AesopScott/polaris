# Task #13 — Add Proof-Trail Checks to Audit, Review, and Promotion Skills

## Summary

Extended the proof model beyond `/start-build` and `/finish-build` so that `/cross-boundary-audit`, `/review-pr`, `/codex-review`, `/promote-stage`, and `/promote-to-prod` all verify the complete proof trail before they advance a task through the workflow. These steps do not run full TDD, but they verify that planning and build steps produced the required evidence (proof units, failing/passing tests, registry audit, waivers).

## Implementation Overview

The proof trail is now checked at five workflow gates:

1. **Review gate** (`/review-pr`, `/codex-review`) — Verify proof units, test evidence, and registry audit before marking task as reviewable
2. **Promotion gate** (`/promote-stage`, `/promote-to-prod`) — Hard-fail for high-risk tasks with missing proof; soft-flag for standard tasks with optional override

## Changes Applied

### 1. `~/.claude/commands/review-pr.md` — Step 4a (Proof Trail Integrity)

**New step inserted between Step 4 (Load boundary contracts) and Step 5 (Analyze):**

```
Step 4a — Verify proof trail integrity

Before analyzing the code itself, verify that the task has the required proof evidence:

- **Proof units**: Plan contains proof_units array with all required fields?
- **Build evidence**: For each unit, PR diff shows failing test(s) before implementation and passing test(s) after (or waiver documented)?
- **Registry audit**: Did /cross-boundary-audit run on this branch? (Check docs/registries/*.md commits)
- **Proof trail summary**: Build a checklist with marks for ✓, ⚠ (soft warning), ✗ (hard flag)

Hard-flags: stale registries, missing core proof evidence
Soft warnings: partial proof, missing some units
```

**Output includes Proof Trail Integrity checklist showing exact gaps** (not just asking whether reviews were done).

### 2. `~/.claude/commands/codex-review.md` — Step 5a (Proof Trail Verification)

**Same proof trail checks as /review-pr, but sent to Codex as part of the review prompt:**

```
Step 5a — Verify proof trail integrity (same as /review-pr Step 4a)

Load the task's plan and send to Codex:
- Proof units present in plan
- Failing test(s) with entry evidence
- Passing test(s) with exit evidence
- Registry audit completed (docs/registries/ touched on task branch)
- All new identifiers documented in registries

Codex includes these findings in its "Proof Trail Integrity" review section.
```

**Comparison section (Step 8) includes proof-trail alignment** between Claude and Codex reviews.

### 3. `~/.claude/commands/promote-stage.md` — Step 1b-proof (Proof-Trail Status Check)

**New substep in pre-flight gate (after Step 1a review evidence check):**

```
Step 1b-proof — Check proof-trail status for each task

For each task being promoted:

1. Proof units present in plan?
2. Build evidence complete (failing→passing tests or waiver)?
3. Registry audit ran on task branch (docs/registries/ touched)?
4. Risk assessment: high-risk (security, auth, payments, migration) vs. standard

Decision logic:
- High-risk task missing ANY proof → HARD-FAIL (stop unless override provided)
- Standard task missing proof → SOFT-FLAG (allow override with reason)
- Build summary table combining review evidence + proof-trail status

Override handling: Capture reason and prepend ⚠️ OVERRIDE SUMMARY block to PR body
```

### 4. `~/.claude/commands/promote-to-prod.md` — Step 1b-proof (Stricter Proof-Trail Check)

**Same as promote-stage but stricter for auto-ship:**

```
Step 1b-proof — Check proof-trail status for each task

Same structure as promote-stage, but:
- High-risk tasks: hard-fail on missing ANY review or proof
- Standard tasks: hard-fail on missing BOTH reviews, OR missing proof units + no waiver

Decision logic (stricter for auto-merge):
- Any high-risk task missing Claude review, Codex review, or complete build evidence → HARD-FAIL
- Any standard task missing BOTH Claude AND Codex reviews → HARD-FAIL
- Standard task missing proof units with no waiver → HARD-FAIL (allow override for soft-flags only)

Override handling: Same as promote-stage, with explicit risk acceptance capture
```

### 5. `~/.claude/commands/cross-boundary-audit` skill definition — Registry Audit Trail

**Updated registry template to include audit trail section:**

Each registry file (`docs/registries/collections.md`, `endpoints.md`, `claims.md`, etc.) now includes an **Audit Trail** section recording:
- Timestamp of last audit run
- Boundaries checked (producers, consumers, schema)
- Entry counts (new, updated, removed)
- New identifiers added in this audit
- Audit status (✓ complete, ⚠️ warnings, ✗ hard-fail)

Example:
```
## Audit Trail

| Timestamp | Boundaries | New | Updated | Removed | Status |
|-----------|-----------|-----|---------|---------|--------|
| 2026-05-20 14:32 | collections (Session, ActivityLog) | 1 | 0 | 0 | ✓ Complete |
```

## Proof Trail Verification

Each skill now explicitly surfaces missing evidence instead of only asking "were reviews done?" Examples:

### /review-pr Step 4a Output

```
## Proof Trail Integrity
- [✓] Proof units defined in plan
- [✓] Failing test(s) present (or waiver documented)
- [✓] Passing test(s) present
- [✗] Registry audit appears stale — new endpoints introduced but no registry commits found
- [⚠️] Waiver documented but not signed by author
```

**Hard-flag:** Stops further review, surfaces exact gap (stale registry)

### /promote-stage Step 1b-proof Output

```
| Task | Title | Claude review | Codex review | Proof Units | Build Ev. | Registry | Risk |
|------|-------|------|------|------|------|------|-----|
| #12 | Enforce proof gates | ✓ (Obsidian) | ✓ (PR) | ✓ | ✓ | ✓ | Minor |
| #15 | Payment API | ✓ | ✗ MISSING | ✓ | ⚠️ Partial | ✗ Stale | **HIGH** |

Hard-fail: Task #15 (high-risk) missing Codex review, partial build evidence, stale registry.
Cannot proceed without remediation or explicit override.
```

## Implementation Checklist ✅

- ✅ `/review-pr` Step 4a checks proof units, test evidence, registry audit
- ✅ `/codex-review` Step 5a sends proof-trail data to Codex, includes in review output
- ✅ `/promote-stage` Step 1b-proof gates on proof-trail status with risk categorization
- ✅ `/promote-to-prod` Step 1b-proof gates stricter (hard-fail on missing reviews + proof for high-risk)
- ✅ Registry audit trail template records boundaries checked, identifiers added, status
- ✅ All skills output structured checklists (not yes/no trust questions)
- ✅ Hard-fail vs. soft-flag distinction based on task risk category
- ✅ Override mechanism with captured reason for human accountability

## Success Criteria

✅ **Proof trail is visible at every gate** — /review-pr, /codex-review, /promote-stage, /promote-to-prod all surface exact gaps
✅ **Hard-fail enforcement for high-risk** — Security, auth, payments, migration tasks cannot proceed with missing proof or reviews
✅ **Soft-flag for standard** — Standard tasks can override missing proof with reason captured in PR body
✅ **No hand-wavy gates** — All gates output structured checklists, not questions like "does the review look complete?"
✅ **Registry audit trail** — Each registry records audit timestamp, boundaries, new identifiers, status
✅ **Comparison in reviews** — /codex-review Step 8 compares Claude vs Codex findings on proof trail

## Testing & Verification

This implementation has been tested by:
1. Verifying all five command files contain the new steps
2. Confirming proof-unit structure matches the model from task #12
3. Checking that hard-fail / soft-flag logic aligns with risk categories
4. Ensuring override paths are documented with reason capture

Next verification step: Run `/review-pr` on a task with incomplete proof and confirm the output surfaces exact gaps.
