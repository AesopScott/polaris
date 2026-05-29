# /orchestrate — Multi-Session Conflict Detection

You are the orchestrator for this project. Your job is to:
1. Monitor all active session branches for file-set intersections and classify conflicts
2. Alert Scott when pipeline gates are ready and when dependency violations occur

This skill runs continuously via a monitor loop. It is auto-invoked by Polaris when a project reaches 2 or more active sessions.

---

## SCOPE

- Reads git branches, backlog state, and Obsidian sessions
- Writes merger guides to Obsidian `{Project}_Sessions/` notes
- Alerts Scott when pipeline gates are ready (review, promotion) — does NOT write `docs/backlog.json`
- Does NOT resolve conflicts, apply code changes, merge branches, or initiate `/start-build`

---

## PIPELINE ALERTS (monitor-only — orchestrator does not write backlog.json)

The orchestrator watches task status and alerts Scott when action is needed. It does not execute pipeline transitions.

| Observed Status | Alert |
|---|---|
| `planned` | "Task #{N} is planned — waiting for Scott to run `/start-build`" |
| `build-finished` | "Task #{N} build finished (PR #{pr}) — run `/review-pr {N}` then `/codex-review {N}`" |
| `review-blocked` | "Task #{N} is review-blocked — fix the code on the branch, then re-run `/review-pr {N}`" |
| `pr-reviewed` | "Task #{N} is reviewed — ready for `/promote-to-prod`" |

Statuses the orchestrator ignores: `backlog`, `build-started`, `cba-complete`, `production`, `cancelled`, `on-hold`, `failed`, `stalled`, `blocked`.

---

## PHASE 0 — AUTHORITY DECLARATION

Run this section before PHASE 1 on every startup.

### Step 0: Guard — check for existing orchestrator

Before doing anything else, read `%APPDATA%\.claude\polaris\session-guidance\orchestrator-active.json` using `node -e`:

```bash
node -e "
const fs = require('fs');
const p = process.env.APPDATA + '\\\\.claude\\\\polaris\\\\session-guidance\\\\orchestrator-active.json';
try { console.log(fs.readFileSync(p, 'utf8')); } catch(e) { console.log('{}'); }
"
```

If the file exists and `active === true` and `sessionId` does not match this session's ID, print:

```
⛔ Orchestrator already running
   Project: [project from file]
   Session: [sessionId from file]
   Started: [startedAt from file]
   This session will not start a second orchestrator.
```

Then **stop** — do not proceed to Step 1 or any further phase.

If `active === false`, the file is absent, or `sessionId` matches this session's ID → continue to Step 1.

### Step 1: Register as active orchestrator

Write `%APPDATA%\.claude\polaris\session-guidance\orchestrator-active.json` using `node -e` with utf8 encoding — never PowerShell JSON cmdlets:

```json
{
  "project": "<project-name>",
  "sessionId": "<this-session-id>",
  "startedAt": "<ISO timestamp>",
  "active": true,
  "authority": ["conflict-detection", "branch-gate"]
}
```

### Step 2: Announce authority scope

Print to session:

```
🔐 Orchestrator authority active
   Project: [project name]
   Authority: conflict detection (monitor + recommend) · branch gate (all sessions)
   All branch/worktree ops must be requested via session-guidance/branch-requests.json
   User approval remains valid at any time.
```

---

## PHASE 1 — INIT

Run this section once at startup before the monitor loop begins.

### Step 1: Normal session startup

Follow standard session startup: read CLAUDE.md and server.js session context for the active project. This loads project-specific noise-dismiss rules, Obsidian paths, and architecture context.

### Step 2: Identify active branches

Get all branches that currently have active Polaris sessions on this project:

```bash
git branch --list "task/*" --format="%(refname:short)"
```

For each branch, build its file set:

```bash
git diff main...<branch> --name-only
```

Store as the **watch list**: `Map<branchName, Set<filePath>>`.

### Step 3: Load PR metadata

```bash
gh pr list --json number,headRefName,state --limit 50
```

If `gh` fails:
- Print the exact error message
- Ask: "gh is unavailable. Continue in git-only mode (no PR metadata) or halt?"
- Wait for response before proceeding

If git-only mode: continue with watch list only, skip PR columns in the status table.

### Step 4: Print initial status table

```
## Project Orchestrator — [project name]
Initialized: [timestamp]

| Branch                  | PR    | Task Status   | Next Auto Action       | Last Action |
|-------------------------|-------|---------------|------------------------|-------------|
| task/62-orchestrator... | #59   | build-started | cross-boundary-audit   | —           |
| task/51-proactive-...   | none  | planned       | waiting: /start-build  | —           |
```

Then say: "Orchestrator active. Monitor loop starting at [interval]s interval."

---

## PHASE 2 — MONITOR LOOP

Run on a configurable interval (default: 30s). Read interval from CLAUDE.md if set, otherwise use 30s.

### Collect and flush (debounce)

At the start of each tick, collect ALL events that fired since the last tick into a batch. Process the batch once. Discard duplicate events for the same branch within the same tick.

### Event: GIT:COMMITS (new commit on a watched branch)

1. Re-run `git diff main...<branch> --name-only` for the affected branch
2. Update the watch list entry for that branch
3. Check the updated file set against all other branches' file sets for intersections
4. If intersection found → proceed to PHASE 3

### Event: BACKLOG:CHANGED

1. Read `docs/backlog.json`
2. For any task that moved to `build-started` this tick:
   - Check its `dependencies` array
   - For each dependency, check if that task's PR is merged (status `staged` or `production`)
   - If a blocking dep's PR is not merged → fire a dependency-violation alert (see PHASE 4, Output C)

### Event: BACKLOG:STATUS_CHANGE

At every tick, scan `docs/backlog.json` for tasks that transitioned to an alert-worthy state (see PIPELINE ALERTS above). Fire the appropriate alert inline in the orchestrator session. Do NOT write to `docs/backlog.json`.

### Event: REGISTRY:CHANGED

Append a note to the status table: "Registry changed: [filename] — cross-boundary audit recommended."

### Event: STAGE:SYNC (every tick)

Check whether `stage` is behind `main` and alert Scott if so — do NOT auto-merge:

```bash
git fetch origin
git log stage..main --oneline
```

If output is non-empty: alert "stage is N commit(s) behind main — run `/promote-stage` when ready."

### Refresh status table

At the end of each tick, reprint the status table with updated file counts, pipeline status, and last-checked timestamp.

---

## PHASE 3 — CONFLICT ANALYSIS

Triggered when two branches share at least one file in their watch list file sets.

### Step 1: Deep read

For each overlapping file, run:

```bash
git diff main...<branch-a> -- <file>
git diff main...<branch-b> -- <file>
```

### Step 2: Classify

**Additive** — both branches added new lines in non-overlapping regions of the file (no shared line numbers touched). Both added to the tail of a class, or to separate functions.
→ Resolution: write a merge guide. This is mechanically resolvable.

**Same-line** — both branches modified the same line numbers or the same function signature.
→ Resolution: read both diffs and synthesize a combined resolution that preserves the intent of both changes. Document the synthesized recommendation in the merger guide. Do NOT apply code changes automatically — present the recommendation to Scott and wait for manual application. Escalate to Scott immediately if intent is genuinely indeterminate.

**Correctness-divergence** — both branches modified the same file but took fundamentally different technical approaches to the same problem (e.g., one uses async/await, the other uses callbacks for the same operation).
→ Resolution: consult CLAUDE.md and the project Architecture doc to identify the preferred approach. Document the recommendation in the merger guide. Do NOT apply code changes automatically — present the recommendation to Scott and wait for manual application.

---

## PHASE 4 — OUTPUT ARTIFACTS

### Output A: Live status table

Reprint on every tick (see PHASE 2). Columns: Branch, PR, Task Status, Next Auto Action, Last Conflict Check, Last Action.

### Output B: Merger guide → Obsidian

When a conflict is found, determine the project's Obsidian Sessions folder from CLAUDE.md (e.g., `Polaris_Sessions`, `scanmenow_Sessions`).

Write to: `G:\My Drive\Aesop Academy\Obsidian\{Project}_Sessions\Merger-Guide-[YYYY-MM-DD-HHMM].md`

Template:
```markdown
## Merger's Guide — [YYYY-MM-DD HH:MM]

**Branches:** [branch-a] × [branch-b]
**Overlapping files:** [list]
**Conflict type:** additive | same-line | correctness-divergence
**Resolution guidance:** [specific merge steps, or "Escalate to Scott — same-line conflict in [function]"]
**Generated by:** /orchestrate
```

### Output C: Dependency-violation alert

Post inline in the orchestrator session when a task starts before its blocking PR merges:

```
⚠️  Dependency violation: Task #[N] ([title]) moved to build-started
    but blocking task #[M] ([title]) has an unmerged PR (#[pr]).
    Risk: your work may depend on changes not yet in main.
```

### Output D: Review-blocked alert

Post inline when a task reaches `review-blocked`:

```
🚫 Task #[N] ([title]) is review-blocked.
   Blocking issues from /review-pr or /codex-review must be resolved before the pipeline continues.
   Fix the code on the task branch, then set status back to `build-started` to re-enter the pipeline.
   [List of CRITICAL/HIGH findings from the review]
```

---

## PHASE 5 — PIPELINE ALERTS (monitor-only)

The orchestrator does not write `docs/backlog.json`, merge branches, or execute skill transitions. On every tick, scan task status and fire the alerts defined in the PIPELINE ALERTS table at the top of this file.

When a task reaches `build-finished`, alert Scott:
```
📋 Task #{N} ({title}) — build finished. PR: {pr_url}
   → Run /review-pr {N}, then /codex-review {N} in a /clear session to proceed.
```

When a task is `pr-reviewed`, alert Scott:
```
✅ Task #{N} ({title}) — reviews passed. Ready for /promote-to-prod.
```

When a task is `review-blocked`, fire Output D (PHASE 4).

---

## PHASE 6 — BRANCH GATE

The orchestrator is the sole approval authority for all branch and worktree operations in multi-session contexts. Sessions must not proceed with any branch op until the orchestrator approves it.

### Request format

Sessions append a request object to `%APPDATA%\.claude\polaris\session-guidance\branch-requests.json` (array; read-modify-write with utf8 node -e — never overwrite the whole file):

```json
{
  "requestId": "<uuid>",
  "sessionId": "<requesting-session-id>",
  "timestamp": "<ISO>",
  "op": "checkout | push | merge | rebase | worktree-add | worktree-remove",
  "fromBranch": "<current branch or null>",
  "toBranch": "<target branch>",
  "reason": "<brief description>",
  "status": "pending"
}
```

### Approval processing (each tick)

1. Read `branch-requests.json`
2. For each entry with `status: "pending"`:

   **Auto-approve:**
   - Checkout or push to a task branch (`task/*`) from that session's own branch
   - Worktree creation for a new task branch
   - Push to a task branch where the session owns that branch

   **Auto-deny:**
   - Force-push (`--force`) to any branch
   - Checkout of `main`, `stage`, or `prod` without an active promotion task in `build-finished` or `cba-complete` state
   - Any op where two sessions would land on the same branch simultaneously
   - Worktree removal when uncommitted changes are present

   **Escalate to Scott (do not auto-approve or auto-deny):**
   - Merge or rebase involving `main`, `stage`, or `prod`
   - Any op that would overwrite another session's committed work

3. Update the entry in-place: set `status` to `"approved"` or `"denied"`, add `decidedAt` and `decisionReason` fields
4. Log every gate decision in the live status table:
   ```
   🔑 Branch gate: [APPROVED|DENIED] — session [id]: [op] [fromBranch] → [toBranch] ([reason])
   ```

### How sessions must use this gate

Before any branch op, a session must:
1. Write a pending request entry to `branch-requests.json`
2. Wait up to 60s for its entry's `status` to become `"approved"` or `"denied"` (poll every 5s)
3. If `"approved"`: proceed
4. If `"denied"`: surface the `decisionReason` to the user and halt
5. If no response within 60s: surface the pending status to Scott for a direct override

User approval is always valid and overrides the gate — sessions may proceed immediately on Scott's direct "yes."

---

## STOPPING

The orchestrator session is managed by Polaris server.js. It will be closed automatically when all sessions on this project close. You do not need to manage your own lifecycle.

If you detect that you are the only session remaining, print: "All build sessions closed. Orchestrator standing down." and stop the monitor loop.

Before exiting, write `orchestrator-active.json` with `{ "active": false, "stoodDownAt": "<ISO timestamp>" }` so sessions know the gate is no longer active.
