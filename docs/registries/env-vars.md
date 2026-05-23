# Environment Variable Registry

Every `process.env.*` variable read in Polaris server or main process. Update whenever a variable is added, removed, or its semantics change.

---

## `APPDATA`

Windows user application data directory.

**Set by:** Windows OS  
**Producers**
- OS environment (Windows): always present  

**Consumers**
- `server.js:16` — fallback base for `POLARIS_DIR` derivation

**Status:** ✓

---

## `LOCALAPPDATA`

Windows local (non-roaming) application data directory.

**Set by:** Windows OS  
**Producers**
- OS environment (Windows): always present  

**Consumers**
- `server.js:9342` — Chrome executable path construction

**Status:** ✓

---

## `MOCKUP_DEST`

Override path for where `mockup.html` is copied at first run.

**Set by:** `main.js` (Electron entry)  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:18` — resolved to `MOCKUP_DEST` constant

**Status:** ✓

---

## `POLARIS_DIR`

Root runtime data directory (`%APPDATA%\.claude\polaris`).

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:17` — resolved to `POLARIS_DIR` constant; used for config, locks, archives

**Status:** ✓

---

## `POLARIS_SKILLS_DIR`

Override path for user global skills directory.

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:62` — resolved to `SKILLS_DIR` constant

**Status:** ✓

---

## `RESOURCES_PATH`

Path to the `resources/` directory inside the installed app.

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:71` — resolved to `RESOURCES_PATH` constant

**Status:** ✓

---

## `SERVER_PORT`

WebSocket/HTTP server port (default 40000).

**Set by:** `main.js`  
**Producers**
- `main.js` — set before forking `server.js`

**Consumers**
- `server.js:19` — resolved to `PORT` constant

**Status:** ✓

---

## `USERPROFILE`

Windows user home directory.

**Set by:** Windows OS  
**Producers**
- OS environment (Windows): always present

**Consumers**
- `server.js:823` — Downloads directory path in `buildDefaultPolicy` (capability policy extended roots)
- `server.js:3647` — Downloads directory path (session metadata)
- `server.js:9930` — The Card project path
- `server.js:9948` — Diamond project path
- `server.js:9968` — AIFactory project path

**Status:** ✓

---

## `STALL_TIMEOUT_SECONDS`

Maximum seconds a LangGraph task may remain paused at a human gate before the executor marks it `stalled`. Configurable so short timeouts can be used in tests.

**Set by:** Operator (manual env var or `.env` file in `agents/`)
**Default:** `3600` (1 hour) — used by executor when variable is absent

**Producers**
- Operator shell / test harness — sets before starting `task_executor.py`

**Consumers**
- `agents/task_executor.py` — read via `os.environ.get('STALL_TIMEOUT_SECONDS', '3600')` (task #26, Task 3.3)

**Status:** ⚠ planned (task #26) — not yet consumed; variable has no producer in current codebase (operator must set manually)

---

## Summary

| Variable | Set by | Consumers | Status |
|----------|--------|-----------|--------|
| `APPDATA` | OS | server.js:16 | ✓ |
| `LOCALAPPDATA` | OS | server.js:9342 | ✓ |
| `MOCKUP_DEST` | main.js | server.js:18 | ✓ |
| `POLARIS_DIR` | main.js | server.js:17 | ✓ |
| `POLARIS_SKILLS_DIR` | main.js | server.js:62 | ✓ |
| `RESOURCES_PATH` | main.js | server.js:71 | ✓ |
| `SERVER_PORT` | main.js | server.js:19 | ✓ |
| `STALL_TIMEOUT_SECONDS` | Operator | task_executor.py (planned) | ⚠ planned |
| `USERPROFILE` | OS | server.js:823, 3647, 9930, 9948, 9968 | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-23T14:00:00Z (by /cross-boundary-audit for task #41)

**Task:** #41 — Capability policy schema + session wiring

**Boundaries checked:** Environment variables (`process.env.*`) read in server.js, main.js, and agents/task_executor.py

**Evidence recorded:**
- 8 entries with complete producer/consumer pairs ✓
- 1 entry planned/pending (STALL_TIMEOUT_SECONDS) ⚠
- 0 entries with shape mismatches
- New identifiers introduced on task #41: none (USERPROFILE line refs updated — server.js:823 added for buildDefaultPolicy)
- Registries match current code diff: yes

**Gaps identified:** STALL_TIMEOUT_SECONDS has no automated producer — operator must set manually or leave at default (3600s). Acceptable; documented with default.

**Note — intentional orphan producer:** `session.policy` field is set at server.js:925 and server.js:8641 but has no consumers yet. Tasks #42-#45 will wire enforcement. Not a cross-boundary env var so not listed here — noted in audit for completeness.

**Status:** Audit complete
