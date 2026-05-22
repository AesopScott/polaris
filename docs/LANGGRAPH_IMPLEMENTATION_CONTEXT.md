# LangGraph Implementation Context — Task #23

**Last Updated:** 2026-05-21  
**Task:** #23 "Migrate Polaris task orchestration to LangGraph state machine"  
**Status:** Planning (Phase 1: Design Discussion)  
**Priority:** 90 (highest)  
**Impact:** Major

---

## Executive Summary

This document captures the research, analysis, and architectural approach for migrating Polaris's task orchestration from a skill-invocation model to a formal LangGraph StateGraph. The work provides foundational infrastructure for scaling Polaris and serves as the orchestration pattern for other projects (Aesop, Scanmenow, Assessment Build).

**Key Drivers:**
1. **Education:** Deep understanding of multi-agent orchestration patterns
2. **Consistency:** Formalize the task workflow state machine with explicit gates
3. **Scalability:** Foundation for more complex multi-project orchestration
4. **Reusability:** LangGraph pattern applies to other projects in portfolio

---

## Part 1: LangGraph Research

### LangGraph vs LangChain

| Aspect | LangChain | LangGraph |
|--------|-----------|-----------|
| **Model** | Linear chains (A→B→C, exits) | Graph nodes + edges with cycles, branching, loops |
| **State Management** | Implicit (messages flow through chain) | Explicit TaskState object, persisted across invocations |
| **Conditional Routing** | Limited (basic if/else at chain level) | Full conditional edges, dynamic routing based on state |
| **Human-in-Loop** | Not designed for it | Native `interrupt_before`/`interrupt_after` pause semantics |
| **Error Recovery** | Sequential retry only | Graph state preserved; resume from exact failure point |
| **Use Case** | Quick linear workflows (load→chunk→embed→answer) | Complex stateful workflows (task progression, review gates, retries) |

**Conclusion:** LangGraph is the right fit for Polaris. LangChain is for simple pipelines, not orchestration.

### Key LangGraph Capabilities

1. **StateGraph** — Directed graph of nodes + edges representing workflow
2. **Explicit State Object** — Shared, persistent state flowing through nodes
3. **HITL Gates** — `interrupt_before` pauses before a node runs; `interrupt_after` pauses after
4. **Supervisor Pattern** — One coordinating node dispatches work to specialized agents
5. **Conditional Routing** — Edges can branch based on state (e.g., proof passed → promote; proof failed → redo)
6. **Error Resilience** — Graph state survives failures; resume from checkpoint, not restart

### Industry Validation

- **Klarna** implemented HITL with LangGraph supervisor pattern → 80% drop in support resolution times
- **120k+ GitHub stars** as of 2025; rapid adoption in production multi-agent systems
- **Coexistence pattern:** LangChain components inside LangGraph nodes (orchestration ↔ component-level logic)

### Orchestration vs Choreography

| Pattern | Fit for Polaris | Fit for Other Projects |
|---------|-----------------|------------------------|
| **Orchestration** (centralized controller) | ✅ **YES** — Task progression has clear coordinator; skills are subordinate agents | Scanmenow (scan→detect→report), Assessment Build (gap→personalization) |
| **Choreography** (event-driven, independent services) | ❌ **NO** — Would lose sequential gates | The Card (event scoring), possibly AI Factory |

**Decision:** Polaris needs **orchestration with HITL gates**. Current skill architecture is already orchestrated; LangGraph formalizes it with better state handling.

---

## Part 2: Polaris Current State

### Task Lifecycle (Status Model)

```
backlog → planned → build-started → build-finished → cba-complete → staged → production
```

**Current Execution:**
- Skills invoked manually via `/ship-task` orchestrator
- Status updates happen inside skills (manual backlog.json writes)
- No formal state machine; transitions are implicit
- Branch operations loosely gated (branch approval is ad-hoc)

### Current Architecture Constraints

1. **20-Turn Rolling Window** — Agent session context limited to last 20 turns
   - Blocks long-running tasks (planning + build + review in one session)
   - Workaround: break into separate sessions, lose context between turns

2. **Skill-Based Orchestration** — Each skill is independent
   - `/plan-task` ← separate session
   - `/start-build` ← separate session
   - User writes code ← manual
   - `/finish-build` ← separate session
   - No state machine glue; flow is user-driven

3. **Proof Verification Outside Orchestration** — Checks happen at gates, not as nodes
   - `/review-pr` → manual
   - `/codex-review` → manual
   - Registry audits → manual `/cross-boundary-audit`
   - No formal proof trail node in the graph

4. **Branch Operations Loosely Gated** — Ad-hoc approval protocol
   - No formal pause points for human confirmation
   - Branch safety relies on memory ([[feedback_branch_isolation]])

### Pain Points (What LangGraph Solves)

| Pain | Current Behavior | LangGraph Behavior |
|------|------------------|-------------------|
| **State ambiguity** | Skills update backlog.json manually; unclear order | Explicit graph transitions with formal conditions |
| **20-turn window** | Long tasks must split across sessions | State persists; nodes resume from checkpoint |
| **Human gates** | Approval loops are ad-hoc, implicit | Native `interrupt_before`/`interrupt_after` pause points |
| **Proof verification** | Manual checks outside workflow | Proof units become graph nodes; gates branch on proof pass/fail |
| **Error recovery** | Failure requires restart from beginning | Graph state preserved; resume from exact failure point |
| **Parallel coordination** | Skills run sequentially | Nodes can run in parallel where safe (audit + test simultaneously) |

---

## Part 3: Proposed LangGraph Architecture

### StateGraph Structure

```
Node Graph:
  START → plan → start_build → build → finish_build → review → codex_review → stage_decision → promote_stage → promote_prod → END
             ↓                                          ↓
          (PAUSE)                                  (PAUSE)
          User writes code                      Manual review gate

Conditional Edges:
  codex_review → {
    score >= threshold → promote_stage
    score < threshold → start_build (redo)
  }
  
  promote_prod → {
    smoke_tests pass → END (success)
    smoke_tests fail → failed_smoke (pause for decision)
  }
```

### TaskState Object

```typescript
interface TaskState {
  // Task identity
  task_number: number
  task_spec: TaskBacklogEntry  // from docs/backlog.json
  status: TaskStatus  // backlog|planned|build-started|...
  
  // Proof trail
  proof_units: ProofUnit[]
  proof_results: ProofResult[]  // RED→GREEN for each unit
  
  // Workflow context
  branch_name: string
  pr_url: string
  
  // Review evidence
  review_evidence: ReviewResult[]  // from /review-pr
  codex_score: number  // from /codex-review
  
  // Registries & audit
  boundary_audit_result: AuditResult
  lock_status: LockStatus
  
  // Human gates
  paused_at_node: string | null  // "build", "review", "failed_smoke", etc.
  human_input: any  // user signal (code_done, approved, rollback_decision, etc.)
  
  // Agent session context (optional)
  messages: BaseMessage[]  // conversation history for this phase
}
```

### Node Signatures

All nodes follow this pattern:

```typescript
async function nodeNameNode(state: TaskState): Promise<TaskState> {
  // Validate preconditions
  // Execute work (may spawn agent session)
  // Update state
  // Return updated state
}
```

### HITL Gate Semantics

**Pause for User Code:**
```
start_build_node → finish → graph.pause("build")
(UI signal: "Write code now")
User writes code, tests, commits
(User signal: "code_done")
graph.resume() → finish_build_node runs
```

**Pause for Manual Review:**
```
finish_build_node → PR opened → graph.pause("review")
(UI signal: "PR ready. Review it?")
User runs /review-pr, /codex-review
(User signal: "review_complete" or "request_changes")
graph.resume() → route based on signal
```

---

## Part 4: Implementation Roadmap

### Phase 1: StateGraph Design
**Goal:** Define the shape of the state machine, node interfaces, and HITL semantics.

**Deliverables:**
- StateGraph definition (nodes, edges, conditions)
- TaskState TypeScript interface
- Node function signature template
- HITL pause/resume protocol

**Effort:** 2 hours  
**Blockers:** None (pure design)

### Phase 2: Executor Rewrite
**Goal:** Replace server.js's rolling 20-turn message window with LangGraph executor.

**Changes:**
- `server.js` — Create `taskGraph.js` module exporting StateGraph executor
- Agent sessions now instantiate the executor instead of rolling message loop
- State persists between turns (no 20-turn truncation)
- Executor loop: `step()` → run node → collect tool calls → execute → persist state → repeat

**Deliverables:**
- `server.js` → `agents/taskGraph.js` (StateGraph definition)
- `agents/taskExecutor.js` (executor loop, state persistence)
- Updated `runDirectAgent()` to use executor instead of rolling window

**Effort:** 4 hours  
**Risk:** Large refactor of critical loop; POC validation essential before rollout

### Phase 3: Skill-to-Node Migration
**Goal:** Convert each skill to a node function.

**Nodes to Migrate:**
1. `planNode()` — from `/plan-task` skill
2. `startBuildNode()` — from `/start-build` skill
3. `buildNode()` — pause checkpoint (no-op node, user signals "code_done")
4. `finishBuildNode()` — from `/finish-build` skill
5. `reviewNode()` — from `/review-pr` skill (human gate)
6. `codexReviewNode()` — from `/codex-review` skill
7. `stageDecisionNode()` — conditional router (proof → promote or redo)
8. `promoteStageNode()` — from `/promote-stage` skill
9. `promoteProdNode()` — from `/promote-to-prod` skill

**File Structure:**
```
server.js (unchanged)
agents/
  taskGraph.js (StateGraph definition, node list)
  taskExecutor.js (executor loop)
  taskNodes/
    planNode.js
    startBuildNode.js
    buildNode.js
    finishBuildNode.js
    reviewNode.js
    codexReviewNode.js
    stageDecisionNode.js
    promoteStageNode.js
    promoteProdNode.js
```

**Deliverables:**
- All 9 nodes implemented as functions
- Each node updates TaskState appropriately
- Nodes that spawn agent work (plan, codex_review) still call runDirectAgent internally

**Effort:** 6 hours  
**Blockers:** Phase 2 executor must be working

### Phase 4: HITL Gates & Checkpoints
**Goal:** Implement pause/resume logic for user code and manual review.

**Build Checkpoint:**
- `buildNode()` is a no-op that pauses immediately
- Executor checks `human_input.signal === "code_done"` before resuming
- UI shows "Write code now" and waits for user signal

**Review Checkpoint:**
- `reviewNode()` runs `/review-pr`, then pauses
- Executor waits for `human_input.signal === "approved"` or `"request_changes"`
- Routes to `codexReviewNode()` (approved) or back to `startBuildNode()` (redo)

**Deliverables:**
- Pause/resume integration with executor
- WebSocket messages for UI signaling ("code_done", "approved", etc.)
- Error handling for timeout/abort

**Effort:** 3 hours  
**Risk:** Pause/resume protocol must be rock-solid; test extensively

### Phase 5: Integration
**Goal:** Sync all external state (backlog.json, branches, locks, registries).

**Changes:**
- Load TaskState from backlog.json at START
- Write status back to backlog.json after each node
- Update branch_name, pr_url as they change
- Check locks.json before starting
- Run `/cross-boundary-audit` as a node before promotion
- Validate registries match proof units

**Deliverables:**
- backlog.json read/write atomicity
- Branch operation confirmation (state branch_isolation)
- Lock enforcement (state lock_status)
- Registry audit node

**Effort:** 4 hours  
**Risk:** Atomic backlog.json writes; git lock ordering

### Phase 6: Proof-of-Concept (POC)
**Goal:** One complete task end-to-end through the new graph.

**Plan:**
1. Pick a simple, ready task from backlog.json (impact: minor)
2. Implement its StateGraph (all 9 nodes)
3. Run it end-to-end:
   - Graph loads task
   - plan_node runs (spawns agent)
   - start_build_node creates branch
   - Graph pauses at "build" checkpoint
   - User signals code_done
   - finish_build_node creates PR
   - Graph pauses at "review" checkpoint
   - Review returns; graph promotes to prod
4. Validate: TaskState output matches manual `/ship-task` workflow

**Deliverables:**
- One task runs through full graph
- Status changes match current behavior
- PR URL recorded correctly
- Branch operations match current safety checks
- Registry audit passes

**Effort:** 3 hours  
**Blockers:** Phases 1–5 complete; executor working

### Phase 7: Testing & Rollout
**Goal:** Run existing tasks through new graph; switch production traffic.

**Validation:**
- Run 3–5 existing tasks through graph
- Compare TaskState output to prior manual runs
- Check git history (commits, branches, PRs match)
- Verify proof trail integrity

**Rollout:**
- Switch `/ship-task` to use executor instead of skill invocation
- Deprecate (don't delete) old skill-based workflow
- Monitor for errors; fallback available

**Effort:** 4 hours  
**Testing & Debug:** 4 hours (buffer)

---

## Part 5: Timeline & Effort

| Phase | Hours | Duration | Dependencies |
|-------|-------|----------|---|
| 1: Design | 2 | — | — |
| 2: Executor | 4 | ——— | Design done |
| 3: Node Migration | 6 | ———— | Executor working |
| 4: HITL Gates | 3 | —— | Nodes done |
| 5: Integration | 4 | ——— | Gates done |
| 6: POC | 3 | —— | All above done |
| 7: Testing & Rollout | 4 | ——— | POC validated |
| Testing & Debug Buffer | 4 | ——— | Throughout |
| **Total** | **28 hours** | **~2–3 weeks** | — |

**Pace Options:**
- **Intensive:** 5–6 hours/day → ~1 week
- **Moderate:** 3–4 hours/day → ~2 weeks
- **Leisurely:** 2 hours/day → ~3 weeks

---

## Part 6: Key Decisions & Risks

### Decision 1: StateGraph Inside server.js or External Module?

**Options:**
- **A:** StateGraph lives inside server.js (simpler, everything in one place)
- **B:** StateGraph extracted to `agents/taskGraph.js` (cleaner separation, reusable)

**Recommendation:** **B** — Extraction buys clarity and reusability. `agents/taskGraph.js` becomes the orchestration logic; `server.js` remains the HTTP+WS server.

### Decision 2: Agent Sessions Per Node or Shared Context?

**Options:**
- **A:** Each complex node (plan, codex_review) spawns its own agent session (focused, fresh context)
- **B:** One long-running agent session for the entire task graph (unified context, 20-turn limit returns)

**Recommendation:** **A** — Spawning focused agent sessions per node keeps context fresh and avoids 20-turn resurrection. Nodes that need LLM work call `runDirectAgent()` internally with TaskState as context.

### Decision 3: Backward Compatibility with Old Skills?

**Options:**
- **A:** Keep old skill files (`~/.claude/commands/ship-task.md`, etc.) alongside new graph nodes
- **B:** Remove old skills once graph is live (cleaner, less confusion)

**Recommendation:** **A initially, then B** — Keep old skills during POC/testing for fallback. Once new graph is validated, deprecate old skills. Users can still reference them in Obsidian if needed.

### Risk 1: Large Refactor of Critical Workflow

**Severity:** HIGH  
**Mitigation:**
- POC validation on simple task first
- Exhaustive testing before switching production traffic
- Keep old skill-based workflow available for rollback
- Test with 3–5 existing tasks before full rollout

### Risk 2: State Persistence Atomicity

**Severity:** MEDIUM  
**Mitigation:**
- backlog.json reads/writes wrapped in transaction-like pattern (read → modify → write)
- Checksums on state before/after writes
- Restore from backup if corruption detected

### Risk 3: Branch Operations Safety

**Severity:** MEDIUM  
**Mitigation:**
- Explicit branch naming confirmation before git operations
- Node always states source branch → target branch → reason
- Locks checked before any checkout/merge
- Test branch isolation extensively

### Risk 4: HITL Pause/Resume Race Conditions

**Severity:** MEDIUM  
**Mitigation:**
- Executor state machine for pause/resume (paused, running, resuming, error)
- Timeout on pause (fail if no resume signal after N minutes)
- Test pause/resume with rapid user signals

---

## Part 7: Proof-of-Concept Success Criteria

- [ ] StateGraph compiles without errors
- [ ] One task progresses through all 9 nodes
- [ ] HITL pauses work (pause at "build", user resumes with "code_done")
- [ ] backlog.json updates correctly at each status
- [ ] Branch operations match current behavior (name, operations, safety checks)
- [ ] Registry audit passes before promotion
- [ ] Final TaskState matches what `/ship-task` + manual workflow would produce
- [ ] No loss of context between nodes

---

## Part 8: Next Steps (Resume in New Session)

1. **Phase 1: Design Discussion** — Interview design decisions, confirm end-to-end reachability
   - User problem it solves
   - End-to-end reachability check
   - System components & architecture
   - Architectural dependencies
   - Scope of changes
   - Key risks
   - Design verdict

2. **Phase 2: Outline Plan** — Distill design into phases, dependencies, scope
   - Refine 7-phase breakdown
   - Identify critical path
   - Estimate effort by phase
   - Lock dependencies

3. **Phase 3: Write Plan** — Break outline into detailed tasks
   - File-by-file changes
   - Node function signatures
   - Test strategy
   - Rollback plan

4. **After Planning:**
   - Run `/cross-boundary-audit` to validate plan against Feature Contracts
   - Run `/start-build 23` to begin implementation

---

## References

- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **Klarna Case Study:** 80% resolution time improvement with HITL orchestration
- **Polaris Soul:** `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md`
- **Polaris Architecture:** `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\2-Architecture.md`
- **Current Task Backlog:** `C:\Users\scott\Code\Polaris\docs\backlog.json` (Task #23)

---

**Created:** 2026-05-21  
**Author:** Claude (research + synthesis)  
**Status:** Ready for new session planning phase
