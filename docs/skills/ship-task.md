---
name: ship-task
description: End-to-end task workflow with human gates. Resumes from the task status in docs/backlog.json and delegates planning, build, audit, review, and promotion to the dedicated skills.
---

# /ship-task [task-number]

Run one backlog task through the shipping lifecycle with a human gate between phases. This skill is an orchestrator only: sub-skills own Obsidian access, worktree setup, auditing, PR creation, review, and promotion details.

## Directive Handling

Do not poll directives here. Invoke the phase sub-skills; each one handles multi-session directives for its own work.

## Scope

- Operate on exactly Task #{N}. If no argument is given, pick the highest-priority task not already done, lowest number as tiebreaker.
- Never batch unrelated tasks outside `/promote-to-prod`.
- Use `/promote-stage` only for Parental CareGuide/CareGuide, the only project with a real stage environment. Other projects go from reviewed PR to `/promote-to-prod`.
- Stop whenever a sub-skill hard-fails, finds objective drift, or asks for user input.
- Human gates are mandatory. Do not silently advance to the next phase.

## Objective Contract

Load the selected task from `docs/backlog.json` before deciding where to resume. Use `objective` as the durable contract:

- If status is `backlog`, invoke `/plan-task {N}` first so objective criteria and proof units are created.
- If status is beyond `backlog` but `objective` is missing, stop and ask the user to rerun `/plan-task {N}` or backfill the objective.
- Between phases, summarize objective statement, current success criterion, non-goals, and triggered stop conditions.
- Proceed only when the next phase advances or verifies mapped `objective.successCriteria[]`.
- Stop if a sub-skill reports work outside the objective or inside `objective.nonGoals[]`.

## Worktree Check

Before invoking sub-skills, run:

```bash
git branch --show-current
git worktree list
pwd
```

Proceed when either:

- Current branch matches `task/{N}-*`.
- Current branch is `main` in the project source tree.
- Current directory is a Polaris temp worktree and `git worktree list` shows a primary `[main]` source worktree.

If running from a temp directory with no primary source worktree, create a stable worktree from `origin/main` before continuing. If that fails, stop.

## Step 0 - Read Backlog And Choose Task

Use a main-pinned worktree for `docs/backlog.json` reads. If current CWD is a linked temp worktree, use the primary `[main]` worktree shown by `git worktree list`.

Show:

- Task number, title, and current `status`
- Branch or `pr_url` if present
- Plan summary if present
- Objective statement, success criteria, non-goals, and current step if present

Gate: `Run the ship-task workflow for Task #{N} - "{title}", currently {status}? [yes/no]`

## Resume Table

Read the current status immediately before choosing a step.

| Status | Next action |
|---|---|
| `backlog` | Invoke `/plan-task {N}`. Do not skip planning. |
| `planned` | Invoke `/start-build {N}`. |
| `build-started` | Ask whether to run audit now, keep coding, or finish. |
| `cba-complete` | Invoke `/finish-build`. |
| `build-finished` | Invoke `/review-pr task {N}`. |
| `pr-reviewed` | Invoke `/codex-review task {N}`. |
| `codex-reviewed` | Wait for approval handler to set `review-passed` or `review-blocked`. |
| `review-passed` | Invoke `/promote-to-prod`. |
| `review-blocked` | Stop; user fixes blockers, then resume review. |
| `staged` | Invoke `/promote-to-prod`. |
| `production` / `complete` | Stop; task is already shipped. |

If `impact: "major"` and status is not `backlog`, stop. Major tasks are planning containers; ship their subtasks instead.

## Phase Gates

### 1. Plan

Before `/plan-task`, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "planning", lastSkill: "plan-task" })`

After it returns, show the plan, objective, criteria, non-goals, stop conditions, and proof map. If the task is major, stop after planning. Otherwise ask: `Plan saved. Proceed to start build? [yes/no/edit]`

### 2. Start Build

Before `/start-build`, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "start-build", lastSkill: "start-build" })`

Invoke `/start-build {N}`. It loads project context, verifies objective/proof prerequisites, prepares the branch, and names the first proof unit.

Gate: `Branch task/{N}-{slug} is ready. Proceed to cross-boundary audit? [yes/abort]`

### 3. Cross-Boundary Audit

Before audit, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "audit", lastSkill: "cross-boundary-audit" })`

Invoke `/cross-boundary-audit`. Summarize contract alignment and any stop condition. After user confirms coding can begin, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "coding", lastSkill: "start-build" })`

Then wait for explicit `done`, `audit`, or `abort`. Do not decide coding is complete yourself.

### 4. Finish Build

Before `/finish-build`, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "build-finished", lastSkill: "finish-build" })`

Invoke `/finish-build`. It verifies objective evidence, registries, PR target, commit, push, and PR creation. If it fails on objective, proof, stale registry, orphan, collision, or drift, stop.

Gate: `Build finished. PR opened: {url}. Proceed to review? [yes/fix/abort]`

### 5. Claude Review

Before `/review-pr`, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "review", lastSkill: "review-pr" })`

Invoke `/review-pr task {N}`. Surface CRITICAL/HIGH blockers first.

Gate: `Claude review complete. Proceed to Codex review? [yes/fix/abort]`

On `yes`, set:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "pr-reviewed", lastSkill: "review-pr" })`

### 6. Codex Review

Before `/codex-review`, call:

`mcp__polaris__SetTaskState({ taskNumber: N, taskState: "codex-review", lastSkill: "codex-review" })`

Invoke `/codex-review task {N}`. Compare it with the Claude review. If either review has CRITICAL/HIGH blockers, set `review-blocked` and stop. If both are clear and the user approves, set `review-passed`.

Gate: `Both reviews complete. Approve and proceed to production? [yes/fix/abort]`

### 7. Promote

Invoke `/promote-to-prod`. It chooses CareGuide stage-to-main or direct main promotion, verifies deploy, and marks included tasks production. Do not call `SetTaskState` separately unless promotion reports that Polaris state did not update.

## Final Report

Summarize task number/title, branch, build PR, promotion PRs if any, and final status.

## Completion Banner

Always end every turn with:

---
### /ship-task - step {n}/7: /<sub-skill> just ran
- **Result:** <success | needs fix | blocked/failed>
- **What happened:** <one concrete outcome>
- **Task status:** <current docs/backlog.json status>
- **Next:** <next sub-skill, gate, or requested action>
---

Nothing comes after this banner.
