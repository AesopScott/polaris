---
name: promote-stage
description: CareGuide-only. Promote `stage` to `main` for pre-production testing. In single-session mode, opens a stage → main PR. In multi-session mode, requests the orchestrator to perform the merge and push.
---

# /promote-stage

You are promoting CareGuide's real `stage` environment. This is the final gate before production deploy. Verify all tasks on stage have passed review, then promote to `main` for final validation.

## Directive Polling (multi-session only) with Error Handling

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives before proceeding:

**Polling with try-catch and retry:**

Use `node -e` with try-catch to read the directive file safely (never use the Read tool):

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
  echo "⚠️ Directive polling unavailable (max retries). Proceeding in single-session mode."
fi
```

**Behavior:**

1. If directive found:
   - Set `status: "acknowledged"` and `acknowledgedAt: <ISO timestamp>` in the file
   - Execute the `instruction` field as a user message
   - Set `status: "completed"`, write `completedAt` and `result`
   - Proceed with the directive's instructions

2. If no directive found:
   - **Single-session:** Continue to "Merge Model" normally
   - **Multi-session:** Continue to "Merge Model" (fallback to normal operation)

3. If polling fails (max retries exceeded):
   - Log "Orchestrator coordination unavailable"
   - Continue to "Merge Model" in single-session fallback mode
   - **Do not halt** on missing directives

## Merge Model

**In multi-session context:** This skill opens a stage → main PR and stops. The orchestrator may coordinate the merge through directives. Do NOT merge directly in multi-session mode — let the orchestrator coordinate via directives or wait for human approval on GitHub.

**In single-session context:** Open a stage → main PR, get human approval, then merge directly and push.

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

- **CareGuide-only by default.** `/promote-stage` is valid only for Parental CareGuide/CareGuide because it is the only project with a real, testable stage environment. For every other project, stop and tell Scott: "This project has no real testable stage. Use `/promote-to-prod` or the direct main PR path instead." Continue only if Scott explicitly overrides this policy for this session.
- **Rollup-scoped, not single-task.** This skill processes EVERY task currently `cba-complete` that has merged to stage since the last promotion. Single-task invocation is not possible — the rollup is the unit of promotion.
- **Opens the stage→main PR but does NOT merge it.** Production merge is human action on GitHub. If you want auto-merge + auto-ship, invoke `/promote-to-prod` instead.
- **Flips backlog statuses to `staged`.** For each pr-reviewed task merged to stage, updates its status in docs/backlog.json on main.

## Objective-Centric Criteria Contract

`/promote-stage` promotes a rollup only after objective completion is visible for each included task.

For every task in the rollup:
- Load `objective` from `docs/backlog.json`.
- Mark objective status as complete, partial, missing, or waived.
- Verify every `successCriteria[]` item has mapped proof evidence or an explicit waiver.
- Verify no `nonGoals[]` item appears in the rolled-up diff.
- Treat missing objective criteria as a soft-flag for standard-risk tasks and a hard-fail for high-risk tasks.

## Worktree isolation check (required before any other step)

Before any git or file operations, verify the session is running from a stable working directory. `/promote-stage` fetches remote branches, audits diffs, and commits backlog status updates — all of which require a reliable git context.

```bash
git branch --show-current   # prints branch name, or empty if detached HEAD
git worktree list           # lists all worktrees: path, HEAD commit, branch
```

Also note the current working directory (`$PWD` in PowerShell, `pwd` in bash).

**Interpret the result and act:**

| Situation | Action |
|---|---|
| Branch is `main` or `stage`, CWD is the project source tree (`C:\Users\scott\Code\{ProjectName}`) | ✅ **Proceed** — stable location for promotion operations. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir (path contains `AppData\Local\Temp\polaris-wt`), AND `git worktree list` shows a `[main]` entry in the source tree | ✅ **Proceed** — the primary `[main]` worktree exists in the source tree. Use it for all `git checkout main`, backlog.json edits, and commit operations. Route those operations to the primary path rather than the temp CWD. |
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
4. Use `$DEST` as the working directory for all remaining steps.

If creation fails, stop immediately — do not run promotion operations from an unstable temp directory.

---

## Step 0 — Project gate

Determine the project from CWD basename, Obsidian project folder, or project config.

- If the project is Parental CareGuide/CareGuide, continue.
- If the project is anything else, stop. Do not inspect or merge `stage`; it is not a usable safety gate for non-CareGuide projects.
- If project identity is unclear, ask Scott once. If no answer is available, stop rather than guessing into stage.

## Step 1 — Pre-flight: confirm reviews are done and findings remediated

**Independent review is the primary safety net before code reaches main/production.** This gate **verifies reviews actually ran by looking for evidence** in Obsidian and on each task's PR. It falls back to a trust question only when evidence is missing.

**Skip review-blocked tasks.** If any task has status `review-blocked`, skip it from this promotion. Tasks in `review-blocked` state have completed review with REQUEST CHANGES verdict; they need remediation before promotion can proceed. Surface a warning listing which tasks were skipped due to `review-blocked` status.

### Step 1a — Identify the rollup (preview Step 3)

Use `gh pr list --state merged --base stage --limit 50 --json number,title,mergedAt` filtered to PRs merged AFTER the most recent merge into main. Parse `Task #{N}` from each PR title. Hold the list `[N1, N2, ...]` and the corresponding pr-N for each task (from `docs/backlog.json` `pr_url`).

### Step 1b — Check review evidence for each task

Resolve `{ProjectObsidian}` via CWD basename fuzzy-match against `*_Build/` folders using the **OBSIDIAN ACCESS PROTOCOL**. If no match, mark Obsidian checks as "skipped (no project match)" and proceed with PR-comment checks only.

For each task `#{N}`:

1. **Obsidian evidence.** Try to get the file `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md` (slug from task branch) using the **OBSIDIAN ACCESS PROTOCOL**. If found, scan content for `## Claude Review` and `## Codex Review` headers.

2. **PR-comment evidence.** Run `gh pr view {pr-N} --json comments`. Scan each comment body for `Task #{N}` plus `Claude Review` (Claude PR evidence) and `Task #{N}` plus `Codex Review` (Codex PR evidence).

3. Per task, mark `claude_evidence` and `codex_evidence` as `obsidian | pr | both | none`.

### Step 1b-proof — Check proof-trail status for each task

For each task `#{N}`, assess the proof trail by:

1. **Proof units present.** Load the task's `plan` from `docs/backlog.json`. Does it contain a `proof_units` array? If empty or missing, mark as ⚠️ (no proof units defined).

2. **Build evidence.** Scan the task's PR diff (loaded in step 3 after step 2's merge) for:
   - Failing test(s) / proof checks (commits marked "RED" or "failing" in the message, or explicit proof failure in test output)
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
4. **Non-goal drift.** Scan the task PR diff and stage rollup diff for work listed in `objective.nonGoals[]` or adjacent work not tied to success criteria.
5. **Stop conditions.** If any `objective.stopConditions[]` item is triggered, hard-fail unless the user provides an explicit override.

Per task, record: `objective_present | criteria_mapped | objective_evidence | non_goal_drift | stop_conditions`.

### Step 1c — Decide

Build a summary table combining review evidence, objective status, and proof-trail status:

```
| Task | Title | Claude review | Codex review | Objective | Proof Units | Build Ev. | Registry | Risk |
|---|---|---|---|---|---|---|---|---|
| #5 | API Auth | ✓ (Obsidian) | ✓ (PR) | ✓ | ✓ | ✓ | ✓ | Medium |
| #6 | Data Schema | ✓ (Obsidian) | ✗ MISSING | ⚠️ Partial | ⚠️ Partial | ⚠️ | ✓ | High |
```

**Decision logic:**

1. **Check for hard-fails:**
   - Any high-risk task (security, auth, payments, migration) missing ANY of: Claude review, Codex review, objective completion, or complete build evidence (proof units + passing tests + registry audit)?
   - If yes → **HARD-FAIL.** Stop and tell user: "Task #{N} ({category}) missing critical proof or reviews. Cannot proceed without remediation or explicit high-risk override."

2. **If no hard-fails**, check for soft-flags:
   - Any standard-risk task missing Claude review, Codex review, objective completion, or proof trail completeness?
   - If yes → **SOFT-FLAG.** Log and ask:

> Proof trail status (see table):
> - {count} task(s) with complete proof and reviews
> - {count} task(s) with missing proof or reviews (marked ⚠️)
>
> Proceed, or remediate first?

Options (for soft-flags only):
- **Remediate first** → stop. List the gaps. "Run missing `/review-pr`, `/codex-review`, or complete proof units, then re-invoke /promote-stage."
- **Proceed (findings clean / acceptable risk)** → proceed to Step 2.
- **Override** → proceed but capture risk details and reason for PR body stamp.

3. **If all tasks pass hard-fail and soft-flag checks** → proceed to Step 2 automatically.

### Override handling

If Override was selected (high-risk or soft-flag), capture the user's reason briefly. In Step 5 (PR body), prepend a **⚠️ OVERRIDE SUMMARY** block listing:
- Which task(s) were overridden
- Gap details (missing review type, proof unit, registry audit)
- Reason provided by user
- Human approving the merge accepts this risk.

This gate exists at the `/promote-stage` level (not only in `/ship-task`) so that direct invocations are equally protected.

## Step 2 — Sync both branches

```bash
git fetch origin main stage --prune
```

Verify:
- `origin/stage` exists. If not, stop and tell the user: "No `stage` branch exists on origin. Create it first with `git push origin main:stage`."
- `origin/stage` is ahead of `origin/main`. If not, stop and tell the user: "stage is not ahead of main — nothing to promote."

```bash
git log origin/main..origin/stage --oneline
git diff origin/main...origin/stage --stat
```

Hold the list of commits being promoted in context.

## Step 3 — Identify the tasks being promoted

Use `gh pr list --state merged --base stage` to list every task PR that has been merged into stage since the last promotion.

For each merged task PR, extract the task number from the title (`Task #{N}: ...`). Read `docs/backlog.json` and pull each task's `title`, `description`, `status`, and `pr_url`.

These tasks are rolling up to production.

### Step 3a — Per-task status guard + branch remediation

For each task in the rollup list:

1. **Check active backlog.json first:**
   - If task found and status == `cba-complete`: **include in promotion** ✓
   - If task found and status == `production`: **drop from rollup**. Log: "Task #{N} is already production; skipping."
   - If task found and status == `on-hold`: **REMEDIATE** — task has commits on stage but is explicitly on-hold. Create a branch `task/{N}-hold` from the task's commits, then drop from rollup. Log: "Task #{N} is on-hold; moved commits to task/{N}-hold."
     - Extract task commits: `git log origin/main..origin/stage --oneline | grep "task.*#{N}\|Task.*#{N}" | head -5`
     - Create hold branch: `git fetch origin main && git checkout -b task/{N}-hold origin/main && git cherry-pick {commit-shas} && git push -u origin task/{N}-hold`
     - Drop task from rollup
   - If task found with other status (`build-finished`, `planned`, etc.): **soft warn** and ask: "Task #{N} is `{status}` but has commits on stage. Include in this rollup anyway? [yes/no]"

2. **If task not found in backlog.json, check backlog-archive.json:**
   ```bash
   grep -q "\"number\": {N}" docs/backlog-archive.json
   ```
   - If found in archive with `promoted_via_pr` field: **REMEDIATE** — task is already promoted but commits linger on stage. Remove commits from stage:
     - `git fetch origin main stage`
     - `git rebase origin/main --onto origin/main origin/stage -- --preserve-merges` or manually reset: `git reset --hard origin/main && git rebase -i origin/main` to cherry-pick only non-archived tasks
     - Push cleanup: `git push origin stage --force-with-lease`
     - Log: "Task #{N} was already promoted to production; archived commits removed from stage."
   - If found in archive but incomplete metadata: log warning and drop from rollup
   - If not found in either file: **HARD-FAIL** — "Task #{N} found in PR title on stage but NOT in backlog.json or backlog-archive.json. STOP: This task is orphaned/stale. Investigate before promotion. Either add task to backlog.json if it's real work, or remove its commits from stage, then re-invoke."

If after handling these anomalies the rollup list is empty, stop with: "No tasks ready to promote (all candidates are already production, archived, or on-hold)."

## Step 4 — Rollup cross-boundary audit (stage vs main)

Read the registries as they stand on `origin/stage` (NOT on the current local HEAD, which may be main):
```bash
git show origin/stage:docs/registries/collections.md
git show origin/stage:docs/registries/endpoints.md
git show origin/stage:docs/registries/claims.md
```

For the **combined diff** stage vs main:
- `git diff origin/main...origin/stage` — full diff to audit
- Enumerate every new identifier on stage (collections, endpoints, claims, pages) that isn't on main
- For each: confirm it has at least one producer AND one consumer, and is documented in the appropriate registry on stage

**Hard-fail criteria — stop and tell the user before opening the PR:**
- Any orphan producer or consumer in the combined diff
- Any naming collision introduced by stage relative to main (two tasks both invented different names for the same concept)
- Any registry annotation on stage that has drifted from the actual code on stage
- Any merge marker text (`<<<<<<<`, `=======`, `>>>>>>>`) accidentally committed on stage

**Soft-flag — note in the PR body but don't block:**
- Convention drift across the rolled-up tasks (e.g., one task uses camelCase, another snake_case for similar concepts)
- Auth/rule patterns that diverge across the rolled-up tasks

Hold the rollup audit summary in context — it goes into the PR body in Step 4.

## Step 5 — Open the promotion PR

Use `gh pr create`:
- **Base:** `main`
- **Head:** `stage`
- **Title:** `Promote: tasks #{n1}, #{n2}, ... → main` (list every task included)
- **Body** — include each section in this order:
  - **If overridden in Step 1c:** ⚠️ **OVERRIDE SUMMARY** block (which tasks, gap details, user's reason)
  - One-line summary of what's being promoted
  - **Tasks included** — for each: number, title, brief description, original task PR URL
  - **Objective/proof status** — summary table from Step 1c showing Claude review, Codex review, objective completion, proof units, build evidence, registry audit, and risk category for each task. Note any gaps or override reasons.
  - **Rollup cross-boundary audit** — what new identifiers were introduced, confirmation of zero hard-fails, any soft-flag notes
  - **Stage verification** — ask the user for a short note: what was tested on the stage environment and the result. Insert their answer here.
  - "Merging this PR ships to production."

Do NOT merge. Capture the PR URL.

## Step 6 — Log Promotion to Obsidian (one section per task)

For **every task included** in this rollup (Step 2's list), append a Promotion record to that task's Obsidian tracker.

1. Resolve the Obsidian project name via CWD basename fuzzy-match against `*_Build/` folders. Call it `{ProjectObsidian}`. If no match, skip Obsidian logging.

2. For each rolled-up task #{N}:

   a. Look up the task in `docs/backlog.json` (using its number from your Step 2 list) to get its title and branch (extract slug from branch).

   b. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`.

   c. **Ensure file exists with header.** Try `mcp__mcp-obsidian__obsidian_get_file_contents`. If 404, append the standard initial header (defensive).

   d. **Append the Promotion section:**

      ```
      ---

      ## Promotion — {ISO 8601 UTC timestamp} (by /promote-stage)

      **Promotion PR:** {url}
      **Tasks rolled up:** #{n1}, #{n2}, ...

      **Rollup audit findings:**
      - Hard-fails: {0 — proceeded; or itemize}
      - Soft-flags: {list verbatim or "none"}

      **Stage verification note:** {user's note from Step 4}

      **Status (this task):** flipped to staged (will flip to production after merge to main and deploy succeeds)
      ```

3. Tell the user: "Promotion logged to {count} task tracker(s) in `{ProjectObsidian}_Build/Tasks/`."

## Step 6b — Update backlog statuses on main

For each task in the rollup, update its status on main:

```bash
git checkout main && git pull
```

Update `docs/backlog.json` using `node -e` — never use the Edit tool on JSON files (Windows encoding rule). Substitute `[{N1}, {N2}, ...]` with the actual task numbers from the rollup:

```bash
node -e "
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('docs/backlog.json', 'utf8'));
for (const n of [{N1}, {N2}]) {
  const t = b.tasks.find(t => t.number === n);
  if (t) { t.status = 'staged'; }
  else { console.warn('Task #' + n + ' not found, skipping'); }
}
fs.writeFileSync('docs/backlog.json', JSON.stringify(b, null, 2) + '\n', 'utf8');
console.log('Marked tasks staged');
"
```

Commit and push (single commit covering all tasks in rollup):
```bash
git add docs/backlog.json
git commit -m "chore(backlog): promote tasks to staged — {N1}, {N2}, {N3}, ..."
git push
```

## Step 7 — Report

Summarize:
- Promotion PR URL
- Tasks included in this rollup ({n1}, {n2}, ...)
- Audit findings (hard-fail: should be zero; soft-flag notes if any)
- Next steps:
  1. Human reviews and merges the promotion PR
  2. Production deploy runs from main
  3. After confirmation, mark each rolled-up task as `status: "complete"` in `docs/backlog.json` on main (use `/mark-tasks-complete {pr-number}`)

Mention: after the prod deploy confirms healthy, run `/mark-tasks-complete {pr-number}` against this promotion PR — it parses the rolled-up task numbers and flips each task's status to `complete` via a follow-up PR (main is protected).


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /promote-stage complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
