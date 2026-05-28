# Polaris Skills

## copy-meetup-group

- Path: `.codex/skills/copy-meetup-group`
- Purpose: Copy the Advanced AI Concepts Meetup group into a requested city, including the main group photo.
- Trigger: `/copy-meetup-group`, or requests to copy, replicate, clone, or create an Advanced AI Concepts city group.
- Notes: Uses the private Mojo Meetup admin endpoint and `C:\Users\scott\Code\Mojo\.env` for `MEETUP_ADMIN_KEY`.

## copy-meetup-events

- Path: `.codex/skills/copy-meetup-events`
- Purpose: Copy active Advanced AI Concepts events to all existing Pro-network groups without duplicates, including featured photos.
- Trigger: `/copy-meetup-events`, or requests to copy, sync, replicate, or create Meetup events in another Advanced AI Concepts group.
- Notes: Discovers existing Pro-network groups automatically. Uses the private Mojo Meetup admin endpoint and `C:\Users\scott\Code\Mojo\.env`.
