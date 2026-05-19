# Polaris

Scott's personal AI command center - parallel agent sessions, real API control, Electron desktop UI.

## Critical rules
1. **Propose before writing.** For file edits and writes, state the planned change and wait for explicit yes. Reads, searches, and tool calls proceed without asking.
2. **Three zones:** Source (`C:\Users\scott\Code\Polaris`) - edit only here; source changes require Scott to rebuild/reinstall, any `dist` or installer-producing build requires explicit approval, and only Scott runs installers. Installed app (`C:\Users\scott\AppData\Local\Programs\Polaris\resources`) - only touch with explicit approval. Runtime data (`C:\Users\scott\AppData\Roaming\.claude\polaris\`, the user's `Downloads` folder, and `G:\*`) - only places for runtime reads/writes.
3. **Versioning:** state file's current version before editing, new version after. Versions in `%APPDATA%\.claude\polaris\file-versions.json`.
4. **Locks:** check `%APPDATA%\.claude\polaris\locks.json` before any write; locked files need explicit approval.
5. **Server restarts:** never from code - tell Scott.
6. **Windows:** backslash paths, no Unix shell tools. PowerShell is available and preferred; use Node `fs` when structured file operations are safer.
7. **Commit after every repo change:** After any repo file edit or write, immediately commit with a conventional message (feat, fix, refactor, docs, chore, perf, ci). Never leave repo changes uncommitted. Runtime data and Obsidian knowledge writes outside a git repo are saved on disk but not committed. Bump `package.json` version **at delivery time** for source, config, runtime behavior, build, UI, or shipped asset changes. Do not bump `package.json` for notes/documentation-only changes.
8. **Never give up after one tool failure.** If `QueryMemory` returns an error or empty content, fall back to `Read`, `Glob`, `Grep`, or PowerShell filesystem reads - do not stop and ask the user. Canonical paths to try first: `C:\Users\scott\Code\Polaris\CLAUDE.md` (project rules) and `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\1-Soul.md` through `8-Logs.md` (project knowledge base, listed in detail under "Project knowledge base" below). PowerShell is the preferred shell tool. Asking the user to "advise" or "provide the path" is a last resort, not a first response.
9. **Config archives.** Every write to `%APPDATA%\.claude\polaris\config.json` auto-copies the prior content to `%APPDATA%\.claude\polaris\config-archive\config.<ISO>.json`. Append-only, capped at 200 files / 10 MB total - oldest pruned first. If a save corrupts or wipes config (the 2026-05-05 incident wiped `obsidianDir`, MCP servers, and routines from every project), restore from the most recent pre-incident archive. Do not trust `config.backup.json` alone - single-level, gets rotated past loss points.
10. **Never run installers.** Scott is the only person who runs Polaris installer executables or `build-install.ps1`. Do not run `build-install.ps1`, `npm run dist`, `npm run dist:fast`, or any installer-producing build unless Scott explicitly approves that exact command; even with build approval, do not launch installer executables yourself. Building with `npm start` or `npm run pack` is safe (no installer, no reboot risk).

## Backlog Workflow Governance

**Protected branch topology:** `main`, `stage`, and `prod` are protected landing branches. Ordinary build, finish, review, and audit sessions must not write to or merge into any of them directly.

**Worktree isolation:** Each backlog `/start-build` session must create a unique git worktree + feature branch. Branches follow pattern: `task/{number}-{description}`. Direct non-backlog edits start from `main` in the normal source checkout unless Scott explicitly asks for a branch or worktree. Rationale: prevents git state interference between parallel backlog sessions while keeping small maintenance edits simple.

**PR targeting:** `/finish-build` prepares the handoff for review but does not land work on a protected branch. Code review happens before any promotion command moves work forward.

**Promotion gates:** Protected branches change only through explicit promotion commands:
1. **`/promote-stage`:** only command allowed to move approved work onto `stage`
2. **`/promote-to-main`:** only command allowed to move `stage` onto `main`
3. **`/promote-to-prod`:** only command allowed to move `main` onto `prod`

**Branch locks:** Direct pushes and ordinary-session merges to `main`, `stage`, and `prod` are blocked. Promotion commands are the sole landing path for those branches.

## Architecture
- **Agent sessions** -> Direct OpenRouter API (`POST https://openrouter.ai/api/v1/chat/completions`, OpenAI streaming format). Implemented in `runDirectAgent()` in server.js. Rolling 20-turn message window. Tool schemas executed natively in server.js: Read, Write, Edit, Glob, Grep, PowerShell, WebFetch, WebSearch, AskUserQuestion, TodoWrite, QueryMemory, SetProject, **SetStatus**. System prompt = BASE_SYSTEM_PROMPT + CLAUDE.md + project memory. No CLI involved.
- **Chat sessions** -> Claude Max plan via Claude CLI (`spawnMaxChat`). Uses Claude Code's native tool set only. Use **SetStatus** when the current session exposes it. Claude CLI chat sessions do not expose SetStatus, so Polaris auto-detects session card state from the final message as a fallback: end with "Please test this" or "Try it out" -> purple test card; end with "?" -> amber waiting card; otherwise -> green done.
- **Routine sessions** -> DeepSeek direct API (`api.deepseek.com`) via `spawnDeepSeekRoutine()`. Single-turn, no tools.
- Never mix routing. The old Claude CLI path (`spawnClaude`) is retained in server.js but no longer called.

## Key files
- `server.js` - HTTP+WS server; agent/chat spawning, file versioning, lock enforcement.
- `main.js` - Electron entry; forks server.js, creates BrowserWindow.
- `resources/mockup.html` - source UI; copied to AppData on first run.
- `scripts/build-install.ps1` - Scott-only one-shot build + install runner. Agents do not run this unless Scott explicitly approves the exact command.
- `scripts/prune-dist.js` - keeps last 5 `dist/Polaris Setup *.exe` (auto-runs via `postdist` / `postdist:fast` hooks).
- `%APPDATA%\.claude\polaris\config.json` - API keys, model strings, vault path, all settings.

## Build & install
- **One-shot:** `& C:\Users\scott\Code\Polaris\scripts\build-install.ps1` - Scott-only daily reinstall loop; agents do not run this unless Scott explicitly approves the exact command.
- **Speed ladder (when you need a different mode):**
  - `npm start` - instant; runs Electron directly, no build, no install
  - `npm run pack` - unpacked `dist/win-unpacked/Polaris.exe`, no installer
  - `npm run dist:fast` - installer-producing build with `compression=store` and `asar=false`; explicit Scott approval required
  - `npm run dist` - full release installer-producing build (LZMA + asar); explicit Scott approval required
- Old installers auto-pruned to 5 most recent. To keep more, edit `KEEP` in `scripts/prune-dist.js`.
- Windows Defender exclusions for the source dir, `dist/`, and `%LOCALAPPDATA%\Programs\Polaris` cut Electron build time 30-50% - set manually in Windows Security.

## Changelog maintenance (mandatory after every version bump)
After bumping `package.json` version, prepend a row to the **Build Index** table at the top of `G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`. Newest build at the top of the table.

**Format:** `| <version> | <YYYY-MM-DD> | **<type>:** <multi-sentence description with markdown> |`

- `<type>` is one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, `ci` - bolded with `**type:**` prefix
- Description is 2-6 sentences explaining **what landed AND why** (root cause for fixes, scope for features). Single-sentence headlines are too thin - they don't survive context loss
- Use backticks around filenames (`mockup.html`, `server.js`), function names (`runDirectAgent`), identifiers, and code-level references
- Server-side auto-extraction (`extractSessionToKnowledge` -> DeepSeek) follows the same convention; if you see a row that's just a one-line headline, it predates this rule

The detailed prose history continues below the table - keep both. The table is the at-a-glance index; prose entries are optional for small builds.

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
