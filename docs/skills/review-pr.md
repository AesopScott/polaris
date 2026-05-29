---
name: review-pr
description: Code review skill with two modes. (1) Ad-hoc mode — pass a PR number (bare integer), a commit range/branch, or nothing (current branch's active PR) to review code with no backlog task; outputs a structured review as text only. (2) Task mode — pass `task <N>` to resolve to the PR via the task's pr_url in backlog.json, reviews against task spec/objective/proof-trail/registries, and logs to Obsidian. Either way it does not post to GitHub automatically. Should use a different model than the one that wrote the code (Codex preferred).
---

# /review-pr [pr-number | task <N> | <commit-range> | (no arg)]

This skill reviews code and outputs a structured review. It runs in one of two modes depending on the argument (see **Review modes** below).

**You do not post to GitHub. You output the review as text only.**

## Directive Polling (multi-session only) with Error Handling

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives before proceeding:

**Polling with try-catch and retry:**

Use `node -e` with error handling (never the Read tool):

```bash
timeout=5
retries=0
max_retries=3

while [ $retries -lt $max_retries ]; do
  timeout $timeout node -e "
    try {
      const fs = require('fs');
      const dirPath = \`\${process.env.APPDATA}\\.claude\\polaris\\session-guidance\\session-directives.json\`;
      if (!fs.existsSync(dirPath)) {
        console.log('no-directive');
        process.exit(0);
      }
      const content = fs.readFileSync(dirPath, 'utf8');
      const data = JSON.parse(content);
      const sessionId = process.env.SESSION_ID || 'unknown';
      const pending = data.directives && data.directives.find(d => 
        d.target.sessionId === sessionId && d.status === 'pending'
      );
      if (pending) {
        console.log(JSON.stringify(pending));
      } else {
        console.log('no-directive');
      }
    } catch (e) {
      console.error('read-failed: ' + e.message);
      process.exit(1);
    }
  " && break
  retries=$((retries + 1))
  [ $retries -lt $max_retries ] && sleep $(echo "2 ^ $retries" | bc) || true
done

if [ $retries -eq $max_retries ]; then
  echo "⚠️ Directive polling unavailable. Proceeding in single-session mode."
fi
```

**Behavior:**

1. If directive found:
   - Set `status: "acknowledged"` and `acknowledgedAt: <ISO timestamp>`
   - Execute the `instruction` field as a user message
   - Set `status: "completed"` with `completedAt` and `result`

2. If no directive or polling fails:
   - Continue to "Review modes" in single-session fallback mode
   - **Do not halt** on missing directives

---

## Review modes

Detect the mode from the argument before doing anything else:

- **Ad-hoc mode** — a bare integer (PR number), `pr <N>` / `#<N>`, a commit range (`main..HEAD`, `A...B`), a branch name, or no argument. Reviews code with no backlog task attached. Follow **Ad-hoc mode** directly below, then stop.
- **Task mode** — the argument begins with the literal word `task` followed by an integer (e.g., `task 4`). Looks up that task number in `docs/backlog.json`, resolves to the task's `pr_url`, then reviews against the task spec, objective, proof trail, and registries, and logs to Obsidian. This is the `/ship-task` review path. Follow **Task mode** (everything from "## OBSIDIAN ACCESS PROTOCOL" onward).

If the argument is ambiguous (e.g., something that could be a branch name or a PR number), ask the user which they meant.

## Ad-hoc mode (code review with no backlog task)

Use this when reviewing code that isn't tied to a backlog task — work in the current session, a one-off PR, or an arbitrary diff. There is no task spec, objective, proof trail, or backlog status here, so those sections are dropped. Do **not** log to Obsidian and do **not** touch `docs/backlog.json`.

### A1 — Resolve the review target

Parse the argument:
- **No argument** → find the active PR for the current branch with `gh pr view` (gh defaults to the current branch; no number needed). Load the diff with `gh pr diff`. If no PR exists for the current branch, fall back to reviewing the branch vs its base: find the base with `git merge-base HEAD origin/main` (fall back to `main`); diff is `git diff <base>...HEAD`. Also run `git status --short` / `git diff` and, if there are uncommitted working-tree changes, include them **noted separately** as "uncommitted".
- **A bare integer, `pr <N>`, or `#<N>`** → review that GitHub PR. Load it with `gh pr view <N>` and `gh pr diff <N>`.
- **A commit range (`A..B`, `A...B`) or a branch name** → review `git diff <range>` (for a branch name, `git diff <base>...<branch>`).

If you can't resolve the argument to any of these, stop and ask the user what to review.

If the user included a free-text description of what the change is supposed to do, capture it as the **stated intent** (a lightweight spec for A4).

### A2 — Load the diff

Load the full diff for the resolved target. If it's very large, summarize lower-risk files but read security- and boundary-relevant files in full.

### A2a — Detect author model

Scan the commit range for `Co-Authored-By: Claude` lines to determine what model wrote the code:

```
git log {base}..HEAD --format="%B"
```

- If the commits include `Co-Authored-By: Claude Sonnet` (any version), the code was written by Sonnet. Since this reviewer is also Sonnet 4.6 (see A4), same-model review is the anti-pattern we are trying to avoid. Spawn an **Opus 4.8 sub-agent** via the Agent tool with `model: "opus"` to perform steps A3–A5, passing it:
  - The full diff (from A2)
  - Any boundary contracts found in `docs/registries/` or `docs/contracts/`
  - The stated intent (if any, from A1)
  - The target descriptor
  - Instructions to output the review in the standard format with `claude-opus-4-8` in the header

  Relay the sub-agent's output verbatim, then stop. Do **not** also run A3–A5 yourself.

- If no Sonnet attribution is found (Opus, Haiku, unknown, or no Co-Authored-By at all), proceed to A3 as normal using Sonnet 4.6.

> **Note:** If the commit range can't be determined (e.g., no base found), skip this detection step and proceed with Sonnet 4.6.

### A3 — Load boundary contracts if present

If `docs/registries/*.md` or `docs/contracts/*.md` exist in the repo, read the ones relevant to the diff and include a **Boundary Integrity** section. If neither directory exists, skip that section entirely — ad-hoc reviews don't assume the registry workflow is in place.

### A4 — Analyze and output

Review the diff for correctness, security, and code quality (the same lenses as Task mode's Step 5, minus the task-spec parts). This review runs as **Claude Sonnet 4.6** (Opus 4.7 is used instead only when the author model detection in A2a triggers the sub-agent path).

```
### Claude Review (model: claude-sonnet-4-6) — Ad-hoc review: {target}

**Reviewer:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
**Target:** {e.g. "PR #42", "current branch `foo` vs `main` (abc123..def456)", "main..HEAD", "working tree"}
**Verdict:** APPROVE | REQUEST CHANGES | NEEDS DISCUSSION

**Summary**
1-2 sentences on overall quality.

**Stated-intent compliance** *(only if the user described intended behavior; otherwise omit)*
Does the diff do what the user said it should? List gaps or overreach.

**Boundary Integrity** *(only if registries/contracts exist; otherwise omit)*
Registry gaps, orphan producers/consumers, undocumented additions. If none: ✓ All boundaries documented.

**Security**
List concerns. If none: ✓ No issues found.

**Code Quality**
Specific line-level concerns. Reference file:line where relevant.

**Recommended action**
What to fix before this is ready (or confirm it's ready).
```

`{target}` must be a stable, human-readable descriptor — `/codex-review` matches its comparison to a prior ad-hoc Claude review by this exact string.

### A5 — Next action

Ask the user what they'd like to do next: post this review to GitHub (only offer this if the target is a real PR), continue working from the recommendations, or something else?

> **Note:** `/codex-review` should be run as a separate skill if it hasn't been yet — it provides an independent second-model pass and is **not** a function of `/review-pr`. Mention this to the user if they haven't already run it.

**Do not** log to Obsidian or update `docs/backlog.json` in ad-hoc mode — stop here.

---

# Task mode

The rest of this file applies only when the argument is `task <N>` — the `task` keyword followed by a backlog task number. GitHub assigns PR numbers sequentially across the whole repo (PR #7 might be Task #5), so this path avoids ambiguity by requiring the explicit `task` prefix. It looks up the actual PR via the task's `pr_url` field in `docs/backlog.json`.

## OBSIDIAN ACCESS PROTOCOL

When you need to read or write Obsidian content (list vault, list folder, get file, append to file), try these in order. Stop at the first one that works.

- **Vault root:** `G:\My Drive\Aesop Academy\Obsidian\`
- **REST API:** `http://127.0.0.1:27123`, auth via header `Authorization: Bearer ${OBSIDIAN_API_KEY}` (env var set globally)
- **MCP server:** `mcp__mcp-obsidian__*` tools

### Fallback order

**1. Filesystem (most reliable — no running services required)**
- List vault root: `Glob "G:\My Drive\Aesop Academy\Obsidian\*"`
- List folder: `Glob "G:\My Drive\Aesop Academy\Obsidian\{folder}\*"`
- Get file: `Read "G:\My Drive\Aesop Academy\Obsidian\{folder}\{file}.md"`
- Write file: `Write "G:\My Drive\Aesop Academy\Obsidian\{folder}\{file}.md"` or `Edit`

**2. Local REST API (fallback when filesystem is unavailable)**
The Obsidian Local REST API plugin runs on `127.0.0.1:27123`. URL-encode folder/file names with spaces.
- List vault root: `curl -s -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" http://127.0.0.1:27123/vault/`
- List folder: `curl -s -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" "http://127.0.0.1:27123/vault/{folder}/"`
- Get file: `curl -s -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" "http://127.0.0.1:27123/vault/{folder}/{file}.md"`
- Write file: `curl -s -X PUT -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" -H "Content-Type: text/markdown" --data-binary @local-file "http://127.0.0.1:27123/vault/{folder}/{file}.md"`
- Append to file: `curl -s -X POST -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" -H "Content-Type: text/markdown" --data-binary "...content..." "http://127.0.0.1:27123/vault/{folder}/{file}.md"`

**3. MCP server (final fallback)**
- List vault: `mcp__mcp-obsidian__obsidian_list_files_in_vault`
- List folder: `mcp__mcp-obsidian__obsidian_list_files_in_dir`
- Get file: `mcp__mcp-obsidian__obsidian_get_file_contents`
- Append: `mcp__mcp-obsidian__obsidian_append_content`

If all three fail, abort with: "Cannot access Obsidian vault — checked filesystem (`G:\My Drive\Aesop Academy\Obsidian\`), REST API (`http://127.0.0.1:27123`), and MCP server. None responded. Investigate before proceeding."

---

## OBSIDIAN FOLDER CONVENTION

Each project gets two sibling folders at the vault root. This is hard-coded — every project follows it.

- **`{Name}_Build/`** — design and planning docs. Canonical file names:
  - `Soul.md`
  - `Architecture.md`
  - `Feature Contracts.md`
  - `Build Plan.md`
- **`{Name}_Sessions/`** — one narrative file per session:
  - `YYYY-MM-DD — {Session Title}.md` (e.g., `2026-05-17 — Task 12 Review Session.md`)

`{Name}` mirrors the project's repo name. **Folder lookups are case-insensitive** — vault history has both `CareGuide_Build/` and `careguide_Sessions/`. When creating new folders for a new project, use the project's canonical capitalisation.

---

## Scope and limits

- **One task per session (review side).** Reviews exactly Task #{N} (the argument). Even if other tasks are `in-review`, ignore them. The user invokes `/review-pr` once per task.
  - **Exception: emergency fixes.** An emergency-fix task gets its own `/review-pr` invocation in a fresh review session, same as any other task.
- **Cannot promote to `main`.** Reviews are advisory output, not merge decisions. Never offers to merge anything, never asks about promotion.
- **No rollups.** This is single-PR review. Multi-task rollup review happens implicitly inside `/promote-stage`'s and `/promote-to-prod`'s rollup audit, not here.

> **Reviewer independence is mandatory.** Authors defend their own choices and miss what a fresh reader would catch. This skill runs directly in the current session context — full conversation history from the build session is helpful for understanding task requirements. What matters for independence is reviewing against the task spec, contracts, and diff — NOT against the project's mission, soul, architecture docs, or prior session debates. After this skill, run `/codex-review {N}` in the same session for an automatic Claude-vs-Codex comparison.

## Objective-Centric Criteria Contract

`/review-pr` reviews the PR against the task's `objective` before general code quality. The objective is the reviewer-facing definition of done.

Review requirements:
- Load `objective.statement`, `objective.successCriteria`, `objective.nonGoals`, `objective.proofMap`, and `objective.stopConditions` from `docs/backlog.json`.
- If `objective` is missing, flag it in the review as a proof/planning gap.
- For each success criterion, decide whether the PR satisfies it, partially satisfies it, or fails it.
- Check whether any diff implements a non-goal or adjacent work not mapped to success criteria.
- Include objective compliance in the verdict. Missing or failed objective criteria should usually be REQUEST CHANGES unless the gap is explicitly waived and low risk.

## Step 0 — Disregard author-narrative docs (but keep conversation history)

If the session-startup routine loaded `Project Overview.md`, `Soul.md`, `Architecture.md`, `Build Plan.md`, or any `{Project}_Sessions/` notes into your context, **disregard them entirely for this review**. They are author-side framing and create bias toward "does this fit the vision" instead of "does this match the spec."

**However:** Full conversation history from prior build or agent sessions in this terminal IS helpful. Use it to understand task context, prior design decisions, and what the implementer was thinking. Reviewer independence comes from grounding your verdict in spec/contracts/diff, not from artificial session isolation.

Your review must be grounded in only:
- The task `description`, `plan`, and `objective` (from `docs/backlog.json`, loaded in Step 1)
- The boundary contracts (`docs/registries/*.md` and `docs/contracts/*.md`, loaded in Step 4)
- The PR diff itself (loaded in Step 3)

If those three sources don't say something, do not infer it from project narrative. Flag the gap in your review instead.

Resolving the Obsidian project name (for writing your review *output* in Step 7) is fine — that's a path lookup, not a content read.

## Step 1 — Resolve task to PR

Parse the task number from the `task <N>` argument (strip the `task` prefix). Read `docs/backlog.json` and find the task by `number`. If not found, stop and tell the user: "Task #{N} not in backlog. Check the task number."

Read the task's `pr_url`. If `null`, stop and tell the user: "Task #{N} has no PR yet — its status is `{status}`. Did you mean to run `/finish-build` first, or are you reviewing a different task?"

### Step 1a — State guard (lifecycle order check)

Check the task's `status`:

| Current status | Allowed action |
|---|---|
| `build-finished` | ✅ Proceed — standard review status (awaiting Claude review before Codex). |
| `pr-reviewed` | ⚠️ Soft warn: "Task #{N} is already pr-reviewed (Codex review done). This is a supplementary review. Proceed? [yes/no]" |
| `staged` / `production` / `complete` | ⚠️ Soft warn: "Task #{N} is already {status}. Reviewing after-the-fact is fine but the review can't gate the merge anymore. Proceed? [yes/no]" |
| `planned` / `backlog` / `build-started` | ❌ **Refuse.** "Task #{N} doesn't have a finished build to review (status: {status}). Run `/finish-build` first." Stop. |

Do NOT skip this check.

Extract the PR number from `pr_url` — e.g., `https://github.com/AesopScott/careguide/pull/3` → `3`. Hold both the **task number** (input) and the **PR number** (derived) in context — you'll use both in the output header.

Note the task's `branch` field for the self-check below.

## Step 2 — Self-check for context independence

Check whether this session is the one that wrote the code under review:

1. `git branch --show-current` — capture the current branch.
2. Compare to the task's `branch` field from Step 1.

**If the current branch matches the task's `branch`**, this session likely produced the code under review.

Warn the user clearly:

> ⚠️ This session appears to be the one that wrote the code for Task #{task-N} (PR #{pr-N}). Reviewing your own work is a known anti-pattern — you'll defend choices a fresh reviewer would question.
>
> Recommended: start a new session, ideally with Codex or another model family, and run `/review-pr {task-N}` there.

Ask whether to **abort** (recommended) or **proceed anyway**. Default to abort. Only continue on explicit override.

## Step 3 — Load the PR

Use GitHub MCP tools or `gh pr view {pr-N}`:
- PR title, description, diff

Sanity check: the PR title should contain `Task #{task-N}`. If it doesn't, warn the user that the `pr_url` in the backlog might be stale or point to the wrong PR.

## Step 3a — Detect author model

Scan the PR branch's commit history for `Co-Authored-By: Claude` lines to determine what model wrote the code. Get the base commit with `git merge-base HEAD origin/main` (or use the PR's base branch from `gh pr view`), then:

```
git log {base}..HEAD --format="%B"
```

- If the commits include `Co-Authored-By: Claude Sonnet` (any version), the code was written by Sonnet. Since this reviewer is also Sonnet 4.6 (see Step 6), same-model review is the anti-pattern we are trying to avoid. Spawn an **Opus 4.8 sub-agent** via the Agent tool with `model: "opus"` to perform steps 4–7, passing it:
  - All task details from Step 1 (description, plan, objective, pr_url, branch, status, task number, PR number)
  - The full PR diff from Step 3
  - Instructions to perform steps 4–7 (load contracts, verify proof trail, analyze, output review, log to Obsidian) and output the review in the standard format with `claude-opus-4-8` in the header

  Relay the sub-agent's output verbatim. Then continue to Step 8 yourself (next-action prompt).

- If no Sonnet attribution is found (Opus, Haiku, unknown, or no Co-Authored-By at all), proceed to Step 4 as normal using Sonnet 4.6.

> **Note:** If the commit range can't be determined, skip this detection step and proceed with Sonnet 4.6.

## Step 4 — Load the boundary contracts

Read in full:
- `docs/registries/collections.md`
- `docs/registries/endpoints.md`
- `docs/registries/claims.md`
- Any `docs/contracts/*.md` relevant to the change

(Task spec is already in context from Step 1.)

## Step 4a — Verify proof trail integrity

Before analyzing the code itself, verify that the task has the required proof evidence from the build session. Load the task's `plan` field from `docs/backlog.json` (from Step 1) and check:

**Proof units**
- Does the plan contain `proof_units` array (from `/plan-task`)? If empty or missing, soft-flag: "Plan lacks proof units — planning may have skipped TDD definition."

**Objective criteria**
- Does the task contain an `objective` object?
- Does every `objective.successCriteria[]` item map to proof evidence through `objective.proofMap[]`?
- Does the diff satisfy every success criterion?
- Did the diff avoid `objective.nonGoals[]`?
- If any criterion is missing, mark it as a proof/objective gap.

**Build evidence**
- For each proof unit in the plan, scan the PR diff for:
  - A failing test before implementation (ideally in a separate commit marked "RED" or "failing")
  - A passing test after implementation (marked "GREEN" or "passing")
  - If automated proof was deemed impossible, is there a waiver documented in the plan with a manual verification path?
- If any unit lacks entry or exit evidence: flag "Missing proof evidence for unit: {unit name}"

**Registry audit evidence**
- Did `/cross-boundary-audit` run on this branch? Check:
  - Are any `docs/registries/*.md` files touched in the commit history between the task's base and HEAD? Run `git log {base}..HEAD -- docs/registries/ --oneline` from the task branch.
  - If no registry commits AND the diff introduces new collections/endpoints/claims: hard-flag "Registry audit appears stale — new identifiers introduced but no registry commits found."
  - If registry commits exist, load `docs/registries/` files and verify they contain entries for all new names in the diff.

**Proof trail summary**
Build a checklist for the output:
```
## Proof Trail Integrity
- [ ] Objective criteria defined
- [ ] Every success criterion mapped to proof
- [ ] Diff satisfies objective criteria
- [ ] No non-goal drift
- [ ] Proof units defined in plan
- [ ] Failing test(s) present (or waiver documented)
- [ ] Passing test(s) present (or waiver documented)
- [ ] Registry audit completed
- [ ] All new identifiers documented in registries
```

Mark each item ✓, ⚠ (soft warning), or ✗ (hard flag).

**Failure mode:** If proof trail has hard-flags (stale registries, missing core evidence) and the code quality review finds issues, let the Verdict reflect both — "REQUEST CHANGES: proof missing + code issues." If proof is missing but code is otherwise clean, "NEEDS DISCUSSION: proof trail incomplete, but implementation appears sound."

## Step 5 — Analyze

**Spec compliance**
- Does the implementation match the task `description` and `plan`?
- Anything missing? Anything out of scope?

**Boundary integrity**
- Any new Firestore collections? Are they in the collections registry with producers, consumers, rules, and indexes documented?
- Any new API endpoints in the endpoints registry with callers, auth, and shape documented?
- Any new or modified custom claims documented?
- Any new orphan producers or consumers introduced?

**Security**
- Firestore rules: does every new collection have a rule? Are access patterns correct?
- API auth: are new endpoints protected with the right middleware?
- Any user-controlled input reaching Firestore or AI services without validation?

**Code quality**
- Unnecessary comments, over-abstracted patterns, half-finished implementations?
- Auth token refresh handled correctly on frontend API calls?
- Error states handled at boundaries (user input, external APIs), not over-handled internally?

## Step 6 — Output the review

This review runs as **Claude Sonnet 4.6** unless the Opus override applied in Step 3a (in which case the Opus 4.8 sub-agent produced this output with `claude-opus-4-8` in the header). Use the appropriate model identifier.

```
### Claude Review (model: claude-sonnet-4-6) — Task #{task-N} (PR #{pr-N}) — {task title}

**Reviewer:** Claude Sonnet 4.6 (`claude-sonnet-4-6`) running in {fresh session | author session — override noted}
**Verdict:** APPROVE | REQUEST CHANGES | NEEDS DISCUSSION

> **Note on review-blocked status:** When REQUEST CHANGES verdict is reached here, that finding should be reflected when `/codex-review` runs next. The Codex review (which includes proof-trail verification) will determine whether the final verdict flips the status to `review-blocked`. This Claude review documents the findings; the next `/codex-review` determines the blocking decision.

**Reviewer context:** Note whether this review ran in a fresh session with a different model than the build, or whether the author-context warning was overridden.

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

**Summary**
1-2 sentences on overall quality and spec compliance.

**Proof Trail Integrity**
Include the checklist from Step 4a with final status. List any hard-flags or gaps.

**Spec Compliance**
List gaps or overreach. If none: ✓ Fully compliant.

**Objective Compliance**
List every success criterion and mark satisfied / partial / missing. List any non-goal drift. If none: ✓ Objective satisfied.

**Boundary Integrity**
List registry gaps, orphan producers/consumers, undocumented additions. If none: ✓ All boundaries documented.

**Security**
List concerns. If none: ✓ No issues found.

**Code Quality**
Specific line-level concerns. Reference file:line where relevant.

**Recommended action**
What the build session should do before this merges (or confirm it's ready). Include proof-trail remediation if needed.
```

The header explicitly lists both `Task #{task-N}` and `PR #{pr-N}` so a follow-up `/codex-review {task-N}` in this same session can find the prior review by task number and produce a side-by-side comparison.

## Step 7 — Log Claude Review to Obsidian

After outputting the review, append it to the task's Obsidian tracker so the full lifecycle is browsable in one place.

1. Resolve the Obsidian project name via CWD basename fuzzy-match against `*_Build/` folders using the **OBSIDIAN ACCESS PROTOCOL**. Call it `{ProjectObsidian}`. If no match, skip Obsidian logging.

2. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{task-N}-{slug}.md`. Extract `{slug}` from the task's `branch` field (strip `task/{N}-` prefix).

3. **Ensure file exists with header.** Try to get the file using the **OBSIDIAN ACCESS PROTOCOL**. If it doesn't exist, append the initial header using the **OBSIDIAN ACCESS PROTOCOL** (defensive — should usually exist by now):

   ```
   # Task #{task-N} — {title}

   **Category:** {category}   **Priority:** {priority}   **Dependencies:** {deps or "none"}
   **Branch:** {branch}   **PR:** {pr_url}   **Status (initial):** build-finished

   ## Description

   {description}
   ```

4. **Append the Claude Review section** using the **OBSIDIAN ACCESS PROTOCOL** — the full review output you just produced in Step 6, prefixed with a separator and timestamp:

   ```
   ---

   ## Claude Review — {ISO 8601 UTC timestamp} (by /review-pr)

   {full review markdown from Step 6, including the Reviewer line and all section findings}
   ```

5. Tell the user: "Review logged to `{ProjectObsidian}_Build/Tasks/Task-{task-N}-{slug}.md`."

## Step 8 — Next action

Ask the user what they'd like to do next: post this review to GitHub, continue working from the recommendations, or take a different action?

> **Note:** If `/codex-review` has not been run on this task yet, it should be run as a separate skill — it provides an independent Codex second-model pass and is **not** a function of `/review-pr`.


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /review-pr complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
