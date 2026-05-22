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
- `server.js:2991` — Downloads directory path
- `server.js:8558` — The Card project path
- `server.js:8576` — Diamond project path
- `server.js:8596` — AIFactory project path

**Status:** ✓

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
| `USERPROFILE` | OS | server.js:2991, 8558, 8576, 8596 | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-22T00:00:00Z (by /cross-boundary-audit for task #25)

**Task:** #25 — Split server.js into bounded runtime services

**Boundaries checked:** Environment variables (`process.env.*`) read in server.js and main.js

**Evidence recorded:**
- 8 entries with complete producer/consumer pairs ✓
- 0 entries with gaps
- 0 entries with shape mismatches
- New identifiers introduced on task #25: none (pure internal refactoring)
- Registries match current code diff: yes

**Gaps identified:** none

**Status:** Audit complete — all env vars valid and balanced. Internal refactoring preserves all environment variable contracts.
