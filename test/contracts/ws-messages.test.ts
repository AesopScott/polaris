import { describe, it, expect } from 'vitest';
import {
  LaunchMessage,
  ResumeMessage,
  StopMessage,
  CloseSessionMessage,
  RenameSessionMessage,
  TransferSessionMessage,
  SessionHeightMessage,
  SessionColumnMessage,
  SessionColumnSpanMessage,
  SessionPinnedMessage,
  UserQuestionAnswerMessage,
  CrossCheckDecisionMessage,
  CrossCheckPostHocDecisionMessage,
  InstallerPermissionDecisionMessage,
  DeleteQueueMessageMessage,
  EditQueueMessageMessage,
  CostUpdateMessage,
  AddBacklogTaskMessage,
  UpdateBacklogTaskMessage,
  UpdateBacklogTaskStatusMessage,
  ArchiveBacklogTasksMessage,
  TestApiKeyMessage,
  AnyClientMessage,
} from '../../src/contracts/ws-messages';

// ─── LaunchMessage ────────────────────────────────────────────────────────────

describe('LaunchMessage', () => {
  it('accepts a minimal agent launch', () => {
    const result = LaunchMessage.safeParse({ type: 'launch' });
    expect(result.success).toBe(true);
  });

  it('accepts a full launch-chat with all optional fields', () => {
    const result = LaunchMessage.safeParse({
      type: 'launch-chat',
      sessionTitle: 'Test session',
      projectName: 'Polaris',
      agent: 'claude',
      model: 'claude-sonnet-4-6',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown launch type', () => {
    const result = LaunchMessage.safeParse({ type: 'launch-unknown' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.errors)).toMatch(/invalid_enum_value|Invalid enum/i);
  });

  it('rejects a message with no type', () => {
    const result = LaunchMessage.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── ResumeMessage ────────────────────────────────────────────────────────────

describe('ResumeMessage', () => {
  it('accepts valid resume', () => {
    const result = ResumeMessage.safeParse({ type: 'resume', sessionId: 'abc-123' });
    expect(result.success).toBe(true);
  });

  it('rejects resume with missing sessionId', () => {
    const result = ResumeMessage.safeParse({ type: 'resume' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('sessionId');
  });

  it('rejects wrong type literal', () => {
    const result = ResumeMessage.safeParse({ type: 'reopen', sessionId: 'abc-123' });
    expect(result.success).toBe(false);
  });
});

// ─── StopMessage ─────────────────────────────────────────────────────────────

describe('StopMessage', () => {
  it('accepts valid stop', () => {
    const result = StopMessage.safeParse({ type: 'stop', sessionId: 'abc-123' });
    expect(result.success).toBe(true);
  });

  it('rejects missing sessionId', () => {
    const result = StopMessage.safeParse({ type: 'stop' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('sessionId');
  });
});

// ─── CloseSessionMessage ──────────────────────────────────────────────────────

describe('CloseSessionMessage', () => {
  it('accepts without optional status', () => {
    const result = CloseSessionMessage.safeParse({ type: 'close-session', sessionId: 's1' });
    expect(result.success).toBe(true);
  });

  it('accepts with optional status', () => {
    const result = CloseSessionMessage.safeParse({
      type: 'close-session',
      sessionId: 's1',
      status: 'done',
    });
    expect(result.success).toBe(true);
  });
});

// ─── RenameSessionMessage ─────────────────────────────────────────────────────

describe('RenameSessionMessage', () => {
  it('accepts valid rename', () => {
    const result = RenameSessionMessage.safeParse({
      type: 'rename-session',
      sessionId: 's1',
      newName: 'My Session',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing newName', () => {
    const result = RenameSessionMessage.safeParse({ type: 'rename-session', sessionId: 's1' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('newName');
  });
});

// ─── TransferSessionMessage ───────────────────────────────────────────────────

describe('TransferSessionMessage', () => {
  it('accepts valid transfer', () => {
    const result = TransferSessionMessage.safeParse({
      type: 'transfer-session',
      sessionId: 's1',
      targetProject: 'Polaris',
    });
    expect(result.success).toBe(true);
  });
});

// ─── Session UI State ─────────────────────────────────────────────────────────

describe('SessionHeightMessage', () => {
  it('accepts valid height', () => {
    const result = SessionHeightMessage.safeParse({
      type: 'session-height',
      sessionId: 's1',
      height: 400,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-numeric height', () => {
    const result = SessionHeightMessage.safeParse({
      type: 'session-height',
      sessionId: 's1',
      height: 'tall',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('height');
  });
});

describe('SessionColumnMessage', () => {
  it('accepts valid integer column', () => {
    const result = SessionColumnMessage.safeParse({
      type: 'session-column',
      sessionId: 's1',
      column: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null column (reset path)', () => {
    const result = SessionColumnMessage.safeParse({
      type: 'session-column',
      sessionId: 's1',
      column: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer column', () => {
    const result = SessionColumnMessage.safeParse({
      type: 'session-column',
      sessionId: 's1',
      column: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('SessionColumnSpanMessage', () => {
  it('accepts valid integer columnSpan', () => {
    const result = SessionColumnSpanMessage.safeParse({
      type: 'session-column-span',
      sessionId: 's1',
      columnSpan: 2,
    });
    expect(result.success).toBe(true);
  });
});

describe('SessionPinnedMessage', () => {
  it('accepts pinned=true', () => {
    const result = SessionPinnedMessage.safeParse({
      type: 'session-pinned',
      sessionId: 's1',
      pinned: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean pinned', () => {
    const result = SessionPinnedMessage.safeParse({
      type: 'session-pinned',
      sessionId: 's1',
      pinned: 'yes',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('pinned');
  });
});

// ─── Agent Interaction ────────────────────────────────────────────────────────

describe('UserQuestionAnswerMessage', () => {
  it('accepts valid answer', () => {
    const result = UserQuestionAnswerMessage.safeParse({
      type: 'user-question-answer',
      questionId: 'q1',
      answer: 'option A',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing answer', () => {
    const result = UserQuestionAnswerMessage.safeParse({
      type: 'user-question-answer',
      questionId: 'q1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('answer');
  });
});

describe('CrossCheckDecisionMessage', () => {
  it('accepts approve without reason', () => {
    const result = CrossCheckDecisionMessage.safeParse({
      type: 'cross-check-decision',
      checkId: 'cc1',
      decision: 'approve',
    });
    expect(result.success).toBe(true);
  });

  it('accepts reject with reason', () => {
    const result = CrossCheckDecisionMessage.safeParse({
      type: 'cross-check-decision',
      checkId: 'cc1',
      decision: 'reject',
      reason: 'Looks risky',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid decision value', () => {
    const result = CrossCheckDecisionMessage.safeParse({
      type: 'cross-check-decision',
      checkId: 'cc1',
      decision: 'maybe',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('decision');
  });
});

describe('CrossCheckPostHocDecisionMessage', () => {
  it('accepts valid post-hoc decision', () => {
    const result = CrossCheckPostHocDecisionMessage.safeParse({
      type: 'cross-check-post-hoc-decision',
      checkId: 'cc1',
      decision: 'approve',
    });
    expect(result.success).toBe(true);
  });
});

describe('InstallerPermissionDecisionMessage', () => {
  it('accepts allow decision', () => {
    const result = InstallerPermissionDecisionMessage.safeParse({
      type: 'installer-permission-decision',
      checkId: 'perm1',
      decision: 'allow',
    });
    expect(result.success).toBe(true);
  });

  it('accepts deny decision', () => {
    const result = InstallerPermissionDecisionMessage.safeParse({
      type: 'installer-permission-decision',
      checkId: 'perm1',
      decision: 'deny',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown decision value', () => {
    const result = InstallerPermissionDecisionMessage.safeParse({
      type: 'installer-permission-decision',
      checkId: 'perm1',
      decision: 'skip',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('decision');
  });
});

// ─── Queue & Message Editing ──────────────────────────────────────────────────

describe('DeleteQueueMessageMessage', () => {
  it('accepts valid delete', () => {
    const result = DeleteQueueMessageMessage.safeParse({
      type: 'delete-queue-message',
      sessionId: 's1',
      queueType: 'steering',
      index: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing queue index', () => {
    const result = DeleteQueueMessageMessage.safeParse({
      type: 'delete-queue-message',
      sessionId: 's1',
      queueType: 'steering',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('index');
  });
});

describe('EditQueueMessageMessage', () => {
  it('accepts valid edit', () => {
    const result = EditQueueMessageMessage.safeParse({
      type: 'edit-queue-message',
      sessionId: 's1',
      queueType: 'steering',
      index: 0,
      prompt: 'Updated content',
    });
    expect(result.success).toBe(true);
  });
});

// ─── Cost ────────────────────────────────────────────────────────────────────

describe('CostUpdateMessage', () => {
  it('accepts valid cost', () => {
    const result = CostUpdateMessage.safeParse({
      type: 'cost-update',
      sessionId: 's1',
      totalCost: 0.0023,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-numeric cost', () => {
    const result = CostUpdateMessage.safeParse({
      type: 'cost-update',
      sessionId: 's1',
      totalCost: 'free',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('totalCost');
  });
});

// ─── Backlog messages ─────────────────────────────────────────────────────────

describe('AddBacklogTaskMessage', () => {
  it('accepts minimal task', () => {
    const result = AddBacklogTaskMessage.safeParse({
      type: 'add-backlog-task',
      scope: 'Polaris',
      task: { title: 'Fix the thing' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts full task with all optional fields', () => {
    const result = AddBacklogTaskMessage.safeParse({
      type: 'add-backlog-task',
      scope: 'Polaris',
      task: {
        title: 'Full task',
        description: 'A description',
        priority: 80,
        category: 'feature',
        impact: 'standard',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid impact value', () => {
    const result = AddBacklogTaskMessage.safeParse({
      type: 'add-backlog-task',
      scope: 'Polaris',
      task: { title: 'Task', impact: 'enormous' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('impact');
  });

  it('rejects missing title', () => {
    const result = AddBacklogTaskMessage.safeParse({
      type: 'add-backlog-task',
      scope: 'Polaris',
      task: {},
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('title');
  });
});

describe('UpdateBacklogTaskMessage', () => {
  it('accepts valid update', () => {
    const result = UpdateBacklogTaskMessage.safeParse({
      type: 'update-backlog-task',
      scope: 'Polaris',
      taskNumber: 10,
      updates: { priority: 90 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-positive taskNumber', () => {
    const result = UpdateBacklogTaskMessage.safeParse({
      type: 'update-backlog-task',
      scope: 'Polaris',
      taskNumber: 0,
      updates: {},
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('taskNumber');
  });

  it('rejects non-integer taskNumber', () => {
    const result = UpdateBacklogTaskMessage.safeParse({
      type: 'update-backlog-task',
      scope: 'Polaris',
      taskNumber: 1.5,
      updates: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateBacklogTaskStatusMessage', () => {
  it('accepts valid status update', () => {
    const result = UpdateBacklogTaskStatusMessage.safeParse({
      type: 'update-backlog-task-status',
      scope: 'Polaris',
      taskNumber: 5,
      status: 'build-started',
    });
    expect(result.success).toBe(true);
  });
});

describe('ArchiveBacklogTasksMessage', () => {
  it('accepts valid archive request', () => {
    const result = ArchiveBacklogTasksMessage.safeParse({
      type: 'archive-backlog-tasks',
      scope: 'Polaris',
      taskNumbers: [1, 2, 3],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer task numbers', () => {
    const result = ArchiveBacklogTasksMessage.safeParse({
      type: 'archive-backlog-tasks',
      scope: 'Polaris',
      taskNumbers: [1.5],
    });
    expect(result.success).toBe(false);
  });
});

// ─── API Key test messages ────────────────────────────────────────────────────

describe('TestApiKeyMessage', () => {
  it('accepts test-openrouter-key', () => {
    const result = TestApiKeyMessage.safeParse({
      type: 'test-openrouter-key',
      apiKey: 'sk-or-abc123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts test-routine-api-model with optional model', () => {
    const result = TestApiKeyMessage.safeParse({
      type: 'test-routine-api-model',
      apiKey: 'sk-abc',
      model: 'deepseek-chat',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown api key type', () => {
    const result = TestApiKeyMessage.safeParse({
      type: 'test-unknown-key',
      apiKey: 'sk-abc',
    });
    expect(result.success).toBe(false);
  });
});

// ─── AnyClientMessage discriminated union ─────────────────────────────────────

describe('AnyClientMessage discriminated union', () => {
  it('routes launch message correctly', () => {
    const result = AnyClientMessage.safeParse({ type: 'launch', model: 'claude-sonnet-4-6' });
    expect(result.success).toBe(true);
  });

  it('routes cross-check-decision correctly', () => {
    const result = AnyClientMessage.safeParse({
      type: 'cross-check-decision',
      checkId: 'cc1',
      decision: 'reject',
      reason: 'Bad idea',
    });
    expect(result.success).toBe(true);
  });

  it('rejects completely unknown type', () => {
    const result = AnyClientMessage.safeParse({ type: 'do-something-weird' });
    expect(result.success).toBe(false);
  });

  it('gives a descriptive error on unknown type', () => {
    const result = AnyClientMessage.safeParse({ type: 'do-something-weird' });
    expect(result.success).toBe(false);
    const errorStr = JSON.stringify(result.error?.errors);
    // should mention the type field
    expect(errorStr).toMatch(/type/i);
  });
});
