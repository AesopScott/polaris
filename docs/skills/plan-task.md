---
name: plan-task
description: Produce a concrete implementation plan for a backlog task before any build session touches it. Loads Obsidian project context (Build folder + recent Sessions), confirms the feature is reachable end-to-end by its target persona before planning, audits boundary changes, and saves the plan to docs/backlog.json through the isolated backlog write protocol.
---

# /plan-task [task-number]

## Backlog Write Isolation Protocol (Task #60)

Any step in this skill that mutates `docs/backlog.json` or `docs/backlog-archive.json` must use this protocol. Do not edit the shared primary working tree for backlog state, even if it is currently on `main`.

1. Resolve the project source repo and fetch fresh main:
   `git -C "<repo>" fetch origin main`
2. Create a disposable backlog worktree from `origin/main`:
   `git -C "<repo>" worktree add "<repo>/worktrees/backlog-<task-or-purpose>-<timestamp>" -b "chore/backlog-<task-or-purpose>-<timestamp>" origin/main`
3. In that disposable worktree, read and write JSON with Node `fs` using explicit `utf8`. Never use the Edit tool or PowerShell JSON cmdlets for these files.
4. Stage only backlog files touched by the mutation, then commit with a conventional `chore(backlog): ...` message.
5. Before pushing, run `git pull --rebase origin main` from the disposable worktree. If the rebase conflicts, resolve only the backlog JSON conflict by re-reading the rebased file and reapplying the intended task-number mutation; do not accept unrelated hunks blindly.
6. Push with `git push origin HEAD:main`. If rejected, repeat fetch/rebase/reapply/push. Never force-push `main`.
7. Remove the disposable worktree after a successful push: `git -C "<repo>" worktree remove "<path>"`, then `git -C "<repo>" worktree prune`.

Read-only task lookup may use `git show origin/main:docs/backlog.json` after fetch, or the disposable worktree if a write may follow. The final report must name the backlog commit SHA pushed to `main`.


Produce an implementation plan for a backlog task. Loads project mission and recent-session context from Obsidian first, confirms the feature can actually be reached and smoke-tested by its target persona (filing prerequisite tasks if not), then plans against the backlog. Saves the plan back to `docs/backlog.json` through the isolated backlog write protocol so the next `/start-build` picks it up.

## Directive Polling (multi-session only)

If this session is running in a multi-session context (2+ active sessions on this project), check for orchestrator directives before proceeding:

1. Read `%APPDATA%\.claude\polaris\session-guidance\session-directives.json`
2. Look for an entry where `target.sessionId` matches this session's ID AND `status === "pending"`
3. If found:
   - Immediately set `status: "acknowledged"` and write `acknowledgedAt: <ISO timestamp>`
   - The directive's `instruction` field contains the full prompt — execute it as if it were a user message
   - After completing the directive, set `status: "completed"`, write `completedAt` and a brief `result`
4. If not found or single-session context: proceed normally with "Scope and limits" below

> **Note:** If `session-directives.json` doesn't exist or this session has no pending directives, that's normal — continue to "Scope and limits".

---

## Scope and limits

- **One primary task per session.** This skill plans exactly Task #{N} (the argument). Do not enumerate, list, or proactively work on other tasks. If the user pivots to a different task, that's a new invocation.
  - **Exception: emergency fixes.** An emergency fix may be planned as a secondary task in a session that's already handling another task. (See the project's emergency-fix workflow definition — being formalized in the in-flight task that codifies fix vs emergency-fix rules.) The skill itself does not detect emergency-fix mode; the user signals it by invoking `/plan-task` for the fix's task number from inside the existing session.
- **Cannot promote to `main`.** Production promotion belongs exclusively to `/promote-stage` (opens stage→main PR for human merge) and `/promote-to-prod` (auto-merges stage→main and ships). This skill never asks the user whether to promote, never offers to promote, and never invokes either promotion skill itself.
- **Cannot merge to `stage`.** Stage merges are `/finish-build`'s job.
- **No rollups.** Multi-task batching is `/promote-stage`, `/promote-to-prod`, and `/mark-tasks-complete` only.

## Objective-Centric Criteria Contract

Every planned task must receive an `objective` object in `docs/backlog.json`. This is the task's durable goal contract. It prevents later sessions from optimizing for "do some work" instead of "satisfy this objective."

Required shape:

```json
"objective": {
  "statement": "One sentence describing the user-visible or system-visible outcome this task must achieve.",
  "successCriteria": [
    "Concrete criterion that must be true before this task can be considered complete."
  ],
  "nonGoals": [
    "Explicitly out-of-scope work that later sessions must not add opportunistically."
  ],
  "proofMap": [
    {
      "criterion": "Exact success criterion text or short id",
      "proofUnit": 1,
      "evidence": "What output, test, audit, review, screenshot, or waiver proves this criterion."
    }
  ],
  "currentStep": "planned",
  "stopConditions": [
    "Condition that requires stopping instead of guessing or expanding scope."
  ],
  "handoffNotes": []
}
```

Planning rules:
- `statement` must be narrower than the project mission and broader than a single implementation tactic.
- `successCriteria` must be observable. Avoid vague verbs unless followed by a measurable outcome.
- `nonGoals` must include any tempting adjacent work discovered during planning.
- `proofMap` must map every success criterion to at least one `proofUnits[]` entry, or to an explicit waiver path.
- `stopConditions` must name ambiguity, blocked dependencies, missing credentials, or environment gaps that should halt `/start-build`, `/finish-build`, review, or promotion.

## OBSIDIAN ACCESS PROTOCOL

When you need to read or write Obsidian content (list vault, list folder, get file, append to file), try these in order. Stop at the first one that works.

- **Vault root:** `G:\My Drive\Aesop Academy\Obsidian\`
- **REST API:** `http://127.0.0.1:27123`, auth via header `Authorization: Bearer ${OBSIDIAN_API_KEY}` (env var set globally)
- **MCP server:** `mcp__mcp-obsidian__*` tools

### Fallback order

**1. Filesystem (most reliable — no running services required)**
- List vault root: `Glob "G:\My Drive\Aesop Academy\Obsidian\*"`
- List folder: `Glob "G:\My Drive\Aesop Academy\Obsidian\{folder}\*"`
- Get file: `Read "G:\My Drive\Aesop Academy\Obsidian\{folder}\{file}.md"`
- Write file: `Write "G:\My Drive\Aesop Academy\Obsidian\{folder}\{file}.md"` or `Edit`

**2. Local REST API (fallback when filesystem is unavailable)**
The Obsidian Local REST API plugin runs on `127.0.0.1:27123`. URL-encode folder/file names with spaces.
- List vault root: `curl -s -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" http://127.0.0.1:27123/vault/`
- List folder: `curl -s -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" "http://127.0.0.1:27123/vault/{folder}/"`
- Get file: `curl -s -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" "http://127.0.0.1:27123/vault/{folder}/{file}.md"`
- Write file: `curl -s -X PUT -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" -H "Content-Type: text/markdown" --data-binary @local-file "http://127.0.0.1:27123/vault/{folder}/{file}.md"`
- Append to file: `curl -s -X POST -H "Authorization: Bearer $env:OBSIDIAN_API_KEY" -H "Content-Type: text/markdown" --data-binary "...content..." "http://127.0.0.1:27123/vault/{folder}/{file}.md"`

**3. MCP server (final fallback)**
- List vault: `mcp__mcp-obsidian__obsidian_list_files_in_vault`
- List folder: `mcp__mcp-obsidian__obsidian_list_files_in_dir`
- Get file: `mcp__mcp-obsidian__obsidian_get_file_contents`
- Append: `mcp__mcp-obsidian__obsidian_append_content`

If all three fail, abort with: "Cannot access Obsidian vault — checked filesystem (`G:\My Drive\Aesop Academy\Obsidian\`), REST API (`http://127.0.0.1:27123`), and MCP server. None responded. Investigate before proceeding."

---

## OBSIDIAN FOLDER CONVENTION

Each project gets two sibling folders at the vault root. This is hard-coded — every project follows it.

- **`{Name}_Build/`** — design and planning docs. Canonical file names:
  - `Soul.md`
  - `Architecture.md`
  - `Feature Contracts.md`
  - `Build Plan.md`
- **`{Name}_Sessions/`** — one narrative file per session:
  - `YYYY-MM-DD — {Session Title}.md` (e.g., `2026-05-17 — Task 12 Review Session.md`)

`{Name}` mirrors the project's repo name. **Folder lookups are case-insensitive** — vault history has both `CareGuide_Build/` and `careguide_Sessions/`. When creating new folders for a new project, use the project's canonical capitalisation.

---

## Step 1 — Load project context from Obsidian

This step is **required** before reading the backlog. Skipping it produces plans that don't understand the project's mission or where things stand.

1. Determine the project's Obsidian name:
   - Capture the CWD basename (the folder name of the current working directory).
   - List the vault root using the **OBSIDIAN ACCESS PROTOCOL** (filesystem first, then REST API, then MCP).
   - Find all top-level folders matching `*_Build/`.
   - For each candidate, strip the `_Build` suffix and compare to the CWD basename — case-insensitive, ignoring non-alphanumeric characters. (Example: CWD `careguide` matches `CareGuide_Build/`.)
   - Pick the single match. If multiple candidates match equally, ask the user which to use.
   - If no candidate matches, warn the user that no Obsidian context was found for this project and skip to Step 2 — don't block.

2. List both folders using the **OBSIDIAN ACCESS PROTOCOL**:
   ```
   List {ProjectName}_Build/
   List {ProjectName}_Sessions/
   ```
   The Sessions folder may not exist; that's fine.

3. Read in full any of these that exist in `{ProjectName}_Build/` using the **OBSIDIAN ACCESS PROTOCOL**:
   - `Project Overview.md`
   - `Soul.md`
   - `Architecture.md`
   - `Build Plan.md`
   - Any feature contracts (root files or `*/Contracts/` subfolders)

4. Read the 1–3 most recent notes from `{ProjectName}_Sessions/` if any exist using the **OBSIDIAN ACCESS PROTOCOL**.

5. Output a structured context summary to the user, with every line filled — don't skip any:

   - **Project**: one-line mission (from `Project Overview.md` or `Soul.md`) — who it serves, what it does
   - **Stack**: tech stack and primary components (from `Architecture.md`) — frontend, backend, data store, key infra
   - **Phase**: where the build currently stands (from `Build Plan.md` and the most recent Sessions notes) — what's done, what's in progress
   - **Conventions**: project-specific patterns you noticed that affect how to plan (e.g., registries used, naming style, auth model)
   - **Notable for this task**: anything in the loaded context that directly affects this plan — related work, decisions to honor, gotchas
   - **Files read**: list every `{Project}_Build/*.md` and `{Project}_Sessions/*.md` you actually loaded

   Aim for 6–10 lines of real content. If a line would be empty (e.g. no Sessions notes exist yet), write "(none yet)" rather than skipping it. A thin one-line tagline summary means you didn't actually load the context — go back and read the files.

## Step 2 — Sync main and read the backlog

**Backlog reads that may lead to writes must use the Backlog Write Isolation Protocol above.**

```bash
git worktree list
```

Create or use a disposable backlog worktree from fresh `origin/main` as described in the Backlog Write Isolation Protocol above. Treat all subsequent backlog reads and writes in this skill as happening inside that disposable worktree. Do not change into the shared primary `main` worktree.

Read `docs/backlog.json` from the disposable backlog worktree. If it doesn't exist, ask the user: "No backlog exists. Want to scaffold one with this task as the first entry?"

## Step 3 — Find the task

Find the task by `number` matching `$ARGUMENTS`. If not found, stop.

### Step 3a — State guard (lifecycle order check)

Read the task's `status`. The skill's allowed action depends on it:

| Current status | Allowed action |
|---|---|
| `backlog` | ✅ Proceed — standard new-plan path. |
| `planned` | ⚠️ Plan already exists. Ask: "Task #{N} already has a plan. [Use existing → stop / Re-plan from scratch → proceed / Abort]". |
| `build-started` | ❌ **Refuse.** "Task #{N} is in-progress with branch `{branch}`. Re-planning would conflict with active code on the task branch. To replan from scratch, first reset the task to `backlog` in `docs/backlog.json` and delete the task branch if it exists." Stop. |
| `build-finished` / `pr-reviewed` / `codex-reviewed` / `review-passed` / `review-blocked` | ❌ **Refuse.** "Task #{N} is already beyond planning with status `{status}`. Open a new task for follow-up work, or intentionally reset the task through the backlog protocol." Stop. |
| `production` | ❌ **Refuse.** "Task #{N} is already production. Create a new task for additional work." Stop. |

Do NOT skip this check. Out-of-order workflow execution is the most common cause of corrupted task state.

### Step 3b — Reachability and testability check (REQUIRED)

A plan is worthless if the feature it builds can't actually be exercised by a real user. This step catches the prerequisites you'd otherwise only discover after shipping to stage and finding the smoke test can't run. Five minutes here prevents days of rework.

Do this **before** reading any code (Step 4) or auditing boundaries (Step 5). The whole point is to catch testability blockers while there's still time to file them as prerequisite tasks and add them to this task's `dependencies` array — not after the plan is locked in.

#### 1. Build a testability profile

From the task description and a quick skim of the loaded contracts, answer four questions. If the task description is too vague to answer any of these, ask the user before continuing:

- **Persona** — who uses this feature? (practitioner / admin / family member / public / system)
- **Entry path** — what URL path the persona takes to reach the feature, step by step? (e.g., "login → dashboard.html → click client card → client.html → Family Members tab")
- **Required state** — what data must exist for this feature to be exercisable? (e.g., "at least one client owned by the test practitioner with an accepted family invitation")
- **Test environment** — where will this be smoke-tested? (typically `stage`; sometimes `prod` for read-only or low-risk changes)

#### 2. Confirm the entry path actually works today

For each step of the entry path, confirm it works in the test environment:

- Direct URL navigation lands where expected (no silent redirects, no 404, no infinite spinner)
- Each click / form submit transitions to the next expected screen
- The required state can be created from scratch by the persona (e.g., the new-client flow works), or already exists for the test persona

The agent typically can't perform the walk itself (no test-account credentials, no email inbox access). Two options:

- **Ask the user to walk it now** and report which steps work and which break. Wait for their answer before proceeding.
- **If the user wants to defer the walk**, document the assumption explicitly (which entry-path steps are *assumed* working) and surface it as a risk in the plan body.

Never silently assume the path works. The original failure mode this step exists to prevent — planning task #2 (Manage Family Members UI) on client.html while the dashboard→client navigation was silently broken on prod — happened because the agent never asked.

#### 3. File prerequisites and update dependencies

For each broken step on the entry path or missing required-state capability the user reports:

1. **File a separate backlog task** for the prerequisite. Category: `emergency-fix` if it blocks a user-facing flow, otherwise `debt`. Number: next available after scanning the current backlog (and any in-flight backlog PRs the user mentions — collisions across parallel sessions are a real risk).
2. **Add the prerequisite task's number to the `dependencies` array** of the task being planned (in Step 8 when you save).
3. **Note in the plan body**, under a `## Testability prerequisites` header, what the gap is and which new task addresses it.

If the user surfaces a hard blocker and does not want to file a prerequisite task, refuse to proceed and stop. A plan that can't be smoke-tested isn't a plan — it's a guess.

#### 4. When in doubt, file the prereq

False positives are cheap (a tiny backlog entry that gets closed quickly when the assumption proves wrong); false negatives ship code to production that can't be exercised and rot quietly until users complain. If you can't tell whether the gap is real (e.g., unsure if Brevo credentials are configured on stage), file it as a "verify X before testing this task" prerequisite and move on.

#### 5. Identify the first proof unit (entry gate confirmation)

Before confirming readiness, identify the **first proof unit** — the smallest, most foundational implementation step whose success unlocks the next step:

1. **First proof unit shape**: "When a user/system reaches {entry point}, {action/condition}, {observable outcome} should occur."
   - Example: "When a practitioner clicks the 'Add Family Member' button on client.html, a modal opens with an email input field."
   - This is NOT the full feature — it's the minimal behavioral wedge that confirms the entry path actually works.

2. **Proof type for this first unit**: What will you check to know it worked? (test file, curl command, UI inspection, manual verification)
   - Example: Browser DevTools shows `<div class="modal" id="add-family-modal">` is visible after click.

3. **If the entry path walk (step 2) found the first proof unit already works in stage**, note that as "entry evidence exists — smoke test confirmed" and proceed.

4. **If the entry path walk found the first proof unit is broken**, file it as a prerequisite (Step 3) and defer this task's first-proof identification until the prereq lands.

5. **Document in the plan body** under a `## First Proof Unit` header:
   - Expected behavior statement
   - How it will be verified
   - Whether it already passes on stage (yes → documented as entry evidence) or is blocked by a prerequisite (no → task number of blocker)

## Step 4 — Load boundary contracts

Read in full if they exist:
- `docs/registries/collections.md`
- `docs/registries/endpoints.md`
- `docs/registries/claims.md`
- Any `docs/contracts/*.md`

Read source files directly relevant to the task (the description should hint at which).

## Step 5 — Identify all boundary changes

Enumerate every cross-boundary change required:
- **New Firestore collections** — name, producers, consumers, rules needed, indexes needed
- **Modified collections** — new fields, new access patterns, rule changes
- **New API endpoints** — path, method, auth middleware, request/response shape, callers
- **Modified endpoints** — shape changes, new auth requirements
- **New custom claims** — name, who sets, who checks
- **New frontend pages or significant UI sections** — auth guard needed?

Flag any conflict with existing boundaries.

## Step 6 — Produce the implementation plan as objective-backed proof units

Before writing proof units, define the task's objective criteria:

1. **Objective statement:** one sentence naming the outcome this task exists to achieve.
2. **Success criteria:** 2-6 observable criteria that collectively define done.
3. **Non-goals:** scope boundaries and adjacent work not included in this task.
4. **Stop conditions:** blockers that should stop later workflow steps instead of letting them improvise.
5. **Proof map:** for each success criterion, name the proof unit or units that will verify it.

Break the implementation into **proof units** — discrete, testable implementation steps. Each unit defines what behavior should exist after the step, how to verify it before the next step starts, and what to do if automated proof isn't possible.

**Proof unit structure** (required for each unit):

```
### Proof Unit {N}: {title}

**Expected behavior:**  
{One sentence describing the observable outcome after this unit lands. Example: "Clicking the Save button writes the client data to Firestore and closes the modal."}

**Preferred proof type:**  
{One of: failing-test, smoke-command, api-check, ui-check, registry-diff, manual-script, or waiver}

**Exact command/check/manual path:**  
{The specific thing to run or check. Example: "npm run test -- src/addClient.test.js; expect 2 passing tests" or "open client.html in browser, fill form, click Save, check DevTools console for no errors and Firestore entry for new doc"}

**Expected initial failure (RED):**  
{What error or missing behavior is expected before code lands. Example: "addClient.test.js fails with 'ReferenceError: addClientToFirestore is not defined'"}

**Expected passing evidence (GREEN):**  
{What success looks like. Example: "addClient.test.js passes; Firestore has new doc with correct fields"}

**Waiver guidance (if automated proof not possible):**  
{If this unit has no automated test, what alternative evidence replaces it? Example: "No test exists because this is pure UI state. Manual evidence: screen recording shows modal closes after Save. Waiver signed by Scott in PR #123."}
```

**Proof unit types and how to verify each:**

| Type | When to use | Verification command/path | Pass criteria |
|------|-------------|--------------------------|---------------|
| **failing-test** | New feature with unit/integration test | `npm test -- {test-file}` | All tests pass; grep shows [1–2] passing |
| **smoke-command** | API endpoint, CLI tool, or build step | `curl -X GET http://localhost:3000/api/...` or `npm run build` | HTTP 2xx or command exit 0, no errors in output |
| **api-check** | Backend API boundary change | `curl -X POST ... -d '{"field":"value"}'` with expected request shape and response | Response matches schema in registries/endpoints.md |
| **ui-check** | Frontend page/component change | Browser DevTools: inspect element, console log, Network tab | Element visible, no console errors, expected network requests fired |
| **registry-diff** | Cross-boundary contract (Firestore rules, endpoints, claims) | `git diff docs/registries/{type}.md` after editing | Registry file is updated before code lands; producer/consumer counts match |
| **manual-script** | Complex manual flow or third-party integration | Step-by-step script (numbered list) the user can follow | User confirms in writing or session capture that each step worked |
| **waiver** | No automated test possible (e.g., pure UI state, external service, compliance check) | Written waiver signed by user in PR body or task plan | Waiver explains why automation can't happen and what manual check replaces it |

**Implementation guidance:**

1. **Registry updates come first** — update docs/registries/*.md before any code. This is a **registry-diff** proof unit.
2. **Firestore rules and indexes** — update firestore.json and rules (if any). Proof unit: manual-script or waiver (can't easily automate without running against live DB).
3. **Backend code** — new/modified routers, services, models. Proof unit: failing-test or smoke-command (curl test against running server).
4. **Frontend code** — new/modified HTML pages, JS logic, styling. Proof unit: ui-check (browser inspection) or failing-test (if component has unit tests).
5. **Wiring & integration** — ensure all producers and consumers are connected. Proof unit: end-to-end smoke-command or manual-script.
6. **Final verification** — manual walk-through of the entry path to confirm the feature works end-to-end. Proof unit: manual-script (numbered steps the user can follow) or waiver (if already covered by earlier proofs).

**Example proof-unit sequence for "Add Family Member" feature:**

```
### Proof Unit 1: Registry — endpoints.md updated with POST /family-members

**Expected behavior:** Endpoint is documented with method, auth, request shape, response shape.
**Preferred proof type:** registry-diff
**Exact command:** git diff docs/registries/endpoints.md after editing
**Expected initial failure:** File does not mention POST /family-members; diff shows 0 additions
**Expected passing evidence:** Diff shows +{POST /family-members {...}} in endpoints.md
**Waiver guidance:** N/A — registry is always automatable

### Proof Unit 2: Backend API — POST /family-members accepts email, sends invitation

**Expected behavior:** Calling POST /family-members with {email: "..."} creates a Firestore doc and sends Brevo email.
**Preferred proof type:** failing-test
**Exact command:** npm test -- src/routes/familyMembers.test.js; grep "2 passing"
**Expected initial failure:** familyMembers.test.js does not exist; npm test fails
**Expected passing evidence:** Test file exists; 2 passing tests: (1) POST /family-members creates Firestore doc, (2) Sends Brevo invitation email
**Waiver guidance:** N/A — test is automatable

### Proof Unit 3: Frontend — modal appears and submits form

**Expected behavior:** Clicking "Add Family Member" opens modal with email input; clicking Save posts to API.
**Preferred proof type:** ui-check (manual) or failing-test (if component test exists)
**Exact command:** Open http://localhost:3000/client.html in browser, click "Add Family Member" button, inspect DevTools Elements tab, verify modal is visible
**Expected initial failure:** Button does not exist or modal does not appear
**Expected passing evidence:** Modal visible with #add-family-modal id; input field with name="email"; console shows no errors
**Waiver guidance:** If no component test exists, provide manual checklist: (1) click button, (2) modal appears, (3) type email, (4) click Save, (5) check Network tab for POST request, (6) close modal

### Proof Unit 4: End-to-end — feature works top-to-bottom

**Expected behavior:** Practitioner logs in, navigates to client.html, adds family member via modal, invitation email arrives, family member confirms invitation.
**Preferred proof type:** manual-script
**Exact command:** [Numbered steps: 1. Log in with test account. 2. Open client.html. 3. Click Add Family Member. 4. Enter test@example.com. 5. Click Save. 6. Check inbox — Brevo email arrives. 7. Click link in email. 8. Confirm account creation.]
**Expected initial failure:** Modal does not appear or POST fails
**Expected passing evidence:** All steps complete; new family member appears in client.html Family Members list
**Waiver guidance:** If Brevo is not configured on stage, waiver: "Brevo not on stage; manual proof substitutes: POST logs email to console. Verified in Network tab."
```

Each unit is **specific enough that a build session can execute without ambiguity** and that /finish-build can later verify whether the proof was satisfied.

## Step 7 — Check dependencies

List the task's dependencies. They come in two flavours — both block readiness, both belong in the same `dependencies` array, but you should label which is which in the plan body so a reviewer can tell them apart:

- **Build deps**: this task's code references that task's code. Example: a Firestore→Supabase sync task needs the schema task done because it imports the table definitions.
- **Test deps**: this task's smoke test requires that task's feature to work, even though the code itself doesn't import anything from it. Example: a "Manage Family Members" UI on `client.html` needs a "dashboard→client navigation works" task done before the UI can be reached at all to verify.

Any test deps captured in Step 3b should be reflected here. Confirm they appear in the `dependencies` array.

For each dep, look it up in the backlog and report its status. Statuses that count as "satisfied":
- `production` — fully shipped, safe to depend on.
- `review-passed` / `pr-reviewed` — code has review evidence but is not production yet. Acceptable for **build** deps only if both tasks will ship together; risky for **test** deps.
- Anything else (`backlog`, `planned`, `build-started`, `build-finished`, `review-blocked`) — **flag clearly**. The build session can technically still proceed, but the task can't be promoted to prod until the dep clears.

## Step 8 — Save the plan with proof units

**Sanity check before commit:** verify you are inside the disposable backlog worktree created from `origin/main`, not the shared primary worktree.

**Write to `docs/backlog.json` using `node -e` inside the disposable backlog worktree** — never use the Edit tool on JSON files (Windows encoding rule). The four fields to set are documented below. After reviewing them, construct and run the `node -e` command shown at the end of this step.

Fields to add to the task object:

### 1. `plan` field (the full plan narrative)
```
"plan": "## Root cause\n\n{narrative plan text — registry changes, dependencies, testability notes, etc.}\n\n## First Proof Unit\n\n{entry point, behavior, verification method}"
```

### 2. `proofUnits` field (structured array for build verification)

```json
"proofUnits": [
  {
    "number": 1,
    "title": "Registry — endpoints.md updated with POST /family-members",
    "expectedBehavior": "Endpoint is documented with method, auth, request shape, response shape.",
    "proofType": "registry-diff",
    "exactCommand": "git diff docs/registries/endpoints.md",
    "expectedInitialFailure": "File does not mention POST /family-members",
    "expectedPassingEvidence": "Diff shows new endpoint entry",
    "waiverGuidance": "N/A"
  },
  {
    "number": 2,
    "title": "Backend API — POST /family-members endpoint implementation",
    "expectedBehavior": "Calling POST /family-members with {email: ...} creates Firestore doc and sends email.",
    "proofType": "failing-test",
    "exactCommand": "npm test -- src/routes/familyMembers.test.js",
    "expectedInitialFailure": "Test file does not exist or tests fail",
    "expectedPassingEvidence": "2 passing tests: create doc, send invitation email",
    "waiverGuidance": "N/A"
  },
  {
    "number": 3,
    "title": "Frontend — Add Family Member modal and form",
    "expectedBehavior": "Clicking button opens modal, typing email and clicking Save posts to API.",
    "proofType": "ui-check",
    "exactCommand": "Open client.html in browser, click 'Add Family Member', inspect modal in DevTools",
    "expectedInitialFailure": "Button or modal does not exist",
    "expectedPassingEvidence": "Modal visible with email input, no console errors",
    "waiverGuidance": "If no component test: provide manual checklist in PR with screenshots"
  },
  {
    "number": 4,
    "title": "End-to-end — full feature smoke test",
    "expectedBehavior": "User flow from login → navigate → add family member → confirm invitation works top-to-bottom.",
    "proofType": "manual-script",
    "exactCommand": "[List numbered steps: 1. Log in. 2. Open client.html. 3. Click Add Family Member. 4. Enter email. 5. Verify email arrives. 6. Confirm family member appears in list.]",
    "expectedInitialFailure": "Modal does not appear or API call fails",
    "expectedPassingEvidence": "All steps complete without errors",
    "waiverGuidance": "If Brevo is not on stage, waiver: 'Brevo not configured; POST logs to console instead. Verified in Network tab and server logs.'"
  }
]
```

Each proof unit object has these required fields:
- `number`: Sequential integer (1, 2, 3, ...).
- `title`: Short description of what this unit verifies.
- `expectedBehavior`: One sentence describing the observable outcome.
- `proofType`: One of the types from the table in Step 6.
- `exactCommand`: The specific command or numbered steps to verify.
- `expectedInitialFailure`: What error or missing behavior is expected before implementation.
- `expectedPassingEvidence`: What success looks like.
- `waiverGuidance`: If automated proof is not possible, what alternative evidence or approval replaces it.

### 3. `objective` field (durable goal contract)

```json
"objective": {
  "statement": "{single outcome statement}",
  "successCriteria": [
    "{criterion 1}",
    "{criterion 2}"
  ],
  "nonGoals": [
    "{explicitly out of scope}"
  ],
  "proofMap": [
    {
      "criterion": "{criterion 1}",
      "proofUnit": 1,
      "evidence": "{passing evidence or waiver path from proof unit 1}"
    }
  ],
  "currentStep": "planned",
  "stopConditions": [
    "{condition that should stop the workflow}"
  ],
  "handoffNotes": [
    "Created by /plan-task at {ISO 8601 UTC timestamp}."
  ]
}
```

Every `successCriteria[]` item must appear in `proofMap[]`. If any criterion cannot be mapped to proof, either rewrite the criterion until it is observable or add a waiver path in the related proof unit.

### 4. `status` field
```json
"status": "planned"
```

**Write with `node -e` (substitute actual values for each `{placeholder}`):**

```bash
node -e "
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('docs/backlog.json', 'utf8'));
const t = b.tasks.find(t => t.number === {N});
if (!t) throw new Error('Task #{N} not found');
t.plan = {JSON.stringify(planString)};
t.proofUnits = {JSON.stringify(proofUnitsArray)};
t.objective = {JSON.stringify(objectiveObject)};
t.impact = '{minor|standard|major}';
t.status = 'planned';
fs.writeFileSync('docs/backlog.json', JSON.stringify(b, null, 2) + '\n', 'utf8');
console.log('Task #{N} plan content saved');
"

> **Note:** This write sets `status: "planned"` in the same backlog commit as the plan content so `/start-build` sees a consistent task state.
```

If the plan content is too large to inline safely, write the fields to a patch file first (using the Write tool), then merge:

```bash
# Write docs/_plan_patch.json with: { "number": N, "plan": "...", "proofUnits": [...], "objective": {...}, "impact": "..." }
node -e "
const fs = require('fs');
const patch = JSON.parse(fs.readFileSync('docs/_plan_patch.json', 'utf8'));
const b = JSON.parse(fs.readFileSync('docs/backlog.json', 'utf8'));
const t = b.tasks.find(t => t.number === patch.number);
if (!t) throw new Error('Task #' + patch.number + ' not found');
Object.assign(t, { plan: patch.plan, proofUnits: patch.proofUnits, objective: patch.objective, impact: patch.impact, status: 'planned' });
fs.writeFileSync('docs/backlog.json', JSON.stringify(b, null, 2) + '\n', 'utf8');
try { fs.unlinkSync('docs/_plan_patch.json'); } catch(e) {}
console.log('Task #' + patch.number + ' plan saved → status planned');
"
```

**Commit and push through the disposable backlog worktree:**

```bash
git add docs/backlog.json
git commit -m "chore(backlog): plan task #{number} — {title}"
git pull --rebase origin main
git push origin HEAD:main
# then remove the disposable backlog worktree and run git worktree prune from the source repo
```

The saved proof units enable /start-build to load them and confirm the first unit's entry evidence exists, /finish-build to verify each proof unit has been satisfied, and /review-pr to check that the proof trail is documented in the PR.

## Step 9 — Log to Obsidian Tasks tracker

After the plan is pushed to `origin/main` through the disposable backlog worktree, also write it to the project's Obsidian task tracker.

1. **Reuse the Obsidian project name** captured in Step 1.
2. **Compute the task file path:** `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md` where `{slug}` is the task title lowercased, non-alphanumeric → hyphens, collapsed, max 40 chars.
3. **Ensure the file exists with a header.** Try `mcp__mcp-obsidian__obsidian_get_file_contents` on the path. If it returns 404, create the file by appending the initial header block via `mcp__mcp-obsidian__obsidian_append_content`:

   ```
   # Task #{N} — {title}

   **Category:** {category}   **Priority:** {priority}   **Dependencies:** {deps list or "none"}
   **Branch:** (none yet)   **PR:** (none yet)   **Status (initial):** {pre-plan status, usually "backlog"}

   ## Description

   {description}
   ```

4. **Append the Plan section** via `mcp__mcp-obsidian__obsidian_append_content`:

   ```
   ---

   ## Plan — {ISO 8601 UTC timestamp} (by /plan-task)

   {full plan text, as written to backlog.json}

   **Dependencies checked:** {list with each dep's status, e.g., "#7: production; #8: planned"}

   **Status flip:** backlog → planned
   ```

5. **Append the Proof Units section** via `mcp__mcp-obsidian__obsidian_append_content`:

   ```
   ---

   ## Proof Units

   ### Unit 1: {title}
   - **Expected behavior:** {behavior}
   - **Proof type:** {proofType}
   - **Verification:** {exactCommand}
   - **Initial failure:** {expectedInitialFailure}
   - **Passing evidence:** {expectedPassingEvidence}
   - **Waiver guidance:** {waiverGuidance}

   ### Unit 2: {title}
   [... repeat for each proof unit ...]

   **First unit entry evidence:** {status — exists on stage / blocked by prerequisite / already passing}
   ```

   Each unit entry gives /start-build and /finish-build a quick reference to know what proof is required and what counts as success.

6. Report to the user: "Plan logged to Obsidian at `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`."

## Step 10 — Report

Output the full plan and proof units. Confirm:
- ✅ Plan text saved to `docs/backlog.json` 
- ✅ `proofUnits` array saved to `docs/backlog.json`
- ✅ `objective` criteria saved to `docs/backlog.json`
- ✅ Both committed and pushed to main
- ✅ Proof units logged to Obsidian at `{ProjectObsidian}_Build/Tasks/...`
- ⏳ Status `planned` — set by the orchestrator, not this skill

Ask if any adjustments are needed to the proof units or dependencies before a build session picks it up.

Tell the user: "Next step is `/start-build {N}` — it creates the task branch. `/cross-boundary-audit` runs immediately after, on the task branch, before coding begins."


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /plan-task complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
