# CLAUDE.md — Polaris

## Purpose & Soul
Read `G:\My Drive\Aesop Academy\Obsidian\SOUL.md` for the full story of why Polaris exists and what it means. That file is the source of truth. Do not skip it.

Summary: Polaris is Scott's personal AI command center — multiple parallel agent sessions, real API control, a clean Electron desktop interface. Built to get serious work done, and eventually shared with others.

---

## Full Architecture Reference
All component decisions, confirmed specs, and decision logs:
`G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\3-Architecture.md`

---

## Critical Rules — Read Before Doing Anything

### 1. Propose Before Acting
Before any code change, file write, or destructive action — state what you plan to do and why. Wait for Scott to confirm. Never assume approval from context. Each action needs an explicit yes.

### 2. File Locations — Three Zones, Different Rules

| Zone | Path | Rule |
|------|------|------|
| Source | `C:\Users\scott\Code\Polaris` | Do not read from or write to this during a session. Not the running app. |
| Installed app | `C:\Users\scott\AppData\Local\Programs\Polaris\resources\` | Never edit. Destroyed on reinstall. |
| Runtime data | `C:\Users\scott\AppData\Roaming\.claude\polaris\` | Only location for runtime reads and writes. |

Code changes require a rebuild. Tell Scott. He edits source, runs `npm run dist`, reinstalls.

### 3. File Versioning
Before modifying a file, state its current version. After modifying it, state the new version. Versions are in `%APPDATA%\.claude\polaris\file-versions.json`.

### 4. Locked Files
Check `locks.json` before any file write. If the file is locked, pause and ask Scott to approve before proceeding.

### 5. Never Restart the Server from Code
If a restart is needed, tell Scott. He will do it.

### 6. Platform
Windows. Use backslash paths. No Unix shell commands (ls, grep, cat, curl, chmod). Use PowerShell or Node.js `fs` instead.

---

## Two-System API Architecture — Never Mix These

| System | Provider | How |
|--------|----------|-----|
| **Agent sessions** | OpenRouter | Claude CLI with `ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1` + `ANTHROPIC_API_KEY=<openRouterApiKey>` |
| **Chat sessions** | DeepSeek web chat | HTTPS to `chat.deepseek.com` — login with email/password to get token, then stream completions |

- Agent sessions always go through OpenRouter. Never directly to Anthropic.
- Chat sessions use the DeepSeek **web chat interface** — not `api.deepseek.com`. No paid API key needed.
- DeepSeek web chat model string: `deepseek_chat` (underscore).

---

## Model Tiers (Agent Sessions)

| Tier | Config key | Default |
|------|-----------|---------|
| Floor | `openRouterFloorModel` | `openrouter/auto` |
| Balanced | `openRouterSonnetModel` | `openrouter/auto` |
| Power | `openRouterOpusModel` | `openrouter/auto` |

The launch bar selector shows Floor / Balanced / Power. Tiers resolve to actual OpenRouter model strings from `config.json` at launch time.

---

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Node.js HTTP + WebSocket server. All agent/chat spawning, WS message handling, file versioning, lock enforcement. |
| `main.js` | Electron entry. Forks server.js, creates BrowserWindow. |
| `resources/mockup.html` | Source UI. Copied to AppData on first run. Served from AppData. |
| `%APPDATA%\.claude\polaris\config.json` | API keys, model strings, vault path, all user settings. |
| `%APPDATA%\.claude\polaris\locks.json` | Locked file paths — check before every write. |
| `%APPDATA%\.claude\polaris\file-versions.json` | Per-file version numbers. |

---

## Config Keys (config.json)

| Key | Purpose |
|-----|---------|
| `openRouterApiKey` | Required for all agent sessions |
| `openRouterFloorModel` | Floor tier model string |
| `openRouterSonnetModel` | Balanced tier model string |
| `openRouterOpusModel` | Power tier model string |
| `deepSeekEmail` | DeepSeek web chat login |
| `deepSeekPassword` | DeepSeek web chat login |
| `chatModel` | DeepSeek web model string (default: `deepseek_chat`) |
| `anthropicApiKey` | Stored for agent use — not used for Polaris routing |
| `openAiApiKey` | Stored for agent use — not used for Polaris routing |
| `obsidianVaultPath` | Path to Obsidian vault |
