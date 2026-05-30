# Meridian Context

This document defines the working language for Meridian. It is not a glossary for marketing. It is a build contract: when we use these words in code, docs, prompts, memory, UI, and tests, they should mean the same thing.

Meridian's purpose:

> Meridian is a proactive portfolio orchestrator and builder. It advances projects, businesses, websites, tools, and experiments until Scott's judgment is the bottleneck.

Public intent:

> Meridian should become a publicly available repo and marketed tool for people following Scott's AI work as soon as the V0 story is coherent.

Public positioning:

> You talk to the orchestrator. The orchestrator drives the worker sessions.

## Canonical Project Anchors

Meridian already has its own repo and Obsidian workspace.

Local repository:

```text
C:\Users\scott\Code\Meridian
```

Remote repository:

```text
https://github.com/AesopScott/Meridian.git
```

Obsidian build folder:

```text
G:\My Drive\Aesop Academy\Obsidian\Meridian_Build
```

Obsidian sessions folder:

```text
G:\My Drive\Aesop Academy\Obsidian\Meridian_Sessions
```

Current build files:

- `1-Soul.md`
- `2-Architecture.md`
- `3-Build-Plan.md`
- `4-Changelog.md`
- `5-Permissions.md`
- `6-Obsidian.md`
- `7-Integrations.md`
- `8-Logs.md`
- `FileMap.md`

When building Meridian, use these anchors instead of the Polaris repo/docs unless explicitly harvesting Polaris lessons.

## Core Principle

Meridian is not an app home. Meridian is a builder and operator.

It does not exist primarily to host agents or applications. It exists to turn intent into useful progress across a portfolio of work.

The local orchestrator is the local brain. Remote models are cognitive resources. Harnesses are the hands, senses, memory, and shipping paths.

## Portfolio

A portfolio is the full set of ventures Meridian is aware of and may help advance.

A portfolio can include:

- Businesses
- Software products
- Websites
- Internal tools
- Automation systems
- Communities
- Experiments
- Client projects
- Research directions

The portfolio is not just a list of repos. It is a map of active and potential value creation.

Example:

```text
Scott's portfolio
  - Meridian
  - Polaris
  - Aesop Academy
  - Advanced AI Concepts
  - CareGuide
  - future SaaS experiments
  - event automation
  - websites and landing pages
```

## Venture

A venture is a value-seeking container inside the portfolio.

Use venture when the work has business, audience, revenue, market, community, or strategic identity beyond a single codebase.

Examples:

- Aesop Academy
- Advanced AI Concepts
- CareGuide
- A future productized AI tool

A venture may contain many projects.

## Project

A project is an organized body of work with a concrete outcome.

A project may be software, content, operations, research, design, or launch work. It may or may not have a Git repository.

Examples:

- Build the Meridian local orchestrator
- Launch a website for a venture
- Create a lead capture funnel
- Automate Meetup event copying
- Build a Chrome extension

Do not use project as a synonym for repository. A repo is an implementation container. A project is an outcome container.

## Repository

A repository is a version-controlled codebase.

Repos are important to the harness, but they are not the top-level planning unit. A single project may use multiple repos, and a single repo may support multiple projects.

## Initiative

An initiative is a directional push inside a venture or project.

Use initiative for proactive portfolio motion: something Meridian can monitor, advance, pause, or escalate.

Examples:

- Improve Advanced AI Concepts event operations
- Build Meridian V0
- Prepare CareGuide for production promotion
- Explore a new SaaS idea
- Refresh a website

An initiative usually has objectives.

## Objective

An objective is a concrete desired outcome.

It should answer:

- What should be true when this is done?
- Why does it matter?
- How will we know?

Examples:

- Meridian can inspect harness heartbeat and inject decisions into blocked sessions.
- A landing page exists and captures leads.
- The memory panel allows Scott to edit or archive memories.
- The event copy automation avoids duplicate Meetup events.

Objectives can be short-lived or durable.

## Goal

A goal is a durable objective with persistence and follow-through.

Use goal when Meridian should keep pursuing the outcome across time, sessions, heartbeats, or restarts.

All goals are objectives. Not all objectives need to become goals.

## Task

A task is a bounded unit of work.

Tasks are execution units, not strategy units. They should be small enough to plan, perform, verify, and close.

Examples:

- Add a read-only builder kernel module.
- Wire a heartbeat endpoint.
- Fix a failing browser verification.
- Draft homepage copy variants.

Tasks may belong to objectives, initiatives, projects, or ventures.

## Next Move

A next move is the smallest useful action Meridian can take to advance an objective.

Next moves are the core of proactive operation.

Examples:

- Inspect the repo for existing scaffold patterns.
- Ask Scott to choose between two customer segments.
- Spawn a reviewer for a PR.
- Run browser verification.
- Draft an app blueprint.
- Create a sandbox prototype.

Meridian should constantly ask: what is the next move that advances the portfolio without unnecessary risk?

## Scott Bottleneck

A Scott bottleneck is a decision or judgment only Scott should make.

Meridian should work to make Scott the bottleneck for judgment, not execution.

Good Scott bottlenecks:

- Choose priority between ventures.
- Approve brand direction.
- Decide whether to spend money.
- Accept a strategic tradeoff.
- Publish externally.
- Choose target customer.

Bad Scott bottlenecks:

- Remember to run the next command.
- Notice a session stalled.
- Copy context between agents.
- Check whether tests ran.
- Manually summarize every project state.

## Harness

A harness is a capability surface Meridian can use to sense or act.

Harnesses are distributed. Each harness should report state, expose capabilities, and accept commands through a controlled interface.

Examples:

- Agent harness
- Tool harness
- Git/worktree harness
- Memory harness
- Proof harness
- Browser harness
- Release harness
- UI harness
- Backlog/task harness

## Heartbeat

A heartbeat is a live state report from a harness, session, objective, or workflow.

It tells Meridian what is alive, busy, blocked, stale, failed, or ready.

Minimum heartbeat shape:

```text
id
kind
status
current_work
last_event
blockers
capabilities
updated_at
```

Heartbeat gives Meridian liveness. Without heartbeat, Meridian becomes a static planner.

## Workflow

A workflow is coordinated motion over time.

Workflows may be fixed, generated, or adaptive. A workflow is not the mind. It is a path the orchestrator can choose, revise, pause, or abandon.

Examples:

- Plan -> build -> verify -> review -> ship
- Research -> compare -> ask Scott -> prototype
- Detect blocker -> diagnose -> inject instruction -> verify recovery

## Kernel

The kernel is Meridian's local reasoning core.

It builds the local state model, interprets intent, reads heartbeat, checks policy, selects next moves, calls remote models when useful, and injects decisions into harnesses or sessions.

The kernel should not become a giant monolith. It should reason over domain objects and delegate execution to harnesses.

## Local Brain

The local brain is Meridian's persistent, local understanding of reality.

It includes:

- Kernel state
- Portfolio state
- Harness heartbeats
- Memory
- Event log
- Policies
- Current objectives
- Known blockers

The local brain maintains continuity. Remote models help with bounded reasoning, generation, review, and synthesis.

## Remote Brain

A remote brain is a model or agent session used for cognitive work.

Examples:

- Claude
- Codex
- GPT
- DeepSeek
- Future local or hosted models

Remote brains do not own Meridian's truth. They propose, generate, review, and reason. The local brain decides what to trust, verify, store, or act on.

## Memory

Memory is durable experience that should shape future behavior.

Memory should include:

- User preferences
- Project decisions
- Venture facts
- Failure modes
- Proof patterns
- Tooling workarounds
- Strategic context

Memory is not gospel. It should be source-linked, correctable, reinforced, contradicted, and decayed.

## Proof

Proof is evidence that a claim or result is trustworthy enough to proceed.

Proof can be:

- Automated test
- Browser verification
- Screenshot
- Build output
- API check
- Review verdict
- Diff inspection
- Manual waiver

No important work should be marked done without proof or an explicit waiver.

## Artifact

An artifact is a durable output Meridian creates, modifies, verifies, or ships.

Examples:

- Code files
- Generated app folder
- Screenshot
- Test report
- PR
- Build package
- Document
- Website
- Design asset
- Decision brief

Artifacts should be indexed so Meridian can refer to them later.

## Decision

A decision is a committed choice with a reason.

Meridian should record important decisions in a decision journal:

```text
decision
reason
context
alternatives_considered
evidence_required
actor
timestamp
outcome
```

## Policy

A policy is a constraint or preference that shapes Meridian's actions.

Hard policies cannot be bypassed without Scott approval.

Soft policies are heuristics that Meridian may adapt with explanation.

## Agent

An agent is a bounded worker with a role, context, tools, and expected output.

Agents are not the center of Meridian. They are labor Meridian can recruit.

Roles may include:

- Planner
- Builder
- Reviewer
- Verifier
- Researcher
- Designer
- Release operator
- Memory distiller

## Builder

A builder is the part of Meridian that turns intent into working artifacts.

Builder does not mean "code generator only." It includes product interpretation, app blueprinting, implementation, verification, and shipping.

## Operator

An operator is the part of Meridian that keeps the portfolio moving.

It scans initiatives, detects stalled work, starts safe next moves, and escalates Scott bottlenecks.

## Orchestrator Session

The orchestrator session is Scott's primary conversational surface.

Scott should mostly talk to the orchestrator, not individual worker sessions. The orchestrator interprets intent, checks portfolio and harness state, then injects instructions into workers.

Worker sessions are managed execution surfaces. They should be visible and inspectable, but manual prompting inside them should be exceptional.

## Open Terms

These terms need more discussion before they become stable:

- Program
- Campaign
- Product
- Business
- Experiment
- Workstream
- Run
- Session
- Thread
- Workspace
- App
- Tool
- System

When a term becomes ambiguous during the build, add it here before encoding it into code.
