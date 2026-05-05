# Polaris

Scott's personal AI command center — parallel agent sessions, real API control, Electron desktop UI.

## Critical rules
1. **Propose before acting.** State the planned change, wait for explicit yes. Never assume approval.
2. **Three zones:** Source (`C:\Users\scott\Code\Polaris`) — edit only here, requires `npm run dist` rebuild. Installed app (`%LOCALAPPDATA%\Programs\Polaris\resources`) — never touch. Runtime data (`%APPDATA%\.claude\polaris\`) — only place for runtime reads/writes.
3. **Versioning:** state file's current version before editing, new version after. Versions in `%APPDATA%\.claude\polaris\file-versions.json`.
4. **Locks:** check `locks.json` before any write; locked files need explicit approval.
5. **Server restarts:** never from code — tell Scott.
6. **Windows:** backslash paths, no Unix shell tools. Use PowerShell or Node `fs`.
7. **Commit after every change:** After any file edit or write, immediately commit with a conventional message (feat, fix, refactor, docs, chore, perf, ci). Never leave changes uncommitted. Bump `package.json` version and rebuild before closing a work session.
8. **Never give up after one tool failure.** If `QueryMemory` returns an error or empty content, fall back to `Read`, `Glob`, or `Grep` against the filesystem — do not stop and ask the user. Canonical paths to try first: `C:\Users\scott\Code\Polaris\CLAUDE.md` (project rules) and `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md` through `8-Logs.md` (project knowledge base, listed in detail under "Project knowledge base" below). Bash and PowerShell tools are available — use them. Asking the user to "advise" or "provide the path" is a last resort, not a first response.

## Architecture
- **Agent sessions** → Direct OpenRouter API (`POST https://openrouter.ai/api/v1/chat/completions`, OpenAI streaming format). Implemented in `runDirectAgent()` in server.js. Rolling 20-turn message window. 9 tool schemas (Read, Write, Edit, Glob, Grep, Bash, PowerShell, WebFetch, TodoWrite) executed natively in server.js. System prompt = BASE_SYSTEM_PROMPT + CLAUDE.md + project memory. No CLI involved.
- **Chat sessions** → DeepSeek **web chat** (`chat.deepseek.com`, login with email/password, model `deepseek_chat`). Not `api.deepseek.com`.
- **Routine sessions** → DeepSeek direct API (`api.deepseek.com`) via `spawnDeepSeekRoutine()`. Single-turn, no tools.
- Never mix routing. The old Claude CLI path (`spawnClaude`) is retained in server.js but no longer called.

## Key files
- `server.js` — HTTP+WS server; agent/chat spawning, file versioning, lock enforcement.
- `main.js` — Electron entry; forks server.js, creates BrowserWindow.
- `resources/mockup.html` — source UI; copied to AppData on first run.
- `scripts/build-install.ps1` — one-shot build + install. Use this instead of running `npm run dist` and the installer manually.
- `scripts/prune-dist.js` — keeps last 5 `dist/Polaris Setup *.exe` (auto-runs via `postdist` / `postdist:fast` hooks).
- `%APPDATA%\.claude\polaris\config.json` — API keys, model strings, vault path, all settings.

## Build & install
- **One-shot:** `& C:\Users\scott\Code\Polaris\scripts\build-install.ps1` — runs `dist:fast`, then launches the newest `dist\Polaris Setup *.exe`. Use this for Scott's daily reinstall loop.
- **Speed ladder (when you need a different mode):**
  - `npm start` — instant; runs Electron directly, no build, no install
  - `npm run pack` — unpacked `dist/win-unpacked/Polaris.exe`, no installer
  - `npm run dist:fast` — NSIS installer with `compression=store` and `asar=false` (~3-5x faster than `dist`)
  - `npm run dist` — full release NSIS (LZMA + asar)
- Old installers auto-pruned to 5 most recent. To keep more, edit `KEEP` in `scripts/prune-dist.js`.
- Windows Defender exclusions for the source dir, `dist/`, and `%LOCALAPPDATA%\Programs\Polaris` cut Electron build time 30-50% — set manually in Windows Security.

## Changelog maintenance (mandatory after every version bump)
After bumping `package.json` version, prepend a row to the **Build Index** table at the top of `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`. Format: `| <version> | <YYYY-MM-DD> | <one-sentence headline of what landed> |`. Newest build at the top of the table. The detailed prose history continues below the table — keep both. The table is the at-a-glance index; prose entries are optional for small builds.

## Project knowledge base
Soul + why: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md`
Architecture decisions: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\2-Architecture.md`
Build plan + roadmap: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\3-Build-Plan.md`
Full changelog: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`


<!-- PROJECT-SPECIFIC -->

<!-- PROJECT-SPECIFIC -->