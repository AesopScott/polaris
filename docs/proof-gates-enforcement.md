# Task #12 — Proof Gates Enforcement

## Summary

Three targeted edits to `~/.claude/commands/` implementing proof-gate enforcement in the build workflow.

## Changes Applied

### 1. `~/.claude/commands/ship-task.md` — Step 2

**Before:** "Now write the code."

**After:** Reminder block noting that proof units are active, exit evidence must be collected per unit during implementation, and `/finish-build` will hard-fail if evidence is missing.

### 2. `~/.claude/commands/start-build.md` — Step 8

Replaced the plain "summarize and confirm" step with a **proof-entry gate** that runs two checks before any code is written:

- **Check 1:** `proofUnits[]` must be present and non-empty in the task's `backlog.json` entry. Missing → stop, direct user to run `/plan-task {N}`.
- **Check 2:** Obsidian task file (`{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`) must exist. Missing → stop, direct user to run `/plan-task {N}`.

On both checks passing, the first proof unit is named to the user (title, expected behavior, proof command, expected initial failure) before confirmation is requested.

### 3. `~/.claude/commands/finish-build.md` — Step 5a (new)

Inserted a **CBA pass gate** between Step 5 (push) and Step 6 (`gh pr create`):

- **Check 1:** CBA must have run on this branch (`git log origin/main..HEAD -- docs/registries/` non-empty).
- **Check 2:** CBA must have passed with zero hard-fail findings (no orphans, collisions, stale registries, or annotation drift).

Either failure is a hard stop — task stays `build-started`, PR is not created.

## Proof Unit Verification

| Unit | Command | Result |
|---|---|---|
| 1 — ship-task.md has proof unit text | `grep -c 'proof unit' ~/.claude/commands/ship-task.md` | 2 (≥1 ✓) |
| 2 — start-build.md has proofUnits check | `grep -c 'proofUnits' ~/.claude/commands/start-build.md` | 4 (≥1 ✓) |
| 3 — finish-build.md CBA gate before pr create | Step 5a at line 225, Step 6 at line 235, `gh pr create` at line 240 ✓ |
