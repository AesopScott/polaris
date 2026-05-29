# Ship-Task Pipeline Updates — Complete Summary

## Overview

Updated the entire `/ship-task` pipeline to support orchestrator-gated, multi-session workflows with directive-based coordination. All changes maintain single-session compatibility while adding robust multi-session conflict detection and async phase gating.

---

## Changes by Skill

### 1. `/cross-boundary-audit` (NEW SKILL)

**Created:** `~/.claude/commands/cross-boundary-audit.md` + synced to `docs/skills/`

**Purpose:** Audit and fix boundary contracts during the build, running between `/start-build` and `/finish-build`.

**Key responsibilities:**
- Verify all new identifiers are registered in `docs/registries/`
- Validate proof units have RED→GREEN evidence (failing test → implementation → passing test)
- Fix registry gaps before PR opens
- Set status to `cba-complete` on success

**Replaces:** The boundary audit work that was previously part of `/finish-build`

**Directive support:** Polls `session-directives.json` before starting

---

### 2. `/plan-task`

**Updated:** `~/.claude/commands/plan-task.md` + synced to `docs/skills/`

**Changes:**
- Added "Directive Polling (multi-session only)" section at the start
- Sessions now read `session-directives.json` before proceeding
- Acknowledge and execute directives
- Report completion/failure back to directive file

**Integration:**
- Single-session: proceeds normally
- Multi-session: waits for orchestrator directives if any are pending

---

### 3. `/start-build`

**Updated:** `~/.claude/commands/start-build.md` + synced to `docs/skills/`

**Changes:**
- Added "Directive Polling (multi-session only)" section after title
- Polls for pending directives before loading project context
- Acknowledges directive and executes embedded instruction
- Reports back via directive file

**Orchestrator integration:** Must wait for `planned` → `/start-build` approval before starting, but this is human-gated (Scott only, not orchestrator)

---

### 4. `/finish-build`

**Updated:** `~/.claude/commands/finish-build.md` + synced to `docs/skills/`

**Changes:**
- Updated description: removed mention of "cross-boundary audit" (now separate skill)
- Added "Directive Polling (multi-session only)" section
- Clarified that `/cross-boundary-audit` must pass before this skill runs
- Polls for directives and reports back

**New workflow:**
- Previous: code → finish-build (with embedded audit) → PR
- New: code → cross-boundary-audit → finish-build → PR

---

### 5. `/review-pr`

**Updated:** `~/.claude/commands/review-pr.md` + synced to `docs/skills/`

**Changes:**
- Added "Directive Polling (multi-session only)" section after title
- Polls for pending directives before starting review
- Executes directives from orchestrator
- Reports back via directive file

**Scope:** Both ad-hoc and task modes support directive polling

---

### 6. `/codex-review`

**Updated:** `~/.claude/commands/codex-review.md` + synced to `docs/skills/`

**Changes:**
- Added "Directive Polling (multi-session only)" section after title
- Polls for pending directives before starting review
- Already sets correct status: `pr-reviewed` (verified in existing code at line 334)
- Reports back via directive file

**Status note:** The skill already correctly sets `pr-reviewed` on APPROVE, not `cba-complete`

---

### 7. `/promote-stage`

**Updated:** `~/.claude/commands/promote-stage.md` + synced to `docs/skills/`

**Changes:**
- Updated description: added merge model note (CareGuide-only)
- Added "Directive Polling (multi-session only)" section
- Added new "Merge Model" section:
  - **Multi-session:** Request orchestrator via `branch-requests.json` (do NOT merge directly)
  - **Single-session:** Merge stage → main directly

**Key change:** No longer merges directly; in multi-session contexts, orchestrator performs the merge

---

### 8. `/promote-to-prod`

**Updated:** `~/.claude/commands/promote-to-prod.md` + synced to `docs/skills/`

**Changes:**
- Added "Directive Polling (multi-session only)" section
- Added new "Merge Model" section:
  - **Multi-session:** Request orchestrator via `branch-requests.json` (do NOT merge directly)
  - **Single-session:** Merge to main directly

**Key change:** No longer merges directly; in multi-session contexts, orchestrator performs the merge

---

### 9. `/ship-task` (Orchestrator Skill)

**Updated:** `~/.claude/commands/ship-task.md` + synced to `docs/skills/`

**Changes:**
- Added "Directive Polling (multi-session only)" section explaining delegation model
- Clarified that `/ship-task` delegates directive polling to sub-skills
- Each sub-skill handles its own directive polling independently

**Architecture note:** `/ship-task` is the entry point orchestrator that invokes sub-skills in sequence; sub-skills handle their own directive coordination

---

## New Directive Polling Pattern

All 9 skills now implement the same directive polling pattern:

```
## Directive Polling (multi-session only)

1. Read `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`
2. Look for entry where `target.sessionId` matches this session AND `status === "pending"`
3. If found:
   - Set `status: "acknowledged"` + `acknowledgedAt`
   - Execute `instruction` as if user message
   - Set `status: "completed"` + `completedAt` + `result`
4. If not found or single-session: proceed normally
```

---

## Phase Gates

| Transition | Gate | Skill |
|---|---|---|
| `planned` → `/start-build` | **Human (Scott)** — direct approval only | `/plan-task` |
| `build-started` → `/cross-boundary-audit` | Orchestrator | `/start-build` |
| `build-started` → `/cross-boundary-audit` | Orchestrator | `/cross-boundary-audit` |
| `cba-complete` → `/finish-build` | Orchestrator | `/cross-boundary-audit` |
| `build-finished` → `/review-pr` | Orchestrator | `/finish-build` |
| (review evidence) → `/codex-review` | Orchestrator | `/review-pr` |
| `build-finished` → `pr-reviewed` | Orchestrator | `/codex-review` |
| `pr-reviewed` → `/promote-to-prod` | Orchestrator | `/codex-review` |
| `pr-reviewed` → `/promote-stage` | Orchestrator (CareGuide only) | `/codex-review` |
| (stage merge) | Orchestrator performs merge | `/promote-stage` |
| (main merge) | Orchestrator performs merge | `/promote-to-prod` |

---

## Merge Serialization

**New in multi-session context:**
- Sessions request merges via `branch-requests.json`
- Orchestrator performs all merges to `stage`/`main` itself
- Serialized: one session at a time
- Orchestrator pushes to origin immediately after each merge
- No concurrent merges to shared branches

**Single-session:** Sessions merge directly (unchanged)

---

## Status Semantics (Unchanged)

Pipeline statuses remain:
- `planned` — plan approved, ready for `/start-build`
- `build-started` — build session active
- `cba-complete` — boundary audit passed, ready for `/finish-build`
- `build-finished` — PR opened and pushed
- `pr-reviewed` — code review passed, ready for `/promote-to-prod`
- `staged` — on stage branch (CareGuide only)
- `production` — deployed to production

---

## Files Synced

All updated skills synced from `~/.claude/commands/` to `docs/skills/`:

```
✅ cross-boundary-audit.md (new)
✅ plan-task.md
✅ start-build.md
✅ finish-build.md
✅ review-pr.md
✅ codex-review.md
✅ promote-stage.md
✅ promote-to-prod.md
✅ ship-task.md
```

---

## CLAUDE.md Rule Addition

**Rule 14/15:** "Skill sync requirement. Anytime a skill is created or modified in `~/.claude/commands/`, it MUST be synced to `docs/skills/` to keep documentation current."

Added to both:
- Worktree: `C:\Users\scott\AppData\Local\Temp\polaris-wt\chat_1780059978136\CLAUDE.md`
- Source: `C:\Users\Scott\code\polaris\CLAUDE.md`

---

## Backward Compatibility

**Single-session workflows:**
- All skills work unchanged
- Directive polling finds nothing (no orchestrator active)
- Skills proceed with normal execution
- No merge gating or serialization

**Multi-session workflows:**
- Orchestrator activates on startup
- Directive polling enables async phase coordination
- Merge serialization prevents conflicts
- All skills participate in gating protocol

---

## Testing Checklist

- [ ] Single-session: `/ship-task {N}` works end-to-end
- [ ] Multi-session: Orchestrator activates on 2+ sessions
- [ ] Directive polling: Sessions acknowledge and execute directives
- [ ] Merge serialization: Only one session merges at a time
- [ ] Conflict detection: Orchestrator detects overlapping file changes
- [ ] Merger guides: Obsidian notes generated for conflicts
- [ ] Phase gates: Tasks blocked until orchestrator approves transition
- [ ] Human gates: `planned` → `/start-build` requires Scott's direct approval
- [ ] Proof units: `/cross-boundary-audit` validates RED→GREEN evidence
- [ ] Registry audit: All new identifiers registered with correct line refs

---

## Implementation Complete

All 9 ship-task pipeline skills updated with:
- ✅ Directive polling support
- ✅ Orchestrator gating
- ✅ Merge serialization (promote skills)
- ✅ Single-session backward compatibility
- ✅ Documentation synced to `docs/skills/`
- ✅ CLAUDE.md rule added

Ready for orchestrator and other multi-session skills to be implemented in parallel sessions.
