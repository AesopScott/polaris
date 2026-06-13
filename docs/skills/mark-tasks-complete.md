---
name: mark-tasks-complete
description: After a stage→main promotion PR has merged AND production deploy is healthy, mark every rolled-up task as `status: "complete"` in `docs/backlog.json` through the isolated backlog write protocol. Takes the merged promotion PR number. Opens a follow-up PR because main is branch-protected. Run once per promotion, after smoke-testing prod.
---

# /mark-tasks-complete {pr-number}

## Backlog Read/Write Isolation Protocol (Task #60)

Do not check out `main` in the shared primary working tree just to read or mutate backlog state.

- For read-only task lookup, run `git fetch origin main` and read `docs/backlog.json` from `origin/main` with `git show origin/main:docs/backlog.json`, or use a disposable worktree from `origin/main`.
- Any step that mutates `docs/backlog.json` or `docs/backlog-archive.json` must create a disposable backlog worktree from fresh `origin/main`, write JSON with Node `fs` using explicit `utf8`, commit only the touched backlog files, `git pull --rebase origin main`, then `git push origin HEAD:main`.
- If push is rejected, fetch/rebase/reapply the exact task-number mutation and retry. Never force-push `main`.
- Remove the disposable worktree after the push succeeds and report the backlog commit SHA.


You are closing the loop after a stage→main rollup PR has merged and prod looks healthy. The promotion PR doesn't update `docs/backlog.json` itself — this skill does, through the isolated backlog write protocol.

**Canonical post-merge-to-main status is `complete`** (not `done`). The full lifecycle is:

```
backlog → ready → in-review → complete
```

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

## Step 0 — Argument check

The user invoked `/mark-tasks-complete {pr-number}`. If `{pr-number}` is missing or non-numeric, stop and ask which promotion PR to process.

## Step 1 — Verify the PR is a merged stage→main rollup

```bash
gh pr view {pr-number} --json number,title,state,baseRefName,headRefName,mergedAt,body
```

Hard-fail and stop if any of:
- `state != "MERGED"` — promotion hasn't merged yet; nothing to mark complete
- `baseRefName != "main"` — this isn't a promotion to main
- `headRefName != "stage"` — this isn't a stage→main rollup (could be a hotfix)

If the title doesn't start with `Promote:`, soft-warn the user and ask whether to proceed anyway.

## Step 2 — Extract task numbers from the rollup

Parse task numbers from the PR title AND body. Two patterns to look for:

- Title: `Promote: task #5 (...) + ... → main` OR `Promote: tasks #3, #5, #7 → main` — capture every `#\d+` in the title.
- Body: the `## Tasks included` section produced by `/promote-stage` lists each rolled-up task. Capture every `#\d+` there too.

Union the two sets. Hold the resulting list of task numbers `[N1, N2, ...]` in context.

If the list is empty, stop and tell the user: "Couldn't find any task numbers in PR #{pr-number}. Pass the numbers explicitly if you want me to proceed."

## Step 3 — Sync main and create a follow-up branch

```bash
git fetch origin main --prune
git switch -c chore/mark-tasks-complete-{pr-number} origin/main
```

If the branch already exists locally, fail with: "Branch already exists — delete it or pick a different name."

## Step 4 — Update `docs/backlog.json`

Read `docs/backlog.json`. For each task number in the list:

- Locate the task object by `number`.
- If `status` is already `complete`, skip it (note in the report).
- If `status` is anything other than `in-review`, soft-warn ("task #N was {status}, not in-review — promoting to complete anyway") but proceed.
- Otherwise set `status` to `complete`. Leave every other field untouched (do NOT touch `plan`, `branch`, `pr_url`, etc).

Hold the list of statuses-actually-changed and skips for the report.

## Step 5 — Commit and push

If at least one task was changed:

```bash
git add docs/backlog.json
git commit -m "chore(backlog): mark tasks #{N1}, #{N2} complete (promoted via #{pr-number})"
git push -u origin HEAD
```

Commit subject lists every task whose status was actually flipped. Body (optional, only if multiple tasks): one line per task with its title.

If zero tasks changed, abort with: "All listed tasks were already complete. Nothing to commit."

## Step 6 — Open the follow-up PR

```bash
gh pr create --base main --head chore/mark-tasks-complete-{pr-number} \
  --title "chore(backlog): mark tasks #{N1}, #{N2} complete" \
  --body "..."
```

PR body template:

```
## Summary

Closes the backlog loop after [#{pr-number}]({pr-url}) (stage→main promotion) merged and prod was confirmed healthy.

## Tasks marked complete

- #{N1} — {title}
- #{N2} — {title}
- ...

## Skipped (already complete)

- #{Nx} — {title}  *(if any; omit section if empty)*

## Test plan

- [ ] `docs/backlog.json` parses (valid JSON)
- [ ] Each listed task shows `status: "complete"` on main after merge
```

Capture the PR URL.

## Step 6.5 — Delete merged task branches and worktrees

The promotion PR (#{pr-number}) merged every rolled-up task into `main`, so each task's `task/N-*` branch and the per-session worktree holding it are done. Delete them now — this is what stops promoted worktrees from accumulating forever in `%TEMP%\polaris-wt` (the server's TTL purge skips named-branch worktrees by design, so without this step nothing ever reclaims them).

For each task `#{N}` in the list:

1. Read the task's `branch` from `docs/backlog.json` → `{branch}`. If the task has no `branch` field, or neither a local nor remote ref for it exists, skip it — likely already cleaned by `/promote-to-prod` Step 9.5.
2. Remove **every** worktree checked out on that branch, then prune. Order matters — `git branch -d` fails while a worktree still holds the branch, which is the usual reason these pile up:

   ```powershell
   node -e "const cp=require('child_process');const b=process.argv[1];const raw=cp.execSync('git worktree list --porcelain',{encoding:'utf8'});for(const blk of raw.split('\n\n')){const p=(blk.match(/^worktree (.+)$/m)||[])[1];const br=(blk.match(/^branch refs\/heads\/(.+)$/m)||[])[1];if(br===b&&p){try{cp.execFileSync('git',['worktree','remove','--force',p],{stdio:'ignore'});console.log('removed worktree '+p);}catch(e){console.log('WARN '+p+': '+e.message);}}}cp.execSync('git worktree prune');" "{branch}"
   ```

3. Delete the remote branch (merged, so safe): `git push origin --delete {branch}`.
4. Delete the local branch: `git branch -d {branch}` (merged into main; if `-d` refuses, log a warning and leave it for manual review rather than forcing).

Any individual failure is a soft-warn — log it and continue with the next task. Record a one-line cleanup summary (`{count} branches + {count} worktrees removed`) for Step 8.

## Step 7 — Log Complete to Obsidian (one section per task)

For every task whose status was flipped to `complete` in Step 4 (skip already-complete ones — they already have their capstone), append a Complete section to the task's Obsidian tracker.

1. Resolve `{ProjectObsidian}` via CWD basename fuzzy-match against `*_Build/` folders using the **OBSIDIAN ACCESS PROTOCOL**. If no match, skip Obsidian logging.

2. For each flipped task `#{N}`:
   a. Look up the task in `docs/backlog.json` for title and branch (extract slug from branch).
   b. Task file path: `{ProjectObsidian}_Build/Tasks/Task-{N}-{slug}.md`.
   c. **Ensure file exists with header** (defensive) using the **OBSIDIAN ACCESS PROTOCOL**. If it doesn't exist, append the standard initial header first.
   d. **Append the Complete section** using the **OBSIDIAN ACCESS PROTOCOL**:

      ```
      ---

      ## Complete — {ISO 8601 UTC timestamp} (by /mark-tasks-complete)

      **Promotion PR:** {pr-url} — MERGED at {mergedAt from Step 1}
      **Prod deploy:** confirmed healthy by user (manual smoke-test, not verified by this skill)
      **Follow-up backlog PR:** {followup-pr-url from Step 6}

      **Status flip:** in-review → complete
      ```

3. Tell the user: "Complete logged to {count} task tracker(s) in `{ProjectObsidian}_Build/Tasks/`."

## Step 8 — Report

Tell the user:
- Promotion PR processed: `#{pr-number}` ({title})
- Tasks marked complete: `{N1}, N2, ...`
- Tasks skipped (already complete): `{list, or "none"}`
- Cleanup: `{count}` merged task branches + `{count}` worktrees removed (Step 6.5)
- Follow-up PR URL: `{url}`
- Next step: review and merge the follow-up PR. After that, `/start-build` and the rest of the workflow will see these tasks as `complete`.

## Notes

- This skill does not retro-mark tasks that were promoted before it existed — pass each historical promotion PR number explicitly if you want to backfill.
- The follow-up PR is intentionally separate from the promotion PR so the prod deploy isn't blocked by a backlog edit, and so the audit trail stays clean (one PR = one purpose).
- If branch protection on main ever allows direct push for `chore(backlog)` paths, this skill can short-circuit Step 6 and push straight to main.


## Completion banner (mandatory — always the last thing you output)

End your final message with this banner so the user can see at a glance which skill just ran and how it ended, without scrolling up:

---
### 🏁 /mark-tasks-complete complete
- **Result:** <✅ success | ⚠️ needs fix | ❌ blocked/failed>
- **What happened:** <one line — the concrete outcome>
- **Task status:** <current docs/backlog.json status, or n/a>
- **Next:** <next skill to run, or the action you asked the user for>
---

Nothing comes after this banner.
