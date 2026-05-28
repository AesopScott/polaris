---
name: copy-meetup-events
description: Copy active Advanced AI Concepts Meetup events from one city group to another through the approved Meetup API automation. Use when Scott invokes /copy-meetup-events, asks to copy/sync/replicate Meetup events, or wants Colorado Springs events copied to another Advanced AI Concepts city group without duplicates.
---

# Copy Meetup Events

## Overview

Copy active events from the source Meetup group `advanced-ai-concepts` to every existing Advanced AI Concepts Pro network group by default. The script checks for existing events by title and start time before creating anything, so running it twice should not create duplicates.

## Workflow

1. Run the bundled script from the Polaris repo:

```powershell
node .codex\skills\copy-meetup-events\scripts\copy_meetup_events.mjs
```

2. To copy to one specific group only, pass a target:

```powershell
node .codex\skills\copy-meetup-events\scripts\copy_meetup_events.mjs --target advanced-ai-concepts-dallas
```

3. Report created events, skipped events, and errors per group.

## Behavior

- Default source group: `advanced-ai-concepts`.
- Default target set is every existing group in the Advanced AI Concepts Pro network except the source group.
- Target groups must already exist.
- Duplicate guard: skip target events that already match title plus start time.
- Uses `C:\Users\scott\Code\Mojo\.env` for `MEETUP_ADMIN_KEY`.
- Uses the private Mojo endpoint `https://mojoaistudio.com/api/meetup-admin`.
- Copies title, description, duration, online venue, and published status.
- Dallas event times are adjusted to Central time so the copied events remain at 6:00 PM local time.
- Copies event featured photos after the events exist by uploading new photos to the target events.

## Guardrails

- Do not print tokens, admin keys, `.env` contents, access tokens, or refresh tokens.
- Default behavior is all existing Pro-network groups; use `--target` only when Scott asks for one group.
- Always mention skipped events so Scott knows duplicate protection ran.
- If errors occur, stop and summarize them before retrying.
