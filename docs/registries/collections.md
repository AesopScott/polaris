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
  type:        string   — "instruction" | "decision" | "preference" | "feedback" | "pattern" | "fact"
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

## Planned: `polaris_security_audit_facts`

Future security tooling must store point-in-time entity attributes as bi-temporal facts, not flat log rows. The contract source is `src/contracts/security-audit.ts` (`BiTemporalAuditFact`). Task #59 registers the schema constraint only; no producer writes this collection yet.

**Schema / shape:**
```
{
  recordId:   string         — stable identity across corrections/revisions
  revisionId: string         — unique identity for this transaction-time version
  supersedesId: string | null (optional) — prior revision closed by this correction
  entityId:   string
  attribute:  string
  value:      unknown        — required; absent value is not an auditable fact
  validFrom:  ISO timestamp  — when the fact became true in the real world
  validTo:    ISO timestamp | null — when the fact stopped being true; null = still open
  txFrom:     ISO timestamp  — when Polaris recorded/believed this version
  txTo:       ISO timestamp | null — when Polaris superseded this version; null = current belief
  source:     string (optional)
  evidenceId: string (optional)
}
```

**Required query shape:** reconstruct with both timelines: `validFrom <= validAt`, `validTo == null OR validAt < validTo`, `txFrom <= txAt`, `txTo == null OR txAt < txTo`.

**Correction invariant:** one open transaction version per `recordId`; corrections set old `txTo`, insert a new `revisionId`, and set `supersedesId` to the prior revision.

**Indexes needed when implemented:** `(entityId, attribute, validFrom, validTo, txFrom, txTo)` plus workload-specific indexes for compliance scans.

**Status:** planned design constraint (Task #59)

---

## Planned: `polaris_security_audit_edges`

Future security tooling must store security graph relationships as bi-temporal edges, so overlap detection can find windows where multiple conditions were simultaneously true. The contract source is `src/contracts/security-audit.ts` (`BiTemporalAuditEdge`). Task #59 registers the schema constraint only; no producer writes this collection yet.

**Schema / shape:**
```
{
  recordId:   string
  revisionId: string
  supersedesId: string | null (optional)
  subjectId:  string
  predicate:  string
  objectId:   string
  validFrom:  ISO timestamp
  validTo:    ISO timestamp | null
  txFrom:     ISO timestamp
  txTo:       ISO timestamp | null
  source:     string (optional)
  evidenceId: string (optional)
}
```

**Required overlap query:** compound condition detection must extract the `validFrom`/`validTo` interval intersection first, then apply transaction-time visibility to answer when Polaris knew about the window.

**Indexes needed when implemented:** `(subjectId, predicate, objectId, validFrom, validTo, txFrom, txTo)` plus reverse lookup indexes for graph traversal.

**Status:** planned design constraint (Task #59)

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-06-13T00:00:00Z (by Task #59 design constraint)

**Boundaries checked:** Firestore collections

**Evidence recorded:**
- 1 active entry with complete producer/consumer pairs ✓
- 2 planned security audit entries intentionally have no producers yet ⚠
- 0 entries with shape mismatches ⚠
- New identifiers introduced on task #59: `polaris_security_audit_facts`, `polaris_security_audit_edges`
- Registries match current code diff: yes

**Gaps identified:** planned collections have no producers/consumers until future security tooling implements the writer/query layer.

**Status:** Audit complete
