# Polaris UI Lessons for Meridian

This document captures Scott's lived experience using Polaris. Treat this as product evidence, not casual preference. Meridian should preserve what worked, retire what did not, and improve the places where Polaris proved the need but not the implementation.

## Overall Direction

Scott likes the Polaris interface. Meridian should not start from a totally new visual system.

Carry forward:

- The overall command-center feel
- The session cards
- The nav bar look
- The central project context row
- Model selection controls
- Version number
- Clock
- Health bar concept
- Dynamic session search/filtering
- Project focus

Brand shift:

- Change Polaris to Meridian.
- Keep the general "Your AI Command Center" framing unless a stronger Meridian-specific line emerges.
- Change the logo, but preserve the polished command-center identity.
- Design so public screenshots and demos are possible later. Meridian should eventually become a public, marketed tool, but V0 can stay private while proving the orchestrator model.

## Primary Conversation Surface

Scott wants to mainly engage Meridian through the orchestrator session.

This is a major UX difference from typical multi-agent tools. Scott should not need to open multiple worker sessions and manually type instructions into each one.

Target interaction:

```text
Scott talks to orchestrator.
Orchestrator talks to worker sessions.
Worker sessions execute, report heartbeat, and surface evidence.
Scott intervenes for judgment, priority, taste, risk, or approval.
```

UI implication:

- The orchestrator session should be visually primary.
- Worker sessions should remain inspectable, hideable, transferable, and debuggable.
- Worker sessions should show orchestrator-injected instructions and steering history.
- Scott should be able to intervene in a worker, but that should be exceptional, not the normal path.
- Quick replies should primarily answer orchestrator questions, not advance worker pipeline steps manually.

## Project Context Header

This worked extremely well and should be preserved almost directly:

- Working directory
- Remote git repo information
- Project name in the middle
- Project focus / selected project

Why it matters:

Meridian is a portfolio orchestrator. The user must always know which project, repo, and working context the local brain is acting in.

Meridian improvement:

- Preserve this interface.
- Add portfolio/initiative awareness without cluttering the existing project row.
- Make project focus an input to orchestrator logic, not only UI display.

## Session Cards

Session cards worked very well.

Carry forward:

- Card-based session layout
- Hide/minimize behavior
- Expand button
- Archive session button
- Diagnostic/debug log in the card
- Pin button
- Transfer button
- Rerun button
- Size controls, including changing all cards together
- Strong color/status presentation

Improve:

- Session card names never became good enough.
- Status button was underused because it was not fed enough automated state.
- Persistent running/monitoring state sometimes stopped even when Scott expected it to keep running.
- Stop button failed too often and must be rebuilt.

Retire or de-emphasize:

- Locks button: Scott never used it.
- Reset Size button on cards: Scott rarely/never used it.
- Preview: Scott never used it.
- Fork: Scott ended up not using it.
- Bottom token/time/cost performance metrics: visually pretty but not very useful.
- Color shifters: not used much.

Keep with lower priority:

- Verbose button may still be valuable, even though Scott did not use it much.
- Top scrolls/scrolling bar/color flourish looks cool, even if not actively used.

## Diagnostic Log

The diagnostic log in session cards is excellent and should be treated as a core Meridian feature.

Carry forward:

- Per-session diagnostic log
- Clear error/info distinction
- Easy visibility inside the card

Meridian improvement:

- Logs should be event-backed, not just streamed text.
- Harnesses should report diagnostic events directly.
- Debug evidence should connect to decisions, proof, and artifacts.

## Hide, Minimize, Search, and Filtering

Hide/minimize was extremely valuable.

Carry forward:

- Hide session
- Minimize session
- Expand session
- Dynamic search sessions
- Filtering/sorting by session state

Meridian improvement:

- Add filters by initiative, project, objective, model/role, blocked state, pinned state, and waiting-on-Scott state.
- Make hidden/minimized sessions visible through summary counts so important blocked work is not forgotten.

## Pin

Pin should stay and be used better.

Meridian meaning:

Pin should mark attention priority.

Potential uses:

- Keep important session visible.
- Promote session/objective into Scott bottleneck queue.
- Tell orchestrator "watch this closely."
- Prevent auto-archive/hide.
- Bias heartbeat summaries toward pinned items.

## Transfer

Transfer is remarkably valuable and must stay.

Meridian meaning:

Transfer is a context-moving primitive. It lets work move between sessions, models, roles, or harnesses.

Meridian improvement:

- Transfer from builder to reviewer.
- Transfer from stalled session to diagnosis session.
- Transfer from chat exploration to objective/task.
- Transfer from project to initiative memory.
- Transfer from one model role to another with a concise state packet.

## Steering Injection

Meridian should expose mid-session steering/injection where the backend supports it.

This is similar to Codex steering: the orchestrator or Scott can inject updated instructions, context, proof requirements, or corrections into an active session without starting over.

UI needs:

- visible indication that a session was steered
- what was injected
- who injected it: Scott or orchestrator
- whether the backend received it as a true system update, directive, resume context, or user-message injection
- ability to inspect the steering history

This is especially important because CLI-backed Claude/Codex sessions may not support true mid-system-prompt mutation. The UI should show the actual steering mode rather than pretending all sessions are equal.

## Rerun

Rerun should stay, even if it was underused.

Meridian meaning:

Rerun is a recovery primitive.

Improve:

- Rerun with same context.
- Rerun with updated memory.
- Rerun with selected model/role.
- Rerun only failed proof.
- Rerun as diagnosis instead of repeating blindly.

## Stop

The stop button failed too often in Polaris. Meridian must do this much better.

Requirement:

Stop must be reliable, observable, and stateful.

Meridian behavior:

- Stop request acknowledged immediately.
- Harness reports stopping -> stopped or failed-to-stop.
- Child processes are tracked.
- Session state reflects cancellation.
- Any lingering process is surfaced.
- Stop does not silently fail.

This belongs in the heartbeat/harness layer, not only UI.

## State and Persistent Running

State worked okay but was not reliable enough for long-running monitors.

Carry forward:

- Visible state matters.
- Running/blocked/done/waiting/error cards are useful.

Improve:

- Persistent monitor state should be heartbeat-backed.
- A monitor should not quietly stop.
- The UI should distinguish idle, sleeping, polling, blocked, failed, and complete.
- The orchestrator should be able to restart or escalate stale monitors.

## Master Navigation

Scott consistently used the reset button in Master Navigation.

Carry forward:

- Keep a global reset/navigation recovery control.
- Preserve the nav bar look.

Improve:

- Make reset semantics explicit: UI layout reset, session view reset, or orchestrator state reset should not be ambiguous.

Most valuable nav buttons from Polaris:

- Settings
- Projects
- Reset
- Close
- Cross Check
- Backlog
- Skills
- Harness

Meridian recommendation:

- Keep these as primary nav actions or very near-primary actions.
- Treat Close as important, not incidental. Scott called it out strongly.
- Cross Check, Backlog, and Skills are proven operational surfaces, even if their Meridian meaning evolves into proof, portfolio/objective state, and workflow harnesses.
- Add Harness as a new Meridian-native nav surface.
- Do not crowd the primary nav with rarely used experimental controls until the orchestrator proves they are daily-use actions.

## Harness Navigation

Meridian should have a first-class Harness button.

Purpose:

- Show every active harness.
- Show each harness's heartbeat.
- Show capabilities exposed by each harness.
- Show whether the harness is alive, busy, blocked, failed, stale, or sleeping.
- Show recent events and errors.
- Eventually allow Scott to configure or modify harness behavior.

Likely sub-harness views:

- Agent harness
- Tool harness
- Git/worktree harness
- Memory harness
- Proof harness
- Browser harness
- Release harness
- UI harness
- Backlog/objective harness
- Workflow harness

This should begin as visibility, not modification. First make harness state legible. Then add controls where Scott actually needs them.

## Quick Reply Buttons

Instant reply buttons were very valuable:

- Yes
- No
- Continue
- Confirmed
- CBA
- Review Codex
- Start Finish

Meridian impact:

Because the orchestrator will control more of the workflow, fewer quick replies may be needed.

Likely carry-forward set:

- Yes
- No
- Continue
- Confirmed

Possible contextual buttons:

- Approve
- Hold
- Retry
- Transfer
- Verify

Principle:

Quick replies should serve Scott bottlenecks, not recreate the old manual pipeline.

## Bottom Metrics

Scott did not use:

- amount of time
- average training tokens per second
- TFT
- TTFT
- cost

Recommendation:

- Remove from primary card UI or move behind details/diagnostics.
- Keep cost/latency data in logs or analytics if useful for system tuning.
- Do not spend prime UI space on metrics Scott does not act on.

## Size Controls

Color shifters were not important. Size controls were important.

Carry forward:

- Per-card size adjustment
- Ability to shift all cards at once

De-emphasize:

- Manual color shifters unless tied to semantic state.

## Memory Button

The memory button should continue.

Meridian note:

Memory is its own harness and deserves a first-class UI surface.

Future discussion needed:

- Memory inspection
- Memory edit/archive
- Memory source/provenance
- Memory influence on decisions
- Memory attached to project/initiative/objective/session

## Health Bar

The health bar concept is good, but Polaris had health issues.

Carry forward:

- Central health indicator

Improve:

- Health should be heartbeat-backed.
- It should reflect harness status, model availability, local server state, queue state, stale monitors, and stuck sessions.
- Clicking health should explain what is unhealthy and what Meridian is doing about it.

## Clock and Version

Scott loves:

- Clock
- Version number

Carry forward directly.

## Model Selection

Scott likes the model selection interface.

Carry forward:

- Visible selectable models
- Overall interface shape

Meridian improvement:

- Orchestrator may choose models automatically by role.
- UI should still allow Scott to see and override model choices.
- Model selector may evolve into role/model mapping.

## Features To Remove or Hide by Default

Remove or hide unless a clear Meridian use appears:

- Preview
- Fork
- Locks button
- Card reset size button
- Primary display of token/time/cost metrics
- Manual color shifters

Do not delete underlying capabilities if they serve the orchestrator. Just stop spending primary UI space on controls Scott does not use.

## Features To Keep Prominent

Keep prominent:

- Project context row
- Session cards
- Diagnostic log
- Hide/minimize
- Expand
- Pin
- Transfer
- Archive
- Rerun
- Quick replies for Scott bottlenecks
- Health
- Clock
- Version
- Dynamic search/filtering
- Model selector
- Master Navigation reset
- Harness

## Meridian UI Principle

Meridian should preserve Polaris's command-center beauty, but make the interface serve the proactive orchestrator.

Polaris UI centered on sessions.

Meridian UI should center on:

```text
portfolio -> initiatives -> objectives -> sessions/workers -> proof/artifacts -> Scott bottlenecks
```

But the session card remains a proven surface. Do not throw it away.
