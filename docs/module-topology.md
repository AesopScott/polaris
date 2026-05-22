# Polaris — Runtime Module Topology

## Module Graph

```
contracts          ──── leaf; zero outbound dependencies
    │
    ├── sessionStore  ──── session Map, fork registry, persistence
    │
    ├── agentRuntime  ──── backend resolution, lifecycle, turn queue
    │
    ├── toolRuntime   ──── native tool dispatch, worktree guard
    │       │
    │       └── mcpGateway  ── MCP stdio/HTTP transport, tool discovery
    │
    ├── crossCheck    ──── pre-approval + post-hoc gates, audit JSONL
    │
    ├── backlog       ──── task CRUD, status lifecycle, archive
    │
    ├── httpRoutes    ──── HTTP route table, request dispatcher
    │
    └── wsAdapter     ──── WS dispatch hub; depends on all above
```

## Module Responsibilities

| Module | File | Responsibility |
|---|---|---|
| `contracts` | `src/runtime/contracts.ts` | All shared TypeScript types — WebSocket messages, tool schemas, session types, backlog types, cross-check types. Leaf node: zero outbound deps. |
| `sessionStore` | `src/runtime/sessionStore.ts` | In-memory `Map<sessionId, SessionRecord>`, fork registry, JSONL message persistence, sessions-persist.json serialization. |
| `agentRuntime` | `src/runtime/agentRuntime.ts` | Backend resolution (direct/chat/codex/gpt/routine), session lifecycle helpers, pending-turn queue, session end callbacks. |
| `toolRuntime` | `src/runtime/toolRuntime.ts` | Native tool dispatch (Read/Write/Edit/Glob/Grep/Bash/PowerShell/…), worktree ownership guard, MCP routing entry point. |
| `mcpGateway` | `src/runtime/mcpGateway.ts` | MCP stdio + HTTP transport, JSON-RPC, process lifecycle, tool discovery with 5-min cache, result normalization. |
| `crossCheck` | `src/runtime/crossCheck.ts` | Pre-approval gate (blocks Write until user approves), post-hoc gate (keep/restore after Bash), installer permission gate, JSONL audit trail. |
| `backlog` | `src/runtime/backlog.ts` | Task CRUD (add, status-update, field-update, archive), global + per-project scope, 5-sec cache, async auto-commit. |
| `httpRoutes` | `src/runtime/httpRoutes.ts` | HTTP route table (18 routes), `buildRequestHandler()` dispatcher, `sendJson`/`sendError`/`send404` utilities. |
| `wsAdapter` | `src/runtime/wsAdapter.ts` | WS dispatch hub — `WsHandlerMap` registry (130 message types), `buildWsDispatcher()`, `broadcastAll`/`broadcastToSession` helpers. |

## Invariants

1. **No module imports from `server.js`** — all runtime state flows in via `init*()` dependency injection.
2. **contracts is a pure leaf** — it never imports from another Polaris module.
3. **wsAdapter is the hub** — it may depend on all other modules (after wiring).
4. **Rollback gate** — each module phase is a separate git commit on `task/25-split-server-modules`. Any phase can be reverted independently without affecting server.js runtime behavior, because the modules are compile-only until wired.
5. **WsHandlerMap type coverage** — `WsHandlerMap` is `Record<string, WsMessageHandler>` (plain string keys). `WS_MESSAGE_TYPES` in wsAdapter.ts lists all 130 server.js handler branches, including ~70 server-internal operational types (tool dispatch, session control, fork management, file ops, MCP config, etc.) that are not yet in the `AnyWebSocketMessage` union in contracts.ts. The registry documents the ~100 client↔server bidirectional types. The delta is intentional: wsAdapter pre-registers all handler slots; as each is wired, its message type will be added to `AnyWebSocketMessage`.

## Current State (2026-05-22)

Modules are **defined and compiling** but **not yet wired into server.js**. Server.js still contains all handler implementations. The modules represent the typed API boundary for the future wiring phase.

Wiring order (dependency-safe):
1. Wire `contracts` (types only — import types anywhere)
2. Wire `sessionStore` (replaces session Map)
3. Wire `agentRuntime` (replaces resolveBackend / lifecycle helpers)
4. Wire `mcpGateway` → `toolRuntime` (replaces MCP gateway + executeDirectTool)
5. Wire `crossCheck` (replaces pending gate Maps)
6. Wire `backlog` (replaces loadAllBacklogs / addBacklogTask etc.)
7. Wire `httpRoutes` (replace manual if/else request router)
8. Wire `wsAdapter` (replace handleMessage dispatch block)
