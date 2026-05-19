# Planning

## When to Plan (Triggers)
- New features or significant refactors
- Multi-file changes affecting architecture
- Any work in `docs/backlog.json` before `/start-build`
- Changes to protected branches or deployment infrastructure

## What to Capture
- Success criteria (what done looks like)
- Scope boundaries (what's in vs. out)
- Key dependencies (files, other tasks, external systems)
- Risks or unknowns requiring research first

## Planning Artifacts
- Task specs in `docs/backlog.json` (structured format)
- `/plan-task` skill output (before formal build sessions)
- Brief notes in session logs (exploratory decisions)

## Where The Plan Goes
- Backlog work: write the structured plan to `docs/backlog.json` through the task's planning fields before `/start-build`.
- Formal `/plan-task` work: save the `/plan-task` output in the task record and include a concise summary in the session handoff.
- Direct non-backlog work: keep the plan in the session response unless Scott asks for a file-backed artifact.
- Review or promotion work: include the plan/checklist in the review or promotion handoff.

## Plan Validation (Before `/start-build`)
- [ ] Success criteria are verifiable
- [ ] Scope fits a single task
- [ ] Research blockers identified and resolved
- [ ] Cross-boundary impacts audited
