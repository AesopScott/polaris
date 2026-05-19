# Proof-Unit Planning Verification — Task #11

## Verification Test Case: Task #18 (dummy) — "Add activity logging"

This document demonstrates that /plan-task produces properly structured proof units for `/start-build` and `/finish-build` to verify.

### Backlog Entry (docs/backlog.json)

```json
{
  "number": 18,
  "title": "Add activity logging to session model",
  "category": "feature",
  "priority": 40,
  "status": "ready",
  "dependencies": [],
  "plan": "## Overview\n\nAdd activity_log field to Session model in Firestore and capture user actions (create, update, delete) with timestamps. This enables audit trails for compliance.\n\n## Changes Required\n\n### Registry: collections.md\nAdd activity_log array to Session collection schema.\n\n### Firestore Rules\nNo new rules — existing session rules already permit field additions.\n\n### Backend: Activity Logging Service\nNew service logs user actions with timestamps.\n\n### Wiring\nEnsure all session-modifying endpoints call the logging service.\n\n## First Proof Unit\n\nWhen a user creates a session in the UI, a timestamp entry appears in the activity_log array in Firestore. Verified via DevTools Network tab and Firestore console inspection.",
  "proofUnits": [
    {
      "number": 1,
      "title": "Registry — collections.md updated with activity_log field",
      "expectedBehavior": "Session collection schema documents the activity_log array field with type, structure, and access rules.",
      "proofType": "registry-diff",
      "exactCommand": "git diff docs/registries/collections.md | grep -A 5 activity_log",
      "expectedInitialFailure": "No mention of activity_log in collections.md",
      "expectedPassingEvidence": "Diff shows +activity_log: array of {timestamp, action, userId}",
      "waiverGuidance": "N/A — registry diffs are always automatable"
    },
    {
      "number": 2,
      "title": "Backend — Activity logging service records user actions",
      "expectedBehavior": "New ActivityLog service accepts action type, user ID, and timestamp, writes to Firestore activity_log array.",
      "proofType": "failing-test",
      "exactCommand": "npm test -- src/services/activityLog.test.js",
      "expectedInitialFailure": "activityLog.test.js does not exist; import fails",
      "expectedPassingEvidence": "2 passing tests: (1) logAction writes to Firestore, (2) Fields include timestamp, action, userId",
      "waiverGuidance": "N/A — unit tests are automatable"
    },
    {
      "number": 3,
      "title": "Backend — Session create endpoint logs activity",
      "expectedBehavior": "POST /sessions calls logAction before returning success response.",
      "proofType": "smoke-command",
      "exactCommand": "curl -X POST http://localhost:3000/api/sessions -d '{...}' && grep -A 3 'activityLog' ~/.config/app/test-session.json",
      "expectedInitialFailure": "POST succeeds but no activity_log entry in Firestore",
      "expectedPassingEvidence": "Firestore doc shows activity_log array with one entry (timestamp, action: 'create', userId)",
      "waiverGuidance": "If test instance lacks Firestore connectivity, use manual check: inspect Firestore console for new activity_log field in Session doc"
    },
    {
      "number": 4,
      "title": "Frontend — Activity log visible in session history UI",
      "expectedBehavior": "Session detail page displays activity_log entries as timestamped action list (Create, Update, Delete).",
      "proofType": "ui-check",
      "exactCommand": "Open localhost:3000/session/{id} in browser, inspect Elements for <div id='activity-log'>, check Network tab for GET /sessions/{id}?include=activity_log",
      "expectedInitialFailure": "Activity log section does not appear on page",
      "expectedPassingEvidence": "Activity log visible with entries like '2026-05-18 14:32:15 — User created session'",
      "waiverGuidance": "If no component test exists, provide manual verification: screenshot of activity log section on session detail page"
    },
    {
      "number": 5,
      "title": "End-to-end — Activity log workflow from UI to Firestore",
      "expectedBehavior": "User creates session via UI → activity_log entry appears in Firestore → activity history displays on session detail page.",
      "proofType": "manual-script",
      "exactCommand": "[Steps: 1. Log in as test user. 2. Click 'New Session'. 3. Fill form and click Create. 4. Open Firestore console and find new Session doc. 5. Expand activity_log array — should have one entry. 6. Return to app and click session detail. 7. Scroll to Activity Log section — verify timestamp and 'create' action appear.]",
      "expectedInitialFailure": "Session creates but activity_log is empty or missing",
      "expectedPassingEvidence": "Activity log shows the creation event; timestamps match session creation time ±1 second",
      "waiverGuidance": "If Firestore console is unavailable, verify via browser DevTools Network tab: GET /sessions/{id} response includes activity_log array"
    }
  ]
}
```

### Obsidian Task Tracker Entry (Polaris_Build/Tasks/Task-18-add-activity-logging.md)

```markdown
# Task #18 — Add activity logging to session model

**Category:** feature   **Priority:** 40   **Dependencies:** none
**Branch:** (none yet)   **PR:** (none yet)   **Status (initial):** backlog

## Description

Add activity_log field to Session model in Firestore and capture user actions (create, update, delete) with timestamps. This enables audit trails for compliance.

---

## Plan — 2026-05-18T16:45:00Z (by /plan-task)

[Full plan narrative as in backlog.json]

**Dependencies checked:** (none)

**Status flip:** backlog → ready

---

## Proof Units

### Unit 1: Registry — collections.md updated with activity_log field
- **Expected behavior:** Session collection schema documents the activity_log array field with type, structure, and access rules.
- **Proof type:** registry-diff
- **Verification:** git diff docs/registries/collections.md | grep -A 5 activity_log
- **Initial failure:** No mention of activity_log in collections.md
- **Passing evidence:** Diff shows +activity_log: array of {timestamp, action, userId}
- **Waiver guidance:** N/A — registry diffs are always automatable

### Unit 2: Backend — Activity logging service records user actions
- **Expected behavior:** New ActivityLog service accepts action type, user ID, and timestamp, writes to Firestore activity_log array.
- **Proof type:** failing-test
- **Verification:** npm test -- src/services/activityLog.test.js
- **Initial failure:** activityLog.test.js does not exist; import fails
- **Passing evidence:** 2 passing tests: (1) logAction writes to Firestore, (2) Fields include timestamp, action, userId
- **Waiver guidance:** N/A — unit tests are automatable

### Unit 3: Backend — Session create endpoint logs activity
- **Expected behavior:** POST /sessions calls logAction before returning success response.
- **Proof type:** smoke-command
- **Verification:** curl -X POST http://localhost:3000/api/sessions -d '{...}' && grep -A 3 'activityLog' ~/.config/app/test-session.json
- **Initial failure:** POST succeeds but no activity_log entry in Firestore
- **Passing evidence:** Firestore doc shows activity_log array with one entry (timestamp, action: 'create', userId)
- **Waiver guidance:** If test instance lacks Firestore connectivity, use manual check: inspect Firestore console for new activity_log field in Session doc

### Unit 4: Frontend — Activity log visible in session history UI
- **Expected behavior:** Session detail page displays activity_log entries as timestamped action list (Create, Update, Delete).
- **Proof type:** ui-check
- **Verification:** Open localhost:3000/session/{id} in browser, inspect Elements for <div id='activity-log'>, check Network tab for GET /sessions/{id}?include=activity_log
- **Initial failure:** Activity log section does not appear on page
- **Passing evidence:** Activity log visible with entries like '2026-05-18 14:32:15 — User created session'
- **Waiver guidance:** If no component test exists, provide manual verification: screenshot of activity log section on session detail page

### Unit 5: End-to-end — Activity log workflow from UI to Firestore
- **Expected behavior:** User creates session via UI → activity_log entry appears in Firestore → activity history displays on session detail page.
- **Proof type:** manual-script
- **Verification:** [Steps: 1. Log in as test user. 2. Click 'New Session'. 3. Fill form and click Create. 4. Open Firestore console and find new Session doc. 5. Expand activity_log array — should have one entry. 6. Return to app and click session detail. 7. Scroll to Activity Log section — verify timestamp and 'create' action appear.]
- **Initial failure:** Session creates but activity_log is empty or missing
- **Passing evidence:** Activity log shows the creation event; timestamps match session creation time ±1 second
- **Waiver guidance:** If Firestore console is unavailable, verify via browser DevTools Network tab: GET /sessions/{id} response includes activity_log array

**First unit entry evidence:** Exists on stage — registry diffs are always testable
```

## Verification Checklist ✅

- ✅ **Proof units are structured** — Each unit has all required fields (number, title, expectedBehavior, proofType, exactCommand, expectedInitialFailure, expectedPassingEvidence, waiverGuidance)
- ✅ **Entry evidence is identified** — First proof unit can be verified with a registry diff (automatable)
- ✅ **Variety of proof types** — Mix of registry-diff, failing-test, smoke-command, ui-check, manual-script
- ✅ **Waivers are realistic** — Unit 3 provides fallback if Firestore unavailable; Unit 4 provides screenshot alternative if no test exists
- ✅ **Obsidian logging is complete** — All proof units logged to task tracker for /start-build and /finish-build visibility
- ✅ **Commands are specific** — Each proof unit has exact command or numbered steps, not vague instructions
- ✅ **Entry → exit expectations are clear** — Each unit defines both failure (RED) and passing (GREEN) states

## How /start-build will use this

1. Load proofUnits array from docs/backlog.json
2. Name the first unit: "Registry — collections.md updated with activity_log field"
3. Block code writing until the user either:
   - Runs `git diff docs/registries/collections.md` and confirms the field is documented, OR
   - Records an explicit waiver ("entry assumption: registry already updated in prior session")

## How /finish-build will use this

1. Load each proof unit from backlog.json
2. For each unit, check the PR diff for evidence:
   - Unit 1: Verify collections.md contains activity_log entry
   - Unit 2: Verify test file exists with passing tests
   - Unit 3: Verify POST endpoint calls logAction
   - Unit 4: Verify UI renders activity_log section
   - Unit 5: Verify end-to-end flow has no failing steps
3. If any unit lacks evidence and has no waiver, refuse to create PR
4. If all units pass or have waivers, open PR to stage with proof trail summary

## Success Criteria for Task #11

✅ /plan-task Step 6 produces proof units (not plain implementation steps)
✅ Each proof unit has all required fields (behavior, proof type, command, RED/GREEN states, waiver)
✅ Proof units saved to docs/backlog.json as structured JSON array
✅ Proof units logged to Obsidian task tracker
✅ First proof unit is identified as entry gate confirmation
✅ Waivers are provided where automated proof is not possible
