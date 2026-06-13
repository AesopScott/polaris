# Firestore Collections Registry

Every Firestore collection used in this project. For each: producers, consumers, schema shape, adjacent constraints, status. Update whenever a collection is added, removed, or its schema changes.

---

## `polaris_memories`

Persistent memory store for Polaris sessions. Holds structured memory entries extracted from sessions, searchable by project + keyword. Fed into session hidden system prompts at turn 1 via the Task #51 injection system.

**Schema / shape:**
```
{
  project:     string   — project name scope (e.g. "Polaris", "CareGuide")
  content:     string   — the memory text
  type:        string   — "instruction" | "preference" | "fact"
  tags:        string[] — optional keyword tags
  strength:    number   — 0.0–1.0, Ebbinghaus decay curve with type-calibrated stability; reinforced on retrieval
  sessionId:   string   — source session ID (optional)
  sessionType: string   — "agent" | "chat" | "routine" (optional)
  source:      string   — "codex" | "manual"
  createdAt:   Timestamp
  lastReinforced: Timestamp (optional)
}
```

**Producers**
- `lib/memory.js:93` — `addMemory()` single-document write via `firestore.collection(COLLECTION).add(doc)`
- `lib/memory.js:116` — `addMemories()` batch write via `firestore.collection(COLLECTION).doc()` + `batch.set()`
- `server.js:1778` — post-session Codex extraction writes via `memory.addMemories(toWrite)`

**Consumers**
- `lib/memory.js:180` — `searchMemories()` compound query (project + optional keyword, BM25 re-rank client-side)
- `lib/memory.js:233` — `reinforceMemory()` reads doc, bumps strength + lastReinforced
- `lib/memory.js` — `decayMemories()` reads all docs with strength > 0, applies type-calibrated Ebbinghaus decay
- `lib/memory.js:307` — `getAllMemories()` reads all docs for a project
- `lib/memoryInjection.js:124` — `buildMemoryInjectionBlock()` calls `memory.searchMemories()` via DI at session turn 1
- `server.js:2601` — `toolQueryMemory()` calls `memory.searchMemories()` for agent QueryMemory tool
- `server.js:2606` — `toolQueryMemory()` calls `memory.reinforceMemory()` on results
- `server.js:12686` — scheduled `memory.decayMemories()` call

**Service account:** `%APPDATA%\.claude\polaris\firebase-keys\polaris-9d022-firebase-adminsdk-fbsvc-55d2c70d3f.json` (read by `lib/memory.js:19–23`)

**Firestore rules:** Not configured in this repo (Admin SDK bypasses rules — intentional). Mark: `✓ (intentional bypass — Admin SDK, service account auth)`

**Indexes:** Compound query `(project == X, strength > 0, orderBy createdAt)` used in `searchMemories` and `decayMemories`. Requires a Firestore composite index. Not defined in this repo — managed in Firebase console.

**Status:** ✓

---

## Summary

| Name | Producers | Consumers | Status |
|------|-----------|-----------|--------|
| `polaris_memories` | `lib/memory.js:93,116` · `server.js:1778` | `lib/memory.js:180,233,263,307` · `lib/memoryInjection.js:124` · `server.js:2601,2606,12686` | ✓ |

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-05-27T00:00:00Z (by /cross-boundary-audit)

**Boundaries checked:** Firestore collections

**Evidence recorded:**
- 1 entry with complete producer/consumer pairs ✓
- 0 entries with gaps ⚠
- 0 entries with shape mismatches ⚠
- New identifiers introduced on task #56: none
- Registries match current code diff: yes

**Gaps identified:** none

**Status:** Audit complete
