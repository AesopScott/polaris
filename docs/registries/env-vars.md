# Environment Variable Registry

Every `process.env.*` variable read in Polaris server or main process. Update whenever a variable is added, removed, or its semantics change.

---

## `APPDATA`

Windows user application data directory.

**Set by:** Windows OS  
**Producers**
- OS environment (Windows): always present  

**Consumers**
- `server.js:44` — fallback base for `POLARIS_DIR` derivation

**Status:** ✓

---

## `LOCALAPPDATA`

Windows local (non-roaming) application data directory.

**Set by:** Windows OS  
**Producers**
- OS environment (Windows): always present  

**Consumers**
- `server.js:97` — Chrome executable path construction (primary — fallback to `path.join(os.homedir(), 'AppData', 'Local')`)
- `server.js:11227` — Chrome binary path string (`LOCALAPPDATA + '\\Google\\Chrome\\...'`)

**Status:** ✓

---

## `MOCKUP_DEST`

Override path for where `mockup.html` is copied at first run.

**Set by:** `main.js` (Electron entry)  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:46` — resolved to `MOCKUP_DEST` constant

**Status:** ✓

---

## `POLARIS_DIR`

Root runtime data directory (`%APPDATA%\.claude\polaris`).

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:45` — resolved to `POLARIS_DIR` constant; used for config, locks, archives

**Status:** ✓

---

## `POLARIS_SKILLS_DIR`

Override path for user global skills directory.

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:221` — resolved to `SKILLS_DIR` constant

**Status:** ✓

---

## `RESOURCES_PATH`

Path to the `resources/` directory inside the installed app.

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:230` — resolved to `RESOURCES_PATH` constant

**Status:** ✓

---

## `POLARIS_ORCHESTRATION_QUIET_MODE`

Suppresses non-essential console output during orchestration runs. When set to `'0'`, verbose orchestration logs are enabled; any other value (or absent) = quiet mode on.

**Set by:** Operator (manual env var)  
**Default:** Quiet mode on (truthy unless `=== '0'`)

**Producers**
- Operator shell — set `POLARIS_ORCHESTRATION_QUIET_MODE=0` before starting server to enable verbose logs
- `resources/mockup.html:4264` — hardcodes `true` for the UI context (no env var read; quiet mode always on in renderer)

**Consumers**
- `server.js:769` — `const ORCHESTRATION_QUIET_MODE = process.env.POLARIS_ORCHESTRATION_QUIET_MODE !== '0'`; used to gate orchestration log output

**Status:** ✓ Implemented (task #33) — undocumented until this audit; server reads env var; UI hardcodes quiet=true

---

## `SERVER_PORT`

WebSocket/HTTP server port (default 40000).

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:47` — resolved to `PORT` constant
- `agents/backlog_sync.py:15` — `_SERVER_PORT = int(os.environ.get("SERVER_PORT", "40000"))` — used to build `/sync-state` URL
- `agents/task_graph.py:41` — `server_port = int(os.environ.get("SERVER_PORT", "40000"))` — used in `dispatch_agent()` to build `/dispatch-agent` URL

**Status:** ✓

---

## `USERPROFILE`

Windows user home directory.

**Set by:** Windows OS  
**Producers**
- OS environment (Windows): always present

**Consumers**
- `server.js:824` — Downloads directory path in `buildDefaultPolicy` (capability policy extended roots)
- `server.js:3566` — Downloads directory path (session metadata)
- `server.js:10431` — The Card project path
- `server.js:10449` — Diamond project path
- `server.js:10469` — AIFactory project path

**Status:** ✓

---

## `POLARIS_PORT`

Port override for test scripts that connect to a running Polaris server. Shadows `SERVER_PORT` in the eval/test harness context; both default to `40000` so tests run without configuration.

**Set by:** Operator (manual env var before running test scripts)
**Default:** `40000` when absent

**Producers**
- Operator shell — set `POLARIS_PORT=<N>` before running eval scripts to target a non-default server

**Consumers**
- `test/agent-evals/run-server-eval.js:16` — `const port = Number(process.env.POLARIS_PORT) || 40000`
- `test/agent-evals/lib/wsClient.js:5` — `const DEFAULT_PORT = Number(process.env.POLARIS_PORT) || 40000`

**⚠ Naming gap:** The production server reads `SERVER_PORT` (set by `main.js`); test scripts read `POLARIS_PORT` (never set by `main.js`). Both default to `40000`, so tests connect correctly in the common case. If the server is started on a non-default port, the operator must set *both* `SERVER_PORT` and `POLARIS_PORT`.

**Status:** ⚠ orphan consumer — consumed by test harness; never explicitly produced. Acceptable if server always runs on default port during eval runs.

---

## `STALL_TIMEOUT_SECONDS`

Maximum seconds a LangGraph task may remain paused at a human gate before the executor marks it `stalled`. Configurable so short timeouts can be used in tests.

**Set by:** Operator (manual env var or `.env` file in `agents/`)
**Default:** `3600` (1 hour) — used by executor when variable is absent

**Producers**
- Operator shell / test harness — sets before starting `task_executor.py`

**Consumers**
- `agents/task_executor.py:43` — `STALL_TIMEOUT_SECONDS = int(os.environ.get("STALL_TIMEOUT_SECONDS", "3600"))` — constant used in `_stall_watchdog()` timeout
- `agents/test_task26_proof.py:13` — `os.environ.setdefault("STALL_TIMEOUT_SECONDS", "2")` — overrides to 2s for fast proof tests

**Status:** ✓ Implemented (task #26) — operator-settable; defaults to 3600s when absent

---

## Summary

| Variable | Set by | Consumers | Status |
|----------|--------|-----------|--------|
| `APPDATA` | OS | server.js:44 | ✓ |
| `LOCALAPPDATA` | OS | server.js:97, 11227 | ✓ |
| `MOCKUP_DEST` | main.js | server.js:46 | ✓ |
| `POLARIS_DIR` | main.js | server.js:45 | ✓ |
| `POLARIS_ORCHESTRATION_QUIET_MODE` | Operator | server.js:769; mockup.html:4264 (hardcoded) | ✓ (task #33) |
| `POLARIS_PORT` | Operator | run-server-eval.js:16; wsClient.js:5 | ⚠ orphan consumer (task #40 audit) |
| `POLARIS_SKILLS_DIR` | main.js | server.js:221 | ✓ |
| `RESOURCES_PATH` | main.js | server.js:230 | ✓ |
| `SERVER_PORT` | main.js | server.js:47; backlog_sync.py:15; task_graph.py:41 | ✓ |
| `STALL_TIMEOUT_SECONDS` | Operator | task_executor.py:43; test_task26_proof.py:13 | ✓ (task #26) |
| `USERPROFILE` | OS | server.js:824, 3566, 10431, 10449, 10469 | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-24T00:00:00Z (by /cross-boundary-audit for task #40)

**Task audited:** #40 — Contract test suite: validate real payload samples

**Boundaries checked:** `process.env.*` variables in server.js, main.js, test/agent-evals/

**Evidence recorded:**
- 10 entries with complete producer/consumer pairs ✓ (was 9 in prior audit)
- 1 new entry added: `POLARIS_PORT` ⚠ orphan consumer — consumed by test harness scripts, never explicitly produced; both `SERVER_PORT` and `POLARIS_PORT` default to 40000 so no functional failure unless port changes
- 0 new env vars introduced by task #40 itself
- No stale line refs in this pass
- Registries match current code diff: yes

**Gaps identified:**
- `POLARIS_PORT` — orphan consumer in test harness; recommend adding production-server mapping note or unifying with `SERVER_PORT` in a future cleanup task

**Status:** Audit complete

---

**Last audit:** 2026-05-23T14:00:00Z (by /cross-boundary-audit for task #42)

**Tasks audited:** #41 — Capability policy schema + session wiring; #42 — Command class registry for shell safety

**Boundaries checked:** Environment variables (`process.env.*`) read in server.js, main.js

**Evidence recorded:**
- 8 entries with complete producer/consumer pairs ✓
- 1 entry planned/pending (STALL_TIMEOUT_SECONDS) ⚠
- 0 entries with shape mismatches
- New identifiers introduced on task #41: none (USERPROFILE line refs updated — server.js:823 added for buildDefaultPolicy)
- New identifiers introduced on task #42: none (pure internal refactor — COMMAND_CLASS_REGISTRY is not an env var)
- Registries match current code diff: yes

**Gaps identified:** STALL_TIMEOUT_SECONDS has no automated producer — operator must set manually or leave at default (3600s). Acceptable; documented with default.

**Note — intentional orphan producer:** `session.policy` field is set at server.js:925 and server.js:8641 but has no consumers yet. Tasks #43-#45 will wire enforcement. Not a cross-boundary env var so not listed here — noted in audit for completeness.

**Status:** Audit complete

---

**Last audit:** 2026-05-23T00:00:00Z (by /cross-boundary-audit for task #33)

**Task:** #33 — LangGraph: Node Implementation + HITL (Phases 4-5)

**Boundaries checked:** Environment variables (`process.env.*`) in server.js; Python `os.environ.get()` in agents/

**Evidence recorded:**
- 10 entries (9 previous + 1 new)
- 9 entries with complete producer/consumer pairs ✓
- 1 new entry: `POLARIS_ORCHESTRATION_QUIET_MODE` — previously unregistered, consumed at server.js:769 and hardcoded in mockup.html:4264
- 6 stale line refs corrected: APPDATA :16→:44, POLARIS_DIR :17→:45, MOCKUP_DEST :18→:46, SERVER_PORT :19→:47, POLARIS_SKILLS_DIR :62→:221, RESOURCES_PATH :71→:230
- 1 stale line ref corrected: LOCALAPPDATA :9342 — split to :97 (primary) and :11227 (Chrome path); second line ref added
- 5 stale line refs corrected: USERPROFILE :823→:824, :3647→:3566, :9930→:10431, :9948→:10449, :9968→:10469
- 2 Python consumers added to SERVER_PORT: backlog_sync.py:15, task_graph.py:41
- 1 Python consumer added to STALL_TIMEOUT_SECONDS: test_task26_proof.py:13 (test harness override)
- STALL_TIMEOUT_SECONDS status corrected: was "⚠ planned", now "✓ Implemented (task #26)"

**Gaps identified:**
- 6 stale line refs (corrected above)
- `POLARIS_ORCHESTRATION_QUIET_MODE` unregistered — now added
- SERVER_PORT Python consumers missing — now added

**Status:** ✓ Audit current — all task #33 env-var changes registered
