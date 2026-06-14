import { z } from 'zod';

const IsoTimestamp = z.string().datetime({ offset: true });
const OpenEndedIsoTimestamp = IsoTimestamp.nullable();
export type AuditValue = string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue };

const RequiredAuditValue: z.ZodType<AuditValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(RequiredAuditValue),
  z.record(RequiredAuditValue),
]));

const BiTemporalFields = z.object({
  recordId: z.string().min(1),
  revisionId: z.string().min(1),
  supersedesId: z.string().min(1).nullable().optional(),
  validFrom: IsoTimestamp,
  validTo: OpenEndedIsoTimestamp,
  txFrom: IsoTimestamp,
  txTo: OpenEndedIsoTimestamp,
  source: z.string().min(1).optional(),
  evidenceId: z.string().min(1).optional(),
});

function validateIntervalOrder(data: { validFrom: string; validTo: string | null; txFrom: string; txTo: string | null }, ctx: z.RefinementCtx): void {
  if (data.validTo !== null && timeMs(data.validFrom) >= timeMs(data.validTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validTo'],
      message: 'validTo must be later than validFrom',
    });
  }
  if (data.txTo !== null && timeMs(data.txFrom) >= timeMs(data.txTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['txTo'],
      message: 'txTo must be later than txFrom',
    });
  }
}

export const BiTemporalAuditFact = BiTemporalFields.extend({
  entityId: z.string().min(1),
  attribute: z.string().min(1),
  value: RequiredAuditValue,
}).superRefine(validateIntervalOrder);

export const BiTemporalAuditEdge = BiTemporalFields.extend({
  subjectId: z.string().min(1),
  predicate: z.string().min(1),
  objectId: z.string().min(1),
}).superRefine(validateIntervalOrder);

export type BiTemporalAuditFactType = z.infer<typeof BiTemporalAuditFact>;
export type BiTemporalAuditEdgeType = z.infer<typeof BiTemporalAuditEdge>;
export type BiTemporalRecord = BiTemporalAuditFactType | BiTemporalAuditEdgeType;
export type TimeInterval = { from: string; to: string | null };

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

export function intervalIntersection(
  leftFrom: string,
  leftTo: string | null,
  rightFrom: string,
  rightTo: string | null,
): TimeInterval | null {
  if (!intervalsOverlap(leftFrom, leftTo, rightFrom, rightTo)) return null;
  const fromMs = Math.max(timeMs(leftFrom), timeMs(rightFrom));
  const leftEnd = leftTo === null ? Number.POSITIVE_INFINITY : timeMs(leftTo);
  const rightEnd = rightTo === null ? Number.POSITIVE_INFINITY : timeMs(rightTo);
  const toMs = Math.min(leftEnd, rightEnd);
  return {
    from: new Date(fromMs).toISOString(),
    to: toMs === Number.POSITIVE_INFINITY ? null : new Date(toMs).toISOString(),
  };
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

export function validIntervalIntersection(
  left: Pick<BiTemporalRecord, 'validFrom' | 'validTo'>,
  right: Pick<BiTemporalRecord, 'validFrom' | 'validTo'>,
): TimeInterval | null {
  return intervalIntersection(left.validFrom, left.validTo, right.validFrom, right.validTo);
}

export function hasOpenTransactionConflict(left: BiTemporalRecord, right: BiTemporalRecord): boolean {
  return left.recordId === right.recordId
    && left.revisionId !== right.revisionId
    && left.txTo === null
    && right.txTo === null;
}
