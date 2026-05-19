# Backlog And Promotion Workflow

## Scope
Read this file before `/start-build`, `/finish-build`, review, audit, promotion, or protected-branch work.

## Branch Topology
`main`, `stage`, and `prod` are protected landing branches.

Ordinary build, finish, review, and audit sessions must not write to or merge into `main`, `stage`, or `prod` directly.

Protected branches change only through explicit promotion commands:
- `/promote-stage` - only command allowed to move approved work onto `stage`.
- `/promote-to-main` - only command allowed to move `stage` onto `main`.
- `/promote-to-prod` - only command allowed to move `main` onto `prod`.

## Worktree Rules
Each backlog `/start-build` session must create a unique git worktree and feature branch.

Branch naming pattern:

`task/{number}-{description}`

Direct non-backlog edits start from `main` in the normal source checkout unless Scott explicitly asks for a branch or worktree.

## `/finish-build` Output
`/finish-build` prepares a review handoff. It does not land work on a protected branch.

The handoff must include:
- Review-ready branch name.
- PR or PR-ready handoff targeting the correct promotion lane.
- Verification summary with commands run and results.
- Risk and rollback note.
- Clear statement that no merge to `stage`, `main`, or `prod` was performed.
- Any skipped checks or manual verification still needed.

## Review Before Promotion
Code review happens before any promotion command moves work forward.

Review, audit, and promotion sessions must preserve proof trails: branch name, commit SHA, verification evidence, and unresolved risk.

## Direct Pushes
Direct pushes and ordinary-session merges to `main`, `stage`, and `prod` are blocked by policy. Treat promotion commands as the sole landing path for those branches.
