import { describe, expect, it } from 'vitest';
import {
  BiTemporalAuditEdge,
  BiTemporalAuditFact,
  hasOpenTransactionConflict,
  intervalContains,
  intervalIntersection,
  intervalsOverlap,
  isKnownAt,
  isValidAt,
  isVisibleAt,
  validIntervalIntersection,
  validIntervalsOverlap,
} from '../../src/contracts/security-audit';

describe('BiTemporalAuditFact', () => {
  const fact = {
    recordId: 'fact:account-scott:mfaEnabled',
    revisionId: 'rev:001',
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

  it('requires a fact value and stable revision identity', () => {
    const { value: _value, ...missingValue } = fact;
    const { recordId: _recordId, ...missingRecordId } = fact;
    const { revisionId: _revisionId, ...missingRevisionId } = fact;
    expect(BiTemporalAuditFact.safeParse(missingValue).success).toBe(false);
    expect(BiTemporalAuditFact.safeParse(missingRecordId).success).toBe(false);
    expect(BiTemporalAuditFact.safeParse(missingRevisionId).success).toBe(false);
  });

  it('rejects zero-length or inverted valid-time and transaction-time intervals', () => {
    expect(BiTemporalAuditFact.safeParse({
      ...fact,
      validTo: fact.validFrom,
    }).success).toBe(false);
    expect(BiTemporalAuditFact.safeParse({
      ...fact,
      validFrom: '2026-02-02T00:00:00.000Z',
      validTo: '2026-02-01T00:00:00.000Z',
    }).success).toBe(false);
    expect(BiTemporalAuditFact.safeParse({
      ...fact,
      txTo: fact.txFrom,
    }).success).toBe(false);
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
    recordId: 'fact:device-laptop-7:encrypted',
    revisionId: 'rev:old',
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
    revisionId: 'rev:new',
    supersedesId: 'rev:old',
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

  it('detects conflicting open transaction versions for the same record', () => {
    const duplicateCurrent = {
      ...correction,
      revisionId: 'rev:duplicate',
      supersedesId: 'rev:old',
      txTo: null,
    };
    expect(hasOpenTransactionConflict(correction, duplicateCurrent)).toBe(true);
    expect(hasOpenTransactionConflict(original, correction)).toBe(false);
  });
});

describe('BiTemporalAuditEdge', () => {
  const suspendedAccount = {
    recordId: 'fact:account-alex:status',
    revisionId: 'rev:suspended',
    entityId: 'account:alex',
    attribute: 'status',
    value: 'suspended',
    validFrom: '2026-04-10T00:00:00.000Z',
    validTo: '2026-04-12T00:00:00.000Z',
    txFrom: '2026-04-10T01:00:00.000Z',
    txTo: null,
  };
  const liveAccessEdge = {
    recordId: 'edge:account-alex:payments',
    revisionId: 'rev:access',
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
    expect(validIntervalIntersection(suspendedAccount, liveAccessEdge)).toEqual({
      from: '2026-04-11T00:00:00.000Z',
      to: '2026-04-12T00:00:00.000Z',
    });
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
    expect(intervalIntersection(
      '2026-04-01T00:00:00.000Z',
      '2026-04-10T00:00:00.000Z',
      liveAccessEdge.validFrom,
      liveAccessEdge.validTo,
    )).toBe(null);
  });
});
