import { z } from 'zod';

const IsoTimestamp = z.string().datetime({ offset: true });
const OpenEndedIsoTimestamp = IsoTimestamp.nullable();

export const BiTemporalAuditFact = z.object({
  entityId: z.string().min(1),
  attribute: z.string().min(1),
  value: z.unknown(),
  validFrom: IsoTimestamp,
  validTo: OpenEndedIsoTimestamp,
  txFrom: IsoTimestamp,
  txTo: OpenEndedIsoTimestamp,
  source: z.string().min(1).optional(),
  evidenceId: z.string().min(1).optional(),
});

export const BiTemporalAuditEdge = z.object({
  subjectId: z.string().min(1),
  predicate: z.string().min(1),
  objectId: z.string().min(1),
  validFrom: IsoTimestamp,
  validTo: OpenEndedIsoTimestamp,
  txFrom: IsoTimestamp,
  txTo: OpenEndedIsoTimestamp,
  source: z.string().min(1).optional(),
  evidenceId: z.string().min(1).optional(),
});

export type BiTemporalAuditFactType = z.infer<typeof BiTemporalAuditFact>;
export type BiTemporalAuditEdgeType = z.infer<typeof BiTemporalAuditEdge>;
export type BiTemporalRecord = BiTemporalAuditFactType | BiTemporalAuditEdgeType;

function timeMs(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
}

export function intervalContains(from: string, to: string | null, at: string): boolean {
  const start = timeMs(from);
  const point = timeMs(at);
  const end = to === null ? Number.POSITIVE_INFINITY : timeMs(to);
  return start <= point && point < end;
}

export function intervalsOverlap(
  leftFrom: string,
  leftTo: string | null,
  rightFrom: string,
  rightTo: string | null,
): boolean {
  const leftStart = timeMs(leftFrom);
  const leftEnd = leftTo === null ? Number.POSITIVE_INFINITY : timeMs(leftTo);
  const rightStart = timeMs(rightFrom);
  const rightEnd = rightTo === null ? Number.POSITIVE_INFINITY : timeMs(rightTo);
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function isKnownAt(record: BiTemporalRecord, txAt: string): boolean {
  return intervalContains(record.txFrom, record.txTo, txAt);
}

export function isValidAt(record: BiTemporalRecord, validAt: string): boolean {
  return intervalContains(record.validFrom, record.validTo, validAt);
}

export function isVisibleAt(record: BiTemporalRecord, validAt: string, txAt: string): boolean {
  return isValidAt(record, validAt) && isKnownAt(record, txAt);
}

export function validIntervalsOverlap(
  left: Pick<BiTemporalRecord, 'validFrom' | 'validTo'>,
  right: Pick<BiTemporalRecord, 'validFrom' | 'validTo'>,
): boolean {
  return intervalsOverlap(left.validFrom, left.validTo, right.validFrom, right.validTo);
}

