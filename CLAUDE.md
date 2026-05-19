# Polaris

Scott's personal AI command center - parallel agent sessions, real API control, Electron desktop UI.

## Critical rules
1. **Propose before writing.** For file edits and writes, state the planned change and wait for explicit yes. Reads, searches, and tool calls proceed without asking.
2. **Three zones:** Source (`C:\Users\scott\Code\Polaris`) - edit only here. Installed app (`C:\Users\scott\AppData\Local\Programs\Polaris\resources`) - only touch with explicit approval. Runtime data (`C:\Users\scott\AppData\Roaming\.claude\polaris\`, the user's `Downloads` folder, and `G:\*`) - only places for runtime reads/writes.
3. **Versioning:** before editing and before delivery, follow `docs/agent-rules/versioning.md`.
4. **Locks:** check `%APPDATA%\.claude\polaris\locks.json` before any write; locked files need explicit approval.
5. **Server restarts:** never from code - tell Scott.
6. **Windows:** backslash paths, no Unix shell tools. PowerShell is available and preferred; use Node `fs` when structured file operations are safer.
7. **Commits:** after repo edits, follow the commit/package/changelog rules in `docs/agent-rules/versioning.md`.
8. **Never give up after one tool failure.** If `QueryMemory` returns an error or empty content, fall back to `Read`, `Glob`, `Grep`, or PowerShell filesystem reads - do not stop and ask the user. Canonical paths to try first: `C:\Users\scott\Code\Polaris\CLAUDE.md` (project rules) and `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md` through `8-Logs.md` (project knowledge base, listed in detail under "Project knowledge base" below). PowerShell is the preferred shell tool. Asking the user to "advise" or "provide the path" is a last resort, not a first response.
9. **Config archives.** Every write to `%APPDATA%\.claude\polaris\config.json` auto-copies the prior content to `%APPDATA%\.claude\polaris\config-archive\config.<ISO>.json`. Append-only, capped at 200 files / 10 MB total - oldest pruned first. If a save corrupts or wipes config (the 2026-05-05 incident wiped `obsidianDir`, MCP servers, and routines from every project), restore from the most recent pre-incident archive. Do not trust `config.backup.json` alone - single-level, gets rotated past loss points.
10. **Build/install:** Scott is the only person who runs Polaris installers. Before any build command, follow `docs/agent-rules/build-install.md`.

## Backlog Workflow Governance

**Protected branch topology:** `main`, `stage`, and `prod` are protected landing branches. Ordinary build, finish, review, and audit sessions must not write to or merge into any of them directly.

Before `/start-build`, `/finish-build`, review, audit, or promotion work, read and follow `docs/agent-rules/workflow.md`.

## Architecture
- **Agent sessions** -> Direct OpenRouter API (`POST https://openrouter.ai/api/v1/chat/completions`, OpenAI streaming format). Implemented in `runDirectAgent()` in server.js. Rolling 20-turn message window. Tool schemas executed natively in server.js: Read, Write, Edit, Glob, Grep, PowerShell, WebFetch, WebSearch, AskUserQuestion, TodoWrite, QueryMemory, SetProject, **SetStatus**. System prompt = BASE_SYSTEM_PROMPT + CLAUDE.md + project memory. No CLI involved.
- **Chat sessions** -> Claude Max plan via Claude CLI (`spawnMaxChat`). Uses Claude Code's native tool set only. Use **SetStatus** when the current session exposes it. Claude CLI chat sessions do not expose SetStatus, so Polaris auto-detects session card state from the final message as a fallback: end with "Please test this" or "Try it out" -> purple test card; end with "?" -> amber waiting card; otherwise -> green done.
- **Routine sessions** -> DeepSeek direct API (`api.deepseek.com`) via `spawnDeepSeekRoutine()`. Single-turn, no tools.
- Never mix routing. The old Claude CLI path (`spawnClaude`) is retained in server.js but no longer called.

## Key files
- `server.js` - HTTP+WS server; agent/chat spawning, file versioning, lock enforcement.
- `main.js` - Electron entry; forks server.js, creates BrowserWindow.
- `resources/mockup.html` - source UI; copied to AppData on first run.
- `scripts/build-install.ps1` - Scott-only one-shot build + install runner; agents do not run it. See `docs/agent-rules/build-install.md`.
- `scripts/prune-dist.js` - keeps last 5 `dist/Polaris Setup *.exe` (auto-runs via `postdist` / `postdist:fast` hooks).
- `%APPDATA%\.claude\polaris\config.json` - API keys, model strings, vault path, all settings.

## Build, Versioning, And Workflow Details
- Build/install permissions: `docs/agent-rules/build-install.md`
- Commit, package version, file version, and changelog mechanics: `docs/agent-rules/versioning.md`
- Backlog, worktree, `/finish-build`, and promotion workflow: `docs/agent-rules/workflow.md`

## Project knowledge base
Soul + why: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md`
Architecture decisions: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\2-Architecture.md`
Build plan + roadmap: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\3-Build-Plan.md`
Full changelog: `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`
Global backlog: `G:\My Drive\Aesop Academy\Obsidian\Backlog\backlog.json` - prioritized list of scheduled work
Polaris backlog: `docs/backlog.json` - prioritized list of scheduled work

## Planning

Plan before building: define success criteria, scope boundaries, dependencies, and risks. For guidance on planning triggers, artifacts, and validation gates, see [planning.md](planning.md).

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
