# Polaris Session Handoff — 2026-05-05

## Current Version
**1.0.89** — all changes committed and installed.

---

## Changes Made This Session

### Bug Fixes
- **TodoWrite dispatch** — `executeDirectTool` switch was missing `case 'TodoWrite'`, causing "Unknown tool" errors. Fixed.
- **Propose-before-acting scoped to writes only** — BASE_SYSTEM_PROMPT rule now explicitly says reads/searches execute immediately, no confirmation needed.
- **No raw JSON/file dumps in responses** — Added BASE_SYSTEM_PROMPT rule: never output raw file contents or data structures; summarize instead.
- **Reload + Balance wireUI mismatches** — `wireUI()` was checking for `'Reload UI'` and `'$ Balance'` but button labels are `'Reload'` and `'Balance'`. Both buttons were silently broken. Fixed.
- **Obsidian write blocked** — `assertWritable()` was rejecting writes outside workDir, which blocked agents from writing session notes and changelog to Obsidian. Fixed: writes to `config.obsidianVaultPath` are now allowed.
- **Direct Model pill** — Renamed to "DIRECT MODEL (API TEST ONLY)" — the `useDirectAnthropic` toggle has no effect on session routing (everything goes through OpenRouter). The field is vestigial.
- **Read permission in Aesop** — Added `"Read"` to `C:\Users\scott\Code\Aesop\.claude\settings.json` allow list.
- **Optional MCP env vars** — Server was writing empty strings for unconfigured optional credentials. Now skips empty values.

### New Features
- **Auto-switch to Code mode on project select** — Selecting a project in the launch bar dropdown now automatically flips the toggle to Code mode. Selecting "— None —" leaves the mode unchanged.
- **You.com Search MCP** — Replaced Chrome Connector (never worked) in MCP catalog with You.com (`@youdotcom-oss/mcp`). Provides `you-search`, `you-contents`, `you-research`. Free tier requires no API key. Optional `YDC_API_KEY` for higher limits.
- **Brave Search API key field** — Added to Settings → API Keys section. Encrypted. `braveSearchApiKey` added to `SENSITIVE_KEYS`.
- **WebSearch priority** — `toolWebSearch()` now tries: You.com MCP free tier → Brave API → DuckDuckGo. Tool description updated so agents know You.com is free.

### Nav Button Grid Redesign
Full 4-row × 6-column layout. Each column has a consistent color class:
- Col 1 (gold): [empty] | Factory | Web | Preview
- Col 2 (cyan): [empty] | Cross ✓ | Code ✓ | Monaco
- Col 3 (red): Files | Archive | Versions | Obsidian
- Col 4 (green): Restart | Reload | Reset | Close
- Col 5 (orange): Routines | Projects | Connect | Balance
- Col 6 (purple): Settings | Walkthrough | Docs | Support

Docs and Walkthrough moved out from under the logo into the grid. Cross ✓ is a placeholder (no functionality yet).

---

## Pending / Remaining P0 Items (from Build Plan)

| Item | Status |
|------|--------|
| Server-side locks.json enforcement | Still pending — currently honor-system only |
| You.com MCP — needs to be enabled in Connect panel | Needs to be saved to `~/.claude.json` via Connect |
| Cross ✓ button | Placeholder only — no panel wired up yet |
| Config backup on startup | Discussed but not built — config was wiped this session |

---

## Architecture Notes

### File Locations
- Source: `C:\Users\scott\Code\Polaris\`
- Runtime data: `%APPDATA%\.claude\polaris\`
- Config: `%APPDATA%\.claude\polaris\config.json`
- Obsidian vault: `G:\My Drive\Aesop Academy\Obsidian\`

### assertWritable() Allowed Paths
Writes are allowed to:
1. `session.workDir` (project working directory)
2. `config.obsidianVaultPath` (Obsidian vault — for session notes and changelog)

### WebSearch Tool Priority
1. You.com MCP (`mcp__you-com__you-search`) — free, no key
2. Brave Search API — if `braveSearchApiKey` in config
3. DuckDuckGo instant answers — free fallback

### Config Wiped This Session
Config was wiped during install (force-kill mid-write). The `enc-key.bin` tied to the old `installId` (`d2c9e221a7c12e48`) no longer matches the new ID (`115248b82daac87a`). Scott re-entered all API keys. New encrypted values are in config.json.

---

## What to Do Next
1. Enable You.com in Connect panel to activate free search
2. Build Cross ✓ panel (cross-model code review — see `CodeReview-Plan.md` in Obsidian)
3. Add config backup-on-startup to prevent future wipes
4. Server-side locks.json enforcement (last remaining P0)
