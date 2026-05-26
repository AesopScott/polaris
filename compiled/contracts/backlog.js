"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacklogFile = exports.BacklogTask = exports.ObjectiveCriteria = exports.ProofUnit = exports.BacklogStatus = exports.ImpactEnum = void 0;
const zod_1 = require("zod");
exports.ImpactEnum = zod_1.z.enum(['minor', 'standard', 'major']);
exports.BacklogStatus = zod_1.z.enum([
    'backlog',
    'planned',
    'build-started',
    'build-finished',
    'cba-complete',
    'review-blocked',
    'staged',
    'production',
    'failed-smoke-test',
    'stalled',
    'failed',
    'blocked',
    'on-hold',
    'cancelled',
    // legacy UI statuses (deprecated)
    'ready',
    'in-progress',
    'complete',
    'pr-reviewed',
    'cba-half-complete',
    'smoke-tested',
]);
exports.ProofUnit = zod_1.z.object({
    number: zod_1.z.number().int().positive(),
    title: zod_1.z.string(),
    expectedBehavior: zod_1.z.string(),
    proofType: zod_1.z.enum(['smoke-command', 'manual-script', 'registry-diff', 'api-check', 'ui-check']),
    exactCommand: zod_1.z.string(),
    expectedInitialFailure: zod_1.z.string(),
    expectedPassingEvidence: zod_1.z.string(),
    waiverGuidance: zod_1.z.string().optional(),
});
exports.ObjectiveCriteria = zod_1.z.object({
    statement: zod_1.z.string(),
    successCriteria: zod_1.z.array(zod_1.z.string()),
    nonGoals: zod_1.z.array(zod_1.z.string()),
    proofMap: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    stopConditions: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.BacklogTask = zod_1.z.object({
    number: zod_1.z.number().int().positive(),
    title: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    priority: zod_1.z.number().optional(),
    impact: zod_1.z.enum(['minor', 'standard', 'major']).optional(),
    status: exports.BacklogStatus.optional(),
    dependencies: zod_1.z.array(zod_1.z.number()).optional(),
    plan: zod_1.z.string().nullable().optional(),
    branch: zod_1.z.string().nullable().optional(),
    pr_url: zod_1.z.string().nullable().optional(),
    proofUnits: zod_1.z.array(exports.ProofUnit).optional(),
    objective: exports.ObjectiveCriteria.optional(),
    created_at: zod_1.z.string().optional(),
    completed_at: zod_1.z.string().nullable().optional(),
});
exports.BacklogFile = zod_1.z.object({
    tasks: zod_1.z.array(exports.BacklogTask),
});
