import { describe, expect, it } from 'vitest';
import { BUILDER_KERNEL_VERSION, createBuilderKernel } from '../../src/runtime/builderKernel';

describe('createBuilderKernel', () => {
  it('identifies rough app requests as build intent with a blueprint recommendation', () => {
    const kernel = createBuilderKernel({
      rawUserRequest: 'I want to build a small dashboard app for tracking agent work.',
    });

    expect(BUILDER_KERNEL_VERSION).toBe('0.1.0-readonly');
    expect(kernel.objective.inferredBuildIntent).toBe('build application');
    expect(kernel.objective.productShape).toBe('operational dashboard');
    expect(kernel.recommendedActions.map((action) => action.action)).toContain('draft_app_blueprint');
    expect(kernel.objective.successCriteria).toContain('First useful workflow or screen is identified.');
  });

  it('plans browser verification for user-facing build requests', () => {
    const kernel = createBuilderKernel({
      rawUserRequest: 'Create a frontend screen for reviewing memories.',
    });

    const browserAction = kernel.recommendedActions.find((action) => action.action === 'plan_browser_verification');
    expect(browserAction).toBeDefined();
    expect(browserAction?.requiredEvidence).toContain('Browser check or screenshot');
  });

  it('flags dirty workspaces before recommending write-capable work', () => {
    const kernel = createBuilderKernel({
      rawUserRequest: 'Build an app scaffold for a new tool.',
      workspace: {
        branch: 'main',
        dirtyFiles: ['server.js'],
      },
    });

    expect(kernel.objective.riskLevel).toBe('high');
    expect(kernel.policies.triggered).toContain('Do not overwrite user changes.');
    expect(kernel.recommendedActions[0].action).toBe('inspect_dirty_workspace');
  });

  it('treats planned tasks as candidates for the legacy start-build harness', () => {
    const kernel = createBuilderKernel({
      rawUserRequest: 'Build the planned memory editing UI.',
      projectState: {
        activeTask: 52,
        taskStatus: 'planned',
        proofUnits: [{ number: 1 }],
      },
    });

    expect(kernel.recommendedActions.map((action) => action.action)).toContain('consider_legacy_start_build');
  });

  it('extracts applicable process patterns from memory signals', () => {
    const kernel = createBuilderKernel({
      rawUserRequest: 'Build a website.',
      memories: [
        { id: 'm1', type: 'pattern', content: 'For frontend work, always run browser verification.', score: 1.5 },
        { id: 'm2', type: 'fact', content: 'The app uses Electron.', score: 0.8 },
      ],
    });

    expect(kernel.memory.applicablePatterns).toEqual([
      'For frontend work, always run browser verification.',
    ]);
  });

  it('creates a decision journal draft from the primary recommendation', () => {
    const kernel = createBuilderKernel({
      rawUserRequest: 'Review the current orchestration design.',
    });

    expect(kernel.decisionJournalDraft.nextAction).toBe(kernel.recommendedActions[0].action);
    expect(kernel.decisionJournalDraft.why.length).toBeGreaterThan(0);
    expect(kernel.decisionJournalDraft.evidenceNeeded.length).toBeGreaterThan(0);
  });
});
