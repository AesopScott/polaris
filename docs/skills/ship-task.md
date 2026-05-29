# `/ship-task` Skill

## Overview

`/ship-task` is an **orchestrator skill** that guides a backlog task through the complete pipeline from planning through production deployment. It doesn't execute changes itself; instead, it invokes a sequence of specialized skills that handle each phase, manage status transitions, and validate the task at each gate.

## Workflow Pipeline

The skill orchestrates seven sequential phases:

```
backlog
  ↓
[/plan-task] → planned
  ↓
[/start-build] → build-started
  ↓
  (coding — status stays build-started)
  ↓
[/cross-boundary-audit] → cba-complete
  ↓
[/finish-build] → build-finished
  ↓
[/review-pr] → (no status change)
  ↓
[/codex-review] → pr-reviewed
  ↓
[/promote-stage] → staged  (CareGuide only — see Phase 6 note)
  ↓
[/promote-to-prod] → production
```

## Phase Details

### Phase 1: Planning (`/plan-task`)

**What it does:**
- Loads project context from Obsidian (Build folder + recent Sessions)
- Runs interactive design discussion to explore architecture and approach
- Creates structured outline with implementation phases
- Breaks task into proof units (TDD expectations)
- Validates the feature is reachable end-to-end by its target persona
- Audits boundary changes against Feature Contracts and registries

**Status transition:** `backlog` → `planned`

**Gates next phase:** Requires user confirmation before moving to build

### Phase 2: Build Startup (`/start-build`)

**What it does:**
- Loads task plan and proof units from the planning phase
- Creates an isolated git branch and worktree for the task
- Syncs the main branch to get latest changes
- Auto-selects the task (or accepts task number as parameter)
- Loads full code context for the implementation

**Status transition:** `backlog` or `planned` → `build-started`

**Output:** Developer is now in a focused build session on an isolated branch

### Phase 2.5: Cross-Boundary Audit (`/cross-boundary-audit`)

**What it does:**
- Verifies all new identifiers produced by the build are registered with correct line refs
- Checks proof units — confirms failing test → implementation → passing test evidence exists
- Fixes any registry gaps before the branch is pushed

**Status transition:** `build-started` → `cba-complete`

**Output:** All boundary contracts and registries are clean; task is ready to finish-build

> **Note:** `cba-complete` means the cross-boundary audit is done, not that code review is done. The status stays `cba-complete` until `/finish-build` runs and opens the PR.

---

### Phase 3: Build Completion (`/finish-build`)

**What it does:**
- Takes over from `cba-complete` state
- Commits all changes with conventional commit message
- Pushes the branch with `-u` flag
- Opens a pull request targeting the `stage` branch (CareGuide deployments) or `main` (other projects)
- Records the PR URL in `docs/backlog.json`
- Clears the build session context

**Status transition:** `cba-complete` → `build-finished`

**Output:** PR is open and ready for review; task branch remains checked out

### Phase 4: Code Review (`/review-pr`)

**What it does:**
- Conducts structured code review against:
  - Task spec and objective
  - Feature Contracts and registries
  - Full diff (all commits, not just latest)
- Validates proof trail completeness
- Records review evidence and findings as text
- Does NOT automatically post comments to GitHub
- Does NOT change task status

**Status transition:** (no status change — review is evidence only)

**Output:** Review findings logged; may identify blockers before Codex review

### Phase 5: Independent Review (`/codex-review`)

**What it does:**
- Independent review via Codex (GPT-5.4 family) — different model than the one that wrote the code
- Reviews against spec, registries, proof trail, and diff
- Compares findings against any prior `/review-pr` to surface disagreements
- Logs all findings to Obsidian
- **Sets status to `cba-complete` when review PASSES** (code review audit complete)
- May set status to `review-blocked` if hard issues are found that must be fixed before merge

**Status transition:** `build-finished` → `pr-reviewed` (or `review-blocked` if blockers found)

> **Note:** The correct status on `/codex-review` APPROVE is `pr-reviewed`. `cba-complete` is a persistent misnomer that has been incorrect for a long time — do not use it here.

**Output:** Task is approved for staging, or flagged with blockers

### Phase 6: Promote to Stage (`/promote-stage`)

> **CareGuide only.** This phase is skipped for all other projects. Invariant #7 means the branch target was already decided at `/finish-build` time — non-CareGuide PRs target `main` directly, so there is no stage branch to promote to. For Polaris and other projects, after `cba-complete` the task moves directly to Phase 7. The `staged` status should never appear on a Polaris task; if it does, `/finish-build` mis-targeted the PR.

**What it does:**
- Scans backlog for tasks in `cba-complete` state
- Merges approved PRs into the `stage` branch
- Runs a rollup audit to verify no boundary conflicts in staged code
- Updates task metadata for staging environment

**Status transition:** `cba-complete` → `staged`

**Output:** Code is deployed to staging environment for final validation

### Phase 7: Promote to Production (`/promote-to-prod`)

**What it does:**
- Scans backlog for tasks in `staged` state
- Promotes code from stage → main → production branch
- Watches the deploy in real-time
- Validates smoke tests pass in production
- If deploy fails: logs failure details and may trigger rollback or fix workflow
- If deploy succeeds: marks task as complete

**Status transition:** `staged` → `production` (or `failed-smoke-test` if deploy validation fails)

**Output:** Task is live in production, or failure details are captured for remediation

## Key Invariants

1. **Status changes only at phase boundaries** — individual skills set status, `/ship-task` does not
2. **No silent branch operations** — each phase that touches git prompts for confirmation
3. **Proof trail is mandatory** — must have failing test → implementation → passing test evidence
4. **Registry audit is mandatory** — boundary changes must be audited before moving past build
5. **Two-model review** — Claude AND Codex perspectives surface disagreements neither alone would catch
6. **Atomic phases** — each phase is self-contained; if it fails, the task remains at that status until fixed
7. **PR targeting is automatic** — `/finish-build` chooses stage or main based on project configuration. This is the fork point that determines whether Phase 6 runs at all. For non-CareGuide projects the effective pipeline is six phases, not seven, and `staged` is an unreachable status.

## Triggering the Workflow

```bash
/ship-task [task-number]
```

**Parameters:**
- `task-number` (optional): Specific task to ship. If omitted, `/ship-task` auto-selects the next ready task from `docs/backlog.json`

**Requirements:**
- Task must be in `backlog` status to start from planning
- Task can jump in at later phases if already partially complete (e.g., if you have a `build-finished` task, run `/ship-task 42` to skip to review)

## Blocking Conditions

The workflow will pause and require user action if:

- **Plan phase:** Boundaries conflict with existing Feature Contracts
- **Build phase:** Proof units cannot be satisfied (no testable evidence)
- **Review phase:** Blocker issues identified (status set to `review-blocked`)
- **Deploy phase:** Smoke tests fail in production (status set to `failed-smoke-test`)

## Output & Logging

- **Obsidian:** Session notes logged to `{Project}_Sessions/` with full transcript
- **backlog.json:** Task status and PR URL updated at each phase
- **Git:** Branch created, commits made, PR opened
- **GitHub:** PR visible with full diff and coverage

## Integration with Other Skills

- **Independently callable skills:** Each phase (`/plan-task`, `/start-build`, etc.) can be called directly without running the full pipeline
- **Reusability:** A task can be paused at any status and resumed later by running `/ship-task <task-number>`
- **Rollback:** If production deploy fails, `/promote-to-prod` captures failure details; remediation may require a new task or hotfix branch

## When to Use

Use `/ship-task` when:
- You have a backlog task ready to move through the pipeline
- You want a guided, gated workflow with validation at each step
- Multiple reviewers need to evaluate the same code (Claude + Codex)
- You need detailed proof trail and registry audit evidence

Don't use `/ship-task` when:
- You're doing a quick one-off fix (use individual skills directly)
- The task doesn't require formal proof units (minor patches)
- You're working in isolation without needing two-model review

---

## Maintenance Note

**`docs/skills/` should be kept in sync with `~/.claude/commands/`.**  
The files in `docs/skills/` are documentation-style references; the executable skill definitions live in `~/.claude/commands/`. When either changes, the other should be updated. Sync has not been done yet — treat `~/.claude/commands/` as authoritative for runtime behavior.
