---
name: copy-meetup-group
description: Copy the Advanced AI Concepts Meetup group into another city through the approved Meetup API automation. Use when Scott invokes /copy-meetup-group, asks to copy/replicate/clone the Meetup group into a city, or asks to create a new Advanced AI Concepts city group with the same description and topics as the source group.
---

# Copy Meetup Group

## Overview

Copy the source Meetup group `advanced-ai-concepts` into one target city using the private Mojo Meetup admin endpoint. The workflow creates the group draft, publishes it, explicitly attaches it to the Advanced AI Concepts Pro network, and reports the resulting group URL.

## Workflow

1. If the user did not provide a city, ask exactly one short question: "What city should I copy Advanced AI Concepts into?"
2. Run the bundled script from the Polaris repo:

```powershell
node .codex\skills\copy-meetup-group\scripts\copy_meetup_group.mjs --city "Dallas"
```

3. For unknown cities, pass state and ZIP:

```powershell
node .codex\skills\copy-meetup-group\scripts\copy_meetup_group.mjs --city "Example City" --state "TX" --zip "75001"
```

4. Report the group link, whether it was newly created or already existed, and any errors.

## Behavior

- Source group: `advanced-ai-concepts`
- Target name default: `Advanced AI Concepts-<City>`
- Target URL default: `advanced-ai-concepts-<city-slug>`
- Uses `C:\Users\scott\Code\Mojo\.env` for `MEETUP_ADMIN_KEY`.
- Uses the private Mojo endpoint `https://mojoaistudio.com/api/meetup-admin`.
- Copies description, member label, and active topics.
- Publishes the group and attaches it to the Advanced AI Concepts Pro network through the API.
- Copies the main group photo by uploading a new photo to the target group after creation.

## Guardrails

- Create one city at a time unless Scott explicitly asks for a batch.
- Do not print tokens, admin keys, `.env` contents, access tokens, or refresh tokens.
- If the script reports an error, stop and summarize the error before trying another city.
- Verify visibility through the Pro network before claiming success when possible.
