"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiTemporalAuditEdge = exports.BiTemporalAuditFact = void 0;
exports.intervalContains = intervalContains;
exports.intervalsOverlap = intervalsOverlap;
exports.intervalIntersection = intervalIntersection;
exports.isKnownAt = isKnownAt;
exports.isValidAt = isValidAt;
exports.isVisibleAt = isVisibleAt;
exports.validIntervalsOverlap = validIntervalsOverlap;
exports.validIntervalIntersection = validIntervalIntersection;
exports.hasOpenTransactionConflict = hasOpenTransactionConflict;
const zod_1 = require("zod");
const IsoTimestamp = zod_1.z.string().datetime({ offset: true });
const OpenEndedIsoTimestamp = IsoTimestamp.nullable();
const RequiredAuditValue = zod_1.z.lazy(() => zod_1.z.union([
    zod_1.z.string(),
    zod_1.z.number(),
    zod_1.z.boolean(),
    zod_1.z.null(),
    zod_1.z.array(RequiredAuditValue),
    zod_1.z.record(RequiredAuditValue),
]));
const BiTemporalFields = zod_1.z.object({
    recordId: zod_1.z.string().min(1),
    revisionId: zod_1.z.string().min(1),
    supersedesId: zod_1.z.string().min(1).nullable().optional(),
    validFrom: IsoTimestamp,
    validTo: OpenEndedIsoTimestamp,
    txFrom: IsoTimestamp,
    txTo: OpenEndedIsoTimestamp,
    source: zod_1.z.string().min(1).optional(),
    evidenceId: zod_1.z.string().min(1).optional(),
});
function validateIntervalOrder(data, ctx) {
    if (data.validTo !== null && timeMs(data.validFrom) >= timeMs(data.validTo)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['validTo'],
            message: 'validTo must be later than validFrom',
        });
    }
    if (data.txTo !== null && timeMs(data.txFrom) >= timeMs(data.txTo)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['txTo'],
            message: 'txTo must be later than txFrom',
        });
    }
}
exports.BiTemporalAuditFact = BiTemporalFields.extend({
    entityId: zod_1.z.string().min(1),
    attribute: zod_1.z.string().min(1),
    value: RequiredAuditValue,
}).superRefine(validateIntervalOrder);
exports.BiTemporalAuditEdge = BiTemporalFields.extend({
    subjectId: zod_1.z.string().min(1),
    predicate: zod_1.z.string().min(1),
    objectId: zod_1.z.string().min(1),
}).superRefine(validateIntervalOrder);
function timeMs(value) {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed))
        throw new Error(`Invalid timestamp: ${value}`);
    return parsed;
}
function intervalContains(from, to, at) {
    const start = timeMs(from);
    const point = timeMs(at);
    const end = to === null ? Number.POSITIVE_INFINITY : timeMs(to);
    return start <= point && point < end;
}
function intervalsOverlap(leftFrom, leftTo, rightFrom, rightTo) {
    const leftStart = timeMs(leftFrom);
    const leftEnd = leftTo === null ? Number.POSITIVE_INFINITY : timeMs(leftTo);
    const rightStart = timeMs(rightFrom);
    const rightEnd = rightTo === null ? Number.POSITIVE_INFINITY : timeMs(rightTo);
    return leftStart < rightEnd && rightStart < leftEnd;
}
function intervalIntersection(leftFrom, leftTo, rightFrom, rightTo) {
    if (!intervalsOverlap(leftFrom, leftTo, rightFrom, rightTo))
        return null;
    const fromMs = Math.max(timeMs(leftFrom), timeMs(rightFrom));
    const leftEnd = leftTo === null ? Number.POSITIVE_INFINITY : timeMs(leftTo);
    const rightEnd = rightTo === null ? Number.POSITIVE_INFINITY : timeMs(rightTo);
    const toMs = Math.min(leftEnd, rightEnd);
    return {
        from: new Date(fromMs).toISOString(),
        to: toMs === Number.POSITIVE_INFINITY ? null : new Date(toMs).toISOString(),
    };
}
function isKnownAt(record, txAt) {
    return intervalContains(record.txFrom, record.txTo, txAt);
}
function isValidAt(record, validAt) {
    return intervalContains(record.validFrom, record.validTo, validAt);
}
function isVisibleAt(record, validAt, txAt) {
    return isValidAt(record, validAt) && isKnownAt(record, txAt);
}
function validIntervalsOverlap(left, right) {
    return intervalsOverlap(left.validFrom, left.validTo, right.validFrom, right.validTo);
}
function validIntervalIntersection(left, right) {
    return intervalIntersection(left.validFrom, left.validTo, right.validFrom, right.validTo);
}
function hasOpenTransactionConflict(left, right) {
    return left.recordId === right.recordId
        && left.revisionId !== right.revisionId
        && left.txTo === null
        && right.txTo === null;
}
