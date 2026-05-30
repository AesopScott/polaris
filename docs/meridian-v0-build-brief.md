# Meridian V0 Build Brief

## V0 Thesis

Meridian V0 is a proactive portfolio orchestrator.

Canonical repo and knowledge workspace:

- Local repo: `C:\Users\scott\Code\Meridian`
- Remote repo: `https://github.com/AesopScott/Meridian.git`
- Obsidian build folder: `G:\My Drive\Aesop Academy\Obsidian\Meridian_Build`
- Obsidian sessions folder: `G:\My Drive\Aesop Academy\Obsidian\Meridian_Sessions`

Its first win is not building one large app. Its first win is proving that the local orchestrator can act as the local brain across many initiatives:

```text
portfolio state
  -> harness heartbeat
  -> local kernel decision
  -> remote model reasoning when useful
  -> session/directive injection
  -> proof/artifact capture
  -> Scott bottleneck queue
```

Meridian should advance projects, businesses, websites, tools, and experiments until Scott's judgment becomes the bottleneck.

## Public Launch Intent

Meridian should become a publicly available repo and marketed tool as soon as possible.

The early build should assume people following Scott in AI will see it, clone it, follow the architecture, and understand the point.

This means V0 needs:

- Clear README
- Public-friendly positioning
- Install/run instructions
- Architecture diagram or concise explanation
- Demo path
- Screenshots or short clips once UI exists
- License decision
- Contribution stance
- Safety boundaries
- No secrets or personal paths committed as required defaults

The product should be useful before it is complete. The public message can be:

> Meridian is a local orchestrator for agentic software work. You talk to the orchestrator; it drives worker sessions, harnesses, proof, and project motion.

Public launch does not mean every powerful feature is enabled for everyone on day one. It means the repo and story are coherent early.

## V0 Outcome

Meridian V0 should be able to answer, at any moment:

- What initiatives are active?
- What objectives are in motion?
- What sessions/workers/harnesses are alive?
- What is blocked, stale, failed, or waiting?
- What next moves can Meridian safely take without Scott?
- What decisions require Scott?
- What evidence exists for completed work?
- What should be injected into which session next?

## Primary Interaction Model

Scott should mainly engage Meridian through the orchestrator session.

Worker sessions should not require manual prompting as the normal operating mode. They are labor managed by the local orchestrator.

The intended model:

```text
Scott -> Orchestrator
Orchestrator -> Workers
Workers -> Harnesses
Harnesses -> Heartbeat/Events
Orchestrator -> Scott only for judgment bottlenecks
```

This differs from common multi-agent usage where the human opens several sessions and manually types into each one. Meridian should make the orchestrator the primary conversational surface and let it drive instructions, corrections, retries, transfers, and proof requirements into worker sessions.

Worker sessions still exist and remain inspectable, but they should feel like managed execution surfaces, not places Scott has to coordinate by hand.

## First Demo

A successful first demo:

1. Meridian tracks at least three initiatives.
2. Each initiative has objectives and next moves.
3. Harnesses report heartbeat state.
4. Meridian identifies safe autonomous next moves.
5. Meridian identifies Scott bottlenecks.
6. Meridian injects a targeted instruction into a session or worker.
7. Meridian records the decision, action, and result.
8. The UI/workbench shows the portfolio state clearly.
9. Scott only types into the orchestrator surface during the demo.
10. The demo can be explained publicly without private Polaris context.

## Core Objects

Build these as native domain objects before UI polish:

- `Portfolio`
- `Venture`
- `Project`
- `Initiative`
- `Objective`
- `Task`
- `NextMove`
- `Harness`
- `Heartbeat`
- `Workflow`
- `Decision`
- `Artifact`
- `Proof`
- `ScottBottleneck`

Definitions live in `context.md`.

## V0 Primitives

### 1. Portfolio Registry

Stores known ventures, projects, initiatives, and objectives.

The registry should not assume every project is a Git repo.

### 2. Harness Registry

Knows available harnesses and their capabilities.

Initial harnesses:

- agent harness
- tool harness
- git/worktree harness
- memory harness
- proof harness
- UI harness

### 3. Heartbeat

Every harness and active worker reports liveness:

```text
alive | busy | blocked | failed | sleeping | stale
```

Heartbeat is the difference between a static planner and a proactive operator.

### 4. Kernel Decision Loop

The local kernel reads portfolio state and heartbeat, then chooses:

- no action
- inspect
- ask remote model
- inject instruction
- spawn worker
- run verification
- create Scott bottleneck
- mark blocked/stale

### 5. Session Injection

Meridian can send a targeted instruction into an active worker/session.

This is the mechanism that replaces Scott as default coordinator.

Injection/steering levels should be explicit because not all model backends support true mid-system-prompt changes:

```text
none
user-message
directive
resume-context
system-prompt
```

V0 can start with directive or user-message injection. The agent harness should still record whether a backend can support deeper steering later.

### 6. Scott Bottleneck Queue

The UI must show decisions only Scott should make:

- priority
- brand/product direction
- external publishing
- spending
- strategic tradeoffs
- risky approval

### 7. Proof and Artifact Capture

Completed actions should attach evidence:

- test result
- screenshot
- browser check
- diff
- review
- decision brief
- generated artifact

## What V0 Should Not Do Yet

Do not start with:

- full app-generation platform
- cloud multi-user hosting
- generalized plugin marketplace
- production deployment automation
- complex billing/cost dashboards
- beautiful redesign from scratch
- autonomous public posting/sending
- large multi-agent factory abstraction

Those can come later. V0 should prove local orchestration intelligence.

## Public Repo Requirements

Before the first public push/announcement:

- Remove or template private paths.
- Keep `Meridian_Build`/`Meridian_Sessions` as Scott-local context, not required public runtime dependencies.
- Provide `.env.example` or settings template.
- Add clear "experimental" safety language.
- Add a minimal license.
- Add a roadmap that names harness, heartbeat, workflow, orchestrator session, and Scott bottleneck queue.
- Include a short "Why this is different" section:
  - Most tools make the human coordinate many agent sessions.
  - Meridian makes the orchestrator the primary conversation surface.
  - Worker sessions are managed by the local brain.

## Interface Carry-Forward

Preserve the Polaris interface language:

- command-center feel
- session cards
- central project context row
- nav bar style
- model selector
- diagnostic logs
- hide/minimize/expand/archive
- pin/transfer/rerun
- health, clock, version
- search/filter
- settings/projects/reset/close/cross-check/backlog/skills

Meridian adds portfolio and Scott bottleneck awareness around that proven UI.

## First Coding Milestone

Create the Meridian local brain skeleton:

```text
meridian_core/
  models.py
  portfolio.py
  heartbeat.py
  harness_registry.py
  decisions.py
  events.py
  injections.py
```

Minimum behavior:

- Load a sample portfolio.
- Load sample harness heartbeats.
- Produce next moves.
- Produce Scott bottlenecks.
- Emit a decision event.
- Produce one session injection instruction.

This can be tested without real model calls.

## V0 Success Criteria

Meridian V0 succeeds when Scott can see:

> Meridian knows what is in motion, knows what is stuck, knows what it can advance, and asks Scott only for judgment.
