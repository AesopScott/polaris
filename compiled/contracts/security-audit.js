"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiTemporalAuditEdge = exports.BiTemporalAuditFact = void 0;
exports.intervalContains = intervalContains;
exports.intervalsOverlap = intervalsOverlap;
exports.isKnownAt = isKnownAt;
exports.isValidAt = isValidAt;
exports.isVisibleAt = isVisibleAt;
exports.validIntervalsOverlap = validIntervalsOverlap;
const zod_1 = require("zod");
const IsoTimestamp = zod_1.z.string().datetime({ offset: true });
const OpenEndedIsoTimestamp = IsoTimestamp.nullable();
exports.BiTemporalAuditFact = zod_1.z.object({
    entityId: zod_1.z.string().min(1),
    attribute: zod_1.z.string().min(1),
    value: zod_1.z.unknown(),
    validFrom: IsoTimestamp,
    validTo: OpenEndedIsoTimestamp,
    txFrom: IsoTimestamp,
    txTo: OpenEndedIsoTimestamp,
    source: zod_1.z.string().min(1).optional(),
    evidenceId: zod_1.z.string().min(1).optional(),
});
exports.BiTemporalAuditEdge = zod_1.z.object({
    subjectId: zod_1.z.string().min(1),
    predicate: zod_1.z.string().min(1),
    objectId: zod_1.z.string().min(1),
    validFrom: IsoTimestamp,
    validTo: OpenEndedIsoTimestamp,
    txFrom: IsoTimestamp,
    txTo: OpenEndedIsoTimestamp,
    source: zod_1.z.string().min(1).optional(),
    evidenceId: zod_1.z.string().min(1).optional(),
});
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
