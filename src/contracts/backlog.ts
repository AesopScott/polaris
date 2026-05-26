import { z } from 'zod';

export const ImpactEnum = z.enum(['minor', 'standard', 'major']);
export type ImpactType = z.infer<typeof ImpactEnum>;

export const BacklogStatus = z.enum([
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

export type BacklogStatusType = z.infer<typeof BacklogStatus>;

export const ProofUnit = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  expectedBehavior: z.string(),
  proofType: z.enum(['smoke-command', 'manual-script', 'registry-diff', 'api-check', 'ui-check']),
  exactCommand: z.string(),
  expectedInitialFailure: z.string(),
  expectedPassingEvidence: z.string(),
  waiverGuidance: z.string().optional(),
});

export const ObjectiveCriteria = z.object({
  statement: z.string(),
  successCriteria: z.array(z.string()),
  nonGoals: z.array(z.string()),
  proofMap: z.record(z.string(), z.unknown()),
  stopConditions: z.array(z.string()).optional(),
});

export const BacklogTask = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.number().optional(),
  impact: z.enum(['minor', 'standard', 'major']).optional(),
  status: BacklogStatus.optional(),
  dependencies: z.array(z.number()).optional(),
  plan: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  pr_url: z.string().nullable().optional(),
  proofUnits: z.array(ProofUnit).optional(),
  objective: ObjectiveCriteria.optional(),
  created_at: z.string().optional(),
  completed_at: z.string().nullable().optional(),
});

export type BacklogTaskType = z.infer<typeof BacklogTask>;

export const BacklogFile = z.object({
  tasks: z.array(BacklogTask),
});
