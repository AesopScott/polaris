# Cross-Boundary Registries

A boundary is anywhere two pieces of code refer to the same name independently and can disagree. These files enumerate every such name with every producer and every consumer, and flag mismatches.

## Registries in this project

| File | Boundary kind | Names | Gaps |
|------|---------------|-------|------|
| [websocket-messages.md](websocket-messages.md) | WebSocket `type` strings between client (mockup.html) and server (server.js) | ~100 | 4 orphan server handlers |
| [env-vars.md](env-vars.md) | `process.env.*` variables read in server.js / main.js | 8 | 0 |

## Maintenance rule

Every PR that adds, removes, or renames a cross-boundary name **must update the relevant registry in the same commit**. This project's boundary kinds were detected by `/cross-boundary-audit` on 2026-05-18.

## Status legend

| Symbol | Meaning |
|--------|---------|
| ✓ | Paired — at least one producer and one consumer, no shape mismatch |
| ⚠ orphan producer | Name sent by client, no server handler |
| ⚠ orphan consumer | Name registered in server handler, never sent by client |
| ⚠ shape mismatch | Producer and consumer disagree on payload fields |
