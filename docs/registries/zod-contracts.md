# Zod Contract Modules Registry

Every Zod schema module in `src/contracts/`. For each: exports, producers (who defines the schema), consumers (who imports and uses it), and status. Update whenever a schema module is added, a named export is renamed, or a new consumer is wired.

**Boundary:** Named exports in `src/contracts/*.ts` → any file that imports from those paths. The schemas are the source of truth for payload shapes. If a schema name or field changes, all consumers must be updated simultaneously.

**Two distinct contracts layers exist in this project:**
- `src/runtime/contracts.ts` — TypeScript interfaces only (no runtime validation). Depended on by `src/runtime/*.ts` modules.
- `src/contracts/*.ts` — Zod schemas (runtime-parseable). Introduced in task #37; currently consumed only by tests.

---

## `src/contracts/ws-messages.ts`

Zod schemas for all ~50 WebSocket message types exchanged between `resources/mockup.html` and `server.js`.

**Key exports:**
- `LaunchMessage`, `ResumeMessage`, `StopMessage`, `CloseSessionMessage`, `RenameSessionMessage`, `TransferSessionMessage`
- `SessionHeightMessage`, `SessionColumnMessage`, `SessionColumnSpanMessage`, `SessionPinnedMessage`
- `UserQuestionAnswerMessage`, `CrossCheckDecisionMessage`, `CrossCheckPostHocDecisionMessage`, `InstallerPermissionDecisionMessage`
- `DeleteQueueMessageMessage`, `EditQueueMessageMessage`, `CostUpdateMessage`
- `ListBacklogsMessage`, `AddBacklogTaskMessage`, `UpdateBacklogTaskMessage`, `UpdateBacklogTaskStatusMessage`, `ArchiveBacklogTasksMessage`
- `TestApiKeyMessage`, `AnyClientMessage` (discriminated union over all ~50 types)
- *(and ~30 additional message schemas)*

**Producers**
- `src/contracts/ws-messages.ts` — schema definitions (488 lines)
- `src/contracts/index.ts` — barrel re-export

**Consumers**
- `test/contracts/ws-messages.test.ts:1` — Vitest contract tests; exercises valid/invalid payloads for all major types including `AnyClientMessage` union
- *(task #38 will add)* `server.js` — runtime WS receive-side validation

**⚠ Divergence risk:** `AnyClientMessage` discriminated union also exists as a TypeScript interface union in `src/runtime/contracts.ts:611`. Both describe the same concept. Task #38 must derive the runtime type from the Zod schema, not maintain both independently.

**Status:** ⚠ orphan runtime producer — test consumer exists (`test/contracts/ws-messages.test.ts`), runtime consumer pending (task #38)

---

## `src/contracts/backlog.ts`

Zod schemas for backlog task data model: status enum, task structure, proof units, objective criteria.

**Key exports:**
- `BacklogStatus` — enum of all valid status strings (backlog → production lifecycle + legacy values)
- `ImpactEnum` — enum of valid impact values (`minor`, `standard`, `major`) *(added task #38 Phase A)*
- `ImpactType` — inferred TypeScript type for `ImpactEnum` *(added task #38 Phase A)*
- `ProofUnit` — task proof unit shape (number, title, proofType, exactCommand, expectedInitialFailure, expectedPassingEvidence)
- `ObjectiveCriteria` — task objective shape (statement, successCriteria, nonGoals, proofMap, stopConditions)
- `BacklogTask` — full task object schema (all optional except `number` and `title`)
- `BacklogFile` — wrapper with `tasks: BacklogTask[]`
- `BacklogTaskType`, `BacklogStatusType` — inferred TypeScript types

**Producers**
- `src/contracts/backlog.ts` — schema definitions
- `src/contracts/index.ts` — barrel re-export

**Consumers**
- `test/contracts/backlog.test.ts:1` — Vitest contract tests; exercises all status enum values, ProofUnit required/optional fields, BacklogTask field validation
- *(task #38 adding)* `server.js` — replaces hand-rolled `VALID_BACKLOG_STATUSES` set and `_validImpact` check with `BacklogStatus.safeParse()` and `ImpactEnum.safeParse()`

**Note:** `src/runtime/backlog.ts:20` imports `type { ProofUnit }` from `./contracts` — that's `src/runtime/contracts.ts`, not this Zod module. The TypeScript interface and the Zod schema are currently maintained separately.

**Status:** ⚠ orphan runtime producer — test consumer exists, runtime consumer being wired (task #38)

---

## `src/contracts/tools.ts`

Zod schemas for all 14 direct tool input shapes used in agent sessions.

**Key exports:**
- `ReadInput`, `WriteInput`, `EditInput`, `GlobInput`, `GrepInput`
- `BashInput`, `PowerShellInput`
- `WebFetchInput`, `WebSearchInput`
- `AskUserQuestionInput`, `AskUserQuestionItem`, `AskUserQuestionOption`
- `TodoWriteInput`, `TodoItem`
- `QueryMemoryInput`, `SetProjectInput`, `SetStatusInput`
- `ToolResult`
- `DIRECT_TOOL_NAMES`, `DirectToolName`, `DirectToolNameType`

**Producers**
- `src/contracts/tools.ts` — schema definitions (168 lines)
- `src/contracts/index.ts` — barrel re-export

**Consumers**
- `test/contracts/tools.test.ts:1` — Vitest contract tests; covers all 14 tool inputs, DirectToolName enum, ToolResult variants
- *(future task — not task #38)* `server.js` — runtime tool-call validation before execution

**⚠ Shape drift risk:** `server.js:2069–2087` defines inline JSON-schema objects for the same 14 tools (used by the OpenRouter API). These inline schemas are maintained separately from the Zod schemas. If a tool's parameter changes, both must be updated. A future task should derive the inline schemas from the Zod definitions.

**Status:** ⚠ orphan runtime producer — test consumer exists, runtime consumer deferred (future task)

---

## `src/contracts/mcp.ts`

Zod schemas for MCP (Model Context Protocol) server configuration and tool envelope shapes.

**Key exports:**
- `MCPServer` — server config (name, command, args, env)
- `MCPToolInputSchema` — JSON Schema `object` shape for MCP tool inputs
- `MCPToolEnvelope` — tool registration shape (name, description, inputSchema)
- `MCPToolCall` — tool invocation (name, arguments)
- `MCPToolResult` — tool result with content union (text | image | resource)
- `MCPServerConfig` — top-level config file shape (`mcpServers: Record<string, MCPServer>`)
- `MCPServerType`, `MCPToolEnvelopeType` — inferred TypeScript types

**Producers**
- `src/contracts/mcp.ts` — schema definitions
- `src/contracts/index.ts` — barrel re-export

**Consumers**
- `test/contracts/mcp.test.ts:1` — Vitest contract tests; covers MCPServer, MCPToolEnvelope, MCPToolCall, MCPToolResult content union (text/image/resource), MCPServerConfig
- *(future task — not task #38)* `server.js` — runtime MCP envelope validation at `mcpGateway.ts`

**Status:** ⚠ orphan runtime producer — test consumer exists, runtime consumer deferred (future task)

---

## `src/contracts/security-audit.ts`

Zod schemas and pure helpers for future bi-temporal security audit facts and graph edges. Added by Task #59 as a design constraint before any writer or UI exists.

**Key exports:**
- `BiTemporalAuditFact` — entity attribute record with `validFrom`/`validTo` plus `txFrom`/`txTo`
- `BiTemporalAuditEdge` — graph relationship record with the same two timelines
- `intervalContains()`, `intervalsOverlap()` — half-open interval helpers
- `intervalIntersection()` — returns the actual overlapping interval instead of only a boolean
- `isValidAt()`, `isKnownAt()`, `isVisibleAt()` — reconstruction helpers for real-world time vs Polaris knowledge time
- `validIntervalsOverlap()`, `validIntervalIntersection()` — compound condition window helpers
- `hasOpenTransactionConflict()` — detects multiple open transaction versions for the same `recordId`
- `BiTemporalAuditFactType`, `BiTemporalAuditEdgeType`, `BiTemporalRecord` — inferred TypeScript types

**Producers**
- `src/contracts/security-audit.ts` — schema definitions and pure interval/reconstruction helpers
- `src/contracts/index.ts` — barrel re-export

**Consumers**
- `test/contracts/security-audit.test.ts` — Vitest contract tests; verifies required two-timeline fields, half-open interval behavior, historical belief reconstruction, corrections, and valid-time overlap detection
- `docs/security-bitemporal-audit-schema.md` — human-readable design contract for future security tooling

**Status:** planned design contract — test consumer exists; runtime writer/query consumers deferred to future security tooling

---

## `src/contracts/index.ts`

Barrel export re-exporting all five contract modules. Single import point for consumers that need multiple schemas.

**Producers**
- `src/contracts/index.ts` — re-exports `backlog`, `mcp`, `security-audit`, `tools`, and `ws-messages`

**Consumers**
- No current imports of the barrel form. Test files import from individual module paths (e.g. `../../src/contracts/ws-messages`).

**Status:** ⚠ orphan producer — barrel is defined but no consumer uses it yet. Acceptable; consumer would be `server.js` in task #38.

---

## Summary

| Module | Test consumer | Runtime consumer | Status |
|--------|--------------|-----------------|--------|
| `src/contracts/ws-messages.ts` | `test/contracts/ws-messages.test.ts` ✓ | being wired (task #38) | ⚠ orphan runtime |
| `src/contracts/backlog.ts` | `test/contracts/backlog.test.ts` ✓ | being wired (task #38) | ⚠ orphan runtime |
| `src/contracts/tools.ts` | `test/contracts/tools.test.ts` ✓ | none (future task) | ⚠ orphan runtime |
| `src/contracts/mcp.ts` | `test/contracts/mcp.test.ts` ✓ | none (future task) | ⚠ orphan runtime |
| `src/contracts/security-audit.ts` | `test/contracts/security-audit.test.ts` ✓ | none (future security tooling) | planned design contract |
| `src/contracts/index.ts` | none | none | ⚠ orphan producer |

**Task #38 scope (runtime wiring):** `backlog.ts` + `ws-messages.ts` only. `tools.ts` and `mcp.ts` runtime consumers are deferred to a future task.

**Shape drift risks** (non-blocking):
- `AnyClientMessage` defined in both `src/contracts/ws-messages.ts` and `src/runtime/contracts.ts:611` — task #38 consolidates via `WS_SCHEMA_REGISTRY`
- 14 inline tool JSON-schemas in `server.js:2069–2087` duplicate the Zod definitions — deferred to future task

---

## Audit Trail — Proof of Registry Verification

**Last audit:** 2026-06-13T00:00:00Z (by Task #59 design constraint)

**Boundaries checked:** `src/contracts/*.ts` module exports → all consumers in `test/`, `src/runtime/`, `server.js`

**Evidence recorded:**
- 5 schema modules with test consumers ✓ (ws-messages, backlog, tools, mcp, security-audit)
- 5 entries with no/full pending runtime consumer ⚠ (intentional — task #38 or future security tooling)
- 1 barrel export with no consumer ⚠ (intentional — pending task #38)
- 2 shape drift risks flagged (AnyClientMessage duplication; inline tool schemas)
- New identifiers introduced by task #59: `security-audit.ts`, `BiTemporalAuditFact`, `BiTemporalAuditEdge`, interval/reconstruction helpers
- New identifiers introduced by task #37 (producers): all 4 modules and ~80 named exports
- Registries match current code diff: yes

**Gaps identified:**
- All `⚠` entries are intentional, documented with task #38 or future security tooling as the resolution path
- `src/contracts/index.ts` barrel has no consumers — acceptable, task #38 will use it
- `AnyClientMessage` maintained in two places — flag for task #38 consolidation
- Inline tool JSON-schemas in server.js duplicate Zod schemas — flag for task #38

**Status:** Audit complete

---

## Audit Trail — Pre-Implementation Verification

**Last audit:** 2026-05-25T00:00:00Z (by /cross-boundary-audit for task #38)

**Boundaries checked:** `src/contracts/*.ts` module exports → all consumers in `test/`, `src/runtime/`, `server.js`

**Evidence recorded:**
- 5 schema modules confirmed — ws-messages, backlog, tools, mcp, security-audit
- `ImpactEnum` + `ImpactType` pre-registered (task #38 Phase A will add to `src/contracts/backlog.ts`)
- tools.ts and mcp.ts runtime consumer attribution corrected: NOT task #38 — deferred to future task
- ws-messages.ts and backlog.ts runtime consumer attribution confirmed in scope for task #38
- 2 orphan runtime producers corrected to "future task" (tools.ts, mcp.ts)
- 2 orphan runtime producers updated to "being wired" (ws-messages.ts, backlog.ts)
- New identifiers introduced by task #38: `ImpactEnum`, `ImpactType` (backlog.ts); `compiled/contracts/` (compiled output)
- Registries match current code diff: yes (pre-implementation state)

**Gaps identified:**
- All `⚠` entries remain intentional — wiring in progress (task #38) or deferred (future task)
- Scope misattribution for tools.ts/mcp.ts: corrected — these are NOT task #38 consumers

**Status:** Audit complete
