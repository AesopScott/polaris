# /lang

Invoke the LangGraph task orchestration sidecar for structured task automation.

## Usage

```
/lang <task_number>
```

## What it does

1. Loads the task from `docs/backlog.json`
2. Starts the Python LangGraph sidecar executor (`agents/task_executor.py`) on `localhost:4001`
3. Initializes task state in SQLite
4. Invokes the StateGraph to run the task lifecycle (plan → build → review → promote → production)
5. Provides WebSocket pause/resume gates for human intervention

## Endpoints (localhost:4001)

- `POST /advance` — Run the task graph (Phase 1-3: full graph invocation; Phase 4+ per-node stepping with pause gates)
- `GET /state?task_number=N` — Retrieve current task state
- `POST /signal?task_number=N` — Send human pause/resume signals (Phase 4+ HITL gates)

## Server Integration

The Python sidecar communicates back to `server.js` via:
- `POST /dispatch-agent` — Invoke UI-selected agents (Claude, Codex, etc.) from within a graph node
- WebSocket events — Report progress, pause points, and human gates

## Proof Units

- **PU1:** Python sidecar HTTP bridge responds with HTTP 200
- **PU2:** SQLite checkpoint survives sidecar restart
- **PU3:** /lang skill invokes executor (this file)
- **PU4:** /dispatch-agent handler works from Python nodes
- **PU5:** StateGraph compiles and runs

## Example

```
/lang 24
```

This starts the orchestrator for Task #24 and begins running it through the LangGraph state machine.

## Future Phases

- **Phase 4:** Human-in-the-loop gates (pause/resume at decision points)
- **Phase 5:** End-to-end integration testing and production validation
