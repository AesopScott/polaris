# Polaris Lessons for Meridian

Polaris worked. It was not just a prototype that taught what to avoid. It proved several durable patterns that Meridian should carry forward deliberately.

This document records what worked well, why it worked, and how Meridian should preserve the value without inheriting Polaris's accidental complexity.

## 1. Local Harness as the Power Center

### What Worked

Polaris put the useful machinery close to the user's machine:

- Electron shell in `main.js`
- Local HTTP/WebSocket backend in `server.js`
- Filesystem, shell, git, browser-adjacent, MCP, memory, and model access through the local runtime
- Runtime data under `%APPDATA%\.claude\polaris`

This gave Polaris real leverage. It could inspect files, run commands, spawn models, manage sessions, track state, and update the UI without pretending the model alone was the product.

### Why It Worked

The local harness made models useful because it gave them:

- Context
- Tools
- State
- Feedback
- Recovery paths
- A visible UI surface

### Carry Forward

Meridian should also be local-first at the core. The local brain should own reality. Remote models should be cognitive resources, not the system of record.

### Change

Do not let one file become the whole harness. Polaris concentrated too much in `server.js`. Meridian should split the local harness into modules or services from the start:

- kernel
- agent harness
- tool harness
- memory harness
- proof harness
- heartbeat
- workflow
- state store
- UI bridge

## 2. Multiple Model Backends

### What Worked

Polaris learned to route work across different model paths:

- Direct OpenRouter agent sessions
- Claude Max chat sessions through Claude CLI
- Codex sessions
- DeepSeek routine sessions
- GPT chat sessions

This was valuable because different models and routes had different strengths, costs, constraints, and tool access.

### Why It Worked

Polaris did not depend on one model path. It treated model access as a backend choice.

### Carry Forward

Meridian should preserve this as an agent harness principle:

> Roles first, models second.

The kernel should ask for a planner, builder, reviewer, verifier, researcher, or release operator. The agent harness should choose the concrete model/backend.

### Change

Avoid exposing provider details as the main user-facing concept. The system should reason in roles and capabilities.

## 3. Session Cards and Visible State

### What Worked

Polaris made AI work visible through session cards, status colors, streamed output, and session lifecycle state.

The UI could show:

- running
- waiting
- done
- error
- test/try-it-out states
- forks and spawned sessions

### Why It Worked

Agent work is hard to trust when it is invisible. Session cards gave Scott a sense of what was alive, blocked, waiting, or complete.

### Carry Forward

Meridian needs an even stronger version:

- initiative state
- objective state
- harness heartbeat
- worker sessions
- blockers
- Scott bottleneck queue
- proof status
- artifacts created

### Change

State should not be inferred mostly from final message text. Meridian should have explicit heartbeat and event records.

## 4. Proof Units

### What Worked

Polaris's proof-unit model was one of the strongest patterns:

- expected behavior
- proof type
- exact command or verification path
- expected initial failure
- expected passing evidence
- waiver guidance

This moved work from "agent says done" toward "evidence says done."

### Why It Worked

Models are probabilistic. Proof units anchored model work to observable reality.

### Carry Forward

Meridian should make proof a native object, not a workflow add-on.

Every meaningful objective should be able to answer:

- What would prove this?
- Can proof be automated?
- If not, what waiver is acceptable?
- Where is the evidence stored?

### Change

Do not require every activity to enter the same task pipeline before proof exists. Meridian should generate proof requirements from context, risk, changed files, and memory.

## 5. Directive-Based Coordination

### What Worked

The multi-session orchestrator introduced shared directive files:

- pending
- acknowledged
- completed
- failed
- priority
- target session/branch

This proved that one coordinating actor could steer other sessions without directly doing their work.

### Why It Worked

It created a lightweight control channel between sessions. Build sessions could remain responsible for their own work while the orchestrator controlled sequencing and conflict response.

### Carry Forward

Meridian should preserve directive injection as a core mechanism:

> The local brain injects decisions into active workers.

### Change

Use a real internal state/event substrate instead of ad hoc JSON coordination files as the primary mechanism. JSON can remain a boundary/debug format.

## 5B. Mid-Session Steering and Prompt Injection

### What Worked

Codex-style steering is extremely valuable: the operator can inject updated instructions, context, or decisions into a running session without starting over.

This is one of the most important mechanisms for replacing Scott as the default coordinator.

### Why It Worked

Long-running AI work drifts. New facts appear after the session starts:

- a harness reports a blocker
- proof is missing
- a reviewer finds a defect
- Scott makes a decision
- project state changes
- memory retrieval finds relevant context
- another session finishes work that changes the plan

If the local orchestrator cannot inject steering mid-run, the human has to keep re-coordinating manually.

### Carry Forward

Meridian should treat steering as a core capability:

- inject decision
- inject context
- inject proof requirement
- inject blocker
- inject correction
- inject memory
- inject stop/retry/transfer instruction

This should be exposed through the agent harness and session UI.

### Constraint

Some backends may not support true mid-system-prompt mutation:

- Claude CLI
- Codex CLI
- other CLI-backed sessions
- remote hosted sessions with fixed system prompts

Meridian should still support best-effort steering for those sessions through:

- high-priority user-message injection
- queued directive messages
- session resume prompts
- tool-call-visible control messages
- controlled restart with preserved state packet
- transfer to a new session with updated kernel context

The agent harness should report each backend's steering capability:

```text
none | user-message | directive | resume-context | system-prompt
```

### Change

Do not assume every worker can be steered the same way. Steering is a capability with levels, not a universal primitive.

## 6. Branch and Worktree Safety

### What Worked

Polaris took branch/worktree isolation seriously:

- task branches
- worktree checks
- branch request protocol
- orchestrator authority for branch operations
- lock files
- conflict scanning

### Why It Worked

Multiple agents editing the same project can destroy trust quickly. Branch and worktree discipline made parallel work possible.

### Carry Forward

Meridian needs a first-class Git/worktree harness with:

- ownership
- dirty state
- active branch
- active worktree
- open PRs
- conflict risk
- safe merge/rebase policies

### Change

Do not encode this as scattered rules in prompts. It should be executable local policy.

## 7. Capability Policy

### What Worked

Extracting `capabilityPolicy.js` into pure policy logic was a strong move:

- blocked destructive command classes
- write modes
- allowed roots
- installer detection
- fail-closed behavior
- testable pure evaluator

### Why It Worked

The model did not have to remember every unsafe command. The harness could block risky actions deterministically.

### Carry Forward

Meridian should think in capabilities and policy results:

- read file
- edit file
- run command
- browse local app
- open PR
- deploy
- spend money
- contact external audience

Each capability should have risk, policy, required evidence, and audit output.

### Change

Move from command-string detection as the main policy mechanism toward typed capability requests. Keep command detection as a defense-in-depth layer.

## 8. Memory Injection

### What Worked

Polaris memory became useful when it was:

- ranked
- capped
- reinforced on access
- safe to fail
- injected as concise context
- tested independently

The `memoryInjection` module is small, dependency-injected, and fail-soft. That shape is good.

### Why It Worked

Agents need relevant context, but raw memory dumps overwhelm them. Ranked, capped injection gives enough experience without drowning the prompt.

### Carry Forward

Meridian should use memory as process experience:

- preferences
- decisions
- recurring failures
- proof patterns
- venture facts
- tool workarounds

### Change

Memory should be correctable, typed, source-linked, and able to contradict older memories. It should influence the kernel's logic, not just appear as a prompt block.

## 9. Backlog and Status Tracking

### What Worked

The backlog/status system gave Polaris a durable map of work:

- task number
- title
- description
- priority
- status
- plan
- proof units
- branch
- PR URL
- impact

Statuses made it possible to resume work and coordinate review/promotion.

### Why It Worked

Without durable task state, every session starts from amnesia.

### Carry Forward

Meridian needs durable objects for:

- venture
- project
- initiative
- objective
- task
- next move
- artifact
- proof
- decision

### Change

Do not make task status the primary reasoning engine. In Meridian, status is a report of reality, not the source of intelligence.

## 10. Independent Review Paths

### What Worked

Polaris separated review paths:

- `/review-pr`
- `/codex-review`
- orchestrator approval handler

This created independent pressure before promotion.

### Why It Worked

One model is not enough for high-trust work. Independent review plus proof gates reduces risk.

### Carry Forward

Meridian should preserve independent roles:

- builder
- reviewer
- verifier
- release operator

### Change

The local kernel should decide when independent review is required based on risk, public exposure, changed files, and business consequence.

## 11. Registries and Boundary Awareness

### What Worked

Polaris registries documented cross-boundary contracts:

- WebSocket messages
- HTTP endpoints
- env vars
- collections
- contracts
- Python modules

This helped catch producer/consumer drift.

### Why It Worked

Agent-generated code often misses downstream consumers. Registries forced the system to look across boundaries.

### Carry Forward

Meridian should preserve boundary awareness for generated systems:

- routes
- APIs
- schemas
- jobs
- events
- data stores
- UI surfaces
- external integrations

### Change

Prefer generating registries from typed contracts where possible. Hand-maintained registries are useful, but they drift.

## 12. Error Reporting and Debug Visibility

### What Worked

The debug-log pattern made generated code more diagnosable. It named the need to surface failures in the UI instead of burying them in logs.

### Why It Worked

AI-built systems fail. The user needs visible, contextual failure reports.

### Carry Forward

Meridian should treat errors as first-class events:

- operation attempted
- failure reason
- affected harness
- retry policy
- escalation target
- artifact/log link

### Change

Do not make error reporting a prompt convention only. It should be a harness/event primitive.

## 13. Skills as Reusable Procedures

### What Worked

Polaris skills captured repeatable procedures:

- plan task
- start build
- finish build
- review PR
- codex review
- promote
- copy Meetup events

They gave agents procedural memory.

### Why It Worked

Not all knowledge belongs in model memory. Some knowledge is a procedure with steps, gates, and expected outputs.

### Carry Forward

Meridian should keep reusable procedures, but treat them as workflow harnesses.

### Change

The local kernel should choose when to invoke a procedure. Procedures should not be the top-level intelligence.

## 14. AppData Runtime Zone

### What Worked

Polaris separated source code, installed app, and runtime data. That protected the source tree and gave the app somewhere durable to store sessions, config, logs, and transient state.

### Why It Worked

Local AI systems need a runtime zone separate from source.

### Carry Forward

Meridian should have a clear local runtime home:

```text
Meridian/
  meridian.db
  events.jsonl
  artifacts/
  logs/
  workspaces/
  harness-heartbeats/
```

### Change

Use a typed state store for canonical state instead of relying primarily on editable JSON files.

## 15. Incremental Extraction Worked

### What Worked

The module topology effort extracted typed boundaries from `server.js` without requiring a dangerous rewrite:

- contracts
- sessionStore
- agentRuntime
- toolRuntime
- mcpGateway
- crossCheck
- backlog
- httpRoutes
- wsAdapter

### Why It Worked

It allowed the architecture to improve while the app still ran.

### Carry Forward

Meridian should be built in vertical slices with tests and clear boundaries.

### Change

Start with those boundaries instead of extracting them later.

## Meridian Carry-Forward Principles

1. Local brain owns reality.
2. Remote models are cognitive resources.
3. Harnesses execute capabilities and report heartbeat.
4. Proof is required for trust.
5. Memory is process experience, not just notes.
6. Directives/injections are how the local brain steers workers.
7. Status reports reality; logic decides next moves.
8. Capability policy is executable, not just prompt text.
9. Artifacts and errors are first-class.
10. Scott should be the bottleneck for judgment, not coordination.

## What Not To Repeat

- One giant runtime file.
- JSON files as the core state substrate.
- Prompt rules as the main safety mechanism.
- Status pipelines as the source of intelligence.
- Manual sync between source-of-truth and docs when generation is possible.
- UI state inferred from prose endings.
- Encoding-sensitive file writes scattered through the codebase.
- Retrofitting proof after workflows already exist.

## First Meridian Implication

The first Meridian build should not begin with app scaffolding. It should begin by preserving Polaris's strongest lesson:

> A local harness with visible state, proof, memory, and model access can make AI work real.

Meridian's V0 should turn that into a proactive portfolio operator:

```text
portfolio state
  -> harness heartbeat
  -> local kernel decision
  -> model call when useful
  -> directive/session injection
  -> proof/artifact capture
  -> Scott bottleneck queue
```
