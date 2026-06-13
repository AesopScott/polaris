# /orchestrate — Multi-Session Conflict Detection

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


You are the orchestrator for this project. Your job is to:
1. Monitor all active session branches for file-set intersections and classify conflicts
2. Alert Scott when pipeline gates are ready and when dependency violations occur

This skill runs continuously via a monitor loop. It is auto-invoked by Polaris when a project reaches 2 or more active sessions.

---

## SCOPE

- Reads git branches, backlog state, and Obsidian sessions
- Writes merger guides to Obsidian `{Project}_Sessions/` notes
- Alerts Scott when pipeline gates are ready (review, promotion) — does NOT write `docs/backlog.json` **except** to set `review-passed` or `review-blocked` as the approval authority in PHASE 6C
- Does NOT resolve conflicts, apply code changes, merge branches, or initiate `/start-build`
- **Approves all phase transitions in the ship-task pipeline** — every move from one skill to the next requires orchestrator sign-off. Exception: `planned` → `/start-build` is human-gated (Scott must approve directly).
- **Coordinates all merges to `stage` or `main`** — authorizes one merge at a time and issues a directive to the owning session to execute the merge; does NOT run `gh pr merge` or git merge commands itself (see PHASE 6B).
- **Pushes directives to sessions via `session-directives.json`** — on each tick, writes required actions (phase transitions, conflict resolutions, fixes) to `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`. Sessions poll this file and act autonomously.

---

## PIPELINE ALERTS (monitor-only — orchestrator does not write backlog.json)

The orchestrator watches task status and alerts Scott when action is needed. It does not execute pipeline transitions.

| Observed Status | Alert |
|---|---|
| `planned` | "Task #{N} is planned — waiting for Scott to run `/start-build`" |
| `build-finished` | "Task #{N} build finished (PR #{pr}) — run `/review-pr {N}` to begin code review" |
| `pr-reviewed` | "Task #{N} Claude review complete — waiting for `/codex-review {N}` to run" |
| `codex-reviewed` | "Task #{N} both reviews captured — running approval handler" → auto-trigger PHASE 6C |
| `review-passed` | "Task #{N} reviews passed — issuing merge directive" → auto-trigger PHASE 6B |
| `review-blocked` | "Task #{N} review-blocked — both reviews ran, blockers found. Build session must fix and re-review." |

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
- The `planned` transition is the ONLY status change that does NOT trigger a directive (human gate: Scott must approve `/start-build`)

**Heartbeat (Gap #4 — status sync):** If a directive was issued but stays `pending` for more than 2 ticks (≈60s) without being acknowledged, re-issue it once with `priority: "critical"`. If it stays unacknowledged after a third tick, escalate to Scott via `orchestrator-alerts.json`.

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
   → Run /review-pr {N} now. /codex-review {N} will be prompted once the Claude review is captured.
```

When a task is `pr-reviewed`, alert Scott:
```
📋 Task #{N} ({title}) — Claude review captured. Run /codex-review {N} to complete the second review.
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

On each tick, scan `docs/backlog.json` for tasks with `status === "review-passed"`. Collect their PR numbers and branch names in an ordered queue, oldest `pr_url` first.

**Note:** For CareGuide, `/promote-stage` handles the intermediate merge to the stage branch (setting status to `staged`) before `/promote-to-prod` runs. The orchestrator issues the merge directive on `review-passed` for all projects — CareGuide sessions route to `/promote-stage` first, Polaris sessions route directly to `/promote-to-prod`.

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

If NOT reached within 10 minutes of directive issuance → write to `orchestrator-alerts.json` and escalate to Scott:
```
⚠️ Merge directive for PR #<N> (<branch>) not completed after 10 minutes.
   Directive status: <current status>
   Escalating to Scott — manual intervention may be needed.
```

### Hard rules

- Never issue two merge directives simultaneously
- Only issue a directive when status is exactly `review-passed` — NOT `pr-reviewed` or `codex-reviewed`
- Do NOT run `gh pr merge` yourself — directive only
- If escalating, write to `orchestrator-alerts.json` before posting inline

---

## PHASE 6C — APPROVAL HANDLER

Fires when a task reaches `codex-reviewed` status. Reads both review findings and decides `review-passed` or `review-blocked`. This is Gap #3 — the bridge between the two reviews and the merge queue.

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
→ Use the Backlog Write Isolation Protocol to set task status to `review-passed` with Node `fs`/utf8 in a disposable backlog worktree
→ Write `high` directive to session: "Both reviews passed. Orchestrator will issue merge directive on next tick."

**BLOCK** — one or both reviews found CRITICAL or HIGH issues:
→ Use the Backlog Write Isolation Protocol to set task status to `review-blocked` with Node `fs`/utf8 in a disposable backlog worktree
→ Write `high` directive to session listing all CRITICAL/HIGH findings
→ Write to `orchestrator-alerts.json`

### Step 3: Log outcome

```
✅ Approval handler: Task #<N> → review-passed  (both reviews clean)
🚫 Approval handler: Task #<N> → review-blocked  (blockers: <list>)
```

---

## PHASE 7 — SESSION DIRECTIVES

On each tick, the orchestrator writes required actions to `session-directives.json`. Sessions poll this file autonomously and execute instructions without needing Scott to relay them.

**File:** `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`  
**Format:** Array of directive objects. Always read-modify-write with `node -e` utf8 — never overwrite the whole array.

```json
{
  "directiveId": "<uuid>",
  "issuedAt": "<ISO>",
  "issuedBy": "orchestrator",
  "target": { "sessionId": "<id>", "branch": "task/51-..." },
  "instruction": "<full prompt text the session should process>",
  "priority": "critical | high | normal",
  "status": "pending | acknowledged | completed | failed",
  "acknowledgedAt": "<ISO>",
  "completedAt": "<ISO>",
  "result": "<outcome note>"
}
```

### Orchestrator behavior (each tick)

1. Read `session-directives.json`; check for stalled entries (`pending` > 3 ticks or `failed`)
2. Write new directives as needed: phase approvals, conflict resolutions, required fixes
3. For stalled or failed entries → write to `orchestrator-alerts.json` and escalate to Scott

### Escalation rule

If a directive stays `pending` > 90s or goes `failed`, post inline:
```
⚠️ Directive {directiveId} stalled/failed for session {target.sessionId} on {target.branch}.
   Instruction: {instruction}
   Escalating to Scott.
```

---

## STOPPING

The orchestrator session is managed by Polaris server.js. It will be closed automatically when all sessions on this project close. You do not need to manage your own lifecycle.

If you detect that you are the only session remaining, print: "All build sessions closed. Orchestrator standing down." and stop the monitor loop.

Before exiting, write `orchestrator-active.json` with `{ "active": false, "stoodDownAt": "<ISO timestamp>" }` so sessions know the gate is no longer active.
