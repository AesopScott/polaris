# Meridian Provider Compliance Strategy

This is not legal advice. It is a product and architecture constraint note for Meridian's public launch.

## Problem

Meridian wants to orchestrate worker sessions across model providers. Polaris proved this is valuable with Claude CLI, Codex CLI, OpenRouter/API sessions, and other routes.

For a public/marketed tool, provider terms matter. A private local tool Scott runs for himself is different from a public product that markets or automates access to consumer/account-based model interfaces.

The risk:

- Some providers prohibit reselling, leasing, or transferring account access.
- Some providers restrict automated/non-human access to consumer surfaces except through official APIs or explicit permission.
- Even if users bring their own accounts, Meridian may create risk if it markets automation of account-based interfaces in ways providers do not permit.

## Current Source Signals

OpenAI's business/services agreement language distinguishes customer applications that integrate with OpenAI APIs, while also restricting resale/lease of account access and transfer of API keys.

Anthropic's public guidance distinguishes API/Claude for Work commercial use from consumer surfaces, and consumer terms have been discussed around restrictions on automated/non-human access except via API key or explicit permission.

Provider terms change. Meridian should verify official terms before public claims, especially for Claude Code, ChatGPT desktop/browser/account automation, Codex CLI, and any subscription-backed route.

## Product Rule

Meridian should not publicly market itself as a way to automate, resell, or multiplex consumer subscriptions.

Instead:

> Meridian is a local orchestration layer with provider adapters. Official API adapters are the supported public path. Account/CLI adapters are local, user-controlled, experimental, and must comply with the provider's terms.

Core distinction:

- Public API interface/adapters are acceptable when users provide their own keys and the provider terms permit customer applications.
- Account-based consumer interface automation is the part that should not be included or marketed in the public version unless explicitly permitted.

## Supported Public Architecture

### Safe Core

- Local orchestrator
- Harness heartbeat
- Portfolio/objective state
- Proof/artifact capture
- Session UI
- BYOK API adapters where provider terms permit customer applications
- Local/open model adapters
- OpenRouter or other aggregator adapters where terms permit

### High-Risk / Do Not Market as Primary

- Automating Claude.ai consumer web UI
- Automating ChatGPT consumer web UI
- Using Claude Max/Pro subscription quota as a backend for Meridian users
- Using account OAuth/session tokens outside provider-approved tooling
- Pooling, proxying, selling, leasing, or sharing provider account access
- Presenting Meridian as a wrapper that monetizes someone else's consumer UI/subscription

### Conditional / Needs Provider Review

- Claude Code CLI integration in a public product
- Codex CLI integration in a public product
- ChatGPT desktop app automation
- Any "bring your own account" flow that drives non-API account interfaces

These may be usable personally or experimentally, but public marketing should be careful unless provider terms explicitly permit the use case or the provider grants approval.

## Adapter Tiers

Meridian should label model adapters by compliance/support tier:

```text
official-api-supported
official-cli-supported
local-model-supported
experimental-user-configured
private-only
disabled-for-public-build
```

The agent harness should expose these tiers in UI and logs.

## Public Default

The public repo should default to:

- official API keys
- local/open models
- explicit provider adapters
- no bundled credentials
- no token extraction
- no consumer web automation by default
- no claims that subscription automation is supported for commercial use
- no account-based adapters enabled in the public build unless provider terms explicitly allow them

## Private Scott Mode

Meridian may have local/private adapters Scott uses for his own workflow.

If so:

- Keep them clearly marked private/experimental.
- Do not make them the public default.
- Do not market them as a selling point.
- Keep configuration local and uncommitted.
- Consider feature flags or separate private plugin packages.

## Marketing Language

Use:

> Bring your own API keys for supported providers.

> Meridian orchestrates local work and model adapters; each adapter must be used according to the provider's terms.

> Meridian does not resell model access.

Avoid:

> Use your Claude Max subscription as a backend for Meridian.

> Automate ChatGPT/Claude accounts through Meridian.

> Share one account across workers/users.

> Unlimited Claude/Codex workers using your subscription.

## Architecture Implications

1. Provider adapters must be modular.
2. The public build must be useful without consumer-account automation.
3. The agent harness must know adapter compliance tier.
4. The UI must show when an adapter is experimental/private.
5. Public docs must separate supported API integrations from private/local experiments.
6. Any provider account automation should be opt-in and not required for the core demo.

## Open Questions

- Can Claude Code CLI be used by a third-party local orchestrator in a marketed public tool?
- Can Codex CLI be driven by a third-party orchestrator in a marketed public tool?
- What exact terms apply when each user provides their own API key?
- Should Meridian seek explicit written permission or partnership paths from Anthropic/OpenAI?
- Should the first public build ship only with OpenRouter/API/local model adapters?

## Recommendation

For private V0:

- Do not let provider compliance concerns block proving the orchestrator model.
- Keep questionable account/CLI adapters clearly local/private/experimental.
- Avoid baking them into Meridian's core architecture.

For later public release:

- Build Meridian around official API and local model adapters.
- Make account/CLI automation private or experimental until terms are clarified.
- Market the orchestrator, heartbeat, proof, portfolio, and harness architecture, not subscription automation.
- Consider contacting providers once the demo is coherent.
