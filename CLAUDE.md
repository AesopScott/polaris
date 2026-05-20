# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Polaris

Scott's personal AI command center — parallel agent sessions, real API control, Electron desktop UI.

## Critical rules
1. **Propose before writing.** For file edits and writes, state the planned change and wait for explicit yes. Reads, searches, and tool calls proceed without asking.
2. **Three zones:** Source (`C:\Users\scott\Code\Polaris`) — edit only here, requires `npm run dist` rebuild. Installed app (`C:\Users\scott\AppData\Local\Programs\Polaris\resources`) — only touch with explicit approval. Runtime data (`C:\Users\scott\AppData\Roaming\.claude\polaris\`, the user's `Downloads` folder, and `G:\*`) — only places for runtime reads/writes.
3. **Versioning:** state file's current version before editing, new version after. Versions in `%APPDATA%\.claude\polaris\file-versions.json`.
4. **Locks:** check `locks.json` before any write; locked files need explicit approval.
5. **Server restarts:** never from code — tell Scott.
6. **Windows:** backslash paths, no Unix shell tools. Use PowerShell or Node `fs`.
7. **Commit after every change:** After any file edit or write, immediately commit with a conventional message (feat, fix, refactor, docs, chore, perf, ci). Never leave changes uncommitted. Bump `package.json` version **at delivery time** — in the same edit as the code change, not retroactively, not at end of session, not when the build runs.
8. **Never give up after one tool failure.** If `QueryMemory` returns an error or empty content, fall back to `Read`, `Glob`, or `Grep` against the filesystem — do not stop and ask the user. Canonical paths to try first: `C:\Users\scott\Code\Polaris\CLAUDE.md` (project rules) and `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md` through `8-Logs.md` (project knowledge base, listed in detail under "Project knowledge base" below). Bash and PowerShell tools are available — use them. Asking the user to "advise" or "provide the path" is a last resort, not a first response.
9. **Config archives.** Every write to `%APPDATA%\.claude\polaris\config.json` auto-copies the prior content to `%APPDATA%\.claude\polaris\config-archive\config.<ISO>.json`. Append-only, capped at 200 files / 10 MB total — oldest pruned first. If a save corrupts or wipes config (the 2026-05-05 incident wiped `obsidianDir`, MCP servers, and routines from every project), restore from the most recent pre-incident archive. Do not trust `config.backup.json` alone — single-level, gets rotated past loss points.
10. **Never run the installer without explicit approval.** Running `build-install.ps1` or any `dist` build launches an NSIS installer that can trigger a Windows reboot. Always ask Scott before running any build+install command. Building with `npm start` or `npm run pack` is safe (no installer, no reboot risk).

## Architecture
- **Agent sessions** → Direct OpenRouter API (`POST https://openrouter.ai/api/v1/chat/completions`, OpenAI streaming format). Implemented in `runDirectAgent()` in server.js. Rolling 20-turn message window. Tool schemas executed natively in server.js: Read, Write, Edit, Glob, Grep, Bash, PowerShell, WebFetch, WebSearch, AskUserQuestion, TodoWrite, QueryMemory, SetProject, **SetStatus**. System prompt = BASE_SYSTEM_PROMPT + CLAUDE.md + project memory. No CLI involved.
- **Chat sessions** → Claude Max plan via Claude CLI (`spawnMaxChat`). Uses Claude Code's native tool set only. **SetStatus is NOT a Claude Code tool — do not attempt to call it in chat sessions.** Polaris auto-detects session card state from your final message: end with "Please test this" or "Try it out" → purple test card; end with "?" → amber waiting card; otherwise → green done.
- **Routine sessions** → DeepSeek direct API (`api.deepseek.com`) via `spawnDeepSeekRoutine()`. Single-turn, no tools.
- Never mix routing. The old Claude CLI path (`spawnClaude`) is retained in server.js but no longer called.

## Architecture deep-dive

**Process model:**
- `main.js` (Electron) forks `server.js` as a child process with 4GB V8 heap to prevent OOM during long sessions
- Server accumulates state: session message history (20-turn rolling window), Obsidian project memory, broadcast/debug logs
- `releaseSessionMemory()` garbage-collects terminated sessions; heap ceiling catches regressions
- Server logs to `%APPDATA%\.claude\polaris\logs\server-stderr.log` for debugging in packaged app

**WebSocket protocol (client ↔ server):**
- Client connects to `ws://localhost:40000` on app startup
- Message types: `list-backlogs`, `backlogs-data`, `add-backlog-task`, `update-backlog-task`, `update-backlog-task-status`, `launch-chat`, `launch-direct-agent`, and many session-specific types
- Backlog tasks live in `docs/backlog.json` (git-tracked) and per-project `docs/backlog.json` files
- Impact field (minor/standard/major) gates workflow: `/plan-task` logic checks impact to decide decomposition depth

**Session lifecycle:**
- `launch-chat`: Max (Claude plan) via CLI, native Claude Code tools only; SetStatus tool unavailable
- `launch-direct-agent`: Direct OpenRouter API, runs natively-wired tools; 20-turn message window; supports SetStatus and SetProject
- `spawnDeepSeekRoutine`: Single-turn DeepSeek for obsidian-analyze (structured knowledge extraction)
- Session state released when user closes card or 4-hour idle timeout triggers

**Config & state persistence:**
- `config.json` stored in `%APPDATA%\.claude\polaris\` — API keys, vault path, model strings
- Auto-archives on write to `config-archive/config.<ISO>.json` (200-file, 10MB cap, LRU pruned)
- File versioning: `file-versions.json` tracks mtime/hash of key files for sync detection
- Backlog.json changes auto-committed to current branch (rule in CLAUDE.md); future: auto-commit to main only

**UI state & data flow:**
- Single-page app in `resources/mockup.html` (vanilla JS, no framework)
- Session cards render from broadcast data; "Done" (default) / "Test" (ending with "please test") / "Waiting" (ending with "?")
- Backlog panel: read-only on startup, updates via WebSocket; add/edit modals mutate local state then send WebSocket commit
- Obsidian vault integration via MCP or REST API (Local REST API plugin); project memory loaded per-project on launch

**Data boundary: registries**
- `docs/registries/backlog-task-fields.md` — Schema fields, producers (server create/update), consumers (UI/skills), validation rules
- `docs/registries/websocket-events.md` — All WS event types, payloads, producer/consumer line-number references (corrected post-implementation)
- `docs/registries/endpoints.md`, `docs/registries/claims.md` — Reserved for future API expansion
- Registries updated by `/cross-boundary-audit` skill (reads code, updates line refs, verifies producer/consumer pairs)

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

## Development commands

**Core development:**
- `npm start` — Run Electron in development mode (instant, no build)
- `npm run check:sync` — Verify mockup.html and AppData sync (detects if UI is out of date)
- `npm run pack` — Build unpacked Electron app to `dist/win-unpacked/` (good for testing installers locally)

**Building for distribution:**
- `& C:\Users\scott\Code\Polaris\scripts\build-install.ps1` — One-shot build + installer launch (Scott's typical workflow)
- `npm run dist:fast` — NSIS installer with fast compression (development/testing)
- `npm run dist` — Full release NSIS with LZMA compression

**Post-build maintenance:**
- `npm run postdist` — Auto-runs after `dist` to prune old installers; keeps 5 most recent in `dist/`
- Edit `KEEP` in `scripts/prune-dist.js` to retain more installers

**Sync & configuration:**
- UI source: `resources/mockup.html` — copied to `%APPDATA%\.claude\polaris\mockup.html` on startup
- Server runs on `localhost:40000` (hardcoded in main.js)
- Runtime data: `%APPDATA%\.claude\polaris\` (sessions, logs, config)

## Changelog maintenance (mandatory after every version bump)
After bumping `package.json` version, prepend a row to the **Build Index** table at the top of `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`. Newest build at the top of the table.

**Format:** `| <version> | <YYYY-MM-DD> | **<type>:** <multi-sentence description with markdown> |`

- `<type>` is one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, `ci` — bolded with `**type:**` prefix
- Description is 2-6 sentences explaining **what landed AND why** (root cause for fixes, scope for features). Single-sentence headlines are too thin — they don't survive context loss
- Use backticks around filenames (`mockup.html`, `server.js`), function names (`runDirectAgent`), identifiers, and code-level references
- Server-side auto-extraction (`extractSessionToKnowledge` → DeepSeek) follows the same convention; if you see a row that's just a one-line headline, it predates this rule

The detailed prose history continues below the table — keep both. The table is the at-a-glance index; prose entries are optional for small builds.

## Backlog & task workflow

**Task model:**
- `docs/backlog.json` stores global + per-project tasks with fields: number, title, description, category, priority, status, plan, proofUnits, branch, pr_url, impact
- Status lifecycle: `backlog` → `ready` → `in-progress` → `in-review` → (approved) → `complete` (or `production` for shipped)
- **Impact field** (task #19): enum `minor|standard|major` gates planning depth. Minor = skip `/plan-task`. Major = break into subtasks.
- **Proof units** (task #11): each task plan includes `proofUnits[]` array defining TDD proof expectations (failing → passing test per unit)
- Registry audit: `/cross-boundary-audit` verifies all task field producers/consumers, updates registry line refs, checks proof units
- Review workflow: `/review-pr` (Claude) + `/codex-review` (Codex) must both pass before promoting to stage

**Key workflows (stored in `~/.claude/commands/`):**
- `/plan-task` — Interview phase, design outline, proof-unit breakdown, reachability check (entry gate)
- `/start-build` — Load task plan + proof units, create branch, sync main, block code until first proof unit is ready
- `/finish-build` — Verify proof trail + registries, commit, push, open PR to stage, record PR URL
- `/review-pr` — Structured review against spec + registries + diff, proof-trail checklist
- `/codex-review` — Independent Codex review, compare against prior `/review-pr`
- `/promote-stage` — Review-approved PRs merged to stage, rollup audit, stage → main PR
- `/promote-to-prod` — Main → prod, watch deploy, flip tasks to complete on success

**Proof trail verification:**
- Build evidence: failing test → implement → passing test (RED→GREEN per proof unit)
- Registry evidence: `/cross-boundary-audit` confirms all new identifiers in registries with correct line refs
- Waiver path: if no automated test possible, document manual steps + Scott sign-off instead
- Hard-fail: missing proof units in backlog.json, stale registry line refs, unexplained out-of-scope diff

## Project knowledge base
Soul + why: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md`
Architecture decisions: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\2-Architecture.md`
Build plan + roadmap: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\3-Build-Plan.md`
Full changelog: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`

## Coding discipline
General behavior rules, subordinate to the Polaris-specific rules above. Adapted from `multica-ai/andrej-karpathy-skills` `CLAUDE.md`:

- Think before coding. State assumptions, surface tradeoffs, and ask when the request has multiple plausible interpretations.
- Prefer the minimum code that solves the problem. Do not add features, abstractions, flexibility, or configuration that were not requested.
- Keep changes surgical. Do not improve adjacent code, comments, formatting, or unrelated dead code unless asked.
- Match the existing style, even when another style seems better.
- Clean up only the unused imports, variables, functions, or files created by your own changes.
- Every changed line should trace directly to the user's request.
- Define success criteria before multi-step work. For bugs, reproduce the failure before fixing when practical; for refactors, verify behavior before and after.
- Loop until the goal is verified, and report any verification that could not be completed.

<!-- PROJECT-SPECIFIC -->
