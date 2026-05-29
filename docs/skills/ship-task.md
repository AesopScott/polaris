---
name: ship-task
description: End-to-end task workflow with human gates. Resumes from the task's current status. Walks /plan-task → /start-build → /cross-boundary-audit → write code → /finish-build → /review-pr → /codex-review → /promote-to-prod, using /promote-stage only for CareGuide's real stage environment.
---

# /ship-task [task-number]

Walks the full task lifecycle with a human gate at every step. Detects the task's current `status` in `docs/backlog.json` and **resumes** from the right place — you don't have to re-run the earlier steps.

## Directive Polling (multi-session only)

In multi-session contexts, `/ship-task` invokes the sub-skills (`/plan-task`, `/start-build`, `/cross-boundary-audit`, `/finish-build`, `/review-pr`, `/codex-review`, `/promote-stage`, `/promote-to-prod`), which each poll for orchestrator directives independently. This skill itself does not poll — it delegates directive handling to the sub-skills.

When orchestrator directives are active:
- Each sub-skill reads `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`
- Acknowledges its pending directive (if any) and executes it
- Reports completion/failure back to the directive file
- Proceeds with phase work or halts if directive indicates an issue

See the individual sub-skill documentation for their directive polling implementation.

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

- **One primary task per session.** Orchestrates exactly Task #{N} through its lifecycle. Sub-skill invocations (`/plan-task`, `/start-build`, `/finish-build`, `/cross-boundary-audit`) all run against Task #{N} only.
  - **Exception: emergency fixes.** A second task may be shipped as an emergency fix inside an existing session by invoking `/ship-task {M}` for the fix's task number. Each `/ship-task` call still scopes to its own task — they don't interleave.
- **The production promotion step (`/promote-to-prod`) is the ONLY rollup step**, and it processes the eligible reviewed tasks for the current promotion path. Outside promotion, this skill never enumerates or works on other tasks.
- **Stage is CareGuide-only.** `/promote-stage` is used only for Parental CareGuide/CareGuide, the only project with a real, testable stage environment. All other projects skip stage and use `/promote-to-prod` after reviews.
- **No separate mark-production step.** `/promote-to-prod` owns the production status change and archive update after prod deploy succeeds.

You **invoke each sub-skill in turn**. Between each sub-skill you stop, summarize what happened, and ask the user to confirm before proceeding.

If any sub-skill hard-fails or surfaces an error, surface it to the user and stop the workflow — do NOT proceed to the next step automatically.

## Objective-Centric Criteria Contract

`/ship-task` is the orchestrator for the task objective. At every resume point, it must load the task's `objective` field and use it as the durable goal contract.

Required behavior:
- If the task is `backlog`, `/ship-task` must invoke `/plan-task {N}` so the objective is created before build starts.
- If the task is beyond planning and `objective` is missing, stop and tell the user to re-run `/plan-task {N}` or manually backfill `objective`.
- Summaries between steps must mention objective statement, current success criterion, non-goals, and any triggered stop condition.
- A step may proceed only when its output advances or verifies at least one `objective.successCriteria[]` item.
- If a sub-skill reports work outside the objective or inside `objective.nonGoals[]`, stop for user decision.

## Worktree isolation check (required before any other step)

Before any code, git, or file operations, verify the session is running from a stable, isolated working directory. `/ship-task` is the full-lifecycle orchestrator — it spawns sub-skills that write code to task branches, open PRs, and merge to main. All of this fails or corrupts state if the orchestrator is running from an ephemeral temp directory with no stable worktree.

```bash
git branch --show-current   # prints branch name, or empty if detached HEAD
git worktree list           # lists all worktrees: path, HEAD commit, branch
```

Also note the current working directory (`$PWD` in PowerShell, `pwd` in bash).

**Interpret the result and act:**

| Situation | Action |
|---|---|
| Branch matches `task/{N}-*` | ✅ **Proceed** — resuming a build already in progress on an isolated task branch. |
| Branch is `main`, CWD is the project source tree (`C:\Users\scott\Code\{ProjectName}`) | ✅ **Proceed** — starting a new task from the source tree. Sub-skills will create the task branch and worktree. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir (path contains `AppData\Local\Temp\polaris-wt`), AND `git worktree list` shows a `[main]` entry in the source tree | ✅ **Proceed** — standard Polaris chat session. Note the primary `[main]` worktree path; sub-skills will use it for main-branch operations and create isolated task worktrees for code work. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir, AND no `[main]` primary worktree exists in the source tree | ⚠️ **Create an isolated worktree** before continuing (see below). |

**Creating an isolated worktree when required:**

1. Confirm the project source path exists: `ls "C:\Users\scott\Code\{ProjectName}"`.
2. Create a timestamped worktree on a new branch based on `origin/main`:
   ```bash
   STAMP=$(date +%Y%m%d-%H%M%S)
   BRANCH="wt/session-${STAMP}"
   DEST="C:/Users/scott/Code/{ProjectName}/worktrees/${STAMP}"
   git -C "C:/Users/scott/Code/{ProjectName}" worktree add "$DEST" -b "$BRANCH" origin/main
   ```
3. Announce: "Session was in a Polaris temp directory without a primary worktree. Created isolated worktree at `{path}` on `{branch}`. All orchestration and sub-skill invocations will use that location."
4. Use `$DEST` as the effective working directory for all git and file operations throughout this skill.

If creation fails (path collision, disk space, network error), stop immediately — do not proceed from a temp directory.

---

## Step 0 — Read backlog and pick the task

Follow the backlog-on-main protocol (worktree-pinned or `git checkout main && git pull`, verify with `git branch --show-current`).

Read `docs/backlog.json`.

If `$ARGUMENTS` is empty: auto-select the highest-priority task whose status is not `done` (oldest `number` as tiebreaker).

If `$ARGUMENTS` is a number: load that task. If not found, stop and tell the user.

Show the user:
- Task number, title, current `status`
- If `branch` or `pr_url` are set, show them
- The plan summary if a plan exists
- The objective statement, success criteria, non-goals, and current step if `objective` exists; if it does not exist and status is not `backlog`, warn that objective criteria are missing and must be backfilled before continuing.

**Gate:** "Run the ship-task workflow for Task #{N} — '{title}', currently `{status}`? [yes/no]"

If `no` or `abort`, stop. Otherwise continue to the resumption logic below.

## Resumption — pick the starting step

**CRITICAL:** Read the task's current `status` from `docs/backlog.json`. DO NOT skip any planning step. Follow this decision tree strictly.

**MAJOR TASK GATE:** Before resuming, check the task's `impact` field. If `impact: "major"` AND status is not `backlog`:
- Stop and print: "Task #{N} is a major task with status `{status}`. Major tasks are decomposed during planning and do not proceed to build. If the plan created subtasks, ship those instead. If you need to revise the plan, edit `docs/backlog.json` directly or re-run `/plan-task {N}` to update it."
- Do NOT proceed with Steps 2-7.

Based on the task's current `status`:

| Status | Start at | Action |
|---|---|---|
| `backlog` | **Step 1 (plan)** | **MUST invoke `/plan-task {N}` FIRST.** Never skip to cross-boundary-audit for backlog tasks. |
| `planned` | Step 2 (start build) | Invoke `/start-build {N}`. Plan is complete; create the task branch, then audit. |
| `build-started` | Ask user | "Code already started on the task branch. Has the cross-boundary audit run on the task branch yet? [no, run audit now / yes, still coding / yes, ready to finish build]" |
| `cba-complete` | Step 4 (finish-build) | Boundary audit passed; proceed to finish build. |
| `build-finished` | Step 5 (review PR) | PR opened and pushed; code reviews next. Invoke `/review-pr`. |
| `pr-reviewed` | Step 6 (codex review) | Claude review complete; proceed to Codex review. |
| `codex-reviewed` | (wait) | Codex review complete; approval handler determining status. Resume if status becomes `review-passed` (proceed to Step 7) or `review-blocked` (fix code and re-run review). |
| `review-passed` | Step 7 (promote to prod) | Both reviews approved; ready to promote to production. Invoke `/promote-to-prod`. |
| `review-blocked` | (fix & retry) | Reviews found blockers. User fixes code and re-runs the blocking review (Claude or Codex). Then resume from that review step. |
| `staged` | Step 7 (promote to prod) | CareGuide task promoted to stage and ready for production. Invoke `/promote-to-prod`; it marks production after deploy succeeds. |
| `production` | Stop | Tell user "Task #{N} is already in production." Do not proceed. |

**If status is `backlog`: You MUST invoke `/plan-task {N}` before anything else. Not optional.**

## Step 1 — Plan (`backlog` → `ready`)

**THIS STEP IS MANDATORY FOR ALL NEW TASKS.** If task status is `backlog`, this is where you start. Do not skip.

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "planning", lastSkill: "plan-task" })` before invoking the skill.

Invoke `/plan-task {N}` via the Skill tool. It will load Obsidian context, write the plan, save to `docs/backlog.json` on main, flip status to `planned`.

After it completes:
- Show the plan summary to the user
- Show the objective statement, success criteria, non-goals, stop conditions, and proof map created by `/plan-task`
- **Check task impact:** Read the task's `impact` field from `docs/backlog.json`. If `impact: "major"`:
  - **Stop here.** Print the following and do NOT proceed to Step 2:
  
  > ✅ **Planning complete for major task #{N}.**
  >
  > Major tasks are decomposed into subtasks during planning. The plan above has split this work into multiple smaller backlog items. Each subtask should now be:
  >
  > 1. Added to `docs/backlog.json` with `status: "backlog"`
  > 2. Shipped individually using `/ship-task` or `/plan-task → /start-build → /finish-build → /review-pr → /promote-to-prod`
  >
  > No further steps apply to the parent major task — it has served its purpose.
  
  - **Stop.** Do not proceed to Step 2.

- **For standard or minor tasks**, show the gate: "Plan saved. Proceed to audit the design? [yes/no/edit]"
  - `yes`: continue to Step 2 (cross-boundary audit)
  - `edit`: stop the workflow; user wants to revise the plan manually
  - `no` / `abort`: stop

## Step 2 — Start build (`planned` → `build-started`)

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "start-build", lastSkill: "start-build" })` before invoking the skill.

Invoke `/start-build {N}`. It will load Obsidian context, sync main, create the task branch, mark `build-started`, load registries.

After it completes, you (the user) are on the task branch with full context.

**Gate:** "Branch `task/{N}-{slug}` created and marked build-started. Proceed to cross-boundary audit? [yes / abort]"
- `yes`: continue to Step 3
- `abort`: stop

## Step 3 — Cross-boundary audit (`build-started` → validates design on branch)

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "audit", lastSkill: "cross-boundary-audit" })` before invoking the skill.

Invoke `/cross-boundary-audit`. It will validate the plan against Feature Contracts and regenerate `docs/registries/*.md` from the current branch state.

After it completes:
- Review the registries and plan alignment
- Summarize objective alignment: whether the design contracts match Feature Contracts, and whether any stop condition was triggered
- Confirm that the plan is production-ready before coding begins

**Proof units are now active.** The task's `proofUnits[]` were loaded by `/start-build` and the first unit was named. As you implement, collect exit evidence per proof unit (passing test result, passing smoke command, or written waiver). `/finish-build` will verify each unit has exit evidence or a waiver before opening the PR — missing evidence is a hard stop.

**Objective criteria are now active.** The task's `objective.successCriteria[]` and `objective.nonGoals[]` were loaded by `/start-build`. Implement only the mapped success criteria; do not expand into non-goals or adjacent cleanup unless the user explicitly approves a new task.

**Gate:** "Audit complete. Contracts validated against Feature Contracts. Branch `task/{N}-{slug}` is active, objective criteria and proof units loaded, context ready. Implement against the mapped objective criteria and proof units. When the implementation is committable and all exit evidence is collected, reply `done` or `audit`. Reply `abort` to stop the workflow."

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "coding", lastSkill: "start-build" })` after the gate confirmation.

**Wait for explicit `done` or `audit` signal from the user.** Do NOT proceed otherwise. Code writing is open-ended — only the user knows when it's truly ready.

## Step 4 — Finish build (`build-started` → `build-finished`)

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "build-finished", lastSkill: "finish-build" })` before invoking the skill.

Invoke `/finish-build`. It will verify registries match code, run incremental cross-boundary audit, commit task code, open the PR to CareGuide stage or to main for every other project, record PR URL, and mark `build-finished` on main.

If `/finish-build` hard-fails (orphan, collision, drift, stale registries), surface the error and stop the workflow. The user will fix and re-invoke.

If `/finish-build` hard-fails on objective criteria (missing success evidence, unmapped criterion, non-goal drift, or triggered stop condition), surface the exact criterion/gap and stop. Do not proceed to review steps until the objective gap is resolved.

If it succeeds, capture the PR URL.

**Gate:** "Build finished. PR opened: {url}. Proceed to review? [yes / fix / abort]"
- `yes`: continue to Step 5 (review PR)
- `fix`: stop the workflow — user will adjust code and re-invoke `/finish-build`
- `abort`: stop

## Step 5 — Review PR (`build-finished` → `pr-reviewed`)

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "review", lastSkill: "review-pr" })` before invoking the skill.

Invoke `/review-pr {N}`. It will analyze the PR against the task spec from `docs/backlog.json` and boundary contracts.

After it completes:
- Surface the review findings to the user
- Identify any CRITICAL or HIGH issues that must be resolved before production

**Gate:** "Claude review complete. {findings summary}. Address issues or proceed to Codex review? [yes proceed / fix / abort]"
- `yes`: Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "pr-reviewed", lastSkill: "review-pr" })`; continue to Step 6 (Codex review)
- `fix`: stop the workflow — user will fix issues on the task branch and re-invoke `/finish-build` or `/ship-task {N}` to resume
- `abort`: stop

## Step 6 — Codex Review (`pr-reviewed` → `review-passed` or `review-blocked`)

Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "codex-review", lastSkill: "codex-review" })` before invoking the skill.

Invoke `/codex-review {N}`. It will run an independent Codex review and compare findings against the Claude review from Step 5.

**Status during Codex review is `pr-reviewed`.** After both reviews complete, the gate below determines the outcome:
- No CRITICAL or HIGH blockers across both reviews → set status to `review-passed` and proceed to Step 7.
- Blocking issues found → set status to `review-blocked` and stop.

In orchestrated multi-session runs, the approval handler may set `codex-reviewed` as an intermediate status; the resumption table holds at `codex-reviewed` until the handler flips to `review-passed` or `review-blocked`.

After it completes:
- Surface the Codex review findings and any disagreements with the Claude review
- Identify any additional issues or confirm the reviews align

**Gate:** "Codex review complete and compared. {findings summary}. Both reviews are now complete. Approve and proceed to production? [yes (no blockers) / fix / abort]"
- `yes`: Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "review-passed", lastSkill: "codex-review" })`; continue to Step 7 (promote to production)
- `fix`: Call `mcp__polaris__SetTaskState({ taskNumber: N, taskState: "review-blocked", lastSkill: "codex-review" })`; stop the workflow — user will fix issues and re-invoke `/finish-build` or `/ship-task {N}` to resume
- `abort`: stop

## Step 7 — Promote to production (`review-passed` or `staged` → `production`)

> **Reached after reviews are complete and approved in Steps 5-6.** Task status is `review-passed` (set at the end of Step 6 after both reviews pass, or by the orchestrator approval handler in multi-session runs). This step invokes the final production gate. There is no `origin/prod` branch; production means reviewed work is on `origin/main`, the main deploy succeeds, and the task is marked `production`.

Invoke `/promote-to-prod`. The orchestrator will send a merge directive to the owning session. The session executes the merge, validates success, and then proceeds with deploy verification. `/promote-to-prod` will choose the correct path:
- CareGuide with real staged work: stage → main, then production deploy from main.
- All other projects: reviewed PRs → main, then production deploy from main.

After prod deploy verification succeeds, `/promote-to-prod` marks included tasks `production` and archives them. There is no separate `/mark-production` step. Do not call `SetTaskState` separately unless `/promote-to-prod` reports that Polaris state did not update; production status belongs to `/promote-to-prod`.

**Gate:** "Production promotion complete. Task #{N} is marked production if it was included in the rollup. Workflow complete."

## Final report

Summarize the full lifecycle:
- Task #{N}: {title}
- Plan: {when saved}
- Branch: {task/N-slug}
- Build PR: {url, merged to CareGuide stage or main}
- Promotion PR(s): {url(s), MERGED to main}
- Status: {production}

Tell the user the task is now in production and the workflow is complete.


## Completion banner (mandatory — always the last thing you output)

`/ship-task` orchestrates sub-skills and stops at a human gate between every step. Each sub-skill prints its own banner; on top of that, end every turn with this orchestrator banner so the user knows which sub-skill just ran, how it ended, and where the workflow stands — without scrolling up:

---
### 🏁 /ship-task — step {n}/7: /<sub-skill> just ran
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome of that sub-skill>
- **Task status:** <current docs/backlog.json status>
- **Next:** <next step/sub-skill, or the gate question you're waiting on>
---

Nothing comes after this banner.
