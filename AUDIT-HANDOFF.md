# Polaris — Build Audit Handoff

## What this is

Phase 6 of the Polaris build plan is a component-by-component audit of every feature. A previous session completed Components 1–14. This file is a handoff so a new session can pick up at **Component 15** without needing context from prior sessions.

---

## Where to find everything

| Resource | Location |
|---|---|
| Full audit doc (questions + defect log) | `Polaris_Build/7-Build-Audit.md` in Obsidian vault |
| Architecture reference | `Polaris_Build/3-Architecture.md` in Obsidian vault |
| Source code | `C:\Users\scott\Code\Polaris\` |
| Runtime data | `C:\Users\scott\AppData\Roaming\.claude\polaris\` |
| Running app UI | `http://localhost:40000` (served via Electron — launch Polaris first) |

---

## Component checklist — current state

| # | Component | Status |
|---|---|---|
| 1 | App boot & window | ✅ |
| 2 | Server fork & WebSocket connection | ✅ |
| 3 | Initial state load (`init` message) | ✅ (rolled into #2) |
| 4 | Launch bar | ✅ |
| 5 | Agent session lifecycle | ✅ |
| 6 | Chat session lifecycle | ✅ |
| 7 | Session card visuals | ✅ |
| 8 | Card grid & layout | ✅ |
| 9 | Session persistence | ⏭ Deferred |
| 10 | Config persistence | ⏭ Deferred |
| 11 | Restart button | ⏭ Deferred (validated in #2) |
| 12 | API Balance | ✅ |
| 13 | Reload UI | ✅ |
| 14 | Routines (skeleton check) | 🔲 |
| **15** | **Settings panel** | **🔲 ← START HERE** |
| 16 | Preview panel | 🔲 |
| 17 | Obsidian Up | 🔲 |
| 18 | Reset Layout | 🔲 |
| 19 | Projects panel | 🔲 |
| 20 | Connections (MCP + Git) | 🔲 |
| 21 | Code Health | 🔲 |
| 22 | Versions panel | 🔲 |
| 23 | File Manager | 🔲 |
| 24 | Locks UI | 🔲 |
| 25 | SPACE Productivity | 🔲 |
| 26 | Support panel | 🔲 |
| 27 | Debug log panel | 🔲 |
| 28 | Drag & drop cards | 🔲 |
| 29 | Card resize | 🔲 |
| 30 | Prompt history (↑↓) | 🔲 |
| 31 | Token counter | 🔲 |
| 32 | File upload (chips) | 🔲 |
| 33 | Minimized launch bar | 🔲 |
| 34 | Tooltips | 🔲 |

---

## How the audit works

For each component:
1. Read the question list in `7-Build-Audit.md`
2. Test each scenario in the running app
3. Mark each answer: ✅ pass / ❌ fail / 🔍 needs investigation / 📝 capability revisit / N/A
4. Bugs go into the **Defects log** at the bottom of `7-Build-Audit.md` with severity: 🔴 critical / 🟡 medium / 🟢 low
5. Do not move to the next component until all questions are answered or explicitly deferred

---

## Key rules for this project

- **Propose before acting.** State what you plan to do and wait for Scott to confirm before any code change or file write.
- **Three-zone file rule:**
  - Source: `C:\Users\scott\Code\Polaris\` — edit here
  - Installed app: `AppData\Local\Programs\Polaris\resources\` — never edit, destroyed on reinstall
  - Runtime data: `AppData\Roaming\.claude\polaris\` — only place for runtime reads/writes
- **Code changes require a rebuild.** Tell Scott. He runs `rebuild-install.ps1`.
- **Never restart the server from code.** Tell Scott; he does it.
- **Windows only.** Use PowerShell or Node.js `fs`. No Unix shell commands.

---

## Recent changes (v1.0.8 — this session)

These shipped in v1.0.8 and may need audit coverage:
- Launch bar now uses CSS Grid (`1fr 30px 110px`) for structural alignment
- Tags moved to their own grid row (no longer inside context-sections)
- Glow Pill labels (Style 9) on all three context fields
- Prompt style variants: 2 (Elevated Card), 4 (Neon Border), 6 (Terminal), 10 (Holo Frame)
- 🎨 UI panel in Settings footer for selecting prompt style
- Model selector shifted down 10px

These are UI-only changes in `mockup.html`. No server.js changes.
