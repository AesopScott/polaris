# Cross-Boundary Registries

A boundary is anywhere two pieces of code refer to the same name independently and can disagree. These files enumerate every such name with every producer and every consumer, and flag mismatches.

## Registries in this project

| File | Boundary kind | Names | Gaps |
|------|---------------|-------|------|
| [collections.md](collections.md) | Firestore collections: producers, consumers, schema shape | 1 | 0 |
| [websocket-messages.md](websocket-messages.md) | WebSocket `type` strings between client (mockup.html) and server (server.js) | ~100 | 4 orphan server handlers (pre-existing) |
| [websocket-events.md](websocket-events.md) | WS event types with full payload docs (server→client push events) | ~20 | 0 |
| [http-endpoints.md](http-endpoints.md) | HTTP endpoints: Polaris server + Python LangGraph executor | ~15 | 0 |
| [backlog-task-fields.md](backlog-task-fields.md) | Fields on BacklogTask objects in docs/backlog.json | ~12 | 0 |
| [agent-state-schema.md](agent-state-schema.md) | LangGraph agent state schema between executor and server | varies | 0 |
| [python-modules.md](python-modules.md) | Python module boundaries in agents/ | varies | 0 |
| [env-vars.md](env-vars.md) | `process.env.*` variables read in server.js / main.js / test harness | 11 | 1 orphan consumer (`POLARIS_PORT`) |
| [zod-contracts.md](zod-contracts.md) | Zod schema module exports in src/contracts/ → consumers | 5 modules | 4 orphan runtime producers (intentional, pending task #38) |

## Maintenance rule

Every PR that adds, removes, or renames a cross-boundary name **must update the relevant registry in the same commit**. This project's boundary kinds were detected by `/cross-boundary-audit` on 2026-05-18.

## Status legend

| Symbol | Meaning |
|--------|---------|
| ✓ | Paired — at least one producer and one consumer, no shape mismatch |
| ⚠ orphan producer | Name sent by client, no server handler |
| ⚠ orphan consumer | Name registered in server handler, never sent by client |
| ⚠ shape mismatch | Producer and consumer disagree on payload fields |
