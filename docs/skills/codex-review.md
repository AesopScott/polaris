---
name: codex-review
description: Independent code review via Codex (GPT-5.4 family) with two modes, mirroring /review-pr. (1) Ad-hoc mode — pass a PR number (bare integer), a commit range/branch, or nothing (current branch's active PR) to review code with no backlog task. (2) Task mode — pass `task <N>` to resolve the PR via the task's pr_url, reviews against spec/objective/proof-trail/registries, compares against any prior /review-pr in the session, logs to Obsidian, and sets the task's review status. Output is text only; never posts to GitHub automatically. Two model families surface disagreements neither alone would catch.
---

# /codex-review [pr-number | task <N> | <commit-range> | (no arg)]

Run a structured code review using **Codex** (a different model family from Claude), then compare it against a prior `/review-pr` review if one exists in this session's context. The skill runs in one of two modes depending on the argument (see **Review modes** below).

You do **not** post to GitHub. Output is text only.

## Directive Polling (multi-session only) with Error Handling

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives:

Poll with try-catch and retry (use `node -e`, never Read tool). Retry up to 3 times with exponential backoff. Timeout 5s per attempt.

**On finding directive:** Set `status: "acknowledged"`, execute `instruction`, set `status: "completed"` with result.
**On timeout/failure:** Log warning and proceed to "Review modes" in single-session fallback mode. Do not halt.

---

## Review modes

Detect the mode from the argument before doing anything else (same rule as `/review-pr`):

- **Ad-hoc mode** — a bare integer (PR number), `pr <N>` / `#<N>`, a commit range, a branch name, or no argument. Reviews arbitrary code with no backlog task. Follow **Ad-hoc mode** directly below, then stop.
- **Task mode** — the argument begins with the literal word `task` followed by an integer (e.g., `task 4`). Resolves the PR via `pr_url`, reviews against spec/objective/proof-trail/registries, compares against any prior `/review-pr`, logs to Obsidian, and sets the task's review status. Follow **Task mode** (everything from "## Scope and limits" onward).

If the argument is ambiguous, ask which the user meant.

## Ad-hoc mode (code review with no backlog task)

Mirror `/review-pr`'s ad-hoc mode: there is no task spec, objective, proof trail, or backlog status, so those sections are dropped. Do **not** log to Obsidian and do **not** touch `docs/backlog.json`.

### B1 — Verify Codex is available

Same as Task mode Step 1: confirm Codex is reachable (`mcp__codex__codex_review` preferred, `/codex:rescue` fallback). If neither is available, stop and tell the user to register the codex MCP server.

### B2 — Resolve the review target

Same as `/review-pr` ad-hoc A1:
- **No argument** → find the active PR for the current branch with `gh pr view` (gh defaults to the current branch). Load the diff with `gh pr diff`. If no PR exists, fall back to current branch vs base (`git merge-base HEAD origin/main`, fall back to `main`); include uncommitted working-tree changes, noted separately.
- **A bare integer, `pr <N>`, or `#<N>`** → that GitHub PR via `gh pr view <N>` + `gh pr diff <N>`.
- **A commit range or branch name** → `git diff <range>`.

Capture any free-text description from the user as the **stated intent**. Record the same human-readable `{target}` descriptor `/review-pr` uses — you'll match the comparison on it in B6.

### B3 — Load the diff and (if present) boundary contracts

Load the full diff. Read `docs/registries/*.md` / `docs/contracts/*.md` only if they exist; include a Boundary Integrity section only in that case.

### B4 — Delegate the review to Codex

Invoke the Codex review path (`mcp__codex__codex_review` preferred, `/codex:rescue` fallback) with a prompt describing the **actual target** generically — do NOT use the CareGuide/stage/task template from Task mode Step 6. Tell Codex there is no task spec, objective, or proof trail to check. Pass:
- The full diff (or `gh pr diff <N>` output)
- Any registries/contracts that exist
- The stated intent, if the user gave one

Ask Codex to state its exact model at the top, then use exactly these section headers: **Verdict** (APPROVE | REQUEST CHANGES | NEEDS DISCUSSION), **Summary**, **Stated-intent compliance** (only if intent was given), **Boundary Integrity** (only if registries exist), **Security**, **Code Quality**, **Recommended action**. Use the same headers `/review-pr` ad-hoc mode uses so a side-by-side comparison is possible.

### B5 — Output the Codex review

```
### Codex Review (model: {model-from-codex}) — Ad-hoc review: {target}

**Reviewer:** Codex via {mcp__codex__codex_review | /codex:rescue}, model `{model-from-codex}`
**Target:** {same descriptor used in /review-pr}
**Verdict:** ...
**Summary:** ...
...
```

If Codex did not report a model identifier, write `unknown` and warn the user that model attribution is incomplete.

### B6 — Compare against a prior /review-pr ad-hoc review (if present)

Scan this session for a header `### Claude Review (model: ...) — Ad-hoc review: {target}` matching the **same `{target}` descriptor**. If found, produce a comparison using the Step 8 template **minus the Proof Trail Integrity and Objective Compliance sections** (those don't exist in ad-hoc) — compare Verdict, Stated-intent compliance (if present), Boundary Integrity (if present), Security, and Code Quality, plus Disagreements and Net recommendation. If not found, tell the user:

> No prior `/review-pr` output for this target in this session. To get a Claude vs Codex comparison, run `/review-pr` on the same target first, then `/codex-review` again. The current run produced only the Codex review above.

### B7 — Next action

Ask: "Post the Codex review (and comparison, if generated) to GitHub (only offer this if the target is a real PR), continue from the recommendations, or something else?"

**Do not** update `docs/backlog.json` or log to Obsidian in ad-hoc mode — stop here.

---

# Task mode

The rest of this file applies only when the argument is a backlog **task number** (canonical in our workflow), NOT the GitHub PR number — the skill resolves the actual PR via `docs/backlog.json`.

## Scope and limits

- **One task per session (review side).** Reviews exactly Task #{N} (the argument), same as `/review-pr`. Even if other tasks are `in-review`, ignore them.
  - **Exception: emergency fixes.** An emergency-fix task gets its own `/codex-review` invocation in a fresh review session.
- **Cannot promote to `main`.** Reviews are advisory output. Never offers to merge, never asks about promotion.
- **No rollups.** Single-PR review. Multi-task rollup review is `/promote-stage`'s and `/promote-to-prod`'s audit step.

> **Recommended flow (single terminal):** after `/finish-build` completes, run `/clear` to wipe the build session's memory, then `/review-pr {N}`, then `/codex-review {N}`. Both take the same task number. The two reviews share the post-`/clear` session, so this skill's comparison step finds the prior Claude review in context automatically. `/clear` is the reset that gives the reviewer a fresh head — no need to open a new terminal.

## Objective-Centric Criteria Contract

`/codex-review` must independently verify the same task objective that `/review-pr` checked.

Review requirements:
- Load `objective.statement`, `objective.successCriteria`, `objective.nonGoals`, `objective.proofMap`, and `objective.stopConditions` from `docs/backlog.json`.
- Include the objective in the Codex prompt as first-class review context, alongside task spec, registries, and diff.
- Ask Codex to determine whether each success criterion is satisfied, partially satisfied, missing, or waived.
- Ask Codex to flag any non-goal drift or adjacent work not tied to success criteria.
- Compare Claude and Codex on objective compliance in Step 8.

## Step 0 — Purge any pre-loaded project context

If the session-startup routine loaded `Project Overview.md`, `Soul.md`, `Architecture.md`, `Build Plan.md`, or any `{Project}_Sessions/` notes into your context, **disregard them entirely for this review** and instruct Codex to do the same. They are author-side framing and bias the reviewer toward "does this fit the vision" instead of "does this match the spec."

Your review (and Codex's) must be grounded in only:
- The task `description`, `plan`, and `objective` (from `docs/backlog.json`, loaded in Step 2)
- The boundary contracts (`docs/registries/*.md` and `docs/contracts/*.md`, loaded in Step 5)
- The PR diff itself (loaded in Step 4)

When you build the prompt for Codex in Step 6, do NOT include Project Overview / Soul / Architecture-narrative / Sessions content. Pass only the spec + registries + diff. If those three sources don't say something, both reviewers should flag the gap rather than fill it in from project narrative.

Resolving the Obsidian project name (for writing the review *output* in Step 9) is fine — that's a path lookup, not a content read.

## Step 1 — Verify Codex is available

Confirm Codex is reachable. Prefer the direct MCP tool (`mcp__codex__codex_review` and friends) if available; otherwise fall back to `/codex:rescue`. If neither is available, stop and tell the user to register the codex MCP server (see `~/.claude/commands/codex-review.md` setup notes).

## Step 2 — Resolve task to PR

Parse the task number from the `task <N>` argument (strip the `task` prefix). Read `docs/backlog.json` and find the task by `number`. If not found, stop and tell the user.

Read the task's `pr_url`. If `null`, stop with "Task #{N} has no PR yet — its status is `{status}`. Did you mean `/finish-build`?"

### Step 2a — State guard (lifecycle order check)

Same lifecycle check as `/review-pr`:

| Current status | Allowed action |
|---|---|
| `build-finished` | ✅ Proceed — standard review status (awaiting Codex review). |
| `cba-complete` | ⚠️ Soft warn: "Task #{N} is already cba-complete (Codex review done). This is a follow-up review. Proceed? [yes/no]" |
| `staged` / `production` / `complete` | ⚠️ Soft warn: "Task #{N} is already {status}. Review is after-the-fact only. Proceed? [yes/no]" |
| `planned` / `backlog` / `build-started` | ❌ **Refuse.** "Task #{N} doesn't have a finished build to review (status: {status}). Run `/finish-build` first." Stop. |

Do NOT skip this check.

Extract the PR number from `pr_url` (e.g., `.../pull/3` → `3`). Hold the **task number** (input) and **PR number** (derived) for use in headers.

Note the task's `branch` field for the self-check.

## Step 3 — Self-check for context independence

Compare `git branch --show-current` to the task's `branch` field. If they match, this session likely wrote the code. Warn the user:

> ⚠️ This session appears to be the one that wrote the code for Task #{task-N} (PR #{pr-N}). Reviewing your own work is a known anti-pattern.
>
> Recommended: start a new session and run `/codex-review {task-N}` there.

Ask whether to **abort** (default) or override. Only continue on explicit override.

## Step 4 — Load the PR

Use GitHub MCP tools or `gh pr view {pr-N}` to fetch:
- PR title, description, diff

Sanity check the title contains `Task #{task-N}`. If not, warn the user that the backlog's `pr_url` might be stale.

## Step 5 — Load the boundary contracts

Read in full:
- `docs/registries/collections.md`
- `docs/registries/endpoints.md`
- `docs/registries/claims.md`
- Any `docs/contracts/*.md` relevant to the change

## Step 5a — Verify proof trail integrity (same as /review-pr Step 4a)

**Send this context to Codex as part of the review prompt below.** Load the task's `plan` field from `docs/backlog.json` and check for:
- Objective criteria present
- Every success criterion mapped to proof
- Diff satisfies objective criteria
- No non-goal drift
- Proof units present in plan
- Failing test(s) with entry evidence
- Passing test(s) with exit evidence
- Registry audit completed (docs/registries/ touched on task branch)
- All new identifiers documented in registries

Codex will include these findings in its review. See `/review-pr` Step 4a for the full checklist format.

## Step 6 — Delegate the review to Codex

Invoke the Codex review path (`mcp__codex__codex_review` preferred, `/codex:rescue` as fallback) with a prompt that instructs Codex to:

> Review pull request #{pr-N} for the CareGuide project (Task #{task-N}). The PR title is "{title}", base is `stage`, head is `task/{task-N}-{slug}`.
>
> Context:
> - Task spec (from `docs/backlog.json` task #{task-N}): {description + plan + objective}
> - Registries: {paste collections.md, endpoints.md, claims.md content}
> - Full PR diff: {paste `gh pr diff {pr-N}` output, or summarize if too long}
>
> **At the very top of your response, state the exact model name you are running** (e.g., "Model: gpt-5.4-codex" or whatever identifier applies). Then produce a structured review using exactly these section headers:
> - **Verdict** (APPROVE | REQUEST CHANGES | NEEDS DISCUSSION)
> - **## FINDINGS** — severity-tagged list before any prose: `[CRITICAL|HIGH|MEDIUM|LOW] Category: description (file:line)`. Order CRITICAL → LOW. If no issues: `✓ No findings.`
> - **Summary** (1–2 sentences)
> - **Proof Trail Integrity** (status of proof units, test evidence, registry audit, and any gaps)
> - **Objective Compliance** (each success criterion satisfied/partial/missing/waived; any non-goal drift)
> - **Spec Compliance** (gaps or overreach; "✓ Fully compliant" if none)
> - **Boundary Integrity** (registry gaps, orphans, undocumented additions; "✓ All boundaries documented" if none)
> - **Security** (concerns; "✓ No issues found" if none)
> - **Code Quality** (specific file:line concerns)
> - **Recommended action**
>
> Use the same section format `/review-pr` uses so a side-by-side comparison is possible.

Capture Codex's full response. Extract the model identifier from the top of the response — you'll need it for the headers in Step 7 and Step 8.

## Step 7 — Output the Codex review

Render Codex's review with the model identifier and both numbers in the header:

```
### Codex Review (model: {model-name-from-codex}) — Task #{task-N} (PR #{pr-N})

**Reviewer:** Codex via {mcp__codex__codex_review | /codex:rescue}, model `{model-name-from-codex}`
**Verdict:** ...

## FINDINGS

*Prioritized list — fix CRITICAL and HIGH before merge. MEDIUM and LOW are optional.*

**CRITICAL** *(security vulnerability or data loss risk — blocks merge)*
- [ ] `file:line` — {description}   ← or: *(none)*

**HIGH** *(bug or significant quality issue — should fix before merge)*
- [ ] `file:line` — {description}   ← or: *(none)*

**MEDIUM** *(maintainability concern — consider fixing)*
- [ ] `file:line` — {description}   ← or: *(none)*

**LOW** *(style or minor suggestion — optional)*
- [ ] `file:line` — {description}   ← or: *(none)*

**Summary:** ...
...
```

If Codex did not report a model identifier, write `unknown` and warn the user that model attribution is incomplete.

## Step 8 — Compare against the prior /review-pr output (if present)

Scan this session's prior turns for a Claude review of the **same task number**. Look for a header matching `### Claude Review ... — Task #{task-N} (PR #{pr-N})`. Match by task number, since that's what both skills now print.

**If found**, extract the Claude model identifier from the `Reviewer:` line. Output a comparison section:

```
### Comparison — Claude ({claude-model}) vs Codex ({codex-model}) — Task #{task-N} (PR #{pr-N})

**Verdict alignment:**
- Claude ({claude-model}): {verdict}
- Codex ({codex-model}): {verdict}
- Match? yes | no — and what that means

**Proof Trail Integrity**
- Agree: {findings both reviewers raised about proof units, test evidence, registry audit}
- Claude only: {gaps Codex missed}
- Codex only: {gaps Claude missed}

**Objective Compliance**
- Agree: {findings both reviewers raised about success criteria or non-goal drift}
- Claude only: {objective gaps Codex missed}
- Codex only: {objective gaps Claude missed}

**Spec Compliance**
- Agree: {findings both reviewers raised}
- Claude only: {findings Codex missed}
- Codex only: {findings Claude missed}

**Boundary Integrity**
- Agree: ...
- Claude only: ...
- Codex only: ...

**Security**
- Agree: ...
- Claude only: ...
- Codex only: ...

**Code Quality**
- Agree: ...
- Claude only: ...
- Codex only: ...

**Disagreements**
For every section where the two reviewers reached different conclusions, summarize why each is plausible — the user decides which to act on.

**Net recommendation**
- If both verdicts are APPROVE → safe to proceed
- If one is REQUEST CHANGES → resolve those findings first
- If they conflict on Verdict → flag for human decision before merge
- If proof trail has gaps and both verdicts would otherwise approve: surface the risk and request remediation before production promotion
```

**If not found**, tell the user:

> No prior `/review-pr {task-N}` output in this session. To get a Claude vs Codex comparison, run `/review-pr {task-N}` first in this same session, then `/codex-review {task-N}` again. The current run produced only the Codex review above.

## Step 9 — Log Codex Review + Comparison to Obsidian

Append the Codex review (and comparison, if generated) to the task's Obsidian tracker.

1. Resolve the Obsidian project name via CWD basename fuzzy-match against `*_Build/` folders. Call it `{ProjectObsidian}`. If no match, skip Obsidian logging.

2. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{task-N}-{slug}.md`. Extract `{slug}` from the task's `branch` field.

3. **Ensure file exists with header** (defensive — should already exist after `/plan-task`, `/start-build`, `/finish-build`, and `/review-pr`). If 404, append the standard initial header.

4. **Append the Codex Review + Comparison section** — the full output from Steps 7 and 8 combined:

   ```
   ---

   ## Codex Review + Comparison — {ISO 8601 UTC timestamp} (by /codex-review)

   ### Codex Review

   {full Codex review markdown from Step 7, including the Reviewer line and all section findings}

   ### Comparison

   {comparison markdown from Step 8 if a prior /review-pr ran in this session; otherwise "(no prior /review-pr {task-N} output found in this session — Codex review stands alone)"}
   ```

5. Tell the user: "Codex review + comparison logged to `{ProjectObsidian}_Build/Tasks/Task-{task-N}-{slug}.md`."

## Step 9 — Set task status to `codex-reviewed` (task mode only)

In task mode, after the Codex review is complete and logged, set the task's status to `codex-reviewed` in `docs/backlog.json` on main:

```bash
node -e "
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('docs/backlog.json', 'utf8'));
const task = b.tasks.find(t => t.number === {task-number});
if (task) {
  task.status = 'codex-reviewed';
  fs.writeFileSync('docs/backlog.json', JSON.stringify(b, null, 2) + '\n', 'utf8');
  console.log('Status updated: Task #{task-number} → codex-reviewed');
}
"
```

This status indicates that the Codex review has been captured and findings are documented. The orchestrator approval handler (PHASE 6C) will now read both `/review-pr` and `/codex-review` findings to determine the final status (`review-passed` or `review-blocked`).

**Important:** This skill does NOT set `review-blocked` or `review-passed`. Only the orchestrator approval handler sets those statuses.

## Step 10 — Approval handler will read both reviews

> **Note on status:** You set `codex-reviewed` in Step 9. The orchestrator approval handler (PHASE 6C) now reads both `/review-pr` findings AND `/codex-review` findings and decides:
>
> | Both Approve | Codex Blocks | Claude Blocks but Codex Approves |
> |---|---|---|
> | Status → `review-passed` | Status → `review-blocked` | Status → `review-blocked` |
> | (Merge proceeds) | (Merge blocked; user fixes) | (Merge blocked; user fixes) |
>
> The orchestrator handler reads the Verdicts from both reviews' completion banners. Ensure your **Verdict** is clearly stated so it can be parsed without ambiguity.
> 
> **If `review-blocked` is set:** The user will fix the code and re-run this `/codex-review` skill (or `/review-pr` if only Claude blocked). The skill runs again from Step 1, captures new findings, and repeats until `review-passed` is reached.

## Step 11 — Final question

Ask: "Post the Codex review (and comparison, if generated) as a GitHub PR comment, continue working from the recommendations, or take a different action?"


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /codex-review complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
