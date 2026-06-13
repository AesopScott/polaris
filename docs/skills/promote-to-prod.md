---
name: promote-to-prod
description: End-to-end production promotion. There is no `origin/prod` branch: "promote to prod" means get reviewed work onto `origin/main`, verify the production deploy that runs from `main`, then mark tasks `production`. Uses CareGuide stage only for Parental CareGuide/CareGuide; otherwise promotes task PRs to main directly.
---

# /promote-to-prod

## Backlog Write Isolation Protocol (Task #60)

Any step in this skill that mutates `docs/backlog.json` or `docs/backlog-archive.json` must use this protocol. Do not edit the shared primary working tree for backlog state, even if it is currently on `main`.

1. Resolve the project source repo and fetch fresh main:
   `git -C "<repo>" fetch origin main`
2. Create a disposable backlog worktree from `origin/main`:
   `git -C "<repo>" worktree add "<repo>/worktrees/backlog-<task-or-purpose>-<timestamp>" -b "chore/backlog-<task-or-purpose>-<timestamp>" origin/main`
3. In that disposable worktree, read and write JSON with Node `fs` using explicit `utf8`. Never use the Edit tool or PowerShell JSON cmdlets for these files.
4. Stage only backlog files touched by the mutation, then commit with a conventional `chore(backlog): ...` message.
5. Before pushing, run `git pull --rebase origin main` from the disposable worktree. If the rebase conflicts, resolve only the backlog JSON conflict by re-reading the rebased file and reapplying the intended task-number mutation; do not accept unrelated hunks blindly.
6. Push with `git push origin HEAD:main`. If rejected, repeat fetch/rebase/reapply/push. Never force-push `main`.
7. Remove the disposable worktree after a successful push: `git -C "<repo>" worktree remove "<path>"`, then `git -C "<repo>" worktree prune`.

Read-only task lookup may use `git show origin/main:docs/backlog.json` after fetch, or the disposable worktree if a write may follow. The final report must name the backlog commit SHA pushed to `main`.


You are running the production promotion sequence. There is no `origin/prod` branch. This skill identifies non-production tasks, audits them, gets reviewed work onto `origin/main`, waits for the production deploy workflow from `main` to confirm, then marks the included tasks `production` and archives them. If anything fails, it stops and reports — it never marks tasks as production on a broken deploy.

## Directive Polling (multi-session only)

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives before proceeding:

1. Read `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`
2. Look for an entry where `target.sessionId` matches this session's ID AND `status === "pending"`
3. If found:
   - Immediately set `status: "acknowledged"` and write `acknowledgedAt: <ISO timestamp>`
   - The directive's `instruction` field contains the full prompt — execute it as if it were a user message
   - After completing the directive, set `status: "completed"`, write `completedAt` and a brief `result`
4. If not found or single-session context: proceed normally with "Merge Model" below

> **Note:** If `session-directives.json` doesn't exist or this session has no pending directives, that's normal — continue to "Merge Model".

## Merge Model

**In multi-session context:** Request the orchestrator to merge via `branch-requests.json`. Do NOT merge directly.

**In single-session context:** Merge to `main` directly and push.

---

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

- **Rollup-scoped, not single-task.** This skill processes EVERY non-production task found on either main or stage branches. Single-task invocation is not possible — the rollup is the unit of promotion. Tasks in any non-production status are accepted.
- **This is the ONLY skill in the workflow that can mark tasks `production`.** There is no `origin/prod` branch and no prod-branch merge. Production promotion means the reviewed code is on `origin/main`, the main deploy succeeds, and backlog/archive state is closed.
- **Flips backlog statuses to `production` inside this workflow** (Step 9) only if Step 8's prod deploy verification succeeds. Failure leaves the backlog untouched.
- **Two production paths:** CareGuide may promote stage → main when `stage` is ahead of main. Every other project promotes task PRs to main directly, even if a `stage` branch exists. In both paths, production is verified from `main`.

> **Relationship to `/promote-stage`:** `/promote-stage` opens a CareGuide-only stage→main PR and stops. `/promote-to-prod` is the normal final gate and owns the production status flip after deploy verification succeeds.

## Objective-Centric Criteria Contract

`/promote-to-prod` is the strictest objective gate because it can auto-merge and ship. It must verify objective completion for every task before production promotion.

For every task in the rollup:
- Load `objective` from `docs/backlog.json`.
- Mark objective status as complete, partial, missing, or waived.
- Verify every `successCriteria[]` item has mapped proof evidence or an explicit waiver.
- Verify no `nonGoals[]` item appears in the production diff.
- Treat missing objective criteria, triggered stop conditions, or non-goal drift as hard-fails for high-risk tasks and strong soft-flags for standard-risk tasks.

## Worktree isolation check (required before any other step)

Before any git or file operations, verify the session is running from a stable working directory. `/promote-to-prod` auto-merges PRs, watches production deploys, and commits backlog archive updates — operations that must not run from an ephemeral temp directory that could vanish mid-execution.

```bash
git branch --show-current   # prints branch name, or empty if detached HEAD
git worktree list           # lists all worktrees: path, HEAD commit, branch
```

Also note the current working directory (`$PWD` in PowerShell, `pwd` in bash).

**Interpret the result and act:**

| Situation | Action |
|---|---|
| Branch is `main` or `stage`, CWD is the project source tree (`C:\Users\scott\Code\{ProjectName}`) | ✅ **Proceed** — stable location for production promotion operations. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir (path contains `AppData\Local\Temp\polaris-wt`), AND `git worktree list` shows a `[main]` entry in the project source tree | ✅ **Proceed** — the primary `[main]` worktree exists in the source tree. Route all `git checkout main`, backlog.json edits, and archive commits to the primary path, not the temp CWD. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir, AND no `[main]` primary worktree exists in the source tree | ⚠️ **Create an isolated worktree** before continuing (see below). |

**Creating an isolated worktree when required:**

1. Confirm the project source path exists: `ls "C:\Users\scott\Code\{ProjectName}"`.
2. Create a worktree tracking `origin/main`:
   ```bash
   STAMP=$(date +%Y%m%d-%H%M%S)
   BRANCH="wt/promote-${STAMP}"
   DEST="C:/Users/scott/Code/{ProjectName}/worktrees/${STAMP}"
   git -C "C:/Users/scott/Code/{ProjectName}" worktree add "$DEST" -b "$BRANCH" origin/main
   ```
3. Announce: "Session was in a Polaris temp directory without a primary worktree. Created isolated worktree at `{path}` on `{branch}`. All git and file operations will use that location."
4. Use `$DEST` as the working directory for all remaining steps in this skill, including the Step 9 backlog closeout branch creation.

If creation fails, stop immediately — do not run production promotion from an unstable temp directory. A failed mid-way promotion (PR merged but backlog not updated) is harder to recover from than a pre-flight stop.

---

## Step 1 — Pre-flight: confirm reviews are done and findings remediated

**Independent review is the primary safety net before code reaches main/production. This skill auto-merges, so the gate matters MORE than in `/promote-stage`.** This gate **verifies reviews actually ran by looking for evidence** in Obsidian and on each task's PR. It falls back to a trust question only when evidence is missing.

### Step 1a — Identify the rollup (preview Step 3)

Use `gh pr list --state merged --base stage --limit 50 --json number,title,mergedAt` filtered to PRs merged AFTER the most recent merge into main. Parse `Task #{N}` from each PR title. Hold the list `[N1, N2, ...]` and the corresponding pr-N for each task (from `docs/backlog.json` `pr_url`).

### Step 1b — Check review evidence for each task

Resolve `{ProjectObsidian}` via CWD basename fuzzy-match against `*_Build/` folders using the **OBSIDIAN ACCESS PROTOCOL**. If no match, mark Obsidian checks as "skipped (no project match)" and proceed with PR-comment checks only.

For each task `#{N}`:

1. **Obsidian evidence.** Try to get the file `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md` (slug from task branch) using the **OBSIDIAN ACCESS PROTOCOL**. If found, scan content for `## Claude Review` and `## Codex Review` headers. Each header found = one piece of evidence.

2. **PR-comment evidence.** Run `gh pr view {pr-N} --json comments`. Scan each comment body for `Task #{N}` plus `Claude Review` (= Claude PR evidence) and `Task #{N}` plus `Codex Review` (= Codex PR evidence).

3. Per task, mark `claude_evidence` and `codex_evidence` as `obsidian | pr | both | none`.

### Step 1b-proof — Check proof-trail status for each task

For each task `#{N}`, assess the proof trail by:

1. **Proof units present.** Load the task's `plan` from `docs/backlog.json`. Does it contain a `proof_units` array? If empty or missing, mark as ⚠️ (no proof units defined).

2. **Build evidence.** Scan the task's PR diff for:
   - Failing test(s) / proof checks (commits marked "RED" or "failing", or explicit proof failure evidence)
   - Passing test(s) / proof checks (commits marked "GREEN" or "passing", or proof success evidence)
   - If no automated tests are present, was a waiver documented in the plan with a manual verification path?
   - Mark as ✓ (complete), ⚠️ (partial / missing some units), or ✗ (missing entirely)

3. **Registry audit.** Did `/cross-boundary-audit` run on the task branch?
   - Check if `docs/registries/*.md` files were touched between the task's base and HEAD: `git log {base}..{pr-head} -- docs/registries/ --oneline`
   - If no registry commits AND the diff introduces new collections/endpoints/claims: mark as ✗ (audit appears stale)
   - Otherwise: mark as ✓

4. **Risk assessment by task category.** Read the task's `category` from `docs/backlog.json`:
   - **High-risk categories** (security, auth, payments, data-migration): missing proof is a hard-fail unless override is provided
   - **Standard categories** (feature, fix, refactor, test, docs): missing proof is a soft-flag; allow override with reason

Per task, record: `proof_units | build_evidence | registry_audit | risk_category`.

### Step 1b-objective — Check objective completion for each task

For each task `#{N}`, assess the objective contract:

1. **Objective present.** Load `objective` from `docs/backlog.json`. If missing, mark as `missing`.
2. **Criteria mapped.** Confirm every `objective.successCriteria[]` item appears in `objective.proofMap[]`.
3. **Evidence complete.** For each success criterion, confirm the mapped proof unit has passing evidence or an explicit waiver.
4. **Non-goal drift.** Scan the task PR diff and production rollup diff for work listed in `objective.nonGoals[]` or adjacent work not tied to success criteria.
5. **Stop conditions.** If any `objective.stopConditions[]` item is triggered, hard-fail unless the user explicitly chooses a manual-risk path outside auto-ship.

Per task, record: `objective_present | criteria_mapped | objective_evidence | non_goal_drift | stop_conditions`.

### Step 1c — Decide

Build a summary table combining review evidence, objective status, and proof-trail status:

```
| Task | Title | Claude review | Codex review | Objective | Proof Units | Build Ev. | Registry | Risk |
|---|---|---|---|---|---|---|---|---|
| #5 | API Auth | ✓ (Obsidian) | ✓ (PR) | ✓ | ✓ | ✓ | ✓ | High |
| #6 | Data Schema | ✓ (Obsidian) | ✗ MISSING | ⚠️ Partial | ⚠️ Partial | ⚠️ | ✓ | High |
```

**Decision logic (stricter for auto-ship):**

1. **Check for hard-fails:**
   - Any high-risk task (security, auth, payments, migration) missing ANY of: Claude review, Codex review, objective completion, or complete build evidence (proof units + passing tests + registry audit)?
   - Any standard-risk task missing BOTH Claude AND Codex reviews, OR with missing objective criteria, missing proof units, or no waiver?
   - If yes → **HARD-FAIL.** Stop with: "Cannot auto-ship with missing critical reviews or proof. Remediate or use `/promote-stage` for manual human merge decision."

2. **Check for soft-flags (standard-risk only):**
   - Any standard-risk task missing one review type (Claude or Codex, not both)?
   - If yes → **SOFT-FLAG.** Ask:

> Proof trail status (see table):
> - {count} task(s) with complete proof and both reviews
> - {count} task(s) with missing reviews or proof (marked ⚠️)
>
> Proceed to auto-ship, or use `/promote-stage` for manual review?

Options:
- **Use /promote-stage instead** → stop. "Use `/promote-stage` to open a PR and have human decide the merge, or remediate and re-invoke /promote-to-prod."
- **Proceed (acceptable risk)** → proceed to Step 2.
- **Override** → proceed but capture risk details and reason for PR body stamp.

3. **If all tasks pass hard-fail check** → proceed to Step 2 automatically.

### Override handling

If Override was selected (high-risk or soft-flag), capture the user's reason briefly. In Step 5 (PR body), prepend a **⚠️ OVERRIDE SUMMARY** block listing:
- Which task(s) were overridden
- Gap details (missing review type, proof unit, registry audit)
- Reason provided by user
- The human reviewing the auto-merge outcome accepts this risk.

Override for high-risk tasks requires explicit approval during execution; override for soft-flags is logged prominently.

## Step 2 — Sync and detect promotion path

```bash
git fetch origin main --prune
git fetch origin stage --prune 2>/dev/null || true
```

### Step 2a — Detect promotion path (CareGuide stage vs. direct main)

Determine whether the current project is Parental CareGuide/CareGuide from CWD basename, Obsidian project folder, or project config. Set `IS_CAREGUIDE=true` only when that identity is clear; otherwise set `IS_CAREGUIDE=false`. Then check if `stage` exists on origin and is ahead of main:

```bash
if [ "$IS_CAREGUIDE" != "true" ]; then
  STAGE_AHEAD=false
elif git rev-parse origin/stage >/dev/null 2>&1; then
  git log origin/main..origin/stage --oneline && STAGE_AHEAD=true || STAGE_AHEAD=false
else
  STAGE_AHEAD=false
fi
```

**Path A (CareGuide only: stage exists and is ahead):** Promote stage → main, then verify production deploy from main
- Log the stage-ahead commits for context:
  ```bash
  git log origin/main..origin/stage --oneline
  git diff origin/main...origin/stage --stat
  ```
- Hold the commit list in context.
- Proceed to Step 3 using tasks from both main and stage.

**Path B (all non-CareGuide projects, or CareGuide with no stage work):** Promote reviewed task PRs to main, then verify production deploy from main
- If this is not Parental CareGuide/CareGuide, force Path B even if `origin/stage` exists or is ahead. Log: "This project has no real testable stage and no prod branch. Promoting reviewed work to origin/main, then verifying production deploy from main."
- If `stage` doesn't exist, log: "Stage branch does not exist. Promoting reviewed work to origin/main."
- If `stage` exists but is not ahead, log: "Stage is not ahead of main. Promoting reviewed work to origin/main."
- Identify candidate task PRs targeting `main` and merge the reviewed PRs to `main`.
- Proceed to Step 3 using tasks from main-targeted PRs.

**Choose path and set context variable:** `PROMOTION_PATH="stage-to-main"` (Path A) or `PROMOTION_PATH="direct-to-main"` (Path B). This variable is used in Step 5 to construct the correct PR/merge plan.

## Step 3 — Identify the tasks being promoted

Build a rollup from tasks based on the promotion path detected in Step 2a:

**Path A (stage → main):** Find tasks on both stage and main (not yet marked production):

1. Find all task PRs merged to stage: `gh pr list --state merged --base stage --limit 50 --json number,title,mergedAt` — filter to PRs merged AFTER the most recent merge into main.

2. Find all task PRs merged to main: `gh pr list --state merged --base main --limit 50 --json number,title,mergedAt` — filter to PRs merged AFTER the most recent production closeout (to avoid re-promoting already-complete tasks).

For each task PR from both branches, extract the task number from the title (`Task #{N}: ...`). Read `docs/backlog.json` and pull each task's `title`, `description`, `status`, and `pr_url`. Deduplicate if a task appears in both lists (prefer the main branch version as it's further along).

**Path B (direct to main):** Find reviewed task PRs targeting main (not yet marked production):

1. Find all open task PRs targeting main: `gh pr list --state open --base main --limit 50 --json number,title,headRefName,url` — include reviewed, non-production tasks ready to ship.
2. Also find task PRs already merged to main but not yet marked `production`: `gh pr list --state merged --base main --limit 50 --json number,title,mergedAt,url` — filter to PRs merged AFTER the most recent production/archive closeout.

For each task PR, extract the task number from the title (`Task #{N}: ...`). Read `docs/backlog.json` and pull each task's `title`, `description`, `status`, and `pr_url`.

**Both paths:** Hold the resulting list of task numbers `[N1, N2, ...]` with their branch locations — you will need it again in Step 9.

### Step 3a — Per-task status check + branch remediation

For each task in the rollup list:

1. **Check active backlog.json first:**
   - If task found and status is `production`: **Drop from this rollup** and log "Task #{N} is already production; skipping."
   - If task found and status is `on-hold`: **REMEDIATE** — task has commits on a branch but is explicitly on-hold. Create a branch `task/{N}-hold` from the task's commits, then drop from rollup. Log: "Task #{N} is on-hold; moved commits to task/{N}-hold."
     - Identify which branch holds the commits (stage or main)
     - Extract task commits: `git log origin/main..{branch} --oneline | grep "task.*#{N}\|Task.*#{N}" | head -5`
     - Create hold branch: `git fetch origin main && git checkout -b task/{N}-hold origin/main && git cherry-pick {commit-shas} && git push -u origin task/{N}-hold`
     - Drop task from rollup
   - If task found with any other status (in-review, build-finished, etc.): **include in the promotion**

2. **If task not found in backlog.json, check backlog-archive.json:**
   ```bash
   grep -q "\"number\": {N}" docs/backlog-archive.json
   ```
   - If found in archive with `promoted_via_pr` field: **REMEDIATE** — task is already promoted but commits linger on the branch. Remove commits:
     - Identify which branch (stage or main) has the commits: `git log origin/main..{branch} --oneline | grep "task.*#{N}\|Task.*#{N}"`
     - For stage: `git fetch origin stage && git checkout stage && git rebase --onto origin/main $(git merge-base origin/main origin/stage) && git push origin stage --force-with-lease`
     - For main: this should not happen (main should never have commits after archive), but if it does, stop and ask user to investigate
     - Log: "Task #{N} was already promoted to production; archived commits removed from the branch."
   - If found in archive but missing metadata or unclear status: log warning but drop from rollup
   - If not found in either file: **HARD-FAIL** — "Task #{N} found on branch but NOT in backlog.json or backlog-archive.json. STOP: This task is orphaned/stale. Investigate before promotion. Either add task to backlog.json if it's real work, or remove its commits from the branch, then re-invoke."

If the rollup list is empty after filtering out production, archived, and on-hold tasks, stop with: "No tasks to promote (all candidates are already production, archived, or on-hold)."

## Step 4 — Rollup cross-boundary audit

**Path A (stage → main):** Audit both the stage-to-main changes and the current main state for anything moving to production:

Read registries as they stand on `origin/main` (the target for the stage→main merge and the branch that production deploys from):
```bash
git show origin/main:docs/registries/collections.md
git show origin/main:docs/registries/endpoints.md
git show origin/main:docs/registries/claims.md
```

Combined diff:
- `git diff origin/main...origin/stage` — what's new on stage going into main
- Enumerate every new identifier on stage (collections, endpoints, claims, pages) that isn't on main
- For each: confirm ≥1 producer AND ≥1 consumer, documented in the appropriate registry on stage

Then check main itself (for tasks already on main):
- Enumerate every identifier on main that the rollup tasks touch
- Confirm each has matching registry entries and no orphans

**Path B (direct to main):** Audit the reviewed PR diffs before they land on main:

Read registries as they stand on `origin/main`:
```bash
git show origin/main:docs/registries/collections.md
git show origin/main:docs/registries/endpoints.md
git show origin/main:docs/registries/claims.md
```

For each main-targeted task PR in the rollup, inspect the PR diff against `origin/main`. Enumerate every identifier the rollup tasks touch and confirm each has matching registry entries and no orphans.

**Hard-fail criteria — stop before opening the PR (both paths):**
- Any orphan producer or consumer in the diff being promoted
- Any naming collision introduced
- Any registry annotation that has drifted from the actual code
- Any merge marker text (`<<<<<<<`, `=======`, `>>>>>>>`) committed

**Soft-flag — note in the PR body but don't block:**
- Convention drift across the rolled-up tasks
- Auth/rule patterns that diverge across the rolled-up tasks

Hold the audit summary in context.

## Step 5 — Open the promotion PR

**Path A (stage → main):**

`gh pr create`:
- **Base:** `main`
- **Head:** `stage`
- **Title:** `Promote: tasks #{n1}, #{n2}, ... → main (auto-ship)`
- **Body** — include each section in this order:
  - **If overridden in Step 1c:** ⚠️ **OVERRIDE SUMMARY** block (which tasks, gap details, user's reason)
  - One-line summary of what's being promoted.
  - **Tasks included** — for each: number, title, brief description, original task PR URL.
  - **Objective/proof status** — summary table from Step 1c showing Claude review, Codex review, objective completion, proof units, build evidence, registry audit, and risk category for each task. Note any gaps or override reasons.
  - **Rollup cross-boundary audit** — what new identifiers were introduced, zero hard-fails confirmation, any soft-flag notes.
  - **Stage verification** — ask the user for a short note: what was tested on stage and the result. Insert their answer here.
  - **Auto-merge enabled** — "This PR will be auto-merged by `/promote-to-prod` as soon as the required `deploy` check passes. Prod deploy runs from main on merge. Backlog tasks will be marked `production` only after the post-merge deploy run succeeds."

**Path B (direct to main):**

Use the existing reviewed task PRs targeting `main`; do not create a `main → prod` PR. For each task PR in the rollup, update or comment with each section below, then auto-merge the PR after checks pass:
  - **If overridden in Step 1c:** ⚠️ **OVERRIDE SUMMARY** block (which tasks, gap details, user's reason)
  - One-line summary of what's being promoted.
  - **Tasks included** — for each: number, title, brief description, original task PR URL.
  - **Objective/proof status** — summary table from Step 1c showing Claude review, Codex review, objective completion, proof units, build evidence, registry audit, and risk category for each task. Note any gaps or override reasons.
  - **Rollup cross-boundary audit** — confirmation of zero hard-fails, any soft-flag notes.
  - **Main verification** — ask the user for a short note: what was tested on main and the result. Insert their answer here.
  - **Auto-merge enabled** — "This task PR will be auto-merged by `/promote-to-prod` as soon as required checks pass. Production deploy runs from `main` after merge. Backlog tasks will be marked `production` only after the post-merge main deploy succeeds."

**Both paths:** Capture every PR number and URL being merged. Path A has one stage→main rollup PR. Path B may have one or more task PRs targeting main.

## Step 6 — Log Promotion to Obsidian (one section per task)

For each rolled-up task, append to its Obsidian tracker. Resolve the Obsidian project name via CWD basename fuzzy-match against `*_Build/` folders → `{ProjectObsidian}`. If no match, skip.

For each task `#{N}`:
- File: `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`
- If missing, create with standard header (defensive).
- Append:

  ```
  ---

  ## Promotion — {ISO 8601 UTC timestamp} (by /promote-to-prod)

  **Promotion PR:** {url}
  **Tasks rolled up:** #{n1}, #{n2}, ...

  **Rollup audit findings:**
  - Hard-fails: {0 — proceeded; or itemize}
  - Soft-flags: {list or "none"}

  **Stage verification note:** {user's note from Step 5}

  **Auto-merge:** enabled — backlog will flip to `production` only if prod deploy succeeds.
  ```

Tell the user: "Promotion logged to {count} task tracker(s)."

## Step 7 — Auto-merge the promotion PR(s) to main

```bash
gh pr merge {pr-number} --merge --auto
```

The `--auto` flag enqueues the merge to run once required status checks pass. Path A merges the CareGuide stage→main rollup PR. Path B merges each reviewed task PR into `main`. Never create or merge a PR whose base is `prod`; `origin/prod` does not exist.

If `gh pr merge --auto` fails with "auto-merge is not allowed for this repository":
- Fall back to polling. `gh pr checks {pr-number} --watch` blocks until checks finish.
- If `gh pr checks` exits 0 (all passing): `gh pr merge {pr-number} --merge`.
- If `gh pr checks` exits non-zero (something failed): stop. Report which check failed. Do NOT proceed to Step 8 or 9.

After issuing the merge command, poll:

```bash
gh pr view {pr-number} --json state,mergedAt,mergeCommit
```

Until `state == "MERGED"`. Cap at 10 minutes; if still not merged, stop and report (likely a check still pending or failing).

Capture each `mergeCommit.oid`; the newest merge SHA for the rollup is `{merge-sha}` and is needed for Step 8.

## Step 8 — Watch the prod deploy

**Path A (stage → main):** The merge to main triggers the deploy workflow on main. Find and watch that run.

```bash
gh run list --workflow="Deploy to Mocahost (CareGuide)" --branch=main --limit=5 \
  --json databaseId,headSha,status,conclusion,createdAt
```

**Path B (direct to main):** The merge to main triggers the production deploy workflow on main. Find and watch that run.

```bash
gh run list --workflow="{production deploy workflow name}" --branch=main --limit=5 \
  --json databaseId,headSha,status,conclusion,createdAt
```

**Both paths:** Find the run whose `headSha` matches `{merge-sha}`. If none yet (GitHub hasn't created it), retry every 5s up to 60s.

Once found, watch it:

```bash
gh run watch {run-id} --exit-status
```

`--exit-status` causes the command to exit non-zero if the run concludes anything other than `success`.

- **Run concludes `success`** → proceed to Step 9.
- **Run concludes `failure` / `cancelled` / `timed_out`** → stop. Report:
  - "Prod deploy failed for promotion PR #{pr-number}. Backlog tasks NOT marked production. Investigate the workflow run at {run-url} and re-run `/promote-to-prod` only after the underlying issue is fixed."
  - Do NOT proceed to Step 9.

If `gh run watch` itself hangs past 15 min, stop and tell the user to check the workflow manually.

## Step 9 — Mark rolled-up tasks production and close the backlog loop

Prod is healthy. Now flip backlog statuses and archive shipped tasks inside this `/promote-to-prod` run. This is not a separate human step.

**Path A (stage → main):** Create a disposable backlog closeout worktree from `origin/main` using the Backlog Write Isolation Protocol (the merge has already updated origin/main):

```bash
git fetch origin main --prune
git switch -c chore/mark-tasks-production-{pr-number} origin/main
```

**Path B (direct to main):** Create a disposable backlog closeout worktree from `origin/main` using the Backlog Write Isolation Protocol (the merge has already updated origin/main):

```bash
git fetch origin main --prune
git switch -c chore/mark-tasks-production-{pr-number} origin/main
```

**Both paths:** If the branch already exists locally (rare — leftover from an aborted prior run), delete it first with the user's confirmation, or pick a suffix.

Inside the disposable backlog worktree from the Backlog Write Isolation Protocol, update `docs/backlog.json` and `docs/backlog-archive.json` using `node -e` — never use the Edit tool on JSON files (Windows encoding rule). Substitute `[{N1}, {N2}]` with the actual task numbers, `{ProjectName}` with the project name, and `{pr-number}` with the promotion PR number:

```bash
node -e "
const fs = require('fs');
const now = new Date().toISOString();
const b = JSON.parse(fs.readFileSync('docs/backlog.json', 'utf8'));
const archivePath = 'docs/backlog-archive.json';
const archive = fs.existsSync(archivePath)
  ? JSON.parse(fs.readFileSync(archivePath, 'utf8'))
  : { tasks: [] };
const toPromote = [{N1}, {N2}];
const promoted = [];
for (const n of toPromote) {
  const idx = b.tasks.findIndex(t => t.number === n);
  if (idx === -1) { console.warn('Task #' + n + ' not found, skipping'); continue; }
  const t = b.tasks[idx];
  if (t.status === 'production') { console.log('Task #' + n + ' already production, skipping'); continue; }
  if (t.status !== 'cba-complete' && t.status !== 'staged') {
    console.warn('Task #' + n + ' was ' + t.status + ', expected cba-complete or staged — promoting anyway');
  }
  t.status = 'production';
  archive.tasks.push(Object.assign({}, t, {
    project_source: '{ProjectName}',
    promoted_via_pr: '{pr-number}',
    promoted_at: now
  }));
  b.tasks.splice(idx, 1);
  promoted.push(n);
}
fs.writeFileSync('docs/backlog.json', JSON.stringify(b, null, 2) + '\n', 'utf8');
fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2) + '\n', 'utf8');
console.log('Promoted to production and archived: #' + promoted.join(', #'));
"
```

If at least one task changed:

```bash
git add docs/backlog.json docs/backlog-archive.json
git commit -m "chore(backlog): promote #{N1}, #{N2} to production; archive shipped tasks (via #{pr-number})"
git push -u origin HEAD
```

**Path A (stage → main):** Create the backlog closeout PR to main:
```bash
gh pr create --base main --head chore/mark-tasks-production-{pr-number} \
  --title "chore(backlog): tasks #{N1}, #{N2} to production; archive" \
  --body "..."
```

**Path B (direct to main):** Create the backlog closeout PR to main:
```bash
gh pr create --base main --head chore/mark-tasks-production-{pr-number} \
  --title "chore(backlog): tasks #{N1}, #{N2} to production; archive" \
  --body "..."
```

PR body (both paths):

```
## Summary

Closes the backlog loop after [#{pr-number}]({pr-url}) merged to `main` and the production deploy from `main` succeeded.

Promoted tasks are moved from the active backlog to the archive with source attribution.

## Tasks promoted to production & archived

- #{N1} — {title}
- #{N2} — {title}
- ...

## Skipped (already production)

- #{Nx} — {title}  *(omit section if empty)*

## Test plan

- [ ] `docs/backlog.json` parses (valid JSON)
- [ ] `docs/backlog-archive.json` parses (valid JSON)
- [ ] Each promoted task is removed from backlog and appears in archive with `project_source`, `promoted_via_pr`, and `promoted_at` fields
- [ ] Each skipped task (already production) remains in neither file (was already archived in a prior promotion)
```

Capture the backlog closeout PR number and URL, then auto-merge it:

```bash
gh pr merge {closeout-pr-number} --merge --auto
```

If auto-merge is unavailable, poll required checks and merge when they pass. If checks fail, stop and report the closeout PR URL; the production deploy already succeeded, but the backlog/archive closeout did not complete and must be retried by re-running `/promote-to-prod` or merging the closeout PR.

After the closeout PR merges, verify the task numbers are no longer in `docs/backlog.json` and are present in `docs/backlog-archive.json` on the target branch.

If zero tasks changed (all already production): skip the commit/PR, note in the report.

## Step 9.5 — Delete merged task branches and worktrees

The rollup task PRs are now merged to `main`. Their branches and the per-session worktrees that hold them are done — delete them now so they don't accumulate. This is the only step that closes the worktree lifecycle; without it, every promoted `task/N-*` branch keeps a detached/named worktree alive in `%TEMP%\polaris-wt` forever (the server's TTL purge skips named-branch worktrees by design).

For each task `#{N}` in the Step 3 rollup whose PR was confirmed merged in Step 7:

1. Resolve the head branch: `gh pr view {pr-N} --json headRefName -q .headRefName` → `{branch}`.
2. Remove **every** worktree checked out on that branch (session temp or named), then prune. Order matters — `git branch -d` fails while a worktree holds the branch:

   ```powershell
   node -e "const cp=require('child_process');const b=process.argv[1];const raw=cp.execSync('git worktree list --porcelain',{encoding:'utf8'});for(const blk of raw.split('\n\n')){const p=(blk.match(/^worktree (.+)$/m)||[])[1];const br=(blk.match(/^branch refs\/heads\/(.+)$/m)||[])[1];if(br===b&&p){try{cp.execFileSync('git',['worktree','remove','--force',p],{stdio:'ignore'});console.log('removed worktree '+p);}catch(e){console.log('WARN '+p+': '+e.message);}}}cp.execSync('git worktree prune');" "{branch}"
   ```

3. Delete the remote branch (already merged, so safe): `git push origin --delete {branch}`.
4. Delete the local branch if present: `git branch -d {branch}` (it is merged into main; if `-d` refuses because the ref isn't recognized as merged, log a warning and leave it for manual review rather than forcing).

Any individual failure is a soft-warn — log it and continue with the next task. Record a one-line cleanup summary (`{count} branches + {count} worktrees removed`) for the final report.

## Step 10 — Log Production to Obsidian (one section per task)

Now that prod deploy is verified healthy AND the backlog closeout PR is merged (or the tasks were already production), append a Production capstone to each rolled-up task's Obsidian tracker.

1. Resolve `{ProjectObsidian}` via CWD basename fuzzy-match against `*_Build/` folders. If no match, skip Obsidian logging.

2. For **every task in the Step 3 rollup list** (whether or not Step 9 actually flipped its status — already-production tasks still get the capstone for traceability):

   a. Look up the task in `docs/backlog.json` for title and branch (extract slug from branch).
   b. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`.
   c. **Ensure file exists with header** (defensive — should already exist after the lifecycle). If 404, append the standard initial header first.
   d. **Append the Production section** via `mcp__mcp-obsidian__obsidian_append_content`:

      ```
      ---

      ## Production — {ISO 8601 UTC timestamp} (by /promote-to-prod)

      **Promotion PR:** {pr-url} — MERGED at {mergedAt}
      **Prod deploy:** SUCCESS — workflow run {run-url}
      **Backlog closeout PR:** {closeout-pr-url, or "(none — already production)" if Step 9 skipped this task}
      **Promotion path:** {Path A (stage→main) or Path B (direct-to-main)}

      **Status flip:** {prior-status} → production
      ```

3. Tell the user: "Production logged to {count} task tracker(s) in `{ProjectObsidian}_Build/Tasks/`."

## Step 11 — Final report

Tell the user:
- **Promotion path:** {Path A (stage→main) or Path B (direct-to-main)}
- **Promotion PR:** `#{pr-number}` ({title}) — MERGED at `{mergedAt}`
- **Prod deploy:** SUCCESS — workflow run `{run-url}`
- **Tasks marked production:** `{N1}, N2, ...` (via merged backlog closeout PR `{closeout-pr-url}`)
- **Tasks skipped (already production):** `{list, or "none"}`
- **Cleanup:** `{count}` merged task branches + `{count}` worktrees removed (Step 9.5)
- **Next step:** none for the promotion lifecycle. `/promote-to-prod` completed the deploy verification, production status flip, archive move, and Obsidian production log.

If anything was overridden in Step 1, repeat the override note in the final report so it shows up in the session record.

## Failure summary (single source of truth)

This skill stops without marking tasks production if ANY of the following happen. Each stop is reported with the relevant URL or error so the human can investigate.

- Step 1: user declined the review gate (without override)
- Step 4: hard-fail in the cross-boundary audit
- Step 7: auto-merge unavailable AND a required check failed, OR PR didn't merge within 10 min
- Step 8: prod deploy concluded anything other than `success`, OR the run didn't appear within 60s
- Step 3: no tasks to promote (all candidates already production)

In every failure case, the backlog is left untouched.

## Path detection summary

The promotion path is automatically detected in Step 2a:
- **Path A (stage → main):** CareGuide only, when stage exists on origin AND is ahead of main. Promotes stage → main in a rollup PR, then verifies production deploy from main.
- **Path B (direct-to-main):** all non-CareGuide projects, or CareGuide when stage doesn't exist or is not ahead of main. Merges reviewed task PRs to main, then verifies production deploy from main.

Both paths go through the same review gate (Step 1), audit (Step 4), auto-merge (Step 7), and prod deploy watch (Step 8). The only difference is which branch is the promotion source.


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /promote-to-prod complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
