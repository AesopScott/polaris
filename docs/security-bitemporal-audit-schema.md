# Bi-Temporal Security Audit Schema

Task #59 establishes the schema constraint for future Polaris security tooling. Security facts and graph edges must preserve two independent timelines:

- `valid_time`: when the fact or edge was true in the real world.
- `transaction_time`: when Polaris recorded or believed that fact or edge.

This distinction is load-bearing. A compliance or incident query must be able to answer both questions:

- Were we secure at real-world time `T`?
- Did Polaris know or believe we were secure at transaction time `T`?

## Record Types

### Fact

Facts describe attributes on entities, such as MFA state, device encryption, account status, control evidence, or scan result state.

```ts
{
  entityId: string;
  attribute: string;
  value: unknown;
  validFrom: ISODateTime;
  validTo: ISODateTime | null;
  txFrom: ISODateTime;
  txTo: ISODateTime | null;
  source?: string;
  evidenceId?: string;
}
```

### Edge

Edges describe relationships between entities, such as access, ownership, membership, trust, dependency, or control coverage.

```ts
{
  subjectId: string;
  predicate: string;
  objectId: string;
  validFrom: ISODateTime;
  validTo: ISODateTime | null;
  txFrom: ISODateTime;
  txTo: ISODateTime | null;
  source?: string;
  evidenceId?: string;
}
```

Intervals are half-open: `from <= t < to`. A `null` end means the interval remains open.

## Reconstruction Queries

To reconstruct what was true at `validAt` according to what Polaris knew at `txAt`, filter records where:

```text
validFrom <= validAt
AND (validTo IS NULL OR validAt < validTo)
AND txFrom <= txAt
AND (txTo IS NULL OR txAt < txTo)
```

To inspect current belief about a past moment, use the past `validAt` and current transaction time.

To inspect historical belief, use the past `validAt` and the historical `txAt`.

## Corrections

Never overwrite a fact or edge in place. Corrections close the prior transaction interval and insert a new version:

1. Set the old record's `txTo` to the correction transaction timestamp.
2. Insert the corrected record with the same valid-time interval and `txFrom` equal to that timestamp.
3. Leave `validFrom`/`validTo` unchanged unless the correction also changes when the fact was true.

This preserves both the current best truth and the historical belief trail.

## Compound Condition Windows

Security tooling often needs overlap queries. Example:

```text
account.status = "suspended"
AND account hasAccessTo system
```

The breach window exists where the valid-time intervals overlap. Transaction-time then answers when Polaris knew enough to detect the window.

## Non-Goals

- Do not implement the writer or UI in Task #59.
- Do not migrate `audit.jsonl` into this shape yet.
- Do not model security audit history as a flat append-only log without `validFrom`, `validTo`, `txFrom`, and `txTo`.

## Contract Source

The enforceable schema lives in `src/contracts/security-audit.ts`:

- `BiTemporalAuditFact`
- `BiTemporalAuditEdge`
- `isValidAt()`
- `isKnownAt()`
- `isVisibleAt()`
- `validIntervalsOverlap()`

