import { z } from 'zod';
export declare const ImpactEnum: z.ZodEnum<["minor", "standard", "major"]>;
export type ImpactType = z.infer<typeof ImpactEnum>;
export declare const BacklogStatus: z.ZodEnum<["backlog", "planned", "build-started", "build-finished", "cba-complete", "review-blocked", "staged", "production", "failed-smoke-test", "stalled", "failed", "blocked", "on-hold", "cancelled", "ready", "in-progress", "complete", "pr-reviewed", "cba-half-complete", "smoke-tested"]>;
export type BacklogStatusType = z.infer<typeof BacklogStatus>;
export declare const ProofUnit: z.ZodObject<{
    number: z.ZodNumber;
    title: z.ZodString;
    expectedBehavior: z.ZodString;
    proofType: z.ZodEnum<["smoke-command", "manual-script", "registry-diff", "api-check", "ui-check"]>;
    exactCommand: z.ZodString;
    expectedInitialFailure: z.ZodString;
    expectedPassingEvidence: z.ZodString;
    waiverGuidance: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    number: number;
    title: string;
    expectedBehavior: string;
    proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
    exactCommand: string;
    expectedInitialFailure: string;
    expectedPassingEvidence: string;
    waiverGuidance?: string | undefined;
}, {
    number: number;
    title: string;
    expectedBehavior: string;
    proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
    exactCommand: string;
    expectedInitialFailure: string;
    expectedPassingEvidence: string;
    waiverGuidance?: string | undefined;
}>;
export declare const ObjectiveCriteria: z.ZodObject<{
    statement: z.ZodString;
    successCriteria: z.ZodArray<z.ZodString, "many">;
    nonGoals: z.ZodArray<z.ZodString, "many">;
    proofMap: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    stopConditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    statement: string;
    successCriteria: string[];
    nonGoals: string[];
    proofMap: Record<string, unknown>;
    stopConditions?: string[] | undefined;
}, {
    statement: string;
    successCriteria: string[];
    nonGoals: string[];
    proofMap: Record<string, unknown>;
    stopConditions?: string[] | undefined;
}>;
export declare const BacklogTask: z.ZodObject<{
    number: z.ZodNumber;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodNumber>;
    impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    status: z.ZodOptional<z.ZodEnum<["backlog", "planned", "build-started", "build-finished", "cba-complete", "review-blocked", "staged", "production", "failed-smoke-test", "stalled", "failed", "blocked", "on-hold", "cancelled", "ready", "in-progress", "complete", "pr-reviewed", "cba-half-complete", "smoke-tested"]>>;
    dependencies: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    plan: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    branch: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pr_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    proofUnits: z.ZodOptional<z.ZodArray<z.ZodObject<{
        number: z.ZodNumber;
        title: z.ZodString;
        expectedBehavior: z.ZodString;
        proofType: z.ZodEnum<["smoke-command", "manual-script", "registry-diff", "api-check", "ui-check"]>;
        exactCommand: z.ZodString;
        expectedInitialFailure: z.ZodString;
        expectedPassingEvidence: z.ZodString;
        waiverGuidance: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        number: number;
        title: string;
        expectedBehavior: string;
        proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
        exactCommand: string;
        expectedInitialFailure: string;
        expectedPassingEvidence: string;
        waiverGuidance?: string | undefined;
    }, {
        number: number;
        title: string;
        expectedBehavior: string;
        proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
        exactCommand: string;
        expectedInitialFailure: string;
        expectedPassingEvidence: string;
        waiverGuidance?: string | undefined;
    }>, "many">>;
    objective: z.ZodOptional<z.ZodObject<{
        statement: z.ZodString;
        successCriteria: z.ZodArray<z.ZodString, "many">;
        nonGoals: z.ZodArray<z.ZodString, "many">;
        proofMap: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        stopConditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        statement: string;
        successCriteria: string[];
        nonGoals: string[];
        proofMap: Record<string, unknown>;
        stopConditions?: string[] | undefined;
    }, {
        statement: string;
        successCriteria: string[];
        nonGoals: string[];
        proofMap: Record<string, unknown>;
        stopConditions?: string[] | undefined;
    }>>;
    created_at: z.ZodOptional<z.ZodString>;
    completed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    number: number;
    title: string;
    status?: "backlog" | "planned" | "build-started" | "build-finished" | "cba-complete" | "review-blocked" | "staged" | "production" | "failed-smoke-test" | "stalled" | "failed" | "blocked" | "on-hold" | "cancelled" | "ready" | "in-progress" | "complete" | "pr-reviewed" | "cba-half-complete" | "smoke-tested" | undefined;
    description?: string | undefined;
    category?: string | undefined;
    priority?: number | undefined;
    impact?: "minor" | "standard" | "major" | undefined;
    dependencies?: number[] | undefined;
    plan?: string | null | undefined;
    branch?: string | null | undefined;
    pr_url?: string | null | undefined;
    proofUnits?: {
        number: number;
        title: string;
        expectedBehavior: string;
        proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
        exactCommand: string;
        expectedInitialFailure: string;
        expectedPassingEvidence: string;
        waiverGuidance?: string | undefined;
    }[] | undefined;
    objective?: {
        statement: string;
        successCriteria: string[];
        nonGoals: string[];
        proofMap: Record<string, unknown>;
        stopConditions?: string[] | undefined;
    } | undefined;
    created_at?: string | undefined;
    completed_at?: string | null | undefined;
}, {
    number: number;
    title: string;
    status?: "backlog" | "planned" | "build-started" | "build-finished" | "cba-complete" | "review-blocked" | "staged" | "production" | "failed-smoke-test" | "stalled" | "failed" | "blocked" | "on-hold" | "cancelled" | "ready" | "in-progress" | "complete" | "pr-reviewed" | "cba-half-complete" | "smoke-tested" | undefined;
    description?: string | undefined;
    category?: string | undefined;
    priority?: number | undefined;
    impact?: "minor" | "standard" | "major" | undefined;
    dependencies?: number[] | undefined;
    plan?: string | null | undefined;
    branch?: string | null | undefined;
    pr_url?: string | null | undefined;
    proofUnits?: {
        number: number;
        title: string;
        expectedBehavior: string;
        proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
        exactCommand: string;
        expectedInitialFailure: string;
        expectedPassingEvidence: string;
        waiverGuidance?: string | undefined;
    }[] | undefined;
    objective?: {
        statement: string;
        successCriteria: string[];
        nonGoals: string[];
        proofMap: Record<string, unknown>;
        stopConditions?: string[] | undefined;
    } | undefined;
    created_at?: string | undefined;
    completed_at?: string | null | undefined;
}>;
export type BacklogTaskType = z.infer<typeof BacklogTask>;
export declare const BacklogFile: z.ZodObject<{
    tasks: z.ZodArray<z.ZodObject<{
        number: z.ZodNumber;
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        category: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
        status: z.ZodOptional<z.ZodEnum<["backlog", "planned", "build-started", "build-finished", "cba-complete", "review-blocked", "staged", "production", "failed-smoke-test", "stalled", "failed", "blocked", "on-hold", "cancelled", "ready", "in-progress", "complete", "pr-reviewed", "cba-half-complete", "smoke-tested"]>>;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        plan: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        branch: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        pr_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        proofUnits: z.ZodOptional<z.ZodArray<z.ZodObject<{
            number: z.ZodNumber;
            title: z.ZodString;
            expectedBehavior: z.ZodString;
            proofType: z.ZodEnum<["smoke-command", "manual-script", "registry-diff", "api-check", "ui-check"]>;
            exactCommand: z.ZodString;
            expectedInitialFailure: z.ZodString;
            expectedPassingEvidence: z.ZodString;
            waiverGuidance: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            number: number;
            title: string;
            expectedBehavior: string;
            proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
            exactCommand: string;
            expectedInitialFailure: string;
            expectedPassingEvidence: string;
            waiverGuidance?: string | undefined;
        }, {
            number: number;
            title: string;
            expectedBehavior: string;
            proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
            exactCommand: string;
            expectedInitialFailure: string;
            expectedPassingEvidence: string;
            waiverGuidance?: string | undefined;
        }>, "many">>;
        objective: z.ZodOptional<z.ZodObject<{
            statement: z.ZodString;
            successCriteria: z.ZodArray<z.ZodString, "many">;
            nonGoals: z.ZodArray<z.ZodString, "many">;
            proofMap: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            stopConditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            statement: string;
            successCriteria: string[];
            nonGoals: string[];
            proofMap: Record<string, unknown>;
            stopConditions?: string[] | undefined;
        }, {
            statement: string;
            successCriteria: string[];
            nonGoals: string[];
            proofMap: Record<string, unknown>;
            stopConditions?: string[] | undefined;
        }>>;
        created_at: z.ZodOptional<z.ZodString>;
        completed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        number: number;
        title: string;
        status?: "backlog" | "planned" | "build-started" | "build-finished" | "cba-complete" | "review-blocked" | "staged" | "production" | "failed-smoke-test" | "stalled" | "failed" | "blocked" | "on-hold" | "cancelled" | "ready" | "in-progress" | "complete" | "pr-reviewed" | "cba-half-complete" | "smoke-tested" | undefined;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
        dependencies?: number[] | undefined;
        plan?: string | null | undefined;
        branch?: string | null | undefined;
        pr_url?: string | null | undefined;
        proofUnits?: {
            number: number;
            title: string;
            expectedBehavior: string;
            proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
            exactCommand: string;
            expectedInitialFailure: string;
            expectedPassingEvidence: string;
            waiverGuidance?: string | undefined;
        }[] | undefined;
        objective?: {
            statement: string;
            successCriteria: string[];
            nonGoals: string[];
            proofMap: Record<string, unknown>;
            stopConditions?: string[] | undefined;
        } | undefined;
        created_at?: string | undefined;
        completed_at?: string | null | undefined;
    }, {
        number: number;
        title: string;
        status?: "backlog" | "planned" | "build-started" | "build-finished" | "cba-complete" | "review-blocked" | "staged" | "production" | "failed-smoke-test" | "stalled" | "failed" | "blocked" | "on-hold" | "cancelled" | "ready" | "in-progress" | "complete" | "pr-reviewed" | "cba-half-complete" | "smoke-tested" | undefined;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
        dependencies?: number[] | undefined;
        plan?: string | null | undefined;
        branch?: string | null | undefined;
        pr_url?: string | null | undefined;
        proofUnits?: {
            number: number;
            title: string;
            expectedBehavior: string;
            proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
            exactCommand: string;
            expectedInitialFailure: string;
            expectedPassingEvidence: string;
            waiverGuidance?: string | undefined;
        }[] | undefined;
        objective?: {
            statement: string;
            successCriteria: string[];
            nonGoals: string[];
            proofMap: Record<string, unknown>;
            stopConditions?: string[] | undefined;
        } | undefined;
        created_at?: string | undefined;
        completed_at?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    tasks: {
        number: number;
        title: string;
        status?: "backlog" | "planned" | "build-started" | "build-finished" | "cba-complete" | "review-blocked" | "staged" | "production" | "failed-smoke-test" | "stalled" | "failed" | "blocked" | "on-hold" | "cancelled" | "ready" | "in-progress" | "complete" | "pr-reviewed" | "cba-half-complete" | "smoke-tested" | undefined;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
        dependencies?: number[] | undefined;
        plan?: string | null | undefined;
        branch?: string | null | undefined;
        pr_url?: string | null | undefined;
        proofUnits?: {
            number: number;
            title: string;
            expectedBehavior: string;
            proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
            exactCommand: string;
            expectedInitialFailure: string;
            expectedPassingEvidence: string;
            waiverGuidance?: string | undefined;
        }[] | undefined;
        objective?: {
            statement: string;
            successCriteria: string[];
            nonGoals: string[];
            proofMap: Record<string, unknown>;
            stopConditions?: string[] | undefined;
        } | undefined;
        created_at?: string | undefined;
        completed_at?: string | null | undefined;
    }[];
}, {
    tasks: {
        number: number;
        title: string;
        status?: "backlog" | "planned" | "build-started" | "build-finished" | "cba-complete" | "review-blocked" | "staged" | "production" | "failed-smoke-test" | "stalled" | "failed" | "blocked" | "on-hold" | "cancelled" | "ready" | "in-progress" | "complete" | "pr-reviewed" | "cba-half-complete" | "smoke-tested" | undefined;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
        dependencies?: number[] | undefined;
        plan?: string | null | undefined;
        branch?: string | null | undefined;
        pr_url?: string | null | undefined;
        proofUnits?: {
            number: number;
            title: string;
            expectedBehavior: string;
            proofType: "smoke-command" | "manual-script" | "registry-diff" | "api-check" | "ui-check";
            exactCommand: string;
            expectedInitialFailure: string;
            expectedPassingEvidence: string;
            waiverGuidance?: string | undefined;
        }[] | undefined;
        objective?: {
            statement: string;
            successCriteria: string[];
            nonGoals: string[];
            proofMap: Record<string, unknown>;
            stopConditions?: string[] | undefined;
        } | undefined;
        created_at?: string | undefined;
        completed_at?: string | null | undefined;
    }[];
}>;
