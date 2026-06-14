import { describe, expect, it } from 'vitest';
import {
  BiTemporalAuditEdge,
  BiTemporalAuditFact,
  intervalContains,
  intervalsOverlap,
  isKnownAt,
  isValidAt,
  isVisibleAt,
  validIntervalsOverlap,
} from '../../src/contracts/security-audit';

describe('BiTemporalAuditFact', () => {
  const fact = {
    entityId: 'account:scott',
    attribute: 'mfaEnabled',
    value: false,
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2026-02-01T00:00:00.000Z',
    txFrom: '2026-01-10T00:00:00.000Z',
    txTo: null,
    source: 'security-scan',
  };

  it('accepts the required bi-temporal fact shape', () => {
    expect(BiTemporalAuditFact.safeParse(fact).success).toBe(true);
  });

  it('requires both valid-time and transaction-time intervals', () => {
    const { txFrom: _txFrom, ...missingTx } = fact;
    const { validFrom: _validFrom, ...missingValid } = fact;
    expect(BiTemporalAuditFact.safeParse(missingTx).success).toBe(false);
    expect(BiTemporalAuditFact.safeParse(missingValid).success).toBe(false);
  });

  it('separates what was true from what Polaris knew', () => {
    expect(isValidAt(fact, '2026-01-05T00:00:00.000Z')).toBe(true);
    expect(isKnownAt(fact, '2026-01-05T00:00:00.000Z')).toBe(false);
    expect(isVisibleAt(fact, '2026-01-05T00:00:00.000Z', '2026-01-05T00:00:00.000Z')).toBe(false);
    expect(isVisibleAt(fact, '2026-01-05T00:00:00.000Z', '2026-01-15T00:00:00.000Z')).toBe(true);
  });

  it('uses half-open intervals at valid-time and transaction-time boundaries', () => {
    expect(intervalContains(fact.validFrom, fact.validTo, fact.validFrom)).toBe(true);
    expect(intervalContains(fact.validFrom, fact.validTo, fact.validTo)).toBe(false);
    expect(intervalContains(fact.txFrom, fact.txTo, '2027-01-01T00:00:00.000Z')).toBe(true);
  });
});

describe('bi-temporal correction history', () => {
  const original = {
    entityId: 'device:laptop-7',
    attribute: 'encrypted',
    value: false,
    validFrom: '2026-03-01T00:00:00.000Z',
    validTo: null,
    txFrom: '2026-03-05T00:00:00.000Z',
    txTo: '2026-03-10T00:00:00.000Z',
  };
  const correction = {
    ...original,
    value: true,
    txFrom: '2026-03-10T00:00:00.000Z',
    txTo: null,
  };

  it('can reconstruct past belief independently from current corrected belief', () => {
    expect(isVisibleAt(original, '2026-03-07T00:00:00.000Z', '2026-03-07T00:00:00.000Z')).toBe(true);
    expect(isVisibleAt(correction, '2026-03-07T00:00:00.000Z', '2026-03-07T00:00:00.000Z')).toBe(false);
    expect(isVisibleAt(original, '2026-03-07T00:00:00.000Z', '2026-03-11T00:00:00.000Z')).toBe(false);
    expect(isVisibleAt(correction, '2026-03-07T00:00:00.000Z', '2026-03-11T00:00:00.000Z')).toBe(true);
  });
});

describe('BiTemporalAuditEdge', () => {
  const suspendedAccount = {
    entityId: 'account:alex',
    attribute: 'status',
    value: 'suspended',
    validFrom: '2026-04-10T00:00:00.000Z',
    validTo: '2026-04-12T00:00:00.000Z',
    txFrom: '2026-04-10T01:00:00.000Z',
    txTo: null,
  };
  const liveAccessEdge = {
    subjectId: 'account:alex',
    predicate: 'hasAccessTo',
    objectId: 'system:payments',
    validFrom: '2026-04-11T00:00:00.000Z',
    validTo: '2026-04-15T00:00:00.000Z',
    txFrom: '2026-04-11T00:05:00.000Z',
    txTo: null,
  };

  it('accepts graph edge records with the same two timelines', () => {
    expect(BiTemporalAuditEdge.safeParse(liveAccessEdge).success).toBe(true);
  });

  it('detects compound condition windows by valid-time overlap', () => {
    expect(validIntervalsOverlap(suspendedAccount, liveAccessEdge)).toBe(true);
    expect(intervalsOverlap(
      '2026-04-12T00:00:00.000Z',
      '2026-04-13T00:00:00.000Z',
      liveAccessEdge.validFrom,
      liveAccessEdge.validTo,
    )).toBe(true);
    expect(intervalsOverlap(
      '2026-04-01T00:00:00.000Z',
      '2026-04-10T00:00:00.000Z',
      liveAccessEdge.validFrom,
      liveAccessEdge.validTo,
    )).toBe(false);
  });
});

