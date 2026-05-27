"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetSpaceAnalysisMessage = exports.GetSpaceDataMessage = exports.BenchmarkSaveResultMessage = exports.BenchmarkLoadQueueMessage = exports.RunBuildMessage = exports.GetPreBuildCheckStatusMessage = exports.RunPreBuildCheckMessage = exports.GetPendingBuildsMessage = exports.SaveAgentEvalResultsMessage = exports.CancelAgentEvalMessage = exports.StartAgentEvalMessage = exports.AgentEvalLoadQueueMessage = exports.TestModelMessage = exports.TestApiKeyMessage = exports.SaveConfigMessage = exports.SaveManifestMessage = exports.GetManifestMessage = exports.GetConfigMessage = exports.DomainScoutClearMessage = exports.DomainScoutMessage = exports.GetRoutineNotificationsMessage = exports.DismissRoutineNotificationMessage = exports.DebugLogMessage = exports.EmitDebugLogMessage = exports.GetHistoryMessage = exports.ListSkillsMessage = exports.ArchiveBacklogTasksMessage = exports.UpdateBacklogTaskStatusMessage = exports.UpdateBacklogTaskMessage = exports.AddBacklogTaskMessage = exports.BacklogErrorMessage = exports.BacklogsDataMessage = exports.ListBacklogsMessage = exports.CostUpdateMessage = exports.EditQueueMessageMessage = exports.DeleteQueueMessageMessage = exports.InstallerPermissionDecisionMessage = exports.CrossCheckPostHocDecisionMessage = exports.CrossCheckDecisionMessage = exports.UserQuestionAnswerMessage = exports.SessionPinnedMessage = exports.SessionColumnSpanMessage = exports.SessionColumnMessage = exports.SessionHeightMessage = exports.TransferSessionMessage = exports.RenameSessionMessage = exports.CloseSessionMessage = exports.StopMessage = exports.ResumeMessage = exports.LaunchMessage = void 0;
exports.AnyClientMessage = exports.GetLiveServerStatusMessage = exports.StopLiveServerMessage = exports.StartLiveServerMessage = exports.GetTokenLogMessage = exports.GetDiagMessage = exports.TtsSpeakMessage = exports.LaunchExternalAppMessage = exports.OpenUrlMessage = exports.CheckDeepseekBalanceMessage = exports.CheckOpenrouterBalanceMessage = exports.RefreshOpenrouterCatalogMessage = exports.DeleteRoutineMessage = exports.UpsertRoutineMessage = exports.DeleteProjectMessage = exports.UpsertProjectMessage = exports.SaveHiddenSessionsMessage = exports.SavePanelStateMessage = void 0;
const zod_1 = require("zod");
// ─── Base ─────────────────────────────────────────────────────────────────────
const WebSocketMessage = zod_1.z.object({ type: zod_1.z.string() }).passthrough();
// ─── Session & Launch ────────────────────────────────────────────────────────
exports.LaunchMessage = WebSocketMessage.extend({
    type: zod_1.z.enum(['launch', 'launch-chat', 'launch-gpt', 'launch-codex']),
    sessionTitle: zod_1.z.string().optional(),
    projectName: zod_1.z.string().optional(),
    agent: zod_1.z.string().optional(),
    model: zod_1.z.string().optional(),
});
exports.ResumeMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('resume'),
    sessionId: zod_1.z.string(),
});
exports.StopMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('stop'),
    sessionId: zod_1.z.string(),
});
exports.CloseSessionMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('close-session'),
    sessionId: zod_1.z.string(),
    status: zod_1.z.string().optional(),
});
exports.RenameSessionMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('rename-session'),
    sessionId: zod_1.z.string(),
    newName: zod_1.z.string(),
});
exports.TransferSessionMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('transfer-session'),
    sessionId: zod_1.z.string(),
    targetProject: zod_1.z.string(),
});
// ─── Session UI State ────────────────────────────────────────────────────────
exports.SessionHeightMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('session-height'),
    sessionId: zod_1.z.string(),
    height: zod_1.z.number(),
});
exports.SessionColumnMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('session-column'),
    sessionId: zod_1.z.string(),
    column: zod_1.z.number().int(),
});
exports.SessionColumnSpanMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('session-column-span'),
    sessionId: zod_1.z.string(),
    span: zod_1.z.number().int(),
});
exports.SessionPinnedMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('session-pinned'),
    sessionId: zod_1.z.string(),
    pinned: zod_1.z.boolean(),
});
// ─── Agent Interaction ───────────────────────────────────────────────────────
exports.UserQuestionAnswerMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('user-question-answer'),
    sessionId: zod_1.z.string(),
    answer: zod_1.z.string(),
});
exports.CrossCheckDecisionMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('cross-check-decision'),
    sessionId: zod_1.z.string(),
    decision: zod_1.z.enum(['approve', 'reject']),
    reason: zod_1.z.string().optional(),
});
exports.CrossCheckPostHocDecisionMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('cross-check-post-hoc-decision'),
    sessionId: zod_1.z.string(),
    decision: zod_1.z.enum(['approve', 'reject']),
    reason: zod_1.z.string().optional(),
});
exports.InstallerPermissionDecisionMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('installer-permission-decision'),
    sessionId: zod_1.z.string(),
    decision: zod_1.z.enum(['allow', 'deny']),
});
// ─── Queue & Message Editing ─────────────────────────────────────────────────
exports.DeleteQueueMessageMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('delete-queue-message'),
    sessionId: zod_1.z.string(),
    messageId: zod_1.z.string(),
});
exports.EditQueueMessageMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('edit-queue-message'),
    sessionId: zod_1.z.string(),
    messageId: zod_1.z.string(),
    newContent: zod_1.z.string(),
});
// ─── Cost & Metrics ──────────────────────────────────────────────────────────
exports.CostUpdateMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('cost-update'),
    sessionId: zod_1.z.string(),
    cost: zod_1.z.number(),
});
// ─── Backlog ─────────────────────────────────────────────────────────────────
exports.ListBacklogsMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('list-backlogs'),
});
exports.BacklogsDataMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('backlogs-data'),
    global: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())),
    projects: zod_1.z.record(zod_1.z.string(), zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()))),
    archive: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())),
});
exports.BacklogErrorMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('backlog-error'),
    error: zod_1.z.string(),
});
exports.AddBacklogTaskMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('add-backlog-task'),
    scope: zod_1.z.string(),
    task: zod_1.z.object({
        title: zod_1.z.string(),
        description: zod_1.z.string().optional(),
        priority: zod_1.z.number().optional(),
        category: zod_1.z.string().optional(),
        impact: zod_1.z.enum(['minor', 'standard', 'major']).optional(),
    }),
});
exports.UpdateBacklogTaskMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('update-backlog-task'),
    scope: zod_1.z.string(),
    taskNumber: zod_1.z.number().int().positive(),
    updates: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
exports.UpdateBacklogTaskStatusMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('update-backlog-task-status'),
    scope: zod_1.z.string(),
    taskNumber: zod_1.z.number().int().positive(),
    status: zod_1.z.string(),
});
exports.ArchiveBacklogTasksMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('archive-backlog-tasks'),
    scope: zod_1.z.string(),
    taskNumbers: zod_1.z.array(zod_1.z.number().int().positive()),
});
// ─── Skills & History ────────────────────────────────────────────────────────
exports.ListSkillsMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('list-skills'),
});
exports.GetHistoryMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-history'),
    sessionId: zod_1.z.string().optional(),
});
// ─── Debug & Logging ─────────────────────────────────────────────────────────
exports.EmitDebugLogMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('emit-debug-log'),
    message: zod_1.z.string(),
    isError: zod_1.z.boolean().optional(),
});
exports.DebugLogMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('debug-log'),
    message: zod_1.z.string(),
    isError: zod_1.z.boolean().optional(),
});
// ─── Routine Notifications ───────────────────────────────────────────────────
exports.DismissRoutineNotificationMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('dismiss-routine-notification'),
    notificationId: zod_1.z.string(),
});
exports.GetRoutineNotificationsMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-routine-notifications'),
});
// ─── Domain Scout ────────────────────────────────────────────────────────────
exports.DomainScoutMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('domain-scout'),
    domain: zod_1.z.string(),
});
exports.DomainScoutClearMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('domain-scout-clear'),
});
// ─── Config & Manifest ───────────────────────────────────────────────────────
exports.GetConfigMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-config'),
});
exports.GetManifestMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-manifest'),
});
exports.SaveManifestMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('save-manifest'),
    manifest: zod_1.z.unknown(),
});
exports.SaveConfigMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('save-config'),
    config: zod_1.z.unknown(),
});
// ─── API Key Tests ───────────────────────────────────────────────────────────
exports.TestApiKeyMessage = WebSocketMessage.extend({
    type: zod_1.z.enum([
        'test-openrouter-key',
        'test-anthropic-key',
        'test-openai-key',
        'test-elevenlabs-key',
        'test-brave-key',
        'test-deepseek-key',
        'test-routine-api-model',
    ]),
    apiKey: zod_1.z.string(),
    model: zod_1.z.string().optional(),
});
// ─── Model Testing ───────────────────────────────────────────────────────────
exports.TestModelMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('test-model'),
    model: zod_1.z.string(),
    prompt: zod_1.z.string(),
    apiKey: zod_1.z.string().optional(),
});
// ─── Agent Eval ──────────────────────────────────────────────────────────────
exports.AgentEvalLoadQueueMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('agent-eval-load-queue'),
});
exports.StartAgentEvalMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('start-agent-eval'),
    config: zod_1.z.unknown(),
});
exports.CancelAgentEvalMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('cancel-agent-eval'),
    evalId: zod_1.z.string(),
});
exports.SaveAgentEvalResultsMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('save-agent-eval-results'),
    results: zod_1.z.unknown(),
});
// ─── Build ───────────────────────────────────────────────────────────────────
exports.GetPendingBuildsMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-pending-builds'),
});
exports.RunPreBuildCheckMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('run-pre-build-check'),
    projectPath: zod_1.z.string().optional(),
});
exports.GetPreBuildCheckStatusMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-pre-build-check-status'),
    checkId: zod_1.z.string().optional(),
});
exports.RunBuildMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('run-build'),
    projectPath: zod_1.z.string(),
    buildType: zod_1.z.string(),
});
// ─── Benchmark ───────────────────────────────────────────────────────────────
exports.BenchmarkLoadQueueMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('benchmark-load-queue'),
});
exports.BenchmarkSaveResultMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('benchmark-save-result'),
    result: zod_1.z.unknown(),
});
// ─── Space ───────────────────────────────────────────────────────────────────
exports.GetSpaceDataMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-space-data'),
});
exports.GetSpaceAnalysisMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-space-analysis'),
    filter: zod_1.z.string().optional(),
});
// ─── Panel State ─────────────────────────────────────────────────────────────
exports.SavePanelStateMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('save-panel-state'),
    panelId: zod_1.z.string(),
    state: zod_1.z.unknown(),
});
exports.SaveHiddenSessionsMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('save-hidden-sessions'),
    hiddenSessions: zod_1.z.array(zod_1.z.string()),
});
// ─── Project & Routine ───────────────────────────────────────────────────────
exports.UpsertProjectMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('upsert-project'),
    project: zod_1.z.unknown(),
});
exports.DeleteProjectMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('delete-project'),
    projectName: zod_1.z.string(),
});
exports.UpsertRoutineMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('upsert-routine'),
    routine: zod_1.z.unknown(),
});
exports.DeleteRoutineMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('delete-routine'),
    routineId: zod_1.z.string(),
});
// ─── Utility ─────────────────────────────────────────────────────────────────
exports.RefreshOpenrouterCatalogMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('refresh-openrouter-catalog'),
});
exports.CheckOpenrouterBalanceMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('check-openrouter-balance'),
    apiKey: zod_1.z.string().optional(),
});
exports.CheckDeepseekBalanceMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('check-deepseek-balance'),
    apiKey: zod_1.z.string().optional(),
});
exports.OpenUrlMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('open-url'),
    url: zod_1.z.string(),
});
exports.LaunchExternalAppMessage = WebSocketMessage.extend({
    type: zod_1.z.enum(['launch-thecard', 'launch-diamond', 'launch-design', 'launch-factory']),
});
exports.TtsSpeakMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('tts-speak'),
    text: zod_1.z.string(),
    voice: zod_1.z.string().optional(),
});
exports.GetDiagMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-diag'),
});
exports.GetTokenLogMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-token-log'),
    sessionId: zod_1.z.string().optional(),
    days: zod_1.z.number().int().positive().optional(),
});
// ─── Live Server ─────────────────────────────────────────────────────────────
exports.StartLiveServerMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('start-live-server'),
    port: zod_1.z.number().int().positive().optional(),
});
exports.StopLiveServerMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('stop-live-server'),
});
exports.GetLiveServerStatusMessage = WebSocketMessage.extend({
    type: zod_1.z.literal('get-live-server-status'),
});
// ─── Union discriminator ─────────────────────────────────────────────────────
exports.AnyClientMessage = zod_1.z.discriminatedUnion('type', [
    exports.LaunchMessage,
    exports.ResumeMessage,
    exports.StopMessage,
    exports.CloseSessionMessage,
    exports.RenameSessionMessage,
    exports.TransferSessionMessage,
    exports.SessionHeightMessage,
    exports.SessionColumnMessage,
    exports.SessionColumnSpanMessage,
    exports.SessionPinnedMessage,
    exports.UserQuestionAnswerMessage,
    exports.CrossCheckDecisionMessage,
    exports.CrossCheckPostHocDecisionMessage,
    exports.InstallerPermissionDecisionMessage,
    exports.DeleteQueueMessageMessage,
    exports.EditQueueMessageMessage,
    exports.CostUpdateMessage,
    exports.ListBacklogsMessage,
    exports.AddBacklogTaskMessage,
    exports.UpdateBacklogTaskMessage,
    exports.UpdateBacklogTaskStatusMessage,
    exports.ArchiveBacklogTasksMessage,
    exports.ListSkillsMessage,
    exports.GetHistoryMessage,
    exports.EmitDebugLogMessage,
    exports.DismissRoutineNotificationMessage,
    exports.GetRoutineNotificationsMessage,
    exports.DomainScoutMessage,
    exports.DomainScoutClearMessage,
    exports.GetConfigMessage,
    exports.GetManifestMessage,
    exports.SaveManifestMessage,
    exports.SaveConfigMessage,
    exports.AgentEvalLoadQueueMessage,
    exports.StartAgentEvalMessage,
    exports.CancelAgentEvalMessage,
    exports.SaveAgentEvalResultsMessage,
    exports.GetPendingBuildsMessage,
    exports.RunPreBuildCheckMessage,
    exports.GetPreBuildCheckStatusMessage,
    exports.RunBuildMessage,
    exports.BenchmarkLoadQueueMessage,
    exports.BenchmarkSaveResultMessage,
    exports.GetSpaceDataMessage,
    exports.GetSpaceAnalysisMessage,
    exports.SavePanelStateMessage,
    exports.SaveHiddenSessionsMessage,
    exports.UpsertProjectMessage,
    exports.DeleteProjectMessage,
    exports.UpsertRoutineMessage,
    exports.DeleteRoutineMessage,
    exports.RefreshOpenrouterCatalogMessage,
    exports.CheckOpenrouterBalanceMessage,
    exports.CheckDeepseekBalanceMessage,
    exports.OpenUrlMessage,
    exports.LaunchExternalAppMessage,
    exports.TestApiKeyMessage,
    exports.TestModelMessage,
    exports.TtsSpeakMessage,
    exports.GetDiagMessage,
    exports.GetTokenLogMessage,
    exports.StartLiveServerMessage,
    exports.StopLiveServerMessage,
    exports.GetLiveServerStatusMessage,
]);
