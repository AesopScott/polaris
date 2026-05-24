import { describe, it, expect } from 'vitest';
import {
  BacklogStatus,
  ProofUnit,
  ObjectiveCriteria,
  BacklogTask,
  BacklogFile,
} from '../../src/contracts/backlog';

// ─── BacklogStatus ────────────────────────────────────────────────────────────

describe('BacklogStatus', () => {
  const validStatuses = [
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
    // legacy
    'ready',
    'in-progress',
    'complete',
    'pr-reviewed',
    'cba-half-complete',
    'smoke-tested',
  ] as const;

  it.each(validStatuses)('accepts status "%s"', (status) => {
    const result = BacklogStatus.safeParse(status);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status string', () => {
    const result = BacklogStatus.safeParse('in-review');
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].code).toBe('invalid_enum_value');
  });

  it('rejects a numeric status', () => {
    const result = BacklogStatus.safeParse(1);
    expect(result.success).toBe(false);
  });
});

// ─── ProofUnit ────────────────────────────────────────────────────────────────

describe('ProofUnit', () => {
  const validProofUnit = {
    number: 1,
    title: 'Server returns 200',
    expectedBehavior: 'GET /health returns HTTP 200',
    proofType: 'smoke-command' as const,
    exactCommand: 'curl -s http://localhost:40000/health',
    expectedInitialFailure: 'Connection refused',
    expectedPassingEvidence: 'HTTP 200 with {"status":"ok"}',
  };

  it('accepts a valid proof unit', () => {
    const result = ProofUnit.safeParse(validProofUnit);
    expect(result.success).toBe(true);
  });

  it('accepts with optional waiverGuidance', () => {
    const result = ProofUnit.safeParse({ ...validProofUnit, waiverGuidance: 'Skip in CI' });
    expect(result.success).toBe(true);
  });

  it('rejects non-positive proof unit number', () => {
    const result = ProofUnit.safeParse({ ...validProofUnit, number: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('number');
  });

  it('rejects non-integer proof unit number', () => {
    const result = ProofUnit.safeParse({ ...validProofUnit, number: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid proofType', () => {
    const result = ProofUnit.safeParse({ ...validProofUnit, proofType: 'vibe-check' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('proofType');
  });

  it('rejects missing required fields', () => {
    const { exactCommand: _, ...incomplete } = validProofUnit;
    const result = ProofUnit.safeParse(incomplete);
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('exactCommand');
  });
});

// ─── ObjectiveCriteria ────────────────────────────────────────────────────────

describe('ObjectiveCriteria', () => {
  const validObjective = {
    statement: 'Build a contract test suite',
    successCriteria: ['Tests pass for all four modules'],
    nonGoals: ['E2E integration tests'],
    proofMap: { 'Tests pass for all four modules': 1 },
  };

  it('accepts valid objective criteria', () => {
    const result = ObjectiveCriteria.safeParse(validObjective);
    expect(result.success).toBe(true);
  });

  it('accepts with optional stopConditions', () => {
    const result = ObjectiveCriteria.safeParse({
      ...validObjective,
      stopConditions: ['Vitest cannot import src/contracts/'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing statement', () => {
    const { statement: _, ...rest } = validObjective;
    const result = ObjectiveCriteria.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('statement');
  });

  it('rejects non-array successCriteria', () => {
    const result = ObjectiveCriteria.safeParse({
      ...validObjective,
      successCriteria: 'pass everything',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('successCriteria');
  });
});

// ─── BacklogTask ──────────────────────────────────────────────────────────────

describe('BacklogTask', () => {
  const minimalTask = {
    number: 40,
    title: 'Contract test suite',
  };

  const fullTask = {
    number: 40,
    title: 'Contract test suite: validate real payload samples',
    description: 'Write test/contracts/ test files.',
    category: 'test',
    priority: 88,
    impact: 'minor' as const,
    status: 'build-started' as const,
    dependencies: [37],
    plan: 'Install vitest, write 4 test files',
    branch: 'task/40-contract-test-suite-validate-real-payload-s',
    pr_url: null,
    proofUnits: [],
    created_at: '2026-05-23',
    completed_at: null,
  };

  it('accepts a minimal task with only number and title', () => {
    const result = BacklogTask.safeParse(minimalTask);
    expect(result.success).toBe(true);
  });

  it('accepts a fully populated task', () => {
    const result = BacklogTask.safeParse(fullTask);
    expect(result.success).toBe(true);
  });

  it('accepts a task with objective criteria', () => {
    const result = BacklogTask.safeParse({
      ...fullTask,
      objective: {
        statement: 'Build test suite',
        successCriteria: ['All tests pass'],
        nonGoals: ['E2E'],
        proofMap: { 'All tests pass': 1 },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-positive task number', () => {
    const result = BacklogTask.safeParse({ ...minimalTask, number: -1 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('number');
  });

  it('rejects non-integer task number', () => {
    const result = BacklogTask.safeParse({ ...minimalTask, number: 40.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = BacklogTask.safeParse({ number: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('title');
  });

  it('rejects invalid status enum', () => {
    const result = BacklogTask.safeParse({ ...minimalTask, status: 'in-review' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('status');
  });

  it('rejects invalid impact value', () => {
    const result = BacklogTask.safeParse({ ...minimalTask, impact: 'huge' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('impact');
  });

  it('accepts all valid impact values', () => {
    for (const impact of ['minor', 'standard', 'major'] as const) {
      const result = BacklogTask.safeParse({ ...minimalTask, impact });
      expect(result.success).toBe(true);
    }
  });

  it('accepts dependencies as an array of numbers', () => {
    const result = BacklogTask.safeParse({ ...minimalTask, dependencies: [37, 38] });
    expect(result.success).toBe(true);
  });

  it('rejects dependencies containing a non-number', () => {
    const result = BacklogTask.safeParse({ ...minimalTask, dependencies: ['37'] });
    expect(result.success).toBe(false);
  });
});

// ─── BacklogFile ──────────────────────────────────────────────────────────────

describe('BacklogFile', () => {
  it('accepts empty task list', () => {
    const result = BacklogFile.safeParse({ tasks: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a file with multiple tasks', () => {
    const result = BacklogFile.safeParse({
      tasks: [
        { number: 1, title: 'Task one' },
        { number: 2, title: 'Task two', status: 'production' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing tasks array', () => {
    const result = BacklogFile.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('tasks');
  });

  it('rejects tasks as a non-array', () => {
    const result = BacklogFile.safeParse({ tasks: 'not an array' });
    expect(result.success).toBe(false);
  });

  it('rejects a task inside the array that has an invalid field', () => {
    const result = BacklogFile.safeParse({
      tasks: [{ number: 'not-a-number', title: 'Bad task' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('number');
  });
});
