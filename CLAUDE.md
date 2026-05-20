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
- **Valid status values** (enum): `backlog`, `planned`, `build-started`, `build-finished`, `cba-complete`, `staged`, `production`, `blocked`, `on-hold`, `cancelled` — plus legacy UI statuses `ready`, `in-progress`, `complete`, `pr-reviewed`, `cba-half-complete`, `smoke-tested`. *Note: `in-review` is NOT a valid status — do not use it.*
- **Status lifecycle for skill-driven workflows:** `backlog` → `planned` (after `/plan-task` completion) → `build-started` (after `/start-build`) → `build-finished` (after `/finish-build`) → `cba-complete` (after `/codex-review`) → `staged` (after `/promote-stage`) → `production` (after `/promote-to-prod` ships)
- **Impact field** (task #19): enum `minor|standard|major` gates planning depth. Minor = skip `/plan-task`. Major = break into subtasks.
- **Proof units** (task #11): each task plan includes `proofUnits[]` array defining TDD proof expectations (failing → passing test per unit)
- Registry audit: `/cross-boundary-audit` verifies all task field producers/consumers, updates registry line refs, checks proof units
- Review workflow: `/review-pr` (Claude) reviews; `/codex-review` (Codex) reviews and sets status to `cba-complete` before promoting to stage

**Key workflows (stored in `~/.claude/commands/`):**
- `/plan-task` — Interview phase, design outline, proof-unit breakdown, reachability check; plan completion sets status to `planned`
- `/start-build` — Load task plan + proof units, create branch, sync main; **sets status to `build-started`**
- `/finish-build` — Verify proof trail + registries, commit, push, open PR to stage, record PR URL; **sets status to `build-finished`**
- `/review-pr` — Structured review against spec + registries + diff, proof-trail checklist; records review evidence only (no status change)
- `/codex-review` — Independent Codex review, compare against prior `/review-pr`; **sets status to `cba-complete`** after passing
- `/promote-stage` — Looks for `cba-complete` tasks, merges approved PRs into stage, rollup audit; **sets status to `staged`**
- `/promote-to-prod` — Looks for `staged` tasks, promotes to main → prod, watches deploy; **flips to `production`**
- `/ship-task` — Orchestrates the workflow from plan through promotion; does not change status itself (other skills do)

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
