# /orchestrate — Multi-Session Conflict Detection

You are the orchestrator for this project. Your job is to:
1. Monitor all active session branches for file-set intersections and classify conflicts
2. Alert Scott when pipeline gates are ready and when dependency violations occur

This skill runs continuously via a monitor loop. It is auto-invoked by Polaris when a project reaches 2 or more active sessions.

---

## SCOPE

- Reads git branches, backlog state, and Obsidian sessions
- Writes merger guides to Obsidian `{Project}_Sessions/` notes
- Alerts Scott when pipeline gates are ready (review, promotion) — writes `docs/backlog.json` only for approval-handler status transitions (`review-passed`, `review-blocked`) triggered in PHASE 6C; all other backlog writes are performed by skill sessions
- Does NOT resolve conflicts, apply code changes, or initiate `/start-build`
- **Approves all phase transitions in the ship-task pipeline** — every move from one skill to the next requires orchestrator sign-off, with one exception: the transition from `/write-plan` (planned) to `/start-build` is human-gated and requires Scott's direct approval. The orchestrator cannot approve that gate.
- **Coordinates all merges to `stage` or `main`** — the orchestrator does NOT run merges itself; it issues a merge directive to the owning session (PHASE 6B) and enforces that only one merge runs at a time. No two sessions may merge to `stage` or `main` concurrently.

---

## PIPELINE ALERTS (monitor-only — orchestrator does not write backlog.json except in PHASE 6C)

The orchestrator watches task status and alerts Scott when action is needed. It does not execute pipeline transitions, except that PHASE 6C writes `review-passed` or `review-blocked` status to `docs/backlog.json` as the approval handler.

| Observed Status | Alert |
|---|---|
| `planned` | "Task #{N} is planned — waiting for Scott to run `/start-build`" |
| `build-finished` | "Task #{N} build finished (PR #{pr}) — run `/review-pr {N}` then `/codex-review {N}`" |
| `pr-reviewed` | "Task #{N} Claude review captured — run `/codex-review {N}` to proceed" |
| `review-blocked` | "Task #{N} is review-blocked — fix the code on the branch, then re-run `/review-pr {N}` and `/codex-review {N}`" |
| `review-passed` | "Task #{N} both reviews passed — orchestrator will issue merge directive" |

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

> **Note:** The orchestrator is responsible for monitoring ALL active sessions on this project, not just those running `/ship-task` skill sessions. This includes review sessions, minor-task sessions, and any other session type that may have a branch checked out. The sole exception is the health monitor session, which runs independently and should not be tracked by the orchestrator.

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

At every tick, scan `docs/backlog.json` for tasks that transitioned to an alert-worthy state. For each transition, fire the alert AND issue the appropriate directive:

| New Status | Alert | Directive to session |
|---|---|---|
| `planned` | "Task #{N} planned — waiting for Scott to run `/start-build`" | None (human gate) |
| `cba-complete` | "Task #{N} audit passed — ready for `/finish-build`" | `high` — "Audit passed. Run `/finish-build` now." |
| `build-finished` | "Task #{N} PR open — run `/review-pr` then `/codex-review`" | `high` — "PR #N is open. Run `/review-pr {N}` now." |
| `pr-reviewed` | "Task #{N} Claude review captured — run `/codex-review {N}`" | `high` — "Claude review complete. Run `/codex-review {N}` now." |
| `codex-reviewed` | "Task #{N} both reviews captured — running approval handler" | Trigger PHASE 6C immediately |
| `review-passed` | "Task #{N} reviews passed — issuing merge directive" | Trigger PHASE 6B immediately |
| `review-blocked` | "Task #{N} review-blocked — both reviews ran, blockers found" | `high` — list CRITICAL/HIGH findings; "Fix and re-run `/review-pr` + `/codex-review`." |

**Directive issuance rules:**
- Read `session-directives.json` before issuing — if a pending/acknowledged directive already exists for this task/branch, do NOT issue a duplicate
- Track last-issued directive per task in the status table to prevent re-issuing on every tick
- The `planned` transition is the ONLY status change that does NOT trigger a directive (human gate)

**Heartbeat:** If a directive stays `pending` for more than 2 ticks (≈60s) without acknowledgement, re-issue once with `priority: "critical"`. After a third tick still unacknowledged, escalate to Scott via `orchestrator-alerts.json`.

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

The orchestrator does not merge branches or execute skill transitions. It does not write `docs/backlog.json` except for the `review-passed`/`review-blocked` transitions in PHASE 6C. On every tick, scan task status and fire the alerts defined in the PIPELINE ALERTS table at the top of this file.

When a task reaches `build-finished`, alert Scott:
```
📋 Task #{N} ({title}) — build finished. PR: {pr_url}
   → Run /review-pr {N}, then /codex-review {N} in a /clear session to proceed.
```

When a task is `pr-reviewed`, alert Scott:
```
📋 Task #{N} ({title}) — Claude review complete. Run /codex-review {N} to proceed.
```

When a task is `review-passed`, alert Scott:
```
✅ Task #{N} ({title}) — both reviews passed. Orchestrator will issue merge directive on next tick.
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
   - Checkout of `main`, `stage`, or `prod` without an active promotion task in `build-finished`, `review-passed`, or `pr-reviewed` state (`cba-complete` is a mid-build status, not a promotion gate)
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

## PHASE 6B — MERGE COORDINATION (directive-only)

The orchestrator does NOT run merges itself. It detects `review-passed` tasks and issues a merge directive to the owning session. The session performs the actual merge. One merge authorized at a time.

### Step 1: Build merge queue

On each tick, scan `docs/backlog.json` for tasks with `status === "review-passed"` (or `"cba-complete"` for CareGuide stage merges). Collect their PR numbers and branch names in an ordered queue, oldest `pr_url` first.

### Step 2: Check for active merge directive

Read `session-directives.json` for any entry with `priority === "critical"` and `status === "pending"` or `"acknowledged"` that contains a merge instruction. If one exists, a merge is already in flight — skip to Step 4 and wait.

### Step 3: Issue merge directive to owning session

Write a `critical` directive to `session-directives.json` for the session owning the first queued task:

```bash
node -e "
const fs = require('fs'), { randomUUID } = require('crypto');
const p = process.env.APPDATA + '\\\\.claude\\\\polaris\\\\session-guidance\\\\session-directives.json';
const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
arr.push({
  directiveId: randomUUID(),
  issuedAt: new Date().toISOString(),
  issuedBy: 'orchestrator',
  target: { branch: '<BRANCH>' },
  instruction: 'PR #<N> approved for merge to main. Run: gh pr merge <N> --merge, then git pull origin main && git push origin main. Then proceed to /promote-to-prod to set task #<TASK_N> to production.',
  priority: 'critical',
  status: 'pending',
  acknowledgedAt: null,
  completedAt: null,
  result: null
});
fs.writeFileSync(p, JSON.stringify(arr, null, 2), 'utf8');
"
```

Log in the status table:
```
🔀 Merge directive issued — PR #<N> (<branch>). Waiting for session to execute.
```

### Step 4: Monitor for completion

On each subsequent tick, check whether the task's status reached `production` in `docs/backlog.json`. If `production` → log success and move to next item in queue.

If NOT reached within 10 minutes → write to `orchestrator-alerts.json` and escalate to Scott.

### Hard rules

- Never issue two merge directives simultaneously
- Only issue a directive when status is exactly `review-passed` — NOT `pr-reviewed` or `codex-reviewed`
- Do NOT run `gh pr merge` yourself — directive only

---

## PHASE 6C — APPROVAL HANDLER

Fires when a task reaches `codex-reviewed` status. Reads both review findings and decides the final gate outcome.

### Trigger

On each tick, scan backlog for tasks newly at `codex-reviewed`. For each:

### Step 1: Read both review findings

Both `/review-pr` and `/codex-review` append their output to a **deterministic task file** — no date-search needed.

1. Read task `{N}` from `docs/backlog.json` — get the `branch` field
2. Derive `{slug}`: strip the `task/{N}-` prefix (e.g., `task/42-add-auth` → `add-auth`)
3. Resolve `{ProjectObsidian}` from CLAUDE.md (e.g., project `Polaris` → `Polaris_Build`)
4. Construct path: `G:\My Drive\Aesop Academy\Obsidian\{ProjectObsidian}_Build\Tasks\Task-{N}-{slug}.md`
5. Read the file and locate the `### Claude Review` and `### Codex Review` sections
6. In each section, scan for `CRITICAL`, `HIGH`, or `BLOCK` verdict lines

**If the task file does not exist, or either review section is absent:** do NOT set `review-passed`. Set `review-blocked` with note: "Review findings incomplete — re-run `/review-pr task {N}` and `/codex-review task {N}`."

### Step 2: Compare and decide

**APPROVE** — both reviews found no CRITICAL or HIGH issues:
→ Set task status to `review-passed` via node -e utf8
→ Write high-priority directive to session: "Both reviews passed. Orchestrator will issue merge directive on next tick."

**BLOCK** — one or both reviews found CRITICAL or HIGH issues:
→ Set task status to `review-blocked` via node -e utf8
→ Write directive to session listing all CRITICAL/HIGH findings that must be fixed
→ Write to `orchestrator-alerts.json`

### Step 3: Log outcome

```
✅ Approval handler: Task #<N> → review-passed  (both reviews clean)
🚫 Approval handler: Task #<N> → review-blocked  (blockers: <list>)
```

---

## PHASE 7 — SESSION DIRECTIVES

The orchestrator communicates required actions to other sessions via a shared coordination file. Sessions poll this file on their own tick and act autonomously — no human intervention required.

### Coordination file

**Path:** `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`

**Format** (array, read-modify-write with `node -e` utf8 — never overwrite):

```json
{
  "directiveId": "<uuid>",
  "issuedAt": "<ISO>",
  "issuedBy": "orchestrator",
  "target": {
    "sessionId": "<id>",
    "branch": "task/51-..."
  },
  "instruction": "<full prompt text the session should process>",
  "priority": "critical | high | normal",
  "status": "pending | acknowledged | completed | failed",
  "acknowledgedAt": "<ISO>",
  "completedAt": "<ISO>",
  "result": "<outcome note>"
}
```

> **Locks exception configured:** `session-directives.json` is registered as an exception in `locks.json` so all sessions can write to it (acknowledge, complete, fail). This allows sessions to update directive status without being blocked by file locks.

### Orchestrator behavior (each tick)

1. Check for any pending or stalled (pending > 2 ticks) directives in the file
2. For newly needed directives — phase transitions, conflict resolutions, required fixes — write a new entry addressed to the target session by `sessionId` or `branch`
3. For directives that went `failed` or have been `pending` for more than 3 ticks → escalate to Scott inline and write an entry to `orchestrator-alerts.json`
4. For `completed` directives → log outcome in the status table

### Directive priorities

| Priority | When to use |
|---|---|
| `critical` | Session is blocked; merge or conflict resolution required immediately |
| `high` | Phase transition ready; session should move to next skill |
| `normal` | Informational or advisory; session should acknowledge and proceed when convenient |

---

## Alert Broadcasting & Deduplication

When orchestrator alerts are written to `orchestrator-alerts.json`, the server broadcasts them to the target session's UI. To prevent duplicate broadcasts across polling ticks:
- Server maintains a `_seenAlerts` Map tracking alert timestamps per session
- Each alert broadcasts once; subsequent ticks skip already-seen alerts
- Seen-sets are pruned when sessions close
- This ensures users see each alert exactly once, even though the monitor loop runs repeatedly

## Maintenance Note

**`docs/skills/` should be kept in sync with `~/.claude/commands/`.**  
The files in `docs/skills/` are documentation-style references; the executable skill definitions live in `~/.claude/commands/`. When either changes, the other should be updated. Sync has not been done yet — treat `~/.claude/commands/` as authoritative for runtime behavior.

**Server-side infrastructure:** Orchestrate.md defines the logical behavior. Server.js provides:
- Alert broadcasting and deduplication
- Session state management from git data
- Worktree collision detection
- Session cleanup on exit
- File locks exceptions for directive updates

---

## STOPPING

The orchestrator session is managed by Polaris server.js. It will be closed automatically when all sessions on this project close. You do not need to manage your own lifecycle.

If you detect that you are the only session remaining, print: "All build sessions closed. Orchestrator standing down." and stop the monitor loop.

Before exiting, write `orchestrator-active.json` with `{ "active": false, "stoodDownAt": "<ISO timestamp>" }` so sessions know the gate is no longer active.
