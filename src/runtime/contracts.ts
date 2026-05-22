/**
 * @module contracts
 * Polaris Runtime Contracts — TypeScript types and interfaces for all WebSocket messages,
 * tool schemas, and internal service contracts.
 *
 * This is the single source of truth for all cross-module communication boundaries.
 * All modules depend on contracts.ts; contracts.ts has no outbound dependencies.
 *
 * Structure:
 * 1. WebSocket message types (client ↔ server)
 * 2. Tool execution contracts
 * 3. Session and task orchestration types
 * 4. MCP and agent runtime types
 * 5. Cross-Check and backlog task types
 * 6. Internal service types (sessionStore, agentRuntime, toolRuntime, etc.)
 */

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET MESSAGE TYPES (client ↔ server)
// ─────────────────────────────────────────────────────────────────────────────

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// Session & Launch Messages
export interface LaunchMessage extends WebSocketMessage {
  type: 'launch' | 'launch-chat' | 'launch-gpt' | 'launch-codex';
  sessionTitle?: string;
  projectName?: string;
  agent?: string;
  model?: string;
}

export interface ResumeMessage extends WebSocketMessage {
  type: 'resume';
  sessionId: string;
}

export interface StopMessage extends WebSocketMessage {
  type: 'stop';
  sessionId: string;
}

export interface CloseSessionMessage extends WebSocketMessage {
  type: 'close-session';
  sessionId: string;
  status?: string;
}

export interface RenameSessionMessage extends WebSocketMessage {
  type: 'rename-session';
  sessionId: string;
  newName: string;
}

export interface TransferSessionMessage extends WebSocketMessage {
  type: 'transfer-session';
  sessionId: string;
  targetProject: string;
}

// Session UI State Messages
export interface SessionHeightMessage extends WebSocketMessage {
  type: 'session-height';
  sessionId: string;
  height: number;
}

export interface SessionColumnMessage extends WebSocketMessage {
  type: 'session-column';
  sessionId: string;
  column: number;
}

export interface SessionColumnSpanMessage extends WebSocketMessage {
  type: 'session-column-span';
  sessionId: string;
  span: number;
}

export interface SessionPinnedMessage extends WebSocketMessage {
  type: 'session-pinned';
  sessionId: string;
  pinned: boolean;
}

// Agent Interaction Messages
export interface UserQuestionAnswerMessage extends WebSocketMessage {
  type: 'user-question-answer';
  sessionId: string;
  answer: string;
}

export interface CrossCheckDecisionMessage extends WebSocketMessage {
  type: 'cross-check-decision';
  sessionId: string;
  decision: 'approve' | 'reject';
  reason?: string;
}

export interface CrossCheckPostHocDecisionMessage extends WebSocketMessage {
  type: 'cross-check-post-hoc-decision';
  sessionId: string;
  decision: 'approve' | 'reject';
  reason?: string;
}

export interface InstallerPermissionDecisionMessage extends WebSocketMessage {
  type: 'installer-permission-decision';
  sessionId: string;
  decision: 'allow' | 'deny';
}

// Queue & Message Editing
export interface DeleteQueueMessageMessage extends WebSocketMessage {
  type: 'delete-queue-message';
  sessionId: string;
  messageId: string;
}

export interface EditQueueMessageMessage extends WebSocketMessage {
  type: 'edit-queue-message';
  sessionId: string;
  messageId: string;
  newContent: string;
}

// Cost & Metrics Messages
export interface CostUpdateMessage extends WebSocketMessage {
  type: 'cost-update';
  sessionId: string;
  cost: number;
}

// Backlog Messages
export interface ListBacklogsMessage extends WebSocketMessage {
  type: 'list-backlogs';
}

export interface BacklogsDataMessage extends WebSocketMessage {
  type: 'backlogs-data';
  global: BacklogTask[];
  projects: Record<string, BacklogTask[]>;
  archive: BacklogTask[];
}

export interface BacklogErrorMessage extends WebSocketMessage {
  type: 'backlog-error';
  error: string;
}

export interface AddBacklogTaskMessage extends WebSocketMessage {
  type: 'add-backlog-task';
  scope: string; // 'global' or project name
  task: {
    title: string;
    description?: string;
    priority?: number;
    category?: string;
    impact?: 'minor' | 'standard' | 'major';
  };
}

export interface UpdateBacklogTaskMessage extends WebSocketMessage {
  type: 'update-backlog-task';
  scope: string;
  taskNumber: number;
  updates: Partial<BacklogTask>;
}

export interface UpdateBacklogTaskStatusMessage extends WebSocketMessage {
  type: 'update-backlog-task-status';
  scope: string;
  taskNumber: number;
  status: string;
}

export interface ArchiveBacklogTasksMessage extends WebSocketMessage {
  type: 'archive-backlog-tasks';
  scope: string;
  taskNumbers: number[];
}

// Skills & History
export interface ListSkillsMessage extends WebSocketMessage {
  type: 'list-skills';
}

export interface GetHistoryMessage extends WebSocketMessage {
  type: 'get-history';
  sessionId?: string;
}

// Debug & Logging
export interface EmitDebugLogMessage extends WebSocketMessage {
  type: 'emit-debug-log';
  message: string;
  isError?: boolean;
}

export interface DebugLogMessage extends WebSocketMessage {
  type: 'debug-log';
  message: string;
  isError?: boolean;
}

// Routine Notifications
export interface DismissRoutineNotificationMessage extends WebSocketMessage {
  type: 'dismiss-routine-notification';
  notificationId: string;
}

export interface GetRoutineNotificationsMessage extends WebSocketMessage {
  type: 'get-routine-notifications';
}

// Domain Scout Messages
export interface DomainScoutMessage extends WebSocketMessage {
  type: 'domain-scout';
  domain: string;
}

export interface DomainScoutClearMessage extends WebSocketMessage {
  type: 'domain-scout-clear';
}

// Config & Manifest Messages
export interface GetConfigMessage extends WebSocketMessage {
  type: 'get-config';
}

export interface GetManifestMessage extends WebSocketMessage {
  type: 'get-manifest';
}

export interface SaveManifestMessage extends WebSocketMessage {
  type: 'save-manifest';
  manifest: any;
}

export interface SaveConfigMessage extends WebSocketMessage {
  type: 'save-config';
  config: any;
}

// API Key Tests
export interface TestApiKeyMessage extends WebSocketMessage {
  type: 'test-openrouter-key' | 'test-anthropic-key' | 'test-openai-key' |
         'test-elevenlabs-key' | 'test-brave-key' | 'test-deepseek-key' |
         'test-routine-api-model';
  apiKey: string;
  model?: string;
}

// Model Testing
export interface TestModelMessage extends WebSocketMessage {
  type: 'test-model';
  model: string;
  prompt: string;
  apiKey?: string;
}

// Agent Eval Messages
export interface AgentEvalLoadQueueMessage extends WebSocketMessage {
  type: 'agent-eval-load-queue';
}

export interface StartAgentEvalMessage extends WebSocketMessage {
  type: 'start-agent-eval';
  config: any;
}

export interface CancelAgentEvalMessage extends WebSocketMessage {
  type: 'cancel-agent-eval';
  evalId: string;
}

export interface SaveAgentEvalResultsMessage extends WebSocketMessage {
  type: 'save-agent-eval-results';
  results: any;
}

// Build Messages
export interface GetPendingBuildsMessage extends WebSocketMessage {
  type: 'get-pending-builds';
}

export interface RunPreBuildCheckMessage extends WebSocketMessage {
  type: 'run-pre-build-check';
  projectPath?: string;
}

export interface GetPreBuildCheckStatusMessage extends WebSocketMessage {
  type: 'get-pre-build-check-status';
  checkId?: string;
}

export interface RunBuildMessage extends WebSocketMessage {
  type: 'run-build';
  projectPath: string;
  buildType: string;
}

// Benchmark Messages
export interface BenchmarkLoadQueueMessage extends WebSocketMessage {
  type: 'benchmark-load-queue';
}

export interface BenchmarkSaveResultMessage extends WebSocketMessage {
  type: 'benchmark-save-result';
  result: any;
}

// Space Messages
export interface GetSpaceDataMessage extends WebSocketMessage {
  type: 'get-space-data';
}

export interface GetSpaceAnalysisMessage extends WebSocketMessage {
  type: 'get-space-analysis';
  filter?: string;
}

// Panel State Messages
export interface SavePanelStateMessage extends WebSocketMessage {
  type: 'save-panel-state';
  panelId: string;
  state: any;
}

export interface SaveHiddenSessionsMessage extends WebSocketMessage {
  type: 'save-hidden-sessions';
  sessionIds: string[];
}

// Project & Routine Messages
export interface UpsertProjectMessage extends WebSocketMessage {
  type: 'upsert-project';
  project: any;
}

export interface DeleteProjectMessage extends WebSocketMessage {
  type: 'delete-project';
  projectName: string;
}

export interface UpsertRoutineMessage extends WebSocketMessage {
  type: 'upsert-routine';
  routine: any;
}

export interface DeleteRoutineMessage extends WebSocketMessage {
  type: 'delete-routine';
  routineId: string;
}

// Utility Messages
export interface RefreshOpenrouterCatalogMessage extends WebSocketMessage {
  type: 'refresh-openrouter-catalog';
}

export interface CheckOpenrouterBalanceMessage extends WebSocketMessage {
  type: 'check-openrouter-balance';
  apiKey?: string;
}

export interface CheckDeepseekBalanceMessage extends WebSocketMessage {
  type: 'check-deepseek-balance';
  apiKey?: string;
}

export interface OpenUrlMessage extends WebSocketMessage {
  type: 'open-url';
  url: string;
}

export interface LaunchExternalAppMessage extends WebSocketMessage {
  type: 'launch-thecard' | 'launch-diamond' | 'launch-factory';
}

export interface TtsSpeakMessage extends WebSocketMessage {
  type: 'tts-speak';
  text: string;
  voice?: string;
}

export interface GetDiagMessage extends WebSocketMessage {
  type: 'get-diag';
}

export interface GetTokenLogMessage extends WebSocketMessage {
  type: 'get-token-log';
  sessionId?: string;
  days?: number;
}

// Live Server Messages
export interface StartLiveServerMessage extends WebSocketMessage {
  type: 'start-live-server';
  port?: number;
}

export interface StopLiveServerMessage extends WebSocketMessage {
  type: 'stop-live-server';
}

export interface GetLiveServerStatusMessage extends WebSocketMessage {
  type: 'get-live-server-status';
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKLOG & TASK TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BacklogTask {
  number: number;
  title: string;
  description?: string;
  category?: string;
  priority?: number;
  impact?: 'minor' | 'standard' | 'major';
  status?: string;
  dependencies?: number[];
  plan?: string;
  branch?: string;
  pr_url?: string;
  proofUnits?: ProofUnit[];
  objective?: ObjectiveCriteria;
  created_at?: string;
  completed_at?: string;
}

export interface ProofUnit {
  number: number;
  title: string;
  expectedBehavior: string;
  proofType: 'smoke-command' | 'manual-script' | 'registry-diff';
  exactCommand: string;
  expectedInitialFailure: string;
  expectedPassingEvidence: string;
  waiverGuidance?: string;
}

export interface ObjectiveCriteria {
  statement: string;
  successCriteria: string[];
  nonGoals: string[];
  proofMap: Record<string, number>; // criterion name → proofUnit number
  stopConditions?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTION CONTRACTS
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolRequest {
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  type: 'text' | 'error' | 'image';
  content: string | any;
  isError?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION & AGENT RUNTIME TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  status: 'running' | 'paused' | 'stopped' | 'error';
  agent?: string;
  model?: string;
  projectName?: string;
  createdAt: number;
  lastMessageAt: number;
  column?: number;
  columnSpan?: number;
  height?: number;
  pinned?: boolean;
  messages: SessionMessage[];
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface AgentLaunchConfig {
  agent: string;
  model?: string;
  prompt?: string;
  context?: Record<string, any>;
  tools?: ToolSchema[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP & TOOL GATEWAY TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPToolEnvelope {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-CHECK & AUDIT TRAIL TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossCheckGate {
  id: string;
  sessionId: string;
  taskId?: number;
  decision?: 'approve' | 'reject' | 'pending';
  reason?: string;
  timestamp?: number;
}

export interface AuditEntry {
  id: string;
  type: string;
  sessionId?: string;
  taskId?: number;
  decision?: string;
  timestamp: number;
  details?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SERVICE OPERATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core operations exported by runtime services and called by WebSocket adapter.
 * These are the typed API boundary that replaces direct server.js handler logic.
 */

export interface CoreOperations {
  // Session Management (from sessionStore + agentRuntime)
  launchSession(config: AgentLaunchConfig): Promise<Session>;
  resumeSession(sessionId: string): Promise<Session>;
  stopSession(sessionId: string): Promise<void>;
  closeSession(sessionId: string, statusText?: string): Promise<void>;
  renameSession(sessionId: string, newName: string): Promise<void>;
  getSession(sessionId: string): Promise<Session | null>;
  listSessions(): Promise<Session[]>;

  // Tool Execution (from toolRuntime)
  executeTool(toolName: string, input: Record<string, any>, sessionId?: string): Promise<ToolResult>;
  validateToolSchema(toolName: string): Promise<boolean>;

  // Task & Backlog (from backlog service)
  transitionTask(taskNumber: number, newStatus: string, scope?: string): Promise<BacklogTask>;
  getTask(taskNumber: number, scope?: string): Promise<BacklogTask | null>;
  listBacklogTasks(scope?: string): Promise<BacklogTask[]>;
  addBacklogTask(scope: string, task: Partial<BacklogTask>): Promise<BacklogTask>;
  updateBacklogTask(taskNumber: number, updates: Partial<BacklogTask>, scope?: string): Promise<BacklogTask>;

  // Cross-Check (from crossCheck service)
  recordCrossCheck(gate: CrossCheckGate): Promise<void>;
  getCrossCheckStatus(gateId: string): Promise<CrossCheckGate | null>;

  // Memory & Config (from sessionStore)
  loadMemory(sessionId: string, key: string): Promise<any>;
  saveMemory(sessionId: string, key: string, value: any): Promise<void>;
  getConfig(): Promise<Record<string, any>>;
  saveConfig(config: Record<string, any>): Promise<void>;

  // Agent Operations (from agentRuntime)
  spawnAgent(agent: string, config: AgentLaunchConfig): Promise<string>;
  resumeAgent(agentId: string): Promise<void>;
  stopAgent(agentId: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE GUARDS & UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard for WebSocket message types */
export function isWebSocketMessage(obj: any): obj is WebSocketMessage {
  return obj && typeof obj === 'object' && typeof obj.type === 'string';
}

/** Union type of all WebSocket message types */
export type AnyWebSocketMessage =
  | LaunchMessage
  | ResumeMessage
  | StopMessage
  | CloseSessionMessage
  | RenameSessionMessage
  | TransferSessionMessage
  | SessionHeightMessage
  | SessionColumnMessage
  | SessionColumnSpanMessage
  | SessionPinnedMessage
  | UserQuestionAnswerMessage
  | CrossCheckDecisionMessage
  | CrossCheckPostHocDecisionMessage
  | InstallerPermissionDecisionMessage
  | DeleteQueueMessageMessage
  | EditQueueMessageMessage
  | CostUpdateMessage
  | ListBacklogsMessage
  | BacklogsDataMessage
  | BacklogErrorMessage
  | AddBacklogTaskMessage
  | UpdateBacklogTaskMessage
  | UpdateBacklogTaskStatusMessage
  | ArchiveBacklogTasksMessage
  | ListSkillsMessage
  | GetHistoryMessage
  | EmitDebugLogMessage
  | DebugLogMessage
  | DismissRoutineNotificationMessage
  | GetRoutineNotificationsMessage
  | DomainScoutMessage
  | DomainScoutClearMessage
  | GetConfigMessage
  | GetManifestMessage
  | SaveManifestMessage
  | SaveConfigMessage
  | TestApiKeyMessage
  | TestModelMessage
  | AgentEvalLoadQueueMessage
  | StartAgentEvalMessage
  | CancelAgentEvalMessage
  | SaveAgentEvalResultsMessage
  | GetPendingBuildsMessage
  | RunPreBuildCheckMessage
  | GetPreBuildCheckStatusMessage
  | RunBuildMessage
  | BenchmarkLoadQueueMessage
  | BenchmarkSaveResultMessage
  | GetSpaceDataMessage
  | GetSpaceAnalysisMessage
  | SavePanelStateMessage
  | SaveHiddenSessionsMessage
  | UpsertProjectMessage
  | DeleteProjectMessage
  | UpsertRoutineMessage
  | DeleteRoutineMessage
  | RefreshOpenrouterCatalogMessage
  | CheckOpenrouterBalanceMessage
  | CheckDeepseekBalanceMessage
  | OpenUrlMessage
  | LaunchExternalAppMessage
  | TtsSpeakMessage
  | GetDiagMessage
  | GetTokenLogMessage
  | StartLiveServerMessage
  | StopLiveServerMessage
  | GetLiveServerStatusMessage;
