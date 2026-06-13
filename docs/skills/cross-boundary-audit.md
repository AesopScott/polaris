---
name: cross-boundary-audit
description: Audit and fix boundary contracts during the build. Verifies all new identifiers are registered in docs/registries, confirms proof units have RED→GREEN evidence, and fixes gaps before the PR opens. Sets status to cba-complete when complete.
---

# /cross-boundary-audit [task-number]

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


You are auditing the boundary contracts and proof units for the current task before the PR is pushed. This skill runs after developer coding but before `/finish-build`.

## Scope and Limits

- **One task only.** Audits exactly the task that is currently `build-started`.
- **Before PR opens.** Must complete before `/finish-build` is invoked. Any registry or proof unit fixes happen here.
- **Cannot invoke other skills.** This phase does not call `/plan-task`, `/start-build`, `/finish-build`, or any other skill. It is a standalone audit.
- **Sets status to `cba-complete`.** On success, updates `docs/backlog.json` to mark the task as ready for `/finish-build`.

## Objective

Validate that the build satisfies all boundary contracts defined in the task plan:

1. **All new identifiers are registered** — every function, constant, schema, endpoint, config key, and env var introduced by the branch is listed in the appropriate registry file
2. **Line references are correct** — each registry entry points to the actual line where the identifier is defined
3. **Proof units have evidence** — each proof unit shows RED → implementation → GREEN (failing test → code → passing test)
4. **No proof gaps** — cross-check each proof unit against the code to confirm the evidence chain is unbroken

On failure: fix the gaps (update registries, add missing tests, commit fixes, re-audit). Do NOT proceed to `/finish-build` until all gaps are closed.

---

## AUDIT WORKFLOW

### Step 1: Load task plan and registries

1. Read `docs/backlog.json` — extract task #{N}
2. Verify task has `proofUnits[]` array (if empty, ask Scott: "No proof units defined — run `/plan-task {N}` first")
3. Read all registry files from `docs/registries/`:
   - `backlog-task-fields.md`
   - `http-endpoints.md`
   - `websocket-messages.md`
   - `zod-contracts.md`
   - `env-vars.md`
   - `collections.md`
   - `session-statuses.md`
   - `agent-state-schema.md`
   - `python-modules.md`
   - Any project-specific registries

### Step 2: Detect new identifiers on the branch

For each identifier type, scan the branch for new additions:

**HTTP Endpoints:**
```bash
git diff main..HEAD -- src/routes.js src/handlers.js | grep -E "^\\+.*app\\.(get|post|put|delete|patch)"
```

**WebSocket events:**
```bash
git diff main..HEAD -- src/ws.js | grep -E "^\\+.*socket\\.(on|emit)"
```

**Zod schemas:**
```bash
git diff main..HEAD -- src/schemas.js | grep -E "^\\+.*z\\."
```

**Environment variables:**
```bash
git diff main..HEAD -- src | grep -E "process\\.env\\.[A-Z_]+"
```

**Config keys:**
```bash
git diff main..HEAD -- config.js | grep -E "^\\+.*config\\."
```

Run `git grep` for each pattern across the branch and collect line numbers.

### Step 3: Cross-check against registries

For each new identifier detected in Step 2:

1. Check if it's already in the appropriate registry file
2. If missing: **ADD IT** with:
   - Name/pattern
   - File path (e.g., `src/routes.js`)
   - Line number where it's defined
   - Brief description
   - Author/date (use commit date from `git log`)
3. If present but line number is wrong: **FIX THE LINE NUMBER**
4. If present but description is outdated: **UPDATE THE DESCRIPTION**

Example registry update (http-endpoints.md):

```markdown
| Endpoint | Method | File | Line | Description | Since |
|---|---|---|---|---|---|
| `/api/tasks/{id}` | GET | src/routes.js | 42 | Fetch task by ID | 1.0.612 |
| `/api/tasks/{id}/comments` | **POST** | **src/routes.js** | **156** | **Create comment on task** | **1.0.631** |
```

### Step 4: Verify proof units

For each item in the task's `proofUnits[]` array:

1. Read the proof unit definition:
   ```json
   {
     "id": "unit-1",
     "criterion": "Users can create tasks",
     "testFile": "tests/tasks.test.js",
     "failingTest": "should reject duplicate task names",
     "implementation": "src/tasks.js:addTask()",
     "passingTest": "should accept unique task names"
   }
   ```

2. Run the failing test to confirm it fails:
   ```bash
   npm test -- tests/tasks.test.js -t "should reject duplicate task names"
   ```
   Verify exit code ≠ 0 (test fails)

3. Run the implementation code path (don't run test yet):
   ```bash
   git show HEAD:src/tasks.js | grep -A 20 "function addTask"
   ```
   Verify the implementation is present and non-empty

4. Run the passing test to confirm it passes:
   ```bash
   npm test -- tests/tasks.test.js -t "should accept unique task names"
   ```
   Verify exit code == 0 (test passes)

5. **If any test fails or is missing:** 
   - Add/fix the test
   - Commit with message: `test: add proof for [criterion]`
   - Re-run this step

### Step 5: Commit registry updates (if any)

If Step 3 made changes to any registry files:

```bash
git status -- docs/registries/
git add docs/registries/*.md
git commit -m "docs: update registries for task #{N}"
```

### Step 6: Report status

If all gaps are closed:
- Use the Backlog Write Isolation Protocol to set task status to `cba-complete` in `docs/backlog.json`
- Print: "✅ Audit complete. All registries are clean and proof units have evidence. Ready for `/finish-build`."

If gaps remain:
- List the gaps with line numbers
- Print: "❌ Audit incomplete. Fix these gaps and re-run `/cross-boundary-audit {N}`:"
- Halt (do NOT set status to `cba-complete`)

---

## FAILURE MODES

**Missing registry entries** → Add them with correct line numbers

**Wrong line numbers** → Fix line numbers to match actual code

**Proof unit tests missing** → Add tests that follow RED → GREEN pattern

**Proof unit tests fail** → Fix implementation to make tests pass

**Registry corruption (mojibake, encoding errors)** → Re-save as UTF-8 via `node -e`

---

## AFTER AUDIT

On success, the task is ready for `/finish-build`:
```bash
/finish-build {task-number}
```

On failure, fix gaps and re-run:
```bash
/cross-boundary-audit {task-number}
```

Do NOT skip this phase. Every task must pass boundary audit before the PR opens.
