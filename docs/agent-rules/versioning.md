# Versioning, Commits, And Changelog Rules

## Before Editing
1. Read `%APPDATA%\.claude\polaris\locks.json`.
2. Read `%APPDATA%\.claude\polaris\file-versions.json` when file-version tracking is relevant.
3. State the current tracked version for each file you plan to edit when a tracked version exists.
4. If a file is locked, get Scott's explicit approval before editing it.

## File-Version Mechanics
Polaris tooling may update `file-versions.json` automatically when edits go through Polaris-native write paths.

When editing outside Polaris-native write paths:
- Report the current tracked file version before editing.
- Report the expected next file version after editing.
- Do not hand-edit `file-versions.json` unless Scott explicitly asks for that registry update.
- If the file is not present in `file-versions.json`, say that no tracked version was found.

## Package Version Bumps
Bump `package.json` at delivery time for source, config, runtime behavior, build, UI, or shipped asset changes.

Do not bump `package.json` for notes/documentation-only changes.

When `package.json` is bumped, make the bump in the same edit set as the shipped change. Do not bump retroactively, at the end of a later session, or only when a build runs.

## Changelog
After every `package.json` version bump, prepend a row to the Build Index table at:

`G:\My Drive\Aesop Academy\Obsidian\Polaris_Build\4-Changelog.md`

Newest build goes at the top of the table.

Format:

`| <version> | <YYYY-MM-DD> | **<type>:** <multi-sentence description with markdown> |`

Rules:
- `<type>` is one of `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, or `ci`.
- Description is 2-6 sentences explaining what landed and why.
- Use backticks around filenames, function names, identifiers, and code-level references.
- Single-sentence headlines are too thin for changelog rows.

## Commits
After any repo file edit or write, immediately commit with a conventional message.

Allowed prefixes: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `ci`.

Never leave repo changes uncommitted.

Runtime data and Obsidian knowledge writes outside a git repo are saved on disk but not committed. Do not stage unrelated user changes.
