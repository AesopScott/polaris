# Polaris 3.0 Builder Kernel

## Thesis

Polaris 3.0 should invert the current architecture:

- Polaris is not an app with an orchestrator session.
- Polaris is the builder.
- Sessions, tools, backlog operations, proof gates, memory retrieval, browser checks, GitHub, and legacy workflows become harnesses around the orchestrator kernel.

The current Polaris system is valuable because it is disciplined: task state, proof units, branch isolation, review gates, registries, and promotion rules protect the project from agent drift. The next version should keep that discipline, but stop making the fixed pipeline the center of the product.

The new center is a builder loop:

```text
Imagine -> Specify -> Build -> Verify -> Ship -> Learn
```

OpenClaw and Hermes are best understood here as homes for applications and agents. Polaris should be different: a builder that can create, modify, verify, and ship applications. It may use hosted agents, goal loops, or external runtimes, but its core identity is not "place where apps run." Its core identity is "system that turns intent into working software."

## Current Model

Polaris currently behaves like a structured workflow engine:

```text
User request
  -> backlog task/status
  -> skill selection
  -> fixed workflow step
  -> agent/tool execution
  -> proof/review gate
  -> next status
```

The LangGraph task graph and `/ship-task` flow formalize this:

```text
plan -> start_build -> build -> finish_build -> review -> codex_review -> promote_stage -> promote_prod
```

This is safe, but rigid. It asks "which workflow step are we in?" before it asks "what is the actual situation?"

## Target Model

Polaris 3.0 starts from desired application outcome and context:

```text
User product/build intent
  -> context kernel
  -> policy + memory + evidence requirements
  -> generated build plan
  -> harness action
  -> verification
  -> durable memory/state update
```

The fixed task pipeline remains available, but as a legacy harness. The builder kernel may choose it, partially use it, skip it with justification, or create a more suitable build path.

## Builder vs Application Home

Polaris 3.0 is not trying to be a general place where arbitrary agents live forever. It is trying to be the workshop that makes applications.

| System Type | Primary Question | Output |
|---|---|---|
| Agent/app home | What agents/apps are running and what goals do they pursue? | Hosted agents, workflows, automations |
| Builder | What should exist, how should it work, and how do we make it real? | Code, tests, UI, docs, deployable artifacts |

The builder needs goal persistence, memory, tools, and autonomy, but those are means. The product is not a persistent agent. The product is shipped software.

This changes the kernel's job:

- It must understand product intent, not just task intent.
- It must generate missing structure when the user only gives a rough outcome.
- It must build interfaces, data models, workflows, tests, docs, and release paths.
- It must know when to create an app, when to modify an app, and when an app should not exist because a model/tool transformation is enough.
- It must treat verification and shipping as first-class, not afterthoughts.

## Kernel Responsibilities

### 0. Imagine

Turn a rough desire into a concrete application shape:

- Who is this for?
- What job should it perform?
- What is the first useful screen or workflow?
- What data does it need?
- What should be generated, stored, edited, or displayed?
- What can be handled by an existing model/tool instead of a custom app?
- What would a "good enough to use" first version include?

### 1. Observe

Collect the live world state before deciding:

- Current user message and active objective
- Existing goal/task/backlog state
- Git branch, worktree, dirty files, staged files
- Active sessions and their scopes
- Open PRs, review state, CI/check status
- Relevant project memories and recent retrieval traces
- Files likely affected by the objective
- Known risk zones such as `server.js`, registries, contracts, and shared UI files

### 2. Interpret

Convert observations into a situational model:

- What is Scott trying to build?
- Is this exploration, implementation, repair, review, promotion, or operations?
- What is already true?
- What is blocked?
- What could be done safely now?
- What evidence would make the result trustworthy?
- Which policies are hard gates and which are preferences?

### 3. Specify

Create the smallest useful build contract:

- Product objective
- Target user/workflow
- Core behaviors
- Non-goals
- Acceptance criteria
- Required assets/data
- Verification path
- Release target

The spec should be durable enough that worker agents can execute it, but light enough that exploration does not drown in ceremony.

### 4. Decide

Choose the next action based on the situational model:

- Answer directly
- Ask Scott a judgment question
- Create or attach a backlog task
- Invoke a legacy skill such as `/plan-task` or `/start-build`
- Spawn a specialized worker session
- Generate an app scaffold
- Modify an existing application surface
- Run a local verification command
- Inspect code or docs
- Open browser verification
- Update memory
- Stop because a hard policy blocks progress

Each decision should produce a short decision journal entry.

### 5. Build

Execute through harnesses, not ad hoc paths:

- Agent harness
- Tool harness
- Git/worktree harness
- Backlog harness
- Proof harness
- Browser harness
- GitHub harness
- Memory harness
- Legacy workflow harness

Harnesses own execution details and safety checks. The kernel owns intent, sequencing, and justification.

### 6. Verify

Every material action must produce evidence appropriate to its risk:

- Targeted test output
- Build or typecheck result
- Browser screenshot/check
- Diff inspection
- Review verdict
- Registry consistency check
- Manual waiver with reason

Verification is not a fixed pipeline step. It is generated from the objective, changed files, risk profile, and project memory.

### 7. Ship

Move from "it works locally" to "it is usable":

- Package or run the app
- Open the local URL or artifact
- Produce screenshots or browser verification when relevant
- Create commits and PRs when requested or appropriate
- Update task/status surfaces
- Report what is ready to try

Shipping can be local, staged, production, or just a verified artifact. The kernel should know the difference.

### 8. Learn

After a session or important action, the kernel should write durable knowledge:

- User preference
- Project decision
- Recurring failure mode
- Proof pattern
- Tooling workaround
- Architecture constraint
- Outcome summary

Memory should hold process knowledge, not just facts.

## Hard Policies vs Soft Policies

Polaris 3.0 needs flexibility without becoming mushy. The split is:

### Hard Policies

These cannot be bypassed by the kernel without explicit Scott approval:

- Do not overwrite user changes.
- Do not merge or promote without required proof/review evidence.
- Do not edit another session's worktree.
- Do not bypass branch/worktree safety gates.
- Do not hide failed verification.
- Do not treat incomplete or blocked work as complete.

### Soft Policies

These are defaults the kernel may adapt with explanation:

- Usually plan before building.
- Usually create a backlog task for durable product work.
- Usually run cross-boundary audit for shared contracts or registries.
- Usually run browser verification for UI changes.
- Usually split major tasks before implementation.
- Usually prefer narrow edits over refactors.

The kernel may deviate from a soft policy if the decision journal records why.

## Context Kernel

The first buildable primitive is a context kernel: a structured object assembled at the start of meaningful work and refreshed after actions.

Suggested shape:

```ts
interface PolarisContextKernel {
  objective: {
    rawUserRequest: string;
    inferredBuildIntent: string;
    productShape?: string;
    targetUser?: string;
    successCriteria: string[];
    nonGoals: string[];
    riskLevel: 'low' | 'medium' | 'high';
  };
  workspace: {
    cwd: string;
    branch: string;
    dirtyFiles: string[];
    activeWorktrees: string[];
    openPrs: Array<{ number: number; branch: string; status: string }>;
  };
  projectState: {
    activeTask?: number;
    taskStatus?: string;
    proofUnits?: unknown[];
    activeSessions: Array<{ id: string; type: string; scope?: string; status: string }>;
  };
  memory: {
    retrieved: Array<{ id?: string; type?: string; content: string; score?: number }>;
    applicablePatterns: string[];
  };
  policies: {
    hard: string[];
    soft: string[];
    triggered: string[];
  };
  recommendedActions: Array<{
    action: string;
    reason: string;
    confidence: number;
    requiredEvidence: string[];
  }>;
}
```

This object becomes the "program" in the Software 3.0 sense: the model gets objective, memory, live world state, policies, and evidence expectations as context.

## Decision Journal

Before a non-trivial action, the kernel records:

```text
Decision:
  Next action:
  Why:
  Evidence needed:
  Hard policies checked:
  Soft policies applied or skipped:
  Alternatives considered:
```

This does two things:

- Makes adaptive behavior auditable.
- Creates high-quality memory extraction material after the session.

## Harness Map

| Harness | Current Seeds | 3.0 Role |
|---|---|---|
| Agent harness | `runDirectAgent`, chat sessions, routine sessions | Spawn workers with kernel-shaped context |
| Tool harness | native tools, MCP tools, capability policy | Execute actions with policy checks |
| Memory harness | `lib/memory.js`, `lib/memoryInjection.js`, `QueryMemory` | Retrieve and reinforce process memory |
| Backlog harness | `src/runtime/backlog.ts`, `docs/backlog.json` | Report durable task state without dominating cognition |
| Proof harness | proof units, `/finish-build`, docs | Generate evidence expectations and verify them |
| Legacy workflow harness | `/ship-task`, LangGraph graph | Provide reliable structured procedures when appropriate |
| Git harness | worktree checks, branch gates | Own branch/worktree safety and conflict detection |
| UI harness | session cards, memory panel, orchestrator panel | Show kernel state, decisions, blockers, and evidence |
| App scaffold harness | future | Create new apps, screens, routes, data stores, assets, and verification commands |
| Release harness | existing dist/build scripts, future deploy adapters | Turn verified work into runnable or shipped artifacts |

## Migration Path

### Phase 1: Builder Kernel as Read-Only Advisor

Build a module that assembles `PolarisContextKernel` for a user request and returns a product/build interpretation plus recommended actions. It does not execute anything.

Deliverables:

- `src/runtime/orchestratorKernel.ts`
- Context assembly from workspace, backlog, sessions, memory, and policies
- Unit tests with fixture contexts
- UI/debug endpoint to inspect kernel output

Proof:

- Given a UI-change request, kernel recommends browser verification.
- Given dirty user files, kernel flags overwrite risk.
- Given a task in `planned`, kernel recommends start-build as one option, not as a commandment.
- Given a rough app idea, kernel infers first useful screen, data needs, acceptance criteria, and likely scaffold path.

### Phase 2: Decision Journal

Persist kernel decisions to JSONL.

Deliverables:

- `decision-journal.jsonl` under the Polaris app data directory
- Decision record schema
- Concise UI display in the orchestrator panel

Proof:

- Each non-trivial recommendation has a reason, evidence expectation, and policy check.

### Phase 3: Harness Invocation

Allow the kernel to invoke a small, safe set of harness actions:

- read files
- run verification commands
- query memory
- spawn a worker with a bounded prompt
- generate a read-only scaffold proposal

No writes, branch operations, or promotion yet.

Proof:

- Kernel can inspect, recommend, spawn a reviewer, and summarize without modifying project files.

### Phase 4: Legacy Workflow as Tool

Expose current pipeline steps as callable harness actions:

- plan task
- start build
- finish build
- review
- promote

The kernel chooses them based on context instead of always following status transitions.

Proof:

- For a normal backlog implementation task, kernel chooses the legacy workflow.
- For an exploratory architecture discussion, kernel does not force backlog ceremony.

### Phase 5: Adaptive Proof Planning

Generate verification plans from objective + changed files + memory.

Proof:

- UI changes produce browser checks.
- Contract changes produce contract tests and registry checks.
- Memory changes produce retrieval tests.
- Server runtime changes produce targeted policy/runtime tests.

### Phase 6: Application Builder Harness

Add the first write-capable builder harness for low-risk application scaffolds.

Deliverables:

- App blueprint schema
- Scaffold generator for a known stack or existing Polaris app surface
- Browser verification requirement
- Screenshot or live URL output

Proof:

- A rough app request can become a runnable first screen with tests/checks.
- The generated result is not a landing page unless that is the explicit product.
- The kernel can explain why it chose the stack and what it intentionally left out.

## First Implementation Slice

Start with read-only kernel output. It has low risk and high leverage.

Suggested task:

> Build a read-only Polaris 3.0 builder kernel that turns a user request into product/build intent, assembles workspace state, task state, memory hits, policy triggers, and recommended next actions. Do not execute actions yet. Expose the result through a debug endpoint and tests.

Why this first:

- It does not disturb existing task orchestration.
- It creates the central abstraction.
- It makes the difference between "pipeline state" and "builder state" concrete.
- It can be tested without live agents.

## Open Design Questions

- Should the kernel live in TypeScript runtime first, or as a sidecar Python/agent process?
- Should goals be explicit durable objects, separate from backlog tasks?
- Should the kernel output be visible in every session card or only the orchestrator panel?
- What is the minimum decision journal that is useful without becoming noisy?
- When should a recommendation become an automatic action?
- How should contradictory memories be surfaced and corrected?
- What is the first blessed app scaffold target: Electron surface, local web app, extension, or standalone project?
- Should Polaris build apps inside the current repo, in project worktrees, or in generated app folders?

## North Star

Polaris 3.0 is a project-native builder.

It should know what Scott wants to build, understand the project, choose the right amount of process, recruit the right workers, produce working software, verify outcomes, ship usable artifacts, and remember what it learned.

The pipeline remains valuable. It just stops being the mind.
