# Polaris Feature Inventory for Meridian

**Purpose:** Decision checklist for whether each Polaris feature should be included in Meridian, excluded from Meridian, or modified for Meridian.

**Source reviewed:** Polaris git history through `d911c3e` (`Make DeepSeek direct sessions queue mode`), current navigation/UI surface, runtime modules, feature manifest, and existing Polaris-to-Meridian lesson docs.

**How to use:** Mark exactly one decision per row when reviewed.

- `Include` = carry into Meridian substantially as-is.
- `Modify` = carry the value forward but redesign, rename, simplify, or move to a different harness.
- `Exclude` = do not intentionally rebuild for Meridian.
- `Notes` = Meridian-specific requirement, change, or rationale.

## 1. Core Shell / Runtime

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Electron desktop shell | Local Electron app with bundled renderer and Node backend. | Bifrost / Local Runtime | [ ] | [ ] | [ ] | Meridian needs an actual openable cockpit app, not only generated HTML. |
| Local HTTP server | Node server exposes local app, health, WebSocket, APIs. | Local Runtime / Bifrost | [ ] | [ ] | [ ] | Split from Polaris `server.js` monolith. |
| WebSocket event bus | UI and backend communicate through large WS message surface. | Bifrost / Prime Event Bus | [ ] | [ ] | [ ] | Meridian should make events typed and harness-owned. |
| AppData runtime directory | Runtime state under `%APPDATA%\.claude\polaris`. | Local Runtime | [ ] | [ ] | [ ] | Meridian needs its own clean runtime root and migration plan. |
| Server stdout/stderr capture | Server logs captured for packaged app debugging. | Local Runtime / Aegis | [ ] | [ ] | [ ] | Keep; logs should be event-backed and visible in cockpit. |
| Auto-restart server on crash | Main process restarts server with crash-loop guard. | Beacon / Local Runtime | [ ] | [ ] | [ ] | Meridian needs restart/resteer logic with visible health. |
| Server health endpoint | `/health` used by app load and monitors. | Beacon | [ ] | [ ] | [ ] | Keep as harness health primitive. |
| Build/install scripts | One-shot build/install loop for private app. | Release Harness | [ ] | [ ] | [ ] | Meridian needs release harness later; not cockpit-first. |
| Fast dev packaging | `dist:fast`, prune dist, package tuning. | Release Harness | [ ] | [ ] | [ ] | Useful but likely V2/V3 release work. |
| Public/private build manifest | Feature flags and secrets marked public/private. | Release / Policy Harness | [ ] | [ ] | [ ] | Important for future public Meridian. |
| Installer archive retention | Keeps recent installers/builds. | Release Harness | [ ] | [ ] | [ ] | Nice operational feature; decide later. |

## 2. Navigation / Command Center UI

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Command-center visual identity | Dark nav, project center row, polished control panel. | Bifrost | [ ] | [ ] | [ ] | Scott likes the look; Meridian cockpit should evolve from it. |
| Project context header | Working directory, remote repo, project name/focus. | Bifrost / Compass | [ ] | [ ] | [ ] | Must stay; becomes Prime project/mission focus. |
| Model/tier selector | Floor/Balanced/Power and mode controls. | Bifrost / Relay | [ ] | [ ] | [ ] | Prime may choose models, but user visibility remains valuable. |
| Clock/version display | Visible app version and clock. | Bifrost | [ ] | [ ] | [ ] | Keep; simple orientation anchor. |
| Health pill/bar | Health checking status visible in nav. | Beacon / Bifrost | [ ] | [ ] | [ ] | Must become real harness health. |
| Session stats filters | Running/Done/Testing/Hidden/Orchestrator filters. | Bifrost / Session Lifecycle | [ ] | [ ] | [ ] | Keep with better lifecycle semantics. |
| Dynamic session search | Search/filter session cards. | Bifrost | [ ] | [ ] | [ ] | Keep; likely by project/objective/role too. |
| Reset layout | Repacks session grid. | Bifrost | [ ] | [ ] | [ ] | Scott uses master reset; keep. |
| Close All | Bulk close/archive/push flow. | Session Lifecycle / Bifrost | [ ] | [ ] | [ ] | Keep but Prime should manage most closure. |
| Settings panel | Central API keys/config/projects/MCP/etc. | Bifrost / Config Harness | [ ] | [ ] | [ ] | Needed; should be modular. |
| Projects panel | Manage named project workdirs/repos/Obsidian dirs. | Compass / Bifrost | [ ] | [ ] | [ ] | Critical; use for portfolio/project definitions. |
| Backlog panel | Global/per-project backlog view/edit. | Compass / Workflow | [ ] | [ ] | [ ] | Important but Meridian may move backlog into Prime cockpit. |
| Skills panel | Browse/click installed skills. | Tool Harness | [ ] | [ ] | [ ] | Keep as harness capability browser. |
| Status panel | Project status notes and memory injection history tab. | Bifrost / Echo | [ ] | [ ] | [ ] | Keep concept; automate updates. |
| Memory panel | Retrieval status and QueryMemory events. | Echo / Atlas / Bifrost | [ ] | [ ] | [ ] | Meridian needs stronger version. |
| Balance panel/button | Provider balance, token/cost graph, model spend. | Bifrost / Relay | [ ] | [ ] | [ ] | Already added to Meridian V2 scope. |
| Cross-check panel | Review findings/history, pre-build gate. | Aegis / Bifrost | [ ] | [ ] | [ ] | Keep as proof/review surface. |
| Code Health panel | Churn/complexity/ownership analysis. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Useful; decide V2/V3 priority. |
| Monaco panel | In-app file tree/editor. | Tool Harness / Bifrost | [ ] | [ ] | [ ] | Useful, but maybe lower priority than cockpit. |
| Files panel | Browse project filesystem in app. | Tool Harness / Bifrost | [ ] | [ ] | [ ] | Keep if scoped and safe. |
| Preview panel | Floating preview iframe. | Browser Harness / Bifrost | [ ] | [ ] | [ ] | Scott rarely used; likely modify or defer. |
| Web/live server panel | Serve selected project locally. | Browser Harness | [ ] | [ ] | [ ] | Useful for app/site builds. |
| Archive panel | Search/reactivate old sessions. | Session Lifecycle / Echo | [ ] | [ ] | [ ] | Keep; ties to memory and history. |
| Versions panel | File change history and restore. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Strong safety feature; likely keep. |
| Routines panel | Scheduled/event-triggered routines. | Workflow / Beacon | [ ] | [ ] | [ ] | Meridian needs heartbeat/workflow automation, redesigned. |
| Tour / onboarding | Voice-guided walkthrough with levels. | Bifrost / Product | [ ] | [ ] | [ ] | Public product later; lower V2 priority. |
| Support panel | In-app bug/feature request via email. | Product / Release | [ ] | [ ] | [ ] | Public version feature, not core private build. |
| Manifest panel | Select public/private feature packaging. | Release / Policy | [ ] | [ ] | [ ] | Important later for public distribution. |

## 3. Session Cards / Worker UI

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Session card grid | Multiple visible cards with live output. | Bifrost / Session Lifecycle | [ ] | [ ] | [ ] | Meridian likely makes Prime primary and workers secondary/minimal. |
| Per-card diagnostic log | Detailed session log in card. | Aegis / Bifrost | [ ] | [ ] | [ ] | Scott called this amazing; keep. |
| Card status states | running/waiting/test/done/error/hold/monitoring. | Session Lifecycle / Bifrost | [ ] | [ ] | [ ] | Make explicit event state, not inferred text. |
| Status animations/colors | Pulsing cards, color-coded states. | Bifrost | [ ] | [ ] | [ ] | Keep visual state, refine cockpit style. |
| Project chip / color stripe | Card shows active project. | Bifrost / Compass | [ ] | [ ] | [ ] | Keep; ensure contrast-aware text. |
| Session rename | Right-click card title rename. | Bifrost | [ ] | [ ] | [ ] | Polaris names were weak; Prime should name sessions. |
| Hide session | Hide cards, hidden count/filter. | Bifrost | [ ] | [ ] | [ ] | Highly valuable; keep. |
| Minimize session | Collapse/minimize cards. | Bifrost | [ ] | [ ] | [ ] | Keep. |
| Expand session | Larger view when needed. | Bifrost | [ ] | [ ] | [ ] | Keep. |
| Pin session | Protect/pin important cards. | Bifrost / Prime Attention | [ ] | [ ] | [ ] | Reinterpret as attention priority. |
| Reset card size | Per-card size reset. | Bifrost | [ ] | [ ] | [ ] | Scott rarely used; likely exclude/low priority. |
| Global card sizing | Size all cards / font persistence. | Bifrost | [ ] | [ ] | [ ] | Scott valued size controls. |
| Terminal font size persistence | Font size saved across sessions. | Bifrost | [ ] | [ ] | [ ] | Keep if cards remain terminal-like. |
| Bottom metrics row | Time, token speed, TTFT, cost. | Bifrost / Relay | [ ] | [ ] | [ ] | Scott did not use much; move useful parts to Balance/Prompt Meter. |
| Prompt payload size line | Shows `(under 1k)` / `(12.4k)` per dispatch. | Relay / Bifrost | [ ] | [ ] | [ ] | Already added to Meridian V2 scope; critical. |
| Streaming rate / TTFT | Live token speed and first-token time. | Relay / Bifrost | [ ] | [ ] | [ ] | Useful for diagnostics; maybe not card footer. |
| User quick replies | Yes/No/Continue/Confirm/CBA/Review/Codex/Start/Finish. | Bifrost / Workflow | [ ] | [ ] | [ ] | Keep fewer: Yes/No/Continue/Confirm; workflow buttons may move to Prime. |
| Rerun button | Re-run prior session/task. | Session Lifecycle | [ ] | [ ] | [ ] | Keep as recovery primitive. |
| Stop button | Stop session/process/stream. | Session Lifecycle | [ ] | [ ] | [ ] | Must be rebuilt; Polaris stop was unreliable until later patches. |
| Transfer button | Move context/work to another session/project. | Relay / Session Lifecycle | [ ] | [ ] | [ ] | Very valuable; keep and make role-aware. |
| Fork button | Mirror prompts to second model, promote fork. | Relay | [ ] | [ ] | [ ] | Scott did not use; maybe replace with Dual-Lane Cognition. |
| Archive button | Archive individual session. | Session Lifecycle / Echo | [ ] | [ ] | [ ] | Keep. |
| Locks button | Manage file locks from card. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Scott did not use; maybe keep hidden/admin. |
| Verbose toggle | Toggle verbosity / details. | Bifrost / Relay | [ ] | [ ] | [ ] | Maybe useful; low priority. |
| System instruction injection | Float launcher can send system-style instruction to Max. | Relay / Session Lifecycle | [ ] | [ ] | [ ] | Meridian needs steering injection across backends. |
| Queue polling button `Q` | Idle session checks assigned queue file. | Session Lifecycle / Prime | [ ] | [ ] | [ ] | Important lesson; Meridian should own this natively. |
| Queue badge / pending turns | Displays queued prompts and supports edit/delete. | Session Lifecycle / Bifrost | [ ] | [ ] | [ ] | Keep in Prime/worker queue views. |

## 4. Model / Agent Backends

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Claude Max CLI sessions | Account-based Claude CLI session cards. | Relay / Account Automation | [ ] | [ ] | [ ] | Must be core private capability; public build may disable/warn. |
| Claude tier mapping | Haiku/Sonnet/Opus tier selection for Max. | Relay | [ ] | [ ] | [ ] | Meridian should route by role/risk, not only user tier. |
| Claude resume support | Reuses Claude session id to reduce cold-start overhead. | Relay / Session Lifecycle | [ ] | [ ] | [ ] | Keep where backend supports it. |
| Direct OpenRouter agent loop | Tool-using direct API agent sessions. | Relay | [ ] | [ ] | [ ] | Maybe include as aggregator path, not primary default. |
| OpenRouter model catalog | Fetch/catalog exact model IDs and rates. | Relay / Balance | [ ] | [ ] | [ ] | Useful; provider metadata should be generic. |
| Provider pin per tier | Pin provider only for model tier. | Relay | [ ] | [ ] | [ ] | Meridian should use capability/provider constraints. |
| DeepSeek routines | Direct DeepSeek API for scheduled routines. | Relay / Workflow | [ ] | [ ] | [ ] | Meridian uses DeepSeek primary provider and Q-mode build lanes. |
| DeepSeek direct model button | `Deep` / `Deep Q` direct API. | Relay / Bifrost | [ ] | [ ] | [ ] | Add as primary provider; queue-only mode preferred. |
| DeepSeek Q mode | Stateless queue worker, no additive transcript. | Relay / Session Lifecycle | [ ] | [ ] | [ ] | Important Meridian pattern for cost/control. |
| GPT desktop sessions | ChatGPT desktop path. | Relay | [ ] | [ ] | [ ] | Scott rarely uses; decide priority. |
| Codex CLI sessions | Codex exec/thread integration. | Relay / Aegis Review | [ ] | [ ] | [ ] | Use for real Codex review; keep distinct from Claude sessions. |
| Model eval runner | Scripted fixtures across models. | Relay / Aegis | [ ] | [ ] | [ ] | Useful for model selection and provider quality. |
| Benchmark runner | TTFT/tok/s/latency and Obsidian queue. | Relay / Balance | [ ] | [ ] | [ ] | Keep as diagnostics, not main UI clutter. |
| Image attachments | Images passed to agent/Max; auto-escalate tier. | Relay / Tool Harness | [ ] | [ ] | [ ] | Keep multimodal support where backend supports it. |
| Doc/audio/video attachments | Extract docs/audio/video frames into prompts. | Tool Harness / Relay | [ ] | [ ] | [ ] | Useful; budget-controlled in Meridian. |
| Browser/Chrome tool | Read/render active Chrome tab via DevTools. | Browser Harness | [ ] | [ ] | [ ] | Keep as tool harness capability. |
| WebFetch/WebSearch tools | You.com, Brave, DuckDuckGo fallback. | Tool Harness | [ ] | [ ] | [ ] | Keep with source attribution and budget. |
| AskUserQuestion tool | Model can ask user with inline prompt UI. | Bifrost / Prime | [ ] | [ ] | [ ] | In Meridian, Prime should gate user questions. |
| SetStatus tool | Agent sets own session status. | Session Lifecycle / Bifrost | [ ] | [ ] | [ ] | Keep but validate through lifecycle events. |
| SetProject tool | Agent can set active project. | Compass / Session Lifecycle | [ ] | [ ] | [ ] | Need guardrails; Prime/project state should own it. |
| TodoWrite tool | Agent updates task todo list. | Workflow / Bifrost | [ ] | [ ] | [ ] | Keep as structured progress, maybe Prime-owned. |

## 5. Memory / Knowledge

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Obsidian vault integration | Project notes, sessions, status, knowledge. | Echo / Atlas | [ ] | [ ] | [ ] | Keep; central to Meridian memory. |
| Polaris_Sessions folder | Session transcripts written to Obsidian. | Echo / Archive | [ ] | [ ] | [ ] | Keep as structured archive, not raw-only. |
| Project memory folders | Per-project knowledge loaded/readable. | Echo / Atlas | [ ] | [ ] | [ ] | Meridian should retrieve, not bulk inject. |
| QueryMemory tool | Ranked retrieval over Obsidian with citations/trace. | Atlas | [ ] | [ ] | [ ] | Keep and improve as Atlas. |
| Ranked Obsidian retrieval | BM25-ish path/purpose/notes ranking. | Atlas | [ ] | [ ] | [ ] | Already aligned with Meridian Atlas. |
| Proactive memory injection | Inject relevant memory at chat turn 1. | Echo / Atlas / Relay | [ ] | [ ] | [ ] | Modify: budgeted retrieval packets, not blind injection. |
| Memory injection history | Panel/log of memory injections. | Echo / Bifrost | [ ] | [ ] | [ ] | Keep for transparency. |
| Auto-distill sessions | DeepSeek summarizes sessions to knowledge files. | Echo | [ ] | [ ] | [ ] | Keep but improve with typed memory records. |
| FileMap.md injection/lookup | Important files and purpose map. | Atlas / FileMap | [ ] | [ ] | [ ] | Meridian already has FileMap; keep as canonical. |
| Session archive search/reactivate | Archive transcripts and search them. | Echo / Session Lifecycle | [ ] | [ ] | [ ] | Keep; connect to memory graph. |
| Project status notes | Status board synced to Obsidian. | Echo / Compass | [ ] | [ ] | [ ] | Keep, automate more. |
| Long-term memory beyond context | Practical backstop via files/RAG. | Echo / Atlas | [ ] | [ ] | [ ] | Core Meridian pillar. |

## 6. Proof / Safety / Review

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Cross-check engine | Reviews writes/diffs and records JSONL. | Aegis | [ ] | [ ] | [ ] | Keep as Aegis proof/review layer. |
| Cross-check panel | Shows findings, grouped diffs, inline summaries. | Aegis / Bifrost | [ ] | [ ] | [ ] | Keep with Review Console. |
| Pre-build cross-check gate | Build button blocked until check passes/acknowledged. | Aegis / Release | [ ] | [ ] | [ ] | Keep for releases; Prime gates earlier too. |
| Auto cross-check session on rejection | Spawn review/fix session after FAIL. | Aegis / Session Lifecycle | [ ] | [ ] | [ ] | Modify into Prime repair routing. |
| Write size cap | Hard cap on file writes. | Tool Harness / Aegis | [ ] | [ ] | [ ] | Keep. |
| Phase 0 backup before edits | Backup source files before agent writes. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Keep, maybe less noisy with git/worktrees. |
| Encoding sanity check | Guard BOM/UTF/mojibake problems. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Very relevant due prior BOM issues. |
| File write versioning | Every AI write stored in file-versions.json. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Keep or replace with structured undo log. |
| File read tracking | Versions panel tracks reads per session. | Aegis / Atlas | [ ] | [ ] | [ ] | Useful for audit/proof. |
| Locks/protected patterns | Blocks protected files/paths. | Aegis / Policy | [ ] | [ ] | [ ] | Keep but UI can be less prominent. |
| Shell sandboxing | Bash/PowerShell scoped to workdir and rules. | Tool Harness / Policy | [ ] | [ ] | [ ] | Keep; Meridian sessions must use unique worktrees. |
| Workdir write enforcement | Blocks writes outside working directory except allowed paths. | Tool Harness / Aegis | [ ] | [ ] | [ ] | Keep. |
| Git auto-commit rule | Agents expected to commit file changes. | Git Harness / Workflow | [ ] | [ ] | [ ] | Meridian should define per-lane commit/proof rules. |
| SetStatus auto-test after commit | Commit/push ends card in test state. | Session Lifecycle / Aegis | [ ] | [ ] | [ ] | Keep as proof-awaiting state. |
| Codex review command/workflow | Independent code review with status transitions. | Aegis / Relay | [ ] | [ ] | [ ] | Keep with real Codex sessions, not Claude-labeled review. |
| CBA / cross-boundary audit | Audit registries for cross-boundary changes. | Aegis | [ ] | [ ] | [ ] | Keep for high-risk architecture. |
| Proof units | Expected behavior + command/proof/waiver pattern. | Aegis | [ ] | [ ] | [ ] | Core Meridian requirement. |
| Review statuses | pr-reviewed/codex-reviewed/review-passed etc. | Workflow / Aegis | [ ] | [ ] | [ ] | Simplify into Meridian state machine. |
| Zod WS contracts | Runtime validation for WS messages. | Bifrost / Local Runtime | [ ] | [ ] | [ ] | Keep typed contracts. |
| Capability policy | Policy tests and capability gating. | Aegis / Tool Harness | [ ] | [ ] | [ ] | Keep; integrate with Aegis. |

## 7. Orchestration / Workflow

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Orchestrator session | Auto session for multi-session project context. | Prime | [ ] | [ ] | [ ] | Meridian Prime is the orchestrator, not a side session. |
| Orchestrator sessions filter | Stats/filter for orchestrator cards. | Bifrost | [ ] | [ ] | [ ] | Prime UI replaces this. |
| Orchestrator glow | Visual distinction for orchestrator card. | Bifrost | [ ] | [ ] | [ ] | Meridian cockpit should make Prime primary. |
| Multi-session conflict detection | Orchestrator detects file/session conflict. | Prime / Session Lifecycle | [ ] | [ ] | [ ] | Keep and formalize. |
| Branch gate / merge authority | Orchestrator gates merges/stage/main transitions. | Git Harness / Prime | [ ] | [ ] | [ ] | Keep with explicit branch permission object. |
| Directive files | Session directives polling and status. | Prime Event Bus / Workflow | [ ] | [ ] | [ ] | Replace ad hoc files with event/state substrate; keep debug export. |
| Session guidance alerts | Cross-session alerts/broadcasts. | Prime / Beacon | [ ] | [ ] | [ ] | Keep; formalize as restart/resteer logic. |
| Health monitor session | Persistent monitor, auto-remediation, cross-session injection. | Beacon / Prime | [ ] | [ ] | [ ] | Keep as Beacon harness, not ordinary session. |
| Cross-session prompt injection | Health monitor can inject prompts into sessions. | Prime / Session Lifecycle | [ ] | [ ] | [ ] | Important; govern with steering modes. |
| Queue polling | Session card checks live-build/review files when idle. | Prime / Session Lifecycle | [ ] | [ ] | [ ] | Core lesson; Meridian should make queues first-class. |
| Live build queue files | `live-build-1..5.md` style queue orchestration. | Prime / Workflow | [ ] | [ ] | [ ] | Temporary control plane; Meridian should internalize. |
| Review queue files | Separate Codex review queues. | Aegis / Workflow | [ ] | [ ] | [ ] | Keep concept; enforce real review backend. |
| No-empty-queue invariant | Coordinator keeps build queues stocked. | Prime | [ ] | [ ] | [ ] | Add to Prime restart/resteer rules. |
| Three-commit review cadence | Route review after three task-changing commits. | Aegis / Workflow | [ ] | [ ] | [ ] | Keep as policy, maybe risk-tiered. |
| Unique worktree per session | Worker sessions use isolated worktrees. | Git Harness / Session Lifecycle | [ ] | [ ] | [ ] | Prime Directive. |
| Branch movement permission | Only Scott/Prime may direct branch movement. | Git Harness / Policy | [ ] | [ ] | [ ] | Prime Directive. |
| Backlog task lifecycle | Plan/start/finish/review/promote/archive statuses. | Workflow / Compass | [ ] | [ ] | [ ] | Modify into simpler Meridian objective lifecycle. |
| Skills pipeline | plan-task/start-build/finish-build/review-pr/promote-stage/prod. | Workflow / Tool Harness | [ ] | [ ] | [ ] | Keep capability but maybe not all user-facing. |
| Orchestrate skill | Multi-session coordination skill. | Prime / Workflow | [ ] | [ ] | [ ] | Lessons become Prime behavior. |
| Ship-task pipeline | Structured PR/task shipping workflow. | Workflow / Release | [ ] | [ ] | [ ] | Useful but adapt to Prime-driven workflow. |

## 8. Project / Git / Release

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Project CRUD | Named projects with workdir/repo/Obsidian/instructions. | Compass | [ ] | [ ] | [ ] | Core. |
| GitHub repo scaffolding | Create local git/public GitHub repo on project save. | Git Harness / Release | [ ] | [ ] | [ ] | Useful but gated; avoid surprise public actions. |
| Git status summary | Project git status in Connect/Summary. | Git Harness / Bifrost | [ ] | [ ] | [ ] | Keep. |
| Serialized merge slots | Queue branch pushes/merge slots. | Git Harness / Prime | [ ] | [ ] | [ ] | Keep as Git harness primitive. |
| Push to Git button | Manual push from orchestrator/close flows. | Git Harness / Bifrost | [ ] | [ ] | [ ] | Keep but Prime should own default routing. |
| Push to Obsidian button | Manual transcript/status push. | Echo / Bifrost | [ ] | [ ] | [ ] | Keep. |
| Auto Obsidian on session close | Close/push writes notes/status. | Echo / Session Lifecycle | [ ] | [ ] | [ ] | Keep but with structured records. |
| Startup changelog popup | Recent commits shown on app launch. | Bifrost / Release | [ ] | [ ] | [ ] | Nice; maybe not critical. |
| App version bump discipline | Version in UI/package/changelog. | Release Harness | [ ] | [ ] | [ ] | Keep. |
| Public build compliance | Public/private feature masking. | Release / Policy | [ ] | [ ] | [ ] | Needed before public Meridian. |
| Mac build workflow | Manual macOS build decoupled from main pushes. | Release Harness | [ ] | [ ] | [ ] | Later. |
| Build button | Runs installer/build with gate. | Release Harness / Bifrost | [ ] | [ ] | [ ] | Keep, maybe only after V2 cockpit. |

## 9. Integrations / Connectors

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| MCP catalog | Configurable MCP servers and credentials. | Tool Harness | [ ] | [ ] | [ ] | Keep as tool harness UI. |
| GitHub MCP | Repo/issues/PR/search integration. | Tool Harness / Git Harness | [ ] | [ ] | [ ] | Keep. |
| Obsidian MCP / REST | Knowledge base sync/read/write. | Echo / Atlas | [ ] | [ ] | [ ] | Keep. |
| Google Drive OAuth | Native OAuth and Drive file access. | Tool Harness | [ ] | [ ] | [ ] | Useful; probably V3/product. |
| Firebase integration | Firebase projects/service account. | Tool Harness / Product | [ ] | [ ] | [ ] | Decide if Meridian needs it. |
| Brevo email | Support/transactional email via API/MCP. | Tool Harness / Product | [ ] | [ ] | [ ] | Public/product later. |
| ElevenLabs TTS | Voice narration for onboarding. | Bifrost / Product | [ ] | [ ] | [ ] | Optional; boot sequence audio idea may reuse. |
| You.com Search MCP | Free web search. | Tool Harness | [ ] | [ ] | [ ] | Keep search abstraction, provider flexible. |
| Brave Search | API fallback for search. | Tool Harness | [ ] | [ ] | [ ] | Keep as optional provider. |
| DuckDuckGo fallback | Web search fallback. | Tool Harness | [ ] | [ ] | [ ] | Keep if reliable/legal. |
| Chrome extension bridge | Browser-side bridge/remote debugging. | Browser Harness | [ ] | [ ] | [ ] | Useful but maybe defer. |
| Meetup copy skills | Advanced AI Concepts Meetup replication. | Tool Harness / Aesop-specific | [ ] | [ ] | [ ] | Likely exclude from core Meridian; maybe plugin. |
| Aesop Course Creator | Course panel/tooling. | Domain Plugin | [ ] | [ ] | [ ] | Exclude from Meridian core; plugin/project app. |
| Diamond/Open Design/Courses buttons | Project/product-specific launches. | Product Plugins | [ ] | [ ] | [ ] | Likely plugin system, not Meridian core. |

## 10. Diagnostics / Observability

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Per-session diag files | Detailed loop/tool/API diagnostics per session. | Aegis / Beacon | [ ] | [ ] | [ ] | Keep; event-backed and linked to proof. |
| Visible system route lines | Shows backend/model/routing info in card. | Relay / Bifrost | [ ] | [ ] | [ ] | Keep; avoid misleading labels like OpenRouter vs DeepSeek. |
| Prompt payload size display | Shows approximate prompt size each send. | Relay / Bifrost | [ ] | [ ] | [ ] | Critical; already added to Meridian V2. |
| Usage/token log | JSONL token/cost log. | Relay / Balance | [ ] | [ ] | [ ] | Keep structured. |
| API balance checks | OpenRouter/DeepSeek/other balance tests. | Balance / Relay | [ ] | [ ] | [ ] | Keep for routing/cost pressure. |
| Model test buttons | Validate API key/model/provider. | Settings / Relay | [ ] | [ ] | [ ] | Keep. |
| Error surfacing | Empty model response/API errors visible with retry count. | Relay / Bifrost | [ ] | [ ] | [ ] | Keep. |
| Retry loop | Retry API errors/empty responses. | Relay | [ ] | [ ] | [ ] | Keep with policy bounds. |
| Completion check | Warn if session ends without response. | Aegis / Session Lifecycle | [ ] | [ ] | [ ] | Keep. |
| Health snapshots | Diagnose CPU/MCP helpers/UI lag. | Beacon | [ ] | [ ] | [ ] | Keep as Beacon. |
| Verbose idle tracking | Root-cause inactive/stale sessions. | Beacon / Session Lifecycle | [ ] | [ ] | [ ] | Keep. |
| Debug logging utility | `pushDebugLog` pattern. | Bifrost / Local Runtime | [ ] | [ ] | [ ] | Keep generalized event log. |
| Runtime registries | Docs for WS messages/events/env/statuses/contracts. | Aegis / Docs | [ ] | [ ] | [ ] | Keep as architecture documentation. |
| Sync checker | `check-polaris-sync.js` drift check. | Release / Aegis | [ ] | [ ] | [ ] | Meridian needs installed/source drift checks. |

## 11. Security / Credentials / Public Product

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Secret encryption | Stable local encryption key for secrets. | Config / Policy | [ ] | [ ] | [ ] | Keep or use OS credential store. |
| Secret masking | SECRET_MASK resolved safely in tests/saves. | Config / Bifrost | [ ] | [ ] | [ ] | Keep. |
| Config backup before writes | Backup `config.json` on every write. | Config / Aegis | [ ] | [ ] | [ ] | Keep; settings loss was costly. |
| Public feature manifest | Marks public/private features/secrets. | Release / Policy | [ ] | [ ] | [ ] | Keep for future public repo/tool. |
| Account automation warnings | Account-based automation may violate ToS. | Policy / Bifrost | [ ] | [ ] | [ ] | Meridian public build needs disabled/warning gates. |
| Connect-tab write protection | Tokenized write gate for MCP config. | Config / Aegis | [ ] | [ ] | [ ] | Keep. |
| WebSocket schema validation | Reject malformed WS messages. | Local Runtime / Aegis | [ ] | [ ] | [ ] | Keep. |
| Write-once privilege guards | Prevent pipeline privilege escalation. | Aegis / Workflow | [ ] | [ ] | [ ] | Keep as policy tests. |
| Worktree ownership verification | Detect sessions operating in wrong/shared worktree. | Git Harness / Prime | [ ] | [ ] | [ ] | Core Prime rule. |

## 12. Product / UX Extras

| Feature | Polaris Behavior | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Voice-guided onboarding | ElevenLabs/Browsers TTS tour. | Product / Bifrost | [ ] | [ ] | [ ] | Could become Prime boot/wake audio. |
| NASA-style startup sequence | Not fully Polaris, but discussed for Meridian. | Bifrost / Beacon | [ ] | [ ] | [ ] | Put in non-orchestrator/system surface. |
| Cockpit visual language | Emerging Meridian V1 requirement, not Polaris. | Bifrost | [ ] | [ ] | [ ] | Carry forward from mockups, not current Polaris UI. |
| Color palette controls | Palettes/color shifters. | Bifrost | [ ] | [ ] | [ ] | Scott rarely used; maybe exclude. |
| Decorative UI flourishes | Scroll bars, top scrolls, glow effects. | Bifrost | [ ] | [ ] | [ ] | Keep only where it reinforces state. |
| Humor/ticker/wisdom messages | Ticker jokes/wisdom. | Product / Bifrost | [ ] | [ ] | [ ] | Nice but not core. |

## 13. Known Polaris Lessons to Decide Explicitly

| Lesson / Issue | Polaris Evidence | Meridian Owner | Include | Modify | Exclude | Notes |
|---|---|---|---:|---:|---:|---|
| Avoid one-file harness | `server.js` absorbed too much. | All Harnesses | [ ] | [ ] | [ ] | Meridian must modularize early. |
| Prompt drag is dangerous | DeepSeek additive prompt growth caught by payload meter. | Relay / Bifrost | [ ] | [ ] | [ ] | Make visible and budgeted. |
| Account limits affect orchestration | Claude usage windows blocked build lanes. | Relay / Balance / Prime | [ ] | [ ] | [ ] | Prime must route by quota/provider health. |
| Wrong review backend wastes work | Claude sessions were mistaken for Codex review sessions. | Aegis / Relay | [ ] | [ ] | [ ] | Review backend identity must be explicit/proven. |
| Queue polling must be native | Manual polling was unreliable until Q button added. | Session Lifecycle / Prime | [ ] | [ ] | [ ] | Meridian should not depend on user keeping queues alive. |
| Worker queues must never be empty | Empty queues stalled progress. | Prime / Workflow | [ ] | [ ] | [ ] | Add no-empty-queue invariant. |
| Sessions must use unique worktrees | Shared worktrees risk overwrite/conflict. | Git Harness / Prime | [ ] | [ ] | [ ] | Prime Directive. |
| Stop must be reliable | Polaris stop failed in real use. | Session Lifecycle | [ ] | [ ] | [ ] | Rebuild as stateful process control. |
| UI should expose truth | Misleading DeepSeek/OpenRouter route line caused confusion. | Bifrost / Relay | [ ] | [ ] | [ ] | All routing/health labels need proof. |
| Human should not drive worker sessions | Scott wants Prime as main interface. | Prime / Bifrost | [ ] | [ ] | [ ] | Meridian UI should center Prime, not worker cards. |

## Initial Triage Suggestions

These are not final decisions, just the first-pass recommendation from reviewing Polaris:

- **Likely include/modify as core:** project context header, session cards, diagnostic logs, hide/minimize/search/filter, transfer, pin, stop rebuilt, queue polling, unique worktrees, cross-check/Aegis, proof units, QueryMemory/Atlas, Obsidian/Echo, Balance, visible prompt payload meter, multi-provider Relay, Prime orchestration, health/Beacon, build/review queues, typed WS/contracts, config backup/secrets.
- **Likely defer or plugin:** Meetup tools, Aesop Course Creator, Diamond/Open Design project buttons, support tickets, public packaging, Google Drive/Firebase/Brevo, onboarding tour, Monaco editor, preview/live server, benchmark/eval runner.
- **Likely exclude or hide:** locks button as prominent card control, per-card reset size, fork as Polaris implemented it, bottom card cost/TTFT clutter, color shifters, decorative-only UI.

