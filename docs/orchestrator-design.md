# Orchestrator Sessions Design

**Purpose:** Orchestrator sessions coordinate multiple active sessions in a project, managing parallelization, sequencing, conflict resolution, and state aggregation.

**Status:** Design exploration (Task #26)

---

## Overview

An orchestrator session is a coordinator-first, non-executor agent that:
- Spawns and monitors child sessions (agent, chat, review, routine)
- Aggregates results and state from parallel work
- Enforces sequencing and proof-unit boundaries
- Detects and resolves conflicts (branches, files, locks)
- Makes strategic decisions on parallelization, resource allocation, and error handling

Unlike traditional sessions, orchestrators do **not** write code directly. They manage the workflow of other sessions and escalate decisions to the user when needed.

---

## What Orchestrators Should See

### Active Session Registry

- **List of all running sessions** in the project
  - Type (agent, chat, Codex, routine)
  - Model and capabilities
  - Age, spawn time, expected duration
  - Current status (spawned, running, idle, complete, failed)

- **Session ownership and scope**
  - Which task each session owns
  - Which proof units are assigned to each session
  - Branch checked out
  - Files being edited (locked)

- **Blocking signals**
  - File locks (who has what locked, when released)
  - Branch locks (merge in progress, promotion queued)
  - Resource contention (context window pressure, API limits)
  - Interdependencies (session B waiting on session A's result)

### Shared Project State

- **Task context**
  - Active task number, title, description
  - Proof units and their ownership
  - Required evidence for each proof unit
  - Status (build-started, build-finished, cba-complete, staged, production)

- **Branch state**
  - Feature branch HEAD (task-N-*)
  - Stage HEAD and pending merges
  - Main HEAD and pending merges
  - Merge conflict zones (detected via dry-run)
  - In-flight GitHub PRs (status, checks, approvals)

- **File version state**
  - Which files have been modified
  - Locks and who holds them
  - Version tracking (from `file-versions.json`)
  - Predicted conflict zones (overlapping edits across sessions)

### Session Outputs (Real-Time)

- **Logs and intermediate results**
  - Build output, test failures, error messages
  - Aggregated test results across parallel runners
  - Code review comments (from code-reviewer, Codex sessions)
  - Proof-unit evidence (RED test, GREEN test, refactor confirmation)

- **Resource metrics**
  - Where sessions got blocked (file locks, branch locks, API rate limits)
  - Context window usage per session
  - Time to completion for each proof unit
  - Retry counts and failure reasons

---

## What Orchestrators Should Do

### Spawning and Lifecycle

- **Spawn child sessions strategically**
  - Identify independent proof units → spawn parallel agents
  - Identify sequential dependencies → queue sessions
  - Suppress redundant spawns (deduplicate work, detect duplicates)
  - Example: spawn TDD-guide for proof unit A *and* code-reviewer for proof unit B in parallel; don't start promotion session until both finish

- **Monitor child session lifecycle**
  - Detect completion (success, error, timeout)
  - Stream outputs in real-time
  - Capture proof trail (test results, review evidence, registry updates)

- **Stop/cancel sessions intelligently**
  - Cancel if overtaken (another session already provided the answer)
  - Cancel if blocked indefinitely (lock not released, user input timeout)
  - Clean up on completion (release locks, delete throwaway branches)

### Sequencing and Coordination

- **Order dependent work**
  - Build phase (proof units in parallel) → complete before review
  - Review phase (code-reviewer + Codex in parallel) → complete before promotion
  - Promotion phase (dry-run merge, check stage/main, merge) → serialize to avoid conflicts
  - Example: don't start `/promote-stage` until `/finish-build` *and* `/codex-review` both report success

- **Route decisions to the right session**
  - Example: if code-reviewer finds a HIGH issue, ask that session to wait (don't promote yet)
  - If build fails, ask build session to retry before escalating to user
  - If merge conflict detected, route conflict details to orchestrator (escalate to user as amber waiting card)

- **Aggregate partial results**
  - Collect all test failures, group by cause
  - Collect all review comments, prioritize by severity
  - Summarize: "3 proof units passed, 1 failed, 2 waiting for code-reviewer input"

### Conflict Resolution

- **Detect file contention**
  - Track which files each session is editing
  - Flag if two sessions touch the same file
  - Decision: allow parallel (expect merge-conflict later), or serialize (one finishes before other starts)

- **Manage shared locks**
  - Acquire/release locks on behalf of child sessions
  - Queue sessions when locks unavailable (FIFO or priority-based)
  - Release locks early if session no longer needs them (e.g., test passes, lock released immediately)

- **Handle merge conflicts on branches**
  - Detect via dry-run before attempting merge
  - Route conflict details to user with suggested resolutions
  - Decide: rebase and retry, manual resolution, or deprioritize task

---

## What Orchestrators Should React To

### Session Events

- **Child session completed (success)**
  - Check if dependent work is now unblocked
  - Trigger next phase (e.g., if build finishes, start review)
  - Aggregate result into overall proof trail

- **Child session failed (error)**
  - Classify error (transient, permanent, user input needed)
  - Retry if transient (network error, rate limit)
  - Escalate if permanent (bug in code, authorization failure)
  - Abort dependents if critical path is blocked

- **Child session timed out or is blocked**
  - Detect: session hasn't produced output for N seconds
  - Alert orchestrator and user (amber waiting card)
  - Option to retry, cancel, or escalate

- **Child session requests user input**
  - Route question to user via amber waiting card
  - Pause timer; don't timeout while awaiting response
  - Resume child session when answer arrives

### External Events

- **File changes in the runtime zone**
  - New config uploaded, new proof evidence available
  - Notify affected sessions (e.g., build session re-runs if config changed)
  - Trigger proof-unit re-validation if inputs changed

- **User input during execution**
  - Scott answers a question in one session (e.g., resolves a conflict)
  - Propagate answer to orchestrator, trigger dependent sessions
  - Example: Scott resolves a merge conflict manually → orchestrator retries promotion

- **CI/CD webhooks**
  - Pre-merge check failed on GitHub
  - Workflow triggered (e.g., `npm run dist` started)
  - Deploy notification (prod deploy completed)
  - Route to orchestrator: update promotion status, unblock next phase

- **Resource signals**
  - Context window approaching limit (prepare to wrap up)
  - API rate limit hit (queue remaining work)
  - Disk space low (clean up temp files, snapshots)

---

## What Orchestrators Should Decide

### Parallelization Strategy

- **Identify independent proof units**
  - Can unit A and unit B run in parallel? (no shared state, no dependencies)
  - Spawn agents for each in parallel; aggregate results when both complete

- **Identify sequential dependencies**
  - Does unit B require output from unit A?
  - Queue unit B to start only after unit A finishes

- **Unified vs. specialized sessions**
  - For a full build+review workflow: spawn single TDD-guide agent + separate code-reviewer? (parallelizable)
  - Or spawn one orchestrator that does everything? (simpler, slower)
  - Decision: parallelizable by default, serialize only when necessary

### Error Handling and Retries

- **Classify errors**
  - Transient: network timeout, API rate limit → retry with backoff
  - Permanent: bad code, auth failure → escalate immediately
  - User input needed: conflict, ambiguity → alert and pause

- **Retry policy**
  - Transient errors: retry up to 3×, exponential backoff
  - Permanent errors: don't retry; escalate to user
  - Timeout: after 30s of no output, alert user (amber card); after 5m, cancel session

- **Graceful degradation**
  - If code-reviewer is blocked, should we promote anyway? (depends on severity)
  - If one proof unit fails, do we abort all others? (depends on criticality)
  - Decision: abort critical path, warn on non-critical

### Resource Allocation

- **Priority triage**
  - Multiple sessions want locks/context/API budget
  - Allocate by task priority or FIFO
  - Fair-queue if same priority

- **Context budget**
  - If running 3 parallel sessions, budget 30k tokens each (Haiku), not 70k each (would overflow)
  - Monitor actual usage; alert if a session overruns
  - Prepare to wrap up if approaching limit

- **Model selection for spawned workers**
  - Haiku for lightweight agents (fast, cheap)
  - Sonnet for main build (capabilities, speed)
  - Opus for deep reasoning or architectural decisions (rare)

### Scope Policing

- **Detect scope creep**
  - Did code-reviewer start writing code instead of reviewing?
  - Did build session try to add features beyond the proof units?
  - Alert orchestrator; re-scope or escalate

- **Enforce proof-unit boundaries**
  - Each proof unit should have clear acceptance criteria
  - Session must stop when criteria met, not continue exploring
  - Orchestrator verifies: is the session actually done, or just tired?

- **Signal when to split or hand off**
  - If one session is doing too much (>50 lines per function, >800 lines per file)
  - Recommend splitting into smaller sessions or extracting utilities
  - Or: hand off to refactor session if cleanup is needed

---

## Branch Conflict Orchestration

### What the Orchestrator Should Track

1. **Pending merges to protected branches (stage, main)**
   - Which tasks have PRs targeting stage/main
   - PR status: approved, checks passing, queued, blocked
   - Current HEAD of stage/main (detect changes between checks)
   - Expected merge time vs. actual (detect hangs)

2. **File-level contention**
   - Which files each active task is touching
   - Predicted merge conflict zones (overlapping edits on same files)
   - Priority/ordering (who wins if conflict occurs)

3. **Merge state on stage/main**
   - Is a merge in-flight? (PR merged but commit not settled)
   - Did merge succeed or fail silently? (GitHub shows merged, but HEAD didn't move)
   - Are there unresolved merge commits? (conflict markers left in code)

### Merge Conflict Prevention Strategies

#### Strategy 1: File-Level Locking
- Maintain registry of "files currently being edited" per task
- If Task A and Task B both touch `src/auth.ts`, flag it upfront
- Decision: allow parallel (expect conflict later), or serialize (one finishes before other starts)

#### Strategy 2: Dependency Tracking
- If Task B depends on Task A (same feature area, sequential design)
- Enforce order: Task A → builds → promotes to stage → Task B → builds on fresh stage
- Prevents "Task B rebased before Task A landed, now they conflict"

#### Strategy 3: Pre-Merge Health Checks
Before allowing merge to stage/main:
1. Fresh clone of target branch
2. Attempt merge on that clone
3. Run test suite on merged state
4. If tests pass → safe to merge
5. If tests fail → block and report

#### Strategy 4: Merge Queue (GitHub-style)
- Maintain queue of tasks waiting to merge to stage
- Each waits for previous to fully land
- Run checks on merged state
- Merge only after all checks green
- Guarantees stage never has concurrent merge operations

### Orchestrator Branch Decisions

**Before promoting a task to stage:**
- Fetch fresh HEAD of stage
- Dry-run merge on throwaway branch (`git merge --no-commit --no-ff task-N-*`)
- If conflict detected:
  - **Option A:** Alert Scott (amber waiting card) with conflict diff and suggested resolution
  - **Option B:** Rebase task onto fresh stage, re-run proof units, retry merge (risky)
  - **Option C:** Block promotion, require manual resolution or deprioritization

**While promoting multiple tasks in parallel:**
- **Preferred:** Serialize promotions to stage (queue, no collision)
  - Task A finishes review → gets slot → merges to stage
  - Task B finishes review → waits → gets slot after A completes
  - Orchestrator detects when stage is stable before releasing next
- **Alternative:** Parallelize builds, serialize promotions (most likely optimal balance)

**When promoting to main:**
- Check if stage has recent commits not yet in main
- Verify stage is stable (all CI checks green, no merge commits pending)
- Block main promotion if stage is broken
- Prevents "bad merge on stage, now main inherits it"

---

## Real-Time Orchestrator Reactions

### Scenario: Task A Promotes to Stage, Merge Shows Success but HEAD Didn't Move

**Detection:**
- PR marked "merged" on GitHub
- But `git rev-parse origin/stage` returns old HEAD

**Reaction:**
- Pull fresh stage
- Check if merge actually landed
- If not: block Task B's promotion
- Alert Scott with "Task A's merge to stage failed, details: [...]"

### Scenario: Task B is Mid-Build, Task A Just Promoted to Stage

**Detection:**
- Stage HEAD changed
- Task B's branch is now stale (based on old stage)

**Reaction:**
- Option A: Auto-rebase Task B onto fresh stage, re-run proof units
- Option B: Flag Task B as "now based on stale stage, run proof units again before promoting"
- Decision: depends on whether rebase is safe (no conflicts predicted)

### Scenario: Merge Conflict on Stage Between Task A and Task B

**Detection:**
- Dry-run merge detects conflict
- Both tasks touch `src/auth.ts` lines 10–20

**Reaction:**
- Report to Scott (amber waiting card):
  - "Tasks A and B both touch `src/auth.ts` lines 10–20"
  - "Task A's version: [diff excerpt]"
  - "Task B's version: [diff excerpt]"
  - "Suggested resolution: [automated if simple, manual fix required if complex]"
- Await Scott's decision (retry, manual edit, deprioritize)

### Scenario: Code-Reviewer Finds HIGH Issue, But Build Session Wants to Promote

**Detection:**
- Build session signals "ready for promotion"
- Code-reviewer signals "CRITICAL: hardcoded API key found"

**Reaction:**
- Block promotion immediately
- Route issue details back to build session
- Request build session to fix issue and re-run proof units
- Only unblock promotion after issue resolved

---

## Orchestrator State Machine

```
Task State          Orchestrator Action
─────────────────────────────────────────────────────────────────

build-started       Spawn TDD-guide agents for each proof unit (parallel)
                    Spawn code-reviewer (waits for build to complete)
                    Monitor: test results, coverage, proof trail

build-finished      TDD agents all report GREEN
                    Check if stage is safe to merge
                    → Acquire "stage merge slot" (may queue)
                    → Fetch fresh stage HEAD
                    → Dry-run merge on throwaway branch
                    → If conflict: alert Scott, hold
                    → If clean: merge to stage, release slot
                    → Monitor: did merge actually land?

cba-complete        Code-reviewer + Codex both report PASS
                    (Codex sets status to cba-complete)
                    Stage merge already attempted
                    Check if main is ready to promote
                    → Verify stage HEAD is stable (all CI checks ✓)
                    → Verify main is open (no unresolved merges)
                    → Acquire "main merge slot"
                    → Merge stage → main
                    → Monitor: prod deploy workflow

staged              Main merge succeeded
                    Prod deploy in progress
                    Monitor workflow; await completion

production          Deploy succeeded
                    All proof units validated
                    Release all locks and slots
                    Task complete

(error states)      If any stage fails:
                    → Classify: transient or permanent
                    → Transient: retry with backoff
                    → Permanent: escalate to Scott (amber card)
                    → Wait for Scott decision before continuing
```

---

## API Additions and Tools

### 1. `GET /branch-state`

Returns current branch state across the project.

**Response:**
```json
{
  "stage": {
    "head": "abc123def456...",
    "lastUpdate": "2026-05-22T14:30:00Z",
    "pendingPRs": [
      { "number": 42, "task": 3, "status": "approved" },
      { "number": 43, "task": 7, "status": "checks-pending" }
    ],
    "inFlightMerge": null,
    "conflicts": []
  },
  "main": {
    "head": "xyz789abc123...",
    "lastUpdate": "2026-05-22T14:25:00Z",
    "pendingPRs": [],
    "inFlightMerge": null,
    "conflicts": []
  },
  "featureBranches": {
    "task-3-feature": {
      "head": "def456ghi789...",
      "status": "build-finished",
      "filesChanged": ["src/auth.ts", "tests/auth.test.ts"],
      "readyForPromotion": true
    }
  }
}
```

**Use:** Orchestrator polls to detect "did something change since I last checked?"

---

### 2. `POST /reserve-merge-slot`

Acquire a merge slot for a task (serialize promotions).

**Request:**
```json
{
  "taskNumber": 3,
  "targetBranch": "stage",
  "timeout": 300000
}
```

**Response:**
```json
{
  "status": "acquired",
  "slotId": "merge-slot-1",
  "position": 1,
  "timestamp": "2026-05-22T14:30:15Z"
}
```

or

```json
{
  "status": "queued",
  "slotId": "merge-slot-1",
  "position": 3,
  "estimatedWaitMs": 45000
}
```

**Use:** Orchestrator requests exclusive access to merge to stage/main. Prevents concurrent merge operations.

---

### 3. `POST /dry-run-merge`

Attempt merge on a throwaway branch; detect conflicts before committing.

**Request:**
```json
{
  "sourceBranch": "task-3-feature",
  "targetBranch": "stage",
  "cleanup": true
}
```

**Response (success):**
```json
{
  "status": "clean",
  "mergeCommit": "abc123def456...",
  "filesChanged": 5,
  "summary": "Merge would succeed; all files clean."
}
```

**Response (conflict):**
```json
{
  "status": "conflict",
  "conflictFiles": ["src/auth.ts", "src/config.ts"],
  "details": [
    {
      "file": "src/auth.ts",
      "lines": "10-25",
      "sourceVersion": "...",
      "targetVersion": "...",
      "merged": false
    }
  ],
  "suggestion": "Rebase source onto fresh target and resolve manually."
}
```

**Use:** Before attempting real merge, orchestrator detects conflicts and decides next steps.

---

### 4. `POST /release-merge-slot`

Release a merge slot after promotion completes.

**Request:**
```json
{
  "slotId": "merge-slot-1",
  "status": "success"
}
```

**Response:**
```json
{
  "released": true,
  "nextInQueue": { "taskNumber": 7, "waitingMs": 30000 }
}
```

**Use:** Orchestrator signals when merge is done; next queued task can proceed.

---

## Recommended Implementation Plan

### Phase 1: Foundations (1-2 weeks)
- [ ] Add `/branch-state` endpoint (read-only, no changes)
- [ ] Add `/reserve-merge-slot` and `/release-merge-slot` endpoints
- [ ] Build `OrchestratorSession` class that spawns and monitors child sessions
- [ ] Implement session registry (in-memory, persisted to `orchestrator-state.json` in runtime zone)

### Phase 2: Coordination (2-3 weeks)
- [ ] Implement dry-run merge detection (`/dry-run-merge`)
- [ ] Build sequencing logic (enforce build → review → promotion order)
- [ ] Add file-level locking for detecting contention
- [ ] Implement merge-queue serialization (Stage promotions only)

### Phase 3: Error Handling (1-2 weeks)
- [ ] Implement retry logic (classify errors, backoff, escalation)
- [ ] Add merge-conflict detection and user alerts (amber waiting cards)
- [ ] Implement timeout detection and session cancellation
- [ ] Add file contention warnings (flag conflicts before they happen)

### Phase 4: Monitoring and UX (1 week)
- [ ] Dashboard showing orchestrator state, child sessions, queued work
- [ ] Amber waiting cards for user decisions (conflicts, errors, input needed)
- [ ] Session timeline (which sessions ran, how long, what proof was generated)
- [ ] Aggregated logs (test results, review comments, errors)

---

## Proof Units for Implementation

1. **Orchestrator spawns parallel agents for independent proof units** → failing test → passing test
2. **Orchestrator serializes promotions to stage (merge queue)** → two tasks promote in parallel, only one succeeds, other queues → verified via logs
3. **Orchestrator detects merge conflict via dry-run** → conflict exists, dry-run detects it, alerts user → verified via alert message
4. **Orchestrator enforces sequencing (build → review → promotion)** → attempt promotion before review finishes, blocked → verified via state machine
5. **Orchestrator handles transient errors (retry)** → network timeout, orchestrator retries, succeeds → verified via logs
6. **Orchestrator escalates permanent errors (user alert)** → hardcoded secret found, blocks promotion, amber card sent → verified via alert
7. **File contention detection** → two tasks touch same file, orchestrator flags it → verified via warning log

---

## Notes for Task #26

- This design assumes orchestrator is **coordinator-first**, not executor. It spawns child sessions and makes decisions, but doesn't write code.
- **Parallelization by default:** identify independent work (proof units, independent files), spawn agents in parallel.
- **Serialize at merge points:** multiple tasks promoting to stage/main can conflict; use merge queue to prevent race conditions.
- **User escalation early:** if a conflict or decision needs Scott's input, alert immediately (don't try to auto-resolve and fail later).
- **Proof trail is critical:** orchestrator must capture evidence from each child session and aggregate it for review and audit purposes.

