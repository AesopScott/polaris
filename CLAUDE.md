# Polaris

Scott's personal AI command center — parallel agent sessions, real API control, Electron desktop UI.

## Critical rules
1. **Propose before acting.** State the planned change, wait for explicit yes. Never assume approval.
2. **Three zones:** Source (`C:\Users\scott\Code\Polaris`) — edit only here, requires `npm run dist` rebuild. Installed app (`%LOCALAPPDATA%\Programs\Polaris\resources`) — never touch. Runtime data (`%APPDATA%\.claude\polaris\`) — only place for runtime reads/writes.
3. **Versioning:** state file's current version before editing, new version after. Versions in `%APPDATA%\.claude\polaris\file-versions.json`.
4. **Locks:** check `locks.json` before any write; locked files need explicit approval.
5. **Server restarts:** never from code — tell Scott.
6. **Windows:** backslash paths, no Unix shell tools. Use PowerShell or Node `fs`.

## Architecture
- **Agent sessions** → OpenRouter via Claude CLI (`ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1` + `ANTHROPIC_API_KEY=<openRouterApiKey>`).
- **Chat sessions** → DeepSeek **web chat** (`chat.deepseek.com`, login with email/password, model `deepseek_chat`). Not `api.deepseek.com`.
- Never mix routing.

## Key files
- `server.js` — HTTP+WS server; agent/chat spawning, file versioning, lock enforcement.
- `main.js` — Electron entry; forks server.js, creates BrowserWindow.
- `resources/mockup.html` — source UI; copied to AppData on first run.
- `%APPDATA%\.claude\polaris\config.json` — API keys, model strings, vault path, all settings.

## Changelog maintenance (mandatory after every version bump)
After bumping `package.json` version, prepend a row to the **Build Index** table at the top of `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\changelog.md`. Format: `| <version> | <YYYY-MM-DD> | <one-sentence headline of what landed> |`. Newest build at the top of the table. The detailed prose history continues below the table — keep both. The table is the at-a-glance index; prose entries are optional for small builds.

## Soul reference
`G:\My Drive\Aesop Academy\Obsidian\SOUL.md` — read for the why.
Architecture decisions: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\3-Architecture.md`.


<!-- PROJECT-SPECIFIC -->

<!-- PROJECT-SPECIFIC -->