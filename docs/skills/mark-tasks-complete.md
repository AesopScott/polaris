---
name: mark-tasks-complete
description: Deprecated for Polaris. Do not use for Polaris backlog closeout; /promote-to-prod owns production status and archive moves.
---

# /mark-tasks-complete {pr-number}

This skill is deprecated for Polaris. It used an older lifecycle (`backlog → ready → in-review → complete`) that does not match the current Polaris backlog statuses.

Current Polaris closeout is owned by `/promote-to-prod`:

```
backlog → planned → build-started → cba-complete → build-finished → pr-reviewed → codex-reviewed → review-passed|review-blocked → production
```

If you are working in Polaris, stop and run `/promote-to-prod` instead. Do not edit `docs/backlog.json` from this command.

For non-Polaris projects that still depend on this legacy command, first port the command to that project's current lifecycle and apply the Task #60 disposable backlog worktree protocol before making any write.
