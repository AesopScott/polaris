---
name: start-build
description: Begin a focused build session. Loads Obsidian project context (Build folder + recent Sessions), syncs main, auto-selects the next ready task from docs/backlog.json (or pass a task number like /start-build 3), and loads code context. Branch is managed by session worktree infrastructure.
---

# /start-build [task-number]

## Backlog Read/Write Isolation Protocol (Task #60)

Do not check out `main` in the shared primary working tree just to read or mutate backlog state.

- For read-only task lookup, run `git fetch origin main` and read `docs/backlog.json` from `origin/main` with `git show origin/main:docs/backlog.json`, or use a disposable worktree from `origin/main`.
- Any step that mutates `docs/backlog.json` or `docs/backlog-archive.json` must create a disposable backlog worktree from fresh `origin/main`, write JSON with Node `fs` using explicit `utf8`, commit only the touched backlog files, `git pull --rebase origin main`, then `git push origin HEAD:main`.
- If push is rejected, fetch/rebase/reapply the exact task-number mutation and retry. Never force-push `main`.
- Remove the disposable worktree after the push succeeds and report the backlog commit SHA.


You are beginning a focused build session. Before any code or git work, you must load the project's mission and recent-session context from Obsidian. Then proceed to the backlog.

## Directive Polling (multi-session only)

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives before proceeding:

1. Read `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`
2. Look for an entry where `target.sessionId` matches this session's ID AND `status === "pending"`
3. If found:
   - Immediately set `status: "acknowledged"` and write `acknowledgedAt: <ISO timestamp>`
   - The directive's `instruction` field contains the full prompt — execute it as if it were a user message
   - After completing the directive, set `status: "completed"`, write `completedAt` and a brief `result`
4. If not found or single-session context: proceed normally with Step 0

> **Note:** If `session-directives.json` doesn't exist or this session has no pending directives, that's normal — continue to Step 0.

---

## Scope and limits

- **One primary task per session.** Starts exactly Task #{N} (the argument, or the auto-selected next ready task). Never auto-picks a second task after the first finishes; never enumerates or works on other tasks in parallel.
  - **Exception: emergency fixes.** An emergency fix may be started as a secondary task inside a session that's already building another task. (See the project's emergency-fix workflow definition.) The skill itself does not detect emergency-fix mode; the user signals it by invoking `/start-build` for the fix's task number from inside the existing session.
- **Cannot promote to `main`.** Production promotion is `/promote-stage` (opens PR) or `/promote-to-prod` (auto-merges and ships). This skill does not ask, offer, or attempt main promotion.
- **Cannot merge to `stage`.** Stage merges are `/finish-build`'s job.
- **No rollups.** Multi-task batching is `/promote-stage`, `/promote-to-prod`, and `/mark-tasks-complete` only.

## Objective-Centric Criteria Contract

`/start-build` must treat the task's `objective` field as the build contract, not as optional planning prose.

Before creating implementation work:
- Load `objective.statement`, `objective.successCriteria`, `objective.nonGoals`, `objective.proofMap`, and `objective.stopConditions` from `docs/backlog.json`.
- Refuse to continue if `objective` is missing, `successCriteria` is empty, or any success criterion lacks a matching `proofMap` entry. Tell the user to run `/plan-task {N}` to create objective criteria.
- Keep implementation scoped to the `successCriteria`; do not add work listed in `nonGoals`.
- If a `stopConditions[]` item is triggered, stop and ask the user instead of guessing.
- Name the active criterion alongside the active proof unit before any code writing begins.

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

## Worktree isolation check (required before any other step)

Before any code, git, or file operations, verify the session is running from a stable, isolated working directory — not from `main` directly (where other sessions may be committing) and not from a Polaris temp session directory (ephemeral, may disappear at session end).

```bash
git branch --show-current   # prints branch name, or empty if detached HEAD
git worktree list           # lists all worktrees: path, HEAD commit, branch
```

Also note the current working directory (`$PWD` in PowerShell, `pwd` in bash).

**Interpret the result and act:**

| Situation | Action |
|---|---|
| Branch matches `task/{N}-*` | ✅ **Proceed** — already on an isolated task branch. |
| Branch is `main`, CWD is inside the project source tree (`C:\Users\scott\Code\{ProjectName}`) | ✅ **Proceed** — main-branch reads/writes are expected here; task code goes on the branch created in Step 5. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir (path contains `AppData\Local\Temp\polaris-wt`), AND `git worktree list` shows a `[main]` entry in the project source tree | ✅ **Proceed** — standard Polaris chat session (Case A in Step 2). Note the primary `[main]` worktree path for use in Step 2 and Step 5. |
| Branch is `main` or detached HEAD, CWD is a Polaris temp session dir, AND no `[main]` primary worktree exists in the source tree | ⚠️ **Create an isolated worktree** before continuing (see below). |

**Creating an isolated worktree when required:**

1. Confirm the project source path exists: `ls "C:\Users\scott\Code\{ProjectName}"`.
2. Create a timestamped branch and worktree:
   ```bash
   STAMP=$(date +%Y%m%d-%H%M%S)
   BRANCH="wt/session-${STAMP}"
   DEST="C:/Users/scott/Code/{ProjectName}/worktrees/${STAMP}"
   git -C "C:/Users/scott/Code/{ProjectName}" worktree add "$DEST" -b "$BRANCH" origin/main
   ```
3. Announce: "Session was in a Polaris temp directory without a primary worktree. Created isolated worktree at `{path}` on `{branch}`. All remaining steps will use that location."
4. Use `$DEST` as the effective working directory for all git and file operations in subsequent steps.

If creation fails (path collision, disk space, network error), stop immediately — do not proceed from a temp directory.

---

## Step 1 — Load project context from Obsidian

This step is **required** before touching anything else. Skipping it produces sessions that don't understand the project's mission or where things stand.

1. Determine the project's Obsidian name:
   - Capture the CWD basename (the folder name of the current working directory).
   - List the vault root using the **OBSIDIAN ACCESS PROTOCOL** (filesystem first, then REST API, then MCP).
   - Find all top-level folders matching `*_Build/`.
   - For each candidate, strip the `_Build` suffix and compare to the CWD basename — case-insensitive, ignoring non-alphanumeric characters. (Example: CWD `careguide` matches `CareGuide_Build/`.)
   - Pick the single match. If multiple candidates match equally, ask the user which to use.
   - If no candidate matches, warn the user that no Obsidian context was found for this project and skip to Step 2 — don't block.

2. List both folders using the **OBSIDIAN ACCESS PROTOCOL**:
   ```
   List {ProjectName}_Build/
   List {ProjectName}_Sessions/
   ```
   The Sessions folder may not exist; that's fine.

3. Read in full any of these that exist in `{ProjectName}_Build/` using the **OBSIDIAN ACCESS PROTOCOL**:
   - `Project Overview.md`
   - `Soul.md`
   - `Architecture.md`
   - `Build Plan.md`
   - Any feature contracts (root files or `*/Contracts/` subfolders)

4. Read the 1–3 most recent notes from `{ProjectName}_Sessions/` if any exist using the **OBSIDIAN ACCESS PROTOCOL**. Sort by filename — newest first.

5. Output a structured context summary to the user, with every line filled — don't skip any:

   - **Project**: one-line mission (from `Project Overview.md` or `Soul.md`) — who it serves, what it does
   - **Stack**: tech stack and primary components (from `Architecture.md`) — frontend, backend, data store, key infra
   - **Phase**: where the build currently stands (from `Build Plan.md` and the most recent Sessions notes) — what's done, what's in progress
   - **Conventions**: project-specific patterns you noticed that affect how to build (e.g., registries used, naming style, auth model)
   - **Notable for this task**: anything in the loaded context that directly affects this task — related work, decisions to honor, gotchas
   - **Files read**: list every `{Project}_Build/*.md` and `{Project}_Sessions/*.md` you actually loaded

   Aim for 6–10 lines of real content. If a line would be empty (e.g. no Sessions notes exist yet), write "(none yet)" rather than skipping it. A thin one-line tagline summary means you didn't actually load the context — go back and read the files.

## Step 2 — Sync main and read the backlog

**Backlog reads that may lead to writes must use the Backlog Read/Write Isolation Protocol above.**

```bash
git worktree list
```

Interpret the output to determine your context:

**Case A — You are in a Polaris session worktree (current CWD shows as `detached HEAD` or similar, and a separate primary worktree shows `[main]`).**
Checking out `main` inside a linked worktree fails — `main` is already checked out in the primary worktree. Use the primary worktree for all main-branch operations instead:
1. Note the primary worktree path (the line marked `[main]`). Save it as `$PRIMARY`.
2. `cd $PRIMARY` and treat all operations in Step 2 through Step 5 as happening there.
3. You will switch back to the session worktree in Step 6 to create the task branch.

**Case B — A worktree pinned to `main` exists at a known path other than the current working directory (you are already on a task branch in the primary repo).**
Change to that working directory and treat all subsequent steps in this section as happening there.

**Case C — No separate main worktree exists; you are in the primary repo.**
In the current working directory:
```bash
git status                       # working tree must be clean — if uncommitted changes, stop and tell the user to commit or stash first
# Do not run git checkout main here; read origin/main or create the disposable backlog worktree from the protocol above.
git branch --show-current        # MUST print exactly "main"
```

If the verification doesn't print exactly `main`, stop and surface the error — do not proceed.

Read `docs/backlog.json` from the project root. If it doesn't exist, stop and tell the user: "This project has no `docs/backlog.json`. Create one or invoke /plan-task to start one."

Schema:
```json
{
  "tasks": [
    {
      "number": 1,
      "title": "...",
      "category": "...",
      "priority": 1,
      "status": "backlog" | "planned" | "build-started" | "build-finished" | "pr-reviewed" | "staged" | "production" | "complete",
      "dependencies": [<task numbers>],
      "description": "...",
      "plan": "..." | null,
      "branch": "..." | null,
      "pr_url": "..." | null
    }
  ]
}
```

## Step 3 — Select the task

If a task number was provided as `$ARGUMENTS`, find that task by `number`.

Otherwise pick the first task with `status: "planned"`, sorted by `priority` ascending. Tiebreaker: lowest `number`.

If no ready task exists, tell the user and stop.

## Step 3a — State guard (lifecycle order check)

Read the selected task's `status`. The skill's allowed action depends on it:

| Current status | Allowed action |
|---|---|
| `planned` | ✅ Proceed — standard new-build path. |
| `build-started` | ✅ Resume the existing branch (Case B in Step 6). The task branch already exists; this is a continuation, not a fresh start. Continue to Step 4. |
| `backlog` | ❌ **Refuse.** "Task #{N} has no plan. Run `/plan-task {N}` first to plan it." Stop. |
| `build-finished` | ❌ **Refuse.** "Task #{N}'s build is finished (PR at `{pr_url}`). Re-starting would create a duplicate branch/PR. If you need more work, open a new task or wait for review feedback." Stop. |
| `pr-reviewed` / `staged` / `production` / `complete` | ❌ **Refuse.** "Task #{N} is {status}. Create a new task for additional work." Stop. |

Do NOT skip this check.

## Step 4 — Check dependencies

If the task has `dependencies`, look up each one in the backlog and confirm it's in a status that means its outcome can be relied upon. Dependencies come in two flavours — both belong in the same `dependencies` array, but they have different tolerance for "almost-done" statuses:

- **Build deps**: this task's code references that task's code (e.g., a Firestore→Supabase sync task that imports the schema task's table definitions).
- **Test deps**: this task's smoke test requires that task's feature to work, even though the code itself doesn't import anything from it (e.g., a Manage Family Members UI on `client.html` needs a "dashboard→client navigation works" task done before the UI can even be reached for testing).

The plan body (written by `/plan-task` Step 7) should label which deps are which. If it doesn't, ask the user before proceeding — guessing wrong here means shipping a task whose smoke test silently can't run.

### Acceptance rules per dep status

| Dep status | Build dep | Test dep |
|---|---|---|
| `production` / `complete` | ✅ Proceed | ✅ Proceed |
| `staged` | ⚠️ Proceed with warning — code is on stage, will ship together via the next rollup. Note in the build session that this task can't be promoted to prod until the dep also reaches `production`/`complete`. | ❌ **Stop.** The dep's feature exists on stage but hasn't been promoted to prod yet — so this task's production smoke test would be blocked. Tell the user to promote the dep first or wait for the next promotion. |
| `build-finished` / `pr-reviewed` | ⚠️ Proceed with warning (for build dep) or stop (for test dep) — same as `staged` logic. | ❌ **Stop.** Dep's review is in progress. |
| `build-started` | ❌ **Stop.** Dep is being built; its API or schema may still change. | ❌ **Stop.** |
| `planned` / `backlog` | ❌ **Stop.** Dep is planned/not planned but not built. | ❌ **Stop.** |

When stopping, name each blocking dep with its number, title, current status, and which kind of dep it is for this task. Don't just say "dep #17 is blocking" — say "dep #17 (Fix dashboard click bug) is `backlog` and is a **test dep** for this task; without it, the Manage Family Members tab can't be reached to smoke-test."

## Step 5 — Derive the branch name

Generate the branch name: `task/{number}-{slug}` where slug = title lowercased, non-alphanumeric → hyphens, collapsed, trimmed, max 40 chars.

> **Note:** Do not write to `docs/backlog.json` here. The orchestrator sets `status: build-started` and `branch` in `docs/backlog.json` after this skill completes. Output the branch name clearly so the orchestrator can record it:
>
> `Branch: task/{number}-{slug}`

## Step 6 — Load code context

Read in full if they exist:
- `docs/registries/collections.md`
- `docs/registries/endpoints.md`
- `docs/registries/claims.md`
- Any `docs/contracts/*.md` files relevant to the task

The task's `description` and `plan` fields are already in your context from Step 2.

## Step 7 — Objective and proof-entry gate (required before any code)

Before summarizing or writing any code, verify the task's proof prerequisites exist:

**Check 0 — objective criteria in backlog.json**
Read the task's `objective` field from `docs/backlog.json`.
- If `objective` is missing: **STOP.** Tell the user: "Task #{N} has no objective criteria. Run `/plan-task {N}` to define the objective before building." Do not proceed.
- If `objective.statement` is empty or `objective.successCriteria` is missing/empty: **STOP.** Ask the user to re-run `/plan-task {N}` or manually add objective criteria.
- If any `successCriteria[]` item lacks a corresponding `proofMap[]` entry: **STOP.** Tell the user which criterion is unmapped and ask them to re-plan.
- If any `stopConditions[]` item is already true (missing credentials, blocked dependency, unreachable environment, unresolved ambiguity): **STOP** and surface the exact stop condition.
- If present and valid: continue.

**Check 1 — proofUnits in backlog.json**
Read the task's `proofUnits` field from `docs/backlog.json`.
- If `proofUnits` is missing or empty: **STOP.** Tell the user: "Task #{N} has no proof units. Run `/plan-task {N}` to define them before building." Do not proceed.
- If `proofUnits` is present and non-empty: continue.

**Check 2 — Written plan in Obsidian**
Using the **OBSIDIAN ACCESS PROTOCOL**, check whether the task file `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md` exists.
- If the file does not exist: **STOP.** Tell the user: "No Obsidian task file found for Task #{N}. Run `/plan-task {N}` to create the written plan before building." Do not proceed.
- If the file exists: continue.

**On both checks passing**, name the first proof unit to the user:

> **Proof Unit 1/{total}: {unit.title}**
> - Active objective criterion: {criterion from objective.proofMap where proofUnit = 1}
> - Expected behavior: {unit.expectedBehavior}
> - Proof command: `{unit.exactCommand}`
> - Expected initial failure: {unit.expectedInitialFailure}
> - To start: run the proof command and confirm it fails (entry evidence), or document a waiver if automated proof is impossible.

Then summarize to the user:
1. Project mission (one line — from the Obsidian context in Step 1)
2. Task number, title, description
3. Task branch (session worktree isolated, ready for code)
4. Dependencies and their status
5. Objective statement, success criteria, non-goals, and first proof unit (named above)

Ask the user to confirm before writing any code: "Task #{N} is ready. Start coding against the proof units and objective criteria. When done, run `/cross-boundary-audit` then `/finish-build`. [yes/abort]"

## Step 8 — Log Build Started to Obsidian

After the user confirms in Step 7, append a "Build Started" record to the task's Obsidian tracker.

1. Reuse the Obsidian project name from Step 1 as `{ProjectObsidian}`. If Step 1 found no Obsidian match, skip this whole step.

2. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md` (use the slug from the branch you just created/resumed).

3. **Ensure the file exists with a header.** Try to get the file using the **OBSIDIAN ACCESS PROTOCOL**. If it doesn't exist, create the file by appending an initial header using the **OBSIDIAN ACCESS PROTOCOL**:

   ```
   # Task #{N} — {title}

   **Category:** {category}   **Priority:** {priority}   **Dependencies:** {deps list or "none"}
   **Branch:** task/{N}-{slug}   **PR:** (none yet)   **Status (initial):** {previous status, usually "planned"}

   ## Description

   {description}
   ```

4. **Append the Build Started section** using the **OBSIDIAN ACCESS PROTOCOL**:

   ```
   ---

   ## Build Started — {ISO 8601 UTC timestamp} (by /start-build)

   **Session:** Task #{N} — isolated worktree, ready for code

   **Code context loaded:**
   - {list of registries/contracts files read in Step 6}

   **Intended first step:** Proof Unit 1 — {unit.title}

   **Objective criterion in progress:** {criterion mapped to Proof Unit 1}
   **Non-goals to avoid:** {objective.nonGoals or "none"}

   **Status flip:** planned → build-started
   ```

5. Tell the user: "Build start logged to `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`."

## Step 9 — Before invoking `/finish-build`

When you've finished writing code for this task, run **`/cross-boundary-audit`** on the task branch **before** `/finish-build`. This is required, not optional.

1. The audit regenerates `docs/registries/*.md` from the current code state. Any new producers, consumers, collections, endpoints, or claims you introduced should now appear in the registries, and any you removed should drop out.
2. Review the registry diff (`git diff -- docs/registries/`). Verify new identifiers are documented correctly, producers and consumers are paired, no orphans appeared.
3. If the audit surfaces a problem (orphan producer/consumer, naming drift, missing rule annotation), **fix it now on the task branch** — don't ship a known-broken state to stage.
4. Commit the registry updates as part of your task commit, or as a separate `docs(registries): refresh for task #{N}` commit on the same branch.
5. Then invoke `/finish-build`. Its Step 3 incremental audit will verify against your fresh registries rather than re-derive them, and your PR body will include the audit summary that reviewers can trust.


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /start-build complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
