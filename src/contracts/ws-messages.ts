import { z } from 'zod';

// ─── Base ─────────────────────────────────────────────────────────────────────

const WebSocketMessage = z.object({ type: z.string() }).passthrough();

// ─── Session & Launch ────────────────────────────────────────────────────────

export const LaunchMessage = WebSocketMessage.extend({
  type: z.enum(['launch', 'launch-chat', 'launch-gpt', 'launch-codex']),
  sessionTitle: z.string().optional(),
  projectName: z.string().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
});

export const ResumeMessage = WebSocketMessage.extend({
  type: z.literal('resume'),
  sessionId: z.string(),
});

export const StopMessage = WebSocketMessage.extend({
  type: z.literal('stop'),
  sessionId: z.string(),
});

export const CloseSessionMessage = WebSocketMessage.extend({
  type: z.literal('close-session'),
  sessionId: z.string(),
  status: z.string().optional(),
});

export const RenameSessionMessage = WebSocketMessage.extend({
  type: z.literal('rename-session'),
  sessionId: z.string(),
  newName: z.string(),
});

export const TransferSessionMessage = WebSocketMessage.extend({
  type: z.literal('transfer-session'),
  sessionId: z.string(),
  targetProject: z.string(),
});

// ─── Session UI State ────────────────────────────────────────────────────────

export const SessionHeightMessage = WebSocketMessage.extend({
  type: z.literal('session-height'),
  sessionId: z.string(),
  height: z.number().nullable(),
});

export const SessionColumnMessage = WebSocketMessage.extend({
  type: z.literal('session-column'),
  sessionId: z.string(),
  column: z.number().int().nullable(),
});

export const SessionColumnSpanMessage = WebSocketMessage.extend({
  type: z.literal('session-column-span'),
  sessionId: z.string(),
  columnSpan: z.number().int(),
});

export const SessionPinnedMessage = WebSocketMessage.extend({
  type: z.literal('session-pinned'),
  sessionId: z.string(),
  pinned: z.boolean(),
});

// ─── Agent Interaction ───────────────────────────────────────────────────────

export const UserQuestionAnswerMessage = WebSocketMessage.extend({
  type: z.literal('user-question-answer'),
  questionId: z.string(),
  answer: z.string(),
});

export const CrossCheckDecisionMessage = WebSocketMessage.extend({
  type: z.literal('cross-check-decision'),
  checkId: z.string(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

export const CrossCheckPostHocDecisionMessage = WebSocketMessage.extend({
  type: z.literal('cross-check-post-hoc-decision'),
  checkId: z.string(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

export const InstallerPermissionDecisionMessage = WebSocketMessage.extend({
  type: z.literal('installer-permission-decision'),
  checkId: z.string(),
  decision: z.enum(['allow', 'deny']),
});

// ─── Queue & Message Editing ─────────────────────────────────────────────────

export const DeleteQueueMessageMessage = WebSocketMessage.extend({
  type: z.literal('delete-queue-message'),
  sessionId: z.string(),
  queueType: z.string(),
  index: z.number().int(),
});

export const EditQueueMessageMessage = WebSocketMessage.extend({
  type: z.literal('edit-queue-message'),
  sessionId: z.string(),
  queueType: z.string(),
  index: z.number().int(),
  prompt: z.string().optional(),
  displayPrompt: z.string().optional(),
});

// ─── Cost & Metrics ──────────────────────────────────────────────────────────

export const CostUpdateMessage = WebSocketMessage.extend({
  type: z.literal('cost-update'),
  sessionId: z.string(),
  totalCost: z.number(),
});

// ─── Backlog ─────────────────────────────────────────────────────────────────

export const ListBacklogsMessage = WebSocketMessage.extend({
  type: z.literal('list-backlogs'),
});

export const BacklogsDataMessage = WebSocketMessage.extend({
  type: z.literal('backlogs-data'),
  global: z.array(z.record(z.string(), z.unknown())),
  projects: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  archive: z.array(z.record(z.string(), z.unknown())),
});

export const BacklogErrorMessage = WebSocketMessage.extend({
  type: z.literal('backlog-error'),
  error: z.string(),
});

export const AddBacklogTaskMessage = WebSocketMessage.extend({
  type: z.literal('add-backlog-task'),
  scope: z.string(),
  task: z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.number().optional(),
    category: z.string().optional(),
    impact: z.enum(['minor', 'standard', 'major']).optional(),
  }),
});

export const UpdateBacklogTaskMessage = WebSocketMessage.extend({
  type: z.literal('update-backlog-task'),
  scope: z.string(),
  taskNumber: z.number().int().positive(),
  updates: z.record(z.string(), z.unknown()),
});

export const UpdateBacklogTaskStatusMessage = WebSocketMessage.extend({
  type: z.literal('update-backlog-task-status'),
  scope: z.string(),
  taskNumber: z.number().int().positive(),
  status: z.string(),
});

export const ArchiveBacklogTasksMessage = WebSocketMessage.extend({
  type: z.literal('archive-backlog-tasks'),
  scope: z.string(),
  taskNumbers: z.array(z.number().int().positive()),
});

// ─── Skills & History ────────────────────────────────────────────────────────

export const ListSkillsMessage = WebSocketMessage.extend({
  type: z.literal('list-skills'),
});

export const GetHistoryMessage = WebSocketMessage.extend({
  type: z.literal('get-history'),
  sessionId: z.string().optional(),
});

// ─── Debug & Logging ─────────────────────────────────────────────────────────

export const EmitDebugLogMessage = WebSocketMessage.extend({
  type: z.literal('emit-debug-log'),
  message: z.string(),
  isError: z.boolean().optional(),
});

export const DebugLogMessage = WebSocketMessage.extend({
  type: z.literal('debug-log'),
  message: z.string(),
  isError: z.boolean().optional(),
});

// ─── Routine Notifications ───────────────────────────────────────────────────

export const DismissRoutineNotificationMessage = WebSocketMessage.extend({
  type: z.literal('dismiss-routine-notification'),
  id: z.string(),
});

export const GetRoutineNotificationsMessage = WebSocketMessage.extend({
  type: z.literal('get-routine-notifications'),
});

// ─── Domain Scout ────────────────────────────────────────────────────────────

export const DomainScoutMessage = WebSocketMessage.extend({
  type: z.literal('domain-scout'),
});

export const DomainScoutClearMessage = WebSocketMessage.extend({
  type: z.literal('domain-scout-clear'),
});

// ─── Config & Manifest ───────────────────────────────────────────────────────

export const GetConfigMessage = WebSocketMessage.extend({
  type: z.literal('get-config'),
});

export const GetManifestMessage = WebSocketMessage.extend({
  type: z.literal('get-manifest'),
});

export const SaveManifestMessage = WebSocketMessage.extend({
  type: z.literal('save-manifest'),
  manifest: z.unknown(),
});

export const SaveConfigMessage = WebSocketMessage.extend({
  type: z.literal('save-config'),
  config: z.unknown(),
});

// ─── API Key Tests ───────────────────────────────────────────────────────────

export const TestApiKeyMessage = WebSocketMessage.extend({
  type: z.enum([
    'test-openrouter-key',
    'test-anthropic-key',
    'test-openai-key',
    'test-elevenlabs-key',
    'test-brave-key',
    'test-deepseek-key',
    'test-routine-api-model',
  ]),
  apiKey: z.string(),
  model: z.string().optional(),
});

// ─── Model Testing ───────────────────────────────────────────────────────────

export const TestModelMessage = WebSocketMessage.extend({
  type: z.literal('test-model'),
  model: z.string(),
  tier: z.string().optional(),
  provider: z.string().nullable().optional(),
});

// ─── Agent Eval ──────────────────────────────────────────────────────────────

export const AgentEvalLoadQueueMessage = WebSocketMessage.extend({
  type: z.literal('agent-eval-load-queue'),
});

export const StartAgentEvalMessage = WebSocketMessage.extend({
  type: z.literal('start-agent-eval'),
  models: z.array(z.unknown()),
  fixtures: z.array(z.string()).optional(),
  runs: z.union([z.number(), z.string()]).optional(),
});

export const CancelAgentEvalMessage = WebSocketMessage.extend({
  type: z.literal('cancel-agent-eval'),
});

export const SaveAgentEvalResultsMessage = WebSocketMessage.extend({
  type: z.literal('save-agent-eval-results'),
  results: z.unknown(),
});

// ─── Build ───────────────────────────────────────────────────────────────────

export const GetPendingBuildsMessage = WebSocketMessage.extend({
  type: z.literal('get-pending-builds'),
});

export const RunPreBuildCheckMessage = WebSocketMessage.extend({
  type: z.literal('run-pre-build-check'),
  projectPath: z.string().optional(),
});

export const GetPreBuildCheckStatusMessage = WebSocketMessage.extend({
  type: z.literal('get-pre-build-check-status'),
  checkId: z.string().optional(),
});

export const RunBuildMessage = WebSocketMessage.extend({
  type: z.literal('run-build'),
  sourcePath: z.string().optional(),
  projectName: z.string().optional(),
  buildType: z.string().optional(),
  skipCheck: z.boolean().optional(),
});

// ─── Benchmark ───────────────────────────────────────────────────────────────

export const BenchmarkLoadQueueMessage = WebSocketMessage.extend({
  type: z.literal('benchmark-load-queue'),
});

export const BenchmarkSaveResultMessage = WebSocketMessage.extend({
  type: z.literal('benchmark-save-result'),
  model: z.string(),
  provider: z.string().nullable().optional(),
  ttft: z.number(),
  tps: z.number(),
  tokens: z.number(),
  totalMs: z.number(),
});

// ─── Space ───────────────────────────────────────────────────────────────────

export const GetSpaceDataMessage = WebSocketMessage.extend({
  type: z.literal('get-space-data'),
});

export const GetSpaceAnalysisMessage = WebSocketMessage.extend({
  type: z.literal('get-space-analysis'),
  filter: z.string().optional(),
});

// ─── Panel State ─────────────────────────────────────────────────────────────

export const SavePanelStateMessage = WebSocketMessage.extend({
  type: z.literal('save-panel-state'),
  panelState: z.unknown(),
});

export const SaveHiddenSessionsMessage = WebSocketMessage.extend({
  type: z.literal('save-hidden-sessions'),
  hiddenSessions: z.array(z.string()),
});

// ─── Project & Routine ───────────────────────────────────────────────────────

export const UpsertProjectMessage = WebSocketMessage.extend({
  type: z.literal('upsert-project'),
  project: z.unknown(),
});

export const DeleteProjectMessage = WebSocketMessage.extend({
  type: z.literal('delete-project'),
  name: z.string(),
});

export const UpsertRoutineMessage = WebSocketMessage.extend({
  type: z.literal('upsert-routine'),
  routine: z.unknown(),
});

export const DeleteRoutineMessage = WebSocketMessage.extend({
  type: z.literal('delete-routine'),
  name: z.string(),
});

// ─── Utility ─────────────────────────────────────────────────────────────────

export const RefreshOpenrouterCatalogMessage = WebSocketMessage.extend({
  type: z.literal('refresh-openrouter-catalog'),
});

export const CheckOpenrouterBalanceMessage = WebSocketMessage.extend({
  type: z.literal('check-openrouter-balance'),
  apiKey: z.string().optional(),
});

export const CheckDeepseekBalanceMessage = WebSocketMessage.extend({
  type: z.literal('check-deepseek-balance'),
  apiKey: z.string().optional(),
});

export const OpenUrlMessage = WebSocketMessage.extend({
  type: z.literal('open-url'),
  url: z.string(),
});

export const LaunchExternalAppMessage = WebSocketMessage.extend({
  type: z.enum(['launch-thecard', 'launch-diamond', 'launch-design', 'launch-factory']),
});

export const TtsSpeakMessage = WebSocketMessage.extend({
  type: z.literal('tts-speak'),
  text: z.string(),
  voice: z.string().optional(),
});

export const GetDiagMessage = WebSocketMessage.extend({
  type: z.literal('get-diag'),
});

export const GetTokenLogMessage = WebSocketMessage.extend({
  type: z.literal('get-token-log'),
  sessionId: z.string().optional(),
  days: z.number().int().positive().optional(),
});

// ─── Live Server ─────────────────────────────────────────────────────────────

export const StartLiveServerMessage = WebSocketMessage.extend({
  type: z.literal('start-live-server'),
  port: z.number().int().positive().optional(),
});

export const StopLiveServerMessage = WebSocketMessage.extend({
  type: z.literal('stop-live-server'),
});

export const GetLiveServerStatusMessage = WebSocketMessage.extend({
  type: z.literal('get-live-server-status'),
});

// ─── Union discriminator ─────────────────────────────────────────────────────

export const AnyClientMessage = z.discriminatedUnion('type', [
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
  ListBacklogsMessage,
  AddBacklogTaskMessage,
  UpdateBacklogTaskMessage,
  UpdateBacklogTaskStatusMessage,
  ArchiveBacklogTasksMessage,
  ListSkillsMessage,
  GetHistoryMessage,
  EmitDebugLogMessage,
  DismissRoutineNotificationMessage,
  GetRoutineNotificationsMessage,
  DomainScoutMessage,
  DomainScoutClearMessage,
  GetConfigMessage,
  GetManifestMessage,
  SaveManifestMessage,
  SaveConfigMessage,
  AgentEvalLoadQueueMessage,
  StartAgentEvalMessage,
  CancelAgentEvalMessage,
  SaveAgentEvalResultsMessage,
  GetPendingBuildsMessage,
  RunPreBuildCheckMessage,
  GetPreBuildCheckStatusMessage,
  RunBuildMessage,
  BenchmarkLoadQueueMessage,
  BenchmarkSaveResultMessage,
  GetSpaceDataMessage,
  GetSpaceAnalysisMessage,
  SavePanelStateMessage,
  SaveHiddenSessionsMessage,
  UpsertProjectMessage,
  DeleteProjectMessage,
  UpsertRoutineMessage,
  DeleteRoutineMessage,
  RefreshOpenrouterCatalogMessage,
  CheckOpenrouterBalanceMessage,
  CheckDeepseekBalanceMessage,
  OpenUrlMessage,
  LaunchExternalAppMessage,
  TestApiKeyMessage,
  TestModelMessage,
  TtsSpeakMessage,
  GetDiagMessage,
  GetTokenLogMessage,
  StartLiveServerMessage,
  StopLiveServerMessage,
  GetLiveServerStatusMessage,
]);
