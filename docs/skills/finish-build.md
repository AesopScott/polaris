---
name: finish-build
description: Complete the current build session after cross-boundary audit passes. Commits the task code, pushes the branch, and opens a PR targeting `stage` only for CareGuide's real stage environment, otherwise `main`. Stays on the task branch throughout — the orchestrator sets build-finished status in backlog.json.
---

# /finish-build

You are completing a build session. The cross-boundary audit must have passed (status `cba-complete`) before this skill runs. Commit task code to the task branch, push, then open a PR targeting either CareGuide's real `stage` environment or `main` for all other projects. Nothing merges or leaves the task branch until you explicitly run a promote command.

## Directive Polling (multi-session only) with Error Handling

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives:

Poll with try-catch and retry (use `node -e`, never Read tool). Retry up to 3 times with exponential backoff. Timeout 5s per attempt.

**On finding directive:** Set `status: "acknowledged"`, execute `instruction`, set `status: "completed"` with result.
**On timeout/failure:** Log warning and proceed to Step 0 in single-session fallback mode. Do not halt.

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

- **One primary task per session.** Finishes exactly the task whose branch is currently checked out (Task #{N}, derived from `task/{N}-{slug}`). Does not touch other tasks.
  - **Exception: emergency fixes.** May be finished as a secondary task inside a session that built another task. Each task gets its own `/finish-build` invocation when its branch is checked out.
- **Opens PR but does not merge.** This skill opens a PR to `stage` only for Parental CareGuide/CareGuide, or to `main` for all other projects, and leaves the merge decision to explicit promote commands (`/promote-stage` or `/promote-to-prod`). No code leaves the task branch without a deliberate promotion step.
- **No rollups.** Opens one task's PR. Multi-task batching and merging is `/promote-stage`, `/promote-to-prod`, and `/mark-tasks-complete` only.

> **Stage policy:** Only Parental CareGuide/CareGuide has a real, testable stage environment. For every other project, do not use `stage` as a safety gate just because a branch exists. Target `main` and let `/promote-to-prod` be the final production gate.

## Objective-Centric Criteria Contract

`/finish-build` is the first hard exit gate for the task objective. It must verify that implementation evidence satisfies the objective, not just that code exists and the branch can open a PR.

Before committing or opening a PR:
- Load `objective` and `proofUnits[]` from `docs/backlog.json`.
- For every `objective.successCriteria[]` item, verify a mapped `proofMap[]` entry exists.
- For every mapped proof unit, verify exit evidence exists in tests, smoke output, audit output, screenshots, PR body notes, or an explicit waiver.
- Verify no diff is explained only by convenience or cleanup if it is listed in `objective.nonGoals[]` or not tied to success criteria.
- If any success criterion lacks evidence, keep the task in `build-started` and stop before PR creation.

## Worktree isolation check (required before any other step)

Before any code, git, or file operations, verify the session is running from a stable, isolated working directory — not from `main` directly and not from a Polaris temp session directory without a proper working branch.

```bash
git branch --show-current   # prints branch name, or empty if detached HEAD
git worktree list           # lists all worktrees: path, HEAD commit, branch
```

Also note the current working directory (`$PWD` in PowerShell, `pwd` in bash).

**Interpret the result and act:**

| Situation | Action |
|---|---|
| Branch matches `task/{N}-*`, CWD is the project source tree OR a Polaris temp session worktree | ✅ **Proceed** — on an isolated task branch as expected. |
| Branch is `main` or detached HEAD (any CWD) | ❌ **Stop** — `/finish-build` must run from a `task/{N}-*` branch. Step 1 enforces this; this check surfaces the problem early. Tell the user: "finish-build requires a task branch. Run `/start-build {N}` first, or check out the correct task branch, then re-invoke." |
| Branch matches `task/{N}-*`, CWD is a Polaris temp session dir (path contains `AppData\Local\Temp\polaris-wt`) with no matching worktree in the source tree | ⚠️ **Verify git access** — the temp session worktree may be about to be cleaned up. Run `git status` and `git remote -v` to confirm the repo is reachable. If git operations fail, create a named worktree (see below) and re-check-out the task branch there before continuing. |

**Creating a named worktree when the temp session worktree is unstable:**

1. Confirm the project source path exists: `ls "C:\Users\scott\Code\{ProjectName}"`.
2. Create a worktree tracking the existing task branch:
   ```bash
   BRANCH="task/{N}-{slug}"
   DEST="C:/Users/scott/Code/{ProjectName}/worktrees/${BRANCH//\//-}"
   git -C "C:/Users/scott/Code/{ProjectName}" worktree add "$DEST" "$BRANCH"
   ```
3. Announce: "Moved to a named worktree at `{path}` to ensure stability. Continuing from there."
4. Use `$DEST` as the working directory for all remaining steps.

If creation fails, stop and report the error — do not risk committing from an unstable location.

---

## Step 1 — Identify the current task

```bash
git branch --show-current
```

Branch format: `task/{number}-{slug}`. Extract `{number}`. If the branch doesn't match, stop — `/finish-build` should only run from a task branch.

Read `docs/backlog.json` and find the task by `number`. Hold the `title`, `description`, and `plan` in context.

### Step 1a — State guard (lifecycle order check)

Check the task's `status`. The skill's allowed action depends on it:

| Current status | Allowed action |
|---|---|
| `build-started` | ✅ Proceed — standard finish path. |
| `in-progress` | ✅ Proceed (legacy status, accepted for backward compat). |
| `ready` | ⚠️ Soft warn: "Task #{N} is `ready` but you're on the task branch. `/start-build` should have flipped status to `build-started`. Proceed anyway and assume the flip was missed? [yes/no]" On yes, continue. |
| `pr-reviewed` | ❌ **Refuse.** "Task #{N} is already pr-reviewed (PR exists and is open). Re-finishing would create a duplicate PR. If you need to apply additional changes, push to the existing task branch and the PR auto-updates. Otherwise open a new task for follow-up work." Stop. |
| `staged` / `production` / `complete` | ❌ **Refuse.** "Task #{N} is {status} (already promoted). Re-finishing not possible." Stop. |
| `backlog` | ❌ **Refuse.** "Task #{N} has no plan and was never started, but you're on a task branch for it. Something is wrong — verify the branch matches the task you intended." Stop. |

Do NOT skip this check.

## Step 2 — Verify against the task objective and spec

- Does the implementation satisfy every `objective.successCriteria[]` item?
- Does every success criterion have a `proofMap[]` entry and evidence from the corresponding proof unit?
- Did the implementation avoid every `objective.nonGoals[]` item?
- Did any `objective.stopConditions[]` trigger during build? If yes, stop and resolve with the user before proceeding.
- Does the implementation match the task `description` and `plan`?
- Are all new Firestore collections, endpoints, or claims introduced in this task reflected in the relevant `docs/registries/*.md` files? If not, update them now.
- Are there changes outside this task's scope? Flag them to the user before proceeding.

If anything is out of scope or missing, stop and resolve with the user.

## Step 3 — Detect the promotion target (CareGuide stage or main)

First determine whether the current project is Parental CareGuide/CareGuide from the repo name, Obsidian project folder, or project config. Then check which branches exist on origin:

```bash
git fetch origin main
git ls-remote --exit-code origin stage >/dev/null 2>&1
HAS_STAGE=$?
```

- Set `IS_CAREGUIDE=true` only when the project is clearly Parental CareGuide/CareGuide; otherwise set `IS_CAREGUIDE=false`.
- **If this project is Parental CareGuide/CareGuide AND `origin/stage` exists** (`HAS_STAGE=0`): PR will target `stage`. Audit against both `main` and `stage`.
- **For every other project:** PR will target `main` directly and audit against `main` only, even if `origin/stage` exists.
- **If project identity is unclear:** Ask Scott once. If no answer is available, default to `main` and state that stage was skipped because only CareGuide has a known testable stage.

Store the result in context for Step 6 (PR creation).

## Step 3a — Cross-boundary audit (against main ± stage)

> **Precondition: `/cross-boundary-audit` was run on this branch after code changes.** The registries should reflect current task-branch reality. If you suspect they're stale (no recent commits to `docs/registries/*.md` on this branch despite new producers/consumers in the diff), stop and tell the user to run `/cross-boundary-audit` first. This step verifies; it does not regenerate.

Fetch latest state of reference branches:
```bash
git fetch origin main
[ "$IS_CAREGUIDE" = "true" ] && [ $HAS_STAGE -eq 0 ] && git fetch origin stage
```

**Sanity check that the audit was run** — verify `docs/registries/*.md` were touched on this branch:
```bash
git log origin/main..HEAD -- docs/registries/ --oneline
```
If empty AND the diff (below) introduces new collection/endpoint/claim identifiers, the registries are stale — stop and have the user run `/cross-boundary-audit`.

Read the current state of (treat these as authoritative — they were just regenerated):
- `docs/registries/collections.md`
- `docs/registries/endpoints.md`
- `docs/registries/claims.md`

Diff this branch against reference point(s):
```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
if [ "$IS_CAREGUIDE" = "true" ] && [ $HAS_STAGE -eq 0 ]; then
  git diff origin/stage...HEAD --stat   # what changes from stage's POV (only if stage exists)
fi
```

**Verification — read the regenerated registries and confirm:**
- Every new identifier introduced by this task appears in the appropriate registry
- Every new identifier has at least one producer AND one consumer
- No identifier introduced by this task collides (under a different name) with an existing entry on `main` (or on CareGuide `stage` when this is the CareGuide project) — e.g., stage already has `intake_summary` from another in-flight task, your code introduces `summary_from_intake` for the same concept

**For every existing identifier touched this task**, verify:
- Producer and consumer lists in the registry still match code reality
- Rule, index, and auth annotations still match the code

**Hard-fail criteria — stop and resolve with the user before committing:**
- Registries appear stale (no recent registry commits on this branch despite new identifiers in code)
- New orphan producer (code writes something nothing reads)
- New orphan consumer (code reads something nothing writes)
- Naming collision with an existing identifier on main OR CareGuide stage when this is the CareGuide project
- Registry annotation that has drifted from the code

**Soft-flag — proceed but note in the PR body:**
- New identifiers that follow a different naming convention than their neighbors
- Auth or rule patterns that diverge from the surrounding pattern in the same registry

Hold the audit summary in context — it goes into the PR body in Step 6.

## Step 4 — Commit the task code

Stage only files relevant to this task (do **not** stage `docs/backlog.json` — that is updated by the orchestrator). Commit:
```
{type}: {short description}

Task #{number} — {title}

{1-2 sentences on what was built and why}
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

## Step 5 — Rebase on target branch (CareGuide stage or main), then push

Before pushing, make sure the branch is current with the PR target branch (`stage` only for CareGuide with a real stage branch, `main` otherwise).

```bash
if [ "$IS_CAREGUIDE" = "true" ] && [ $HAS_STAGE -eq 0 ]; then
  TARGET_BRANCH=stage
else
  TARGET_BRANCH=main
fi
git fetch origin $TARGET_BRANCH
git rebase origin/$TARGET_BRANCH
```

If the target branch has moved since this branch was cut — e.g., another task was promoted and merged during this build session — and rebase conflicts occur, follow the conflict resolution steps below.

**If the rebase reports conflicts:** stop. Surface the conflicting files to the user. Offer to:
1. Have you resolve the conflicts (you'll need to know which side wins for each file — usually stage's version for shared infrastructure, the task's version for the task's own work)
2. Let the user resolve manually
3. Abort with `git rebase --abort` and revisit

Do not continue until the rebase completes cleanly.

**If the rebase succeeds with no changes** (branch was already current): no force needed, push normally.

**Push:**
```bash
# First push (no remote branch yet):
git push -u origin task/{number}-{slug}

# Subsequent push after rebase (remote branch exists, history was rewritten):
git push --force-with-lease origin task/{number}-{slug}
```

Detect which case by checking whether the remote branch already exists:
```bash
git ls-remote --exit-code origin task/{number}-{slug} >/dev/null 2>&1 && echo exists || echo new
```

Retry the push up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure. Never retry past a `--force-with-lease` rejection — that means someone else pushed in between, surface it to the user.

**After a successful push** — including after conflict-resolution and force-with-lease — proceed to Step 5a before opening the PR.

## Step 5a — CBA pass gate (hard stop before PR creation)

Before calling `gh pr create`, verify the cross-boundary audit from Step 3a **passed clean**:

1. **CBA was run on this branch** — confirm `git log origin/main..HEAD -- docs/registries/` is non-empty. If empty AND the diff introduced new identifiers, the audit was never run. **STOP:** "CBA has not been run on this branch. Run `/cross-boundary-audit` first."

2. **CBA passed with zero hard-fail findings** — review the audit summary held in context from Step 3a. If any hard-fail finding is present (orphan producer/consumer, naming collision, stale registries, annotation drift): **STOP.** Do not open the PR. Tell the user the exact finding(s) and how to resolve them. Keep task status as `build-started`.

If both conditions are met, proceed to Step 6.

## Step 6 — Open the PR (target stage or main)

Open the PR targeting the appropriate base branch:

```bash
gh pr create --base $TARGET_BRANCH --title "Task #{number}: {title}" --body "..."
```

Body — include each section:
- Task description
- **Objective criteria** — objective statement, success criteria, non-goals, and a criterion-to-proof summary
- What was built (1–2 paragraphs)
- Registries updated (list the files)
- **Cross-boundary audit** (from Step 3): list the new identifiers introduced, confirm zero hard-fail findings against main AND stage; include any soft-flag notes verbatim
- Test plan — how to verify this works on the stage/main environment
- Task #{number} (for traceability)

Capture the PR URL and number from the output.

**The PR is now open but not merged.** The task branch and code remain untouched until you explicitly run `/promote-stage` or `/promote-to-prod` to merge and move the code forward.

## Step 7 — Signal build completion (orchestrator handles backlog)

> **Note:** Do not write to `docs/backlog.json` or check out `main`. Stay on the task branch. The orchestrator sets `status: build-finished` and `pr_url` in `docs/backlog.json` after reading this skill's output.
>
> Ensure the PR URL is prominently stated in the Step 9 report and in the completion banner so the orchestrator can capture it.
>
> **Do not delete the task branch.** The remote branch stays in place until the PR is merged via an explicit promote command (`/promote-stage` or `/promote-to-prod`).

## Step 8 — Log Build Finished + Audit to Obsidian

Append a record of the audit results and the build completion to the task's Obsidian tracker.

1. Resolve the Obsidian project name via the CWD basename fuzzy-match against `*_Build/` folders using the **OBSIDIAN ACCESS PROTOCOL**. Call it `{ProjectObsidian}`. If no match, skip Obsidian logging.

2. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`. Extract `{slug}` from the task branch name you held in context from Step 1 (before deletion).

3. **Ensure file exists with header.** Try to get the file using the **OBSIDIAN ACCESS PROTOCOL**. If it doesn't exist, append the initial header using the **OBSIDIAN ACCESS PROTOCOL** (typically `/plan-task` and `/start-build` already created it, but be defensive):

   ```
   # Task #{N} — {title}

   **Category:** {category}   **Priority:** {priority}   **Dependencies:** {deps list or "none"}
   **Branch:** task/{N}-{slug} (deleted)   **PR:** {pr_url}   **Status (initial):** build-started

   ## Description

   {description}
   ```

4. **Append the Cross-Boundary Audit + Build Finished section** using the **OBSIDIAN ACCESS PROTOCOL**:

   ```
   ---

   ## Cross-Boundary Audit + Build Finished — {ISO 8601 UTC timestamp} (by /finish-build)

   ### Cross-boundary audit (Step 3 verification)

   **Hard-fail findings:** {0 — proceeded; otherwise this section wouldn't be logged because the skill would have stopped}
   **Soft-flag findings:** {list verbatim from Step 3, or "none"}

   ### Build finished

   **PR:** {url}
   **Merge status:** MERGED (squash, branch deleted)
   **Files committed (Step 4):** {list of files staged for the task commit}
   **Registry files updated:** {list from docs/registries/ that changed, or "none"}

   **Status flip:** build-started → build-finished
   ```

5. Tell the user: "Build + audit logged to `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`."

## Step 9 — Report

Summarize:
- What was committed on the task branch
- Audit findings against main (and against CareGuide stage when applicable) — hard-fail: should be zero; soft-flag notes if any
- PR URL (base = `$TARGET_BRANCH`) and **merge status: OPEN** (awaiting review and promotion)
- Task branch remains on remote (will be cleaned up after merge)
- Task marked build-finished on main (awaiting review and promotion)
- Registry files updated (if any)

**Suggested next steps:**

**If this is Parental CareGuide/CareGuide with the real stage environment:**
1. `/clear` — wipes this session's context so the reviewer starts cold
2. `/review-pr {N}` — Claude review against task spec + registries
3. `/codex-review {N}` — Codex review + comparison
4. Test the feature on the stage environment
5. `/promote-stage` (opens stage→main PR for CareGuide) **or** `/promote-to-prod` (merges to main, verifies production deploy from main, then marks tasks production)

**For every other project:**
1. `/clear` — wipes this session's context
2. `/review-pr {N}` — Claude review against task spec + registries
3. `/codex-review {N}` — Codex review + comparison
4. Test the feature in the environment
5. `/promote-to-prod` (merges reviewed PRs to main, verifies production deploy from main, then marks tasks production) **or** merge the PR manually if you prefer

The reviews are advisory — they don't block the merge. The merge happens when you run a promote command. The order above keeps everything in one terminal: `/clear` is the reset that gives the reviewer a fresh head.

You should be on main (per Step 7). No branch switch needed.


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /finish-build complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
