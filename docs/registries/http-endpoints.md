# HTTP Endpoints Registry

Endpoints exposed by Polaris server for cross-process communication. For each: producer (client), consumer (handler), method, path, payload shape, response shape.

**Boundary:** HTTP POST/GET requests from external processes (Python sidecar, agents) → server.js endpoint handlers → JSON responses.

---

## Documented Endpoints

### `/dispatch-agent`

Invoke a UI-selected agent from within a Python LangGraph node.

**Method:** `POST`  
**Producer:** Python task_executor.py nodes (Phases 4+)  
**Consumer:** server.js HTTP handler (spawnMaxChat or runDirectAgent wrapper)

**Request Payload:**
```json
{
  "agent": "max" | "claude" | "sonnet" | "codex",
  "prompt": "string — the prompt to send to the agent",
  "task_number": number
}
```

**Response Payload (Success):**
```json
{
  "response": "string — agent's text output",
  "tokens": number,
  "model": "string",
  "agent": "string"
}
```

**Response Payload (Error):**
```json
{
  "error": "string — error message",
  "status": 400 | 500
}
```

**Status:** ✓ Documented (Task #24)  
**Audit Trail:** Task #24 Phase 2, commit 42bfb1d (feat: LangGraph sidecar spike), commit a81318 (feat: /lang skill and /dispatch-agent handler)

---

## Maintenance Rule

Every PR that adds, removes, or modifies an HTTP endpoint **must update this registry in the same commit**. Changes include:
- New endpoints (add entry)
- Renamed endpoints (update path)
- Payload shape changes (update Request/Response sections)
- Producer/Consumer changes (update entries)

Update the Audit Trail with the relevant task number, commit hash, and brief description.
