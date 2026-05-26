import { z } from 'zod';
export declare const LaunchMessage: z.ZodObject<{} & {
    type: z.ZodEnum<["launch", "launch-chat", "launch-gpt", "launch-codex"]>;
    sessionTitle: z.ZodOptional<z.ZodString>;
    projectName: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodEnum<["launch", "launch-chat", "launch-gpt", "launch-codex"]>;
    sessionTitle: z.ZodOptional<z.ZodString>;
    projectName: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodEnum<["launch", "launch-chat", "launch-gpt", "launch-codex"]>;
    sessionTitle: z.ZodOptional<z.ZodString>;
    projectName: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const ResumeMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"resume">;
    sessionId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"resume">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"resume">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const StopMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"stop">;
    sessionId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"stop">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"stop">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const CloseSessionMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"close-session">;
    sessionId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"close-session">;
    sessionId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"close-session">;
    sessionId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const RenameSessionMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"rename-session">;
    sessionId: z.ZodString;
    newName: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"rename-session">;
    sessionId: z.ZodString;
    newName: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"rename-session">;
    sessionId: z.ZodString;
    newName: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const TransferSessionMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"transfer-session">;
    sessionId: z.ZodString;
    targetProject: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"transfer-session">;
    sessionId: z.ZodString;
    targetProject: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"transfer-session">;
    sessionId: z.ZodString;
    targetProject: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const SessionHeightMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"session-height">;
    sessionId: z.ZodString;
    height: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-height">;
    sessionId: z.ZodString;
    height: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-height">;
    sessionId: z.ZodString;
    height: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>;
export declare const SessionColumnMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"session-column">;
    sessionId: z.ZodString;
    column: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-column">;
    sessionId: z.ZodString;
    column: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-column">;
    sessionId: z.ZodString;
    column: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>;
export declare const SessionColumnSpanMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"session-column-span">;
    sessionId: z.ZodString;
    span: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-column-span">;
    sessionId: z.ZodString;
    span: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-column-span">;
    sessionId: z.ZodString;
    span: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>;
export declare const SessionPinnedMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"session-pinned">;
    sessionId: z.ZodString;
    pinned: z.ZodBoolean;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-pinned">;
    sessionId: z.ZodString;
    pinned: z.ZodBoolean;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-pinned">;
    sessionId: z.ZodString;
    pinned: z.ZodBoolean;
}, z.ZodTypeAny, "passthrough">>;
export declare const UserQuestionAnswerMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"user-question-answer">;
    sessionId: z.ZodString;
    answer: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"user-question-answer">;
    sessionId: z.ZodString;
    answer: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"user-question-answer">;
    sessionId: z.ZodString;
    answer: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const CrossCheckDecisionMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"cross-check-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cross-check-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cross-check-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const CrossCheckPostHocDecisionMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"cross-check-post-hoc-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cross-check-post-hoc-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cross-check-post-hoc-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const InstallerPermissionDecisionMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"installer-permission-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["allow", "deny"]>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"installer-permission-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["allow", "deny"]>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"installer-permission-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["allow", "deny"]>;
}, z.ZodTypeAny, "passthrough">>;
export declare const DeleteQueueMessageMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"delete-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"delete-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"delete-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const EditQueueMessageMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"edit-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
    newContent: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"edit-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
    newContent: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"edit-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
    newContent: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const CostUpdateMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"cost-update">;
    sessionId: z.ZodString;
    cost: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cost-update">;
    sessionId: z.ZodString;
    cost: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cost-update">;
    sessionId: z.ZodString;
    cost: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>;
export declare const ListBacklogsMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"list-backlogs">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"list-backlogs">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"list-backlogs">;
}, z.ZodTypeAny, "passthrough">>;
export declare const BacklogsDataMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"backlogs-data">;
    global: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    projects: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    archive: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"backlogs-data">;
    global: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    projects: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    archive: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"backlogs-data">;
    global: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    projects: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    archive: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
}, z.ZodTypeAny, "passthrough">>;
export declare const BacklogErrorMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"backlog-error">;
    error: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"backlog-error">;
    error: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"backlog-error">;
    error: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const AddBacklogTaskMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"add-backlog-task">;
    scope: z.ZodString;
    task: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        category: z.ZodOptional<z.ZodString>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"add-backlog-task">;
    scope: z.ZodString;
    task: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        category: z.ZodOptional<z.ZodString>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"add-backlog-task">;
    scope: z.ZodString;
    task: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        category: z.ZodOptional<z.ZodString>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }>;
}, z.ZodTypeAny, "passthrough">>;
export declare const UpdateBacklogTaskMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"update-backlog-task">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    updates: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"update-backlog-task">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    updates: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"update-backlog-task">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    updates: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>;
export declare const UpdateBacklogTaskStatusMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"update-backlog-task-status">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    status: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"update-backlog-task-status">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    status: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"update-backlog-task-status">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    status: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const ArchiveBacklogTasksMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"archive-backlog-tasks">;
    scope: z.ZodString;
    taskNumbers: z.ZodArray<z.ZodNumber, "many">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"archive-backlog-tasks">;
    scope: z.ZodString;
    taskNumbers: z.ZodArray<z.ZodNumber, "many">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"archive-backlog-tasks">;
    scope: z.ZodString;
    taskNumbers: z.ZodArray<z.ZodNumber, "many">;
}, z.ZodTypeAny, "passthrough">>;
export declare const ListSkillsMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"list-skills">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"list-skills">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"list-skills">;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetHistoryMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-history">;
    sessionId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-history">;
    sessionId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-history">;
    sessionId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const EmitDebugLogMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"emit-debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"emit-debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"emit-debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">>;
export declare const DebugLogMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">>;
export declare const DismissRoutineNotificationMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"dismiss-routine-notification">;
    notificationId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"dismiss-routine-notification">;
    notificationId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"dismiss-routine-notification">;
    notificationId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetRoutineNotificationsMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-routine-notifications">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-routine-notifications">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-routine-notifications">;
}, z.ZodTypeAny, "passthrough">>;
export declare const DomainScoutMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"domain-scout">;
    domain: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"domain-scout">;
    domain: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"domain-scout">;
    domain: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const DomainScoutClearMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"domain-scout-clear">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"domain-scout-clear">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"domain-scout-clear">;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetConfigMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-config">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-config">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-config">;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetManifestMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-manifest">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-manifest">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-manifest">;
}, z.ZodTypeAny, "passthrough">>;
export declare const SaveManifestMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"save-manifest">;
    manifest: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-manifest">;
    manifest: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-manifest">;
    manifest: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const SaveConfigMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"save-config">;
    config: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-config">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-config">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const TestApiKeyMessage: z.ZodObject<{} & {
    type: z.ZodEnum<["test-openrouter-key", "test-anthropic-key", "test-openai-key", "test-elevenlabs-key", "test-brave-key", "test-deepseek-key", "test-routine-api-model"]>;
    apiKey: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodEnum<["test-openrouter-key", "test-anthropic-key", "test-openai-key", "test-elevenlabs-key", "test-brave-key", "test-deepseek-key", "test-routine-api-model"]>;
    apiKey: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodEnum<["test-openrouter-key", "test-anthropic-key", "test-openai-key", "test-elevenlabs-key", "test-brave-key", "test-deepseek-key", "test-routine-api-model"]>;
    apiKey: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const TestModelMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"test-model">;
    model: z.ZodString;
    prompt: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"test-model">;
    model: z.ZodString;
    prompt: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"test-model">;
    model: z.ZodString;
    prompt: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const AgentEvalLoadQueueMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"agent-eval-load-queue">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"agent-eval-load-queue">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"agent-eval-load-queue">;
}, z.ZodTypeAny, "passthrough">>;
export declare const StartAgentEvalMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"start-agent-eval">;
    config: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"start-agent-eval">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"start-agent-eval">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const CancelAgentEvalMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"cancel-agent-eval">;
    evalId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cancel-agent-eval">;
    evalId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cancel-agent-eval">;
    evalId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const SaveAgentEvalResultsMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"save-agent-eval-results">;
    results: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-agent-eval-results">;
    results: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-agent-eval-results">;
    results: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetPendingBuildsMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-pending-builds">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-pending-builds">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-pending-builds">;
}, z.ZodTypeAny, "passthrough">>;
export declare const RunPreBuildCheckMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"run-pre-build-check">;
    projectPath: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"run-pre-build-check">;
    projectPath: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"run-pre-build-check">;
    projectPath: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetPreBuildCheckStatusMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-pre-build-check-status">;
    checkId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-pre-build-check-status">;
    checkId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-pre-build-check-status">;
    checkId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const RunBuildMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"run-build">;
    projectPath: z.ZodString;
    buildType: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"run-build">;
    projectPath: z.ZodString;
    buildType: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"run-build">;
    projectPath: z.ZodString;
    buildType: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const BenchmarkLoadQueueMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"benchmark-load-queue">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"benchmark-load-queue">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"benchmark-load-queue">;
}, z.ZodTypeAny, "passthrough">>;
export declare const BenchmarkSaveResultMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"benchmark-save-result">;
    result: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"benchmark-save-result">;
    result: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"benchmark-save-result">;
    result: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetSpaceDataMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-space-data">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-space-data">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-space-data">;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetSpaceAnalysisMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-space-analysis">;
    filter: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-space-analysis">;
    filter: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-space-analysis">;
    filter: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const SavePanelStateMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"save-panel-state">;
    panelId: z.ZodString;
    state: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-panel-state">;
    panelId: z.ZodString;
    state: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-panel-state">;
    panelId: z.ZodString;
    state: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const SaveHiddenSessionsMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"save-hidden-sessions">;
    sessionIds: z.ZodArray<z.ZodString, "many">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-hidden-sessions">;
    sessionIds: z.ZodArray<z.ZodString, "many">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-hidden-sessions">;
    sessionIds: z.ZodArray<z.ZodString, "many">;
}, z.ZodTypeAny, "passthrough">>;
export declare const UpsertProjectMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"upsert-project">;
    project: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"upsert-project">;
    project: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"upsert-project">;
    project: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const DeleteProjectMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"delete-project">;
    projectName: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"delete-project">;
    projectName: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"delete-project">;
    projectName: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const UpsertRoutineMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"upsert-routine">;
    routine: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"upsert-routine">;
    routine: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"upsert-routine">;
    routine: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>;
export declare const DeleteRoutineMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"delete-routine">;
    routineId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"delete-routine">;
    routineId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"delete-routine">;
    routineId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const RefreshOpenrouterCatalogMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"refresh-openrouter-catalog">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"refresh-openrouter-catalog">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"refresh-openrouter-catalog">;
}, z.ZodTypeAny, "passthrough">>;
export declare const CheckOpenrouterBalanceMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"check-openrouter-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"check-openrouter-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"check-openrouter-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const CheckDeepseekBalanceMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"check-deepseek-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"check-deepseek-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"check-deepseek-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const OpenUrlMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"open-url">;
    url: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"open-url">;
    url: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"open-url">;
    url: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const LaunchExternalAppMessage: z.ZodObject<{} & {
    type: z.ZodEnum<["launch-thecard", "launch-diamond", "launch-design", "launch-factory"]>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodEnum<["launch-thecard", "launch-diamond", "launch-design", "launch-factory"]>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodEnum<["launch-thecard", "launch-diamond", "launch-design", "launch-factory"]>;
}, z.ZodTypeAny, "passthrough">>;
export declare const TtsSpeakMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"tts-speak">;
    text: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"tts-speak">;
    text: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"tts-speak">;
    text: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetDiagMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-diag">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-diag">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-diag">;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetTokenLogMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-token-log">;
    sessionId: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-token-log">;
    sessionId: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-token-log">;
    sessionId: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>;
export declare const StartLiveServerMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"start-live-server">;
    port: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"start-live-server">;
    port: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"start-live-server">;
    port: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>;
export declare const StopLiveServerMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"stop-live-server">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"stop-live-server">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"stop-live-server">;
}, z.ZodTypeAny, "passthrough">>;
export declare const GetLiveServerStatusMessage: z.ZodObject<{} & {
    type: z.ZodLiteral<"get-live-server-status">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-live-server-status">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-live-server-status">;
}, z.ZodTypeAny, "passthrough">>;
export declare const AnyClientMessage: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{} & {
    type: z.ZodEnum<["launch", "launch-chat", "launch-gpt", "launch-codex"]>;
    sessionTitle: z.ZodOptional<z.ZodString>;
    projectName: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodEnum<["launch", "launch-chat", "launch-gpt", "launch-codex"]>;
    sessionTitle: z.ZodOptional<z.ZodString>;
    projectName: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodEnum<["launch", "launch-chat", "launch-gpt", "launch-codex"]>;
    sessionTitle: z.ZodOptional<z.ZodString>;
    projectName: z.ZodOptional<z.ZodString>;
    agent: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"resume">;
    sessionId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"resume">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"resume">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"stop">;
    sessionId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"stop">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"stop">;
    sessionId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"close-session">;
    sessionId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"close-session">;
    sessionId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"close-session">;
    sessionId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"rename-session">;
    sessionId: z.ZodString;
    newName: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"rename-session">;
    sessionId: z.ZodString;
    newName: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"rename-session">;
    sessionId: z.ZodString;
    newName: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"transfer-session">;
    sessionId: z.ZodString;
    targetProject: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"transfer-session">;
    sessionId: z.ZodString;
    targetProject: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"transfer-session">;
    sessionId: z.ZodString;
    targetProject: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"session-height">;
    sessionId: z.ZodString;
    height: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-height">;
    sessionId: z.ZodString;
    height: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-height">;
    sessionId: z.ZodString;
    height: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"session-column">;
    sessionId: z.ZodString;
    column: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-column">;
    sessionId: z.ZodString;
    column: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-column">;
    sessionId: z.ZodString;
    column: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"session-column-span">;
    sessionId: z.ZodString;
    span: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-column-span">;
    sessionId: z.ZodString;
    span: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-column-span">;
    sessionId: z.ZodString;
    span: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"session-pinned">;
    sessionId: z.ZodString;
    pinned: z.ZodBoolean;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"session-pinned">;
    sessionId: z.ZodString;
    pinned: z.ZodBoolean;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"session-pinned">;
    sessionId: z.ZodString;
    pinned: z.ZodBoolean;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"user-question-answer">;
    sessionId: z.ZodString;
    answer: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"user-question-answer">;
    sessionId: z.ZodString;
    answer: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"user-question-answer">;
    sessionId: z.ZodString;
    answer: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"cross-check-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cross-check-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cross-check-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"cross-check-post-hoc-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cross-check-post-hoc-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cross-check-post-hoc-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"installer-permission-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["allow", "deny"]>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"installer-permission-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["allow", "deny"]>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"installer-permission-decision">;
    sessionId: z.ZodString;
    decision: z.ZodEnum<["allow", "deny"]>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"delete-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"delete-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"delete-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"edit-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
    newContent: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"edit-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
    newContent: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"edit-queue-message">;
    sessionId: z.ZodString;
    messageId: z.ZodString;
    newContent: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"cost-update">;
    sessionId: z.ZodString;
    cost: z.ZodNumber;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cost-update">;
    sessionId: z.ZodString;
    cost: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cost-update">;
    sessionId: z.ZodString;
    cost: z.ZodNumber;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"list-backlogs">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"list-backlogs">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"list-backlogs">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"add-backlog-task">;
    scope: z.ZodString;
    task: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        category: z.ZodOptional<z.ZodString>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"add-backlog-task">;
    scope: z.ZodString;
    task: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        category: z.ZodOptional<z.ZodString>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"add-backlog-task">;
    scope: z.ZodString;
    task: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
        category: z.ZodOptional<z.ZodString>;
        impact: z.ZodOptional<z.ZodEnum<["minor", "standard", "major"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }, {
        title: string;
        description?: string | undefined;
        category?: string | undefined;
        priority?: number | undefined;
        impact?: "minor" | "standard" | "major" | undefined;
    }>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"update-backlog-task">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    updates: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"update-backlog-task">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    updates: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"update-backlog-task">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    updates: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"update-backlog-task-status">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    status: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"update-backlog-task-status">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    status: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"update-backlog-task-status">;
    scope: z.ZodString;
    taskNumber: z.ZodNumber;
    status: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"archive-backlog-tasks">;
    scope: z.ZodString;
    taskNumbers: z.ZodArray<z.ZodNumber, "many">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"archive-backlog-tasks">;
    scope: z.ZodString;
    taskNumbers: z.ZodArray<z.ZodNumber, "many">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"archive-backlog-tasks">;
    scope: z.ZodString;
    taskNumbers: z.ZodArray<z.ZodNumber, "many">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"list-skills">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"list-skills">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"list-skills">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-history">;
    sessionId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-history">;
    sessionId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-history">;
    sessionId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"emit-debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"emit-debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"emit-debug-log">;
    message: z.ZodString;
    isError: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"dismiss-routine-notification">;
    notificationId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"dismiss-routine-notification">;
    notificationId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"dismiss-routine-notification">;
    notificationId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-routine-notifications">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-routine-notifications">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-routine-notifications">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"domain-scout">;
    domain: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"domain-scout">;
    domain: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"domain-scout">;
    domain: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"domain-scout-clear">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"domain-scout-clear">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"domain-scout-clear">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-config">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-config">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-config">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-manifest">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-manifest">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-manifest">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"save-manifest">;
    manifest: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-manifest">;
    manifest: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-manifest">;
    manifest: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"save-config">;
    config: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-config">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-config">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"agent-eval-load-queue">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"agent-eval-load-queue">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"agent-eval-load-queue">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"start-agent-eval">;
    config: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"start-agent-eval">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"start-agent-eval">;
    config: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"cancel-agent-eval">;
    evalId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"cancel-agent-eval">;
    evalId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"cancel-agent-eval">;
    evalId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"save-agent-eval-results">;
    results: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-agent-eval-results">;
    results: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-agent-eval-results">;
    results: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-pending-builds">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-pending-builds">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-pending-builds">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"run-pre-build-check">;
    projectPath: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"run-pre-build-check">;
    projectPath: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"run-pre-build-check">;
    projectPath: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-pre-build-check-status">;
    checkId: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-pre-build-check-status">;
    checkId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-pre-build-check-status">;
    checkId: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"run-build">;
    projectPath: z.ZodString;
    buildType: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"run-build">;
    projectPath: z.ZodString;
    buildType: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"run-build">;
    projectPath: z.ZodString;
    buildType: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"benchmark-load-queue">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"benchmark-load-queue">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"benchmark-load-queue">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"benchmark-save-result">;
    result: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"benchmark-save-result">;
    result: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"benchmark-save-result">;
    result: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-space-data">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-space-data">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-space-data">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-space-analysis">;
    filter: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-space-analysis">;
    filter: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-space-analysis">;
    filter: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"save-panel-state">;
    panelId: z.ZodString;
    state: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-panel-state">;
    panelId: z.ZodString;
    state: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-panel-state">;
    panelId: z.ZodString;
    state: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"save-hidden-sessions">;
    sessionIds: z.ZodArray<z.ZodString, "many">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"save-hidden-sessions">;
    sessionIds: z.ZodArray<z.ZodString, "many">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"save-hidden-sessions">;
    sessionIds: z.ZodArray<z.ZodString, "many">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"upsert-project">;
    project: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"upsert-project">;
    project: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"upsert-project">;
    project: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"delete-project">;
    projectName: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"delete-project">;
    projectName: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"delete-project">;
    projectName: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"upsert-routine">;
    routine: z.ZodUnknown;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"upsert-routine">;
    routine: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"upsert-routine">;
    routine: z.ZodUnknown;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"delete-routine">;
    routineId: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"delete-routine">;
    routineId: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"delete-routine">;
    routineId: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"refresh-openrouter-catalog">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"refresh-openrouter-catalog">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"refresh-openrouter-catalog">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"check-openrouter-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"check-openrouter-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"check-openrouter-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"check-deepseek-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"check-deepseek-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"check-deepseek-balance">;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"open-url">;
    url: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"open-url">;
    url: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"open-url">;
    url: z.ZodString;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodEnum<["launch-thecard", "launch-diamond", "launch-design", "launch-factory"]>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodEnum<["launch-thecard", "launch-diamond", "launch-design", "launch-factory"]>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodEnum<["launch-thecard", "launch-diamond", "launch-design", "launch-factory"]>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodEnum<["test-openrouter-key", "test-anthropic-key", "test-openai-key", "test-elevenlabs-key", "test-brave-key", "test-deepseek-key", "test-routine-api-model"]>;
    apiKey: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodEnum<["test-openrouter-key", "test-anthropic-key", "test-openai-key", "test-elevenlabs-key", "test-brave-key", "test-deepseek-key", "test-routine-api-model"]>;
    apiKey: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodEnum<["test-openrouter-key", "test-anthropic-key", "test-openai-key", "test-elevenlabs-key", "test-brave-key", "test-deepseek-key", "test-routine-api-model"]>;
    apiKey: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"test-model">;
    model: z.ZodString;
    prompt: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"test-model">;
    model: z.ZodString;
    prompt: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"test-model">;
    model: z.ZodString;
    prompt: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"tts-speak">;
    text: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"tts-speak">;
    text: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"tts-speak">;
    text: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-diag">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-diag">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-diag">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-token-log">;
    sessionId: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-token-log">;
    sessionId: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-token-log">;
    sessionId: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"start-live-server">;
    port: z.ZodOptional<z.ZodNumber>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"start-live-server">;
    port: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"start-live-server">;
    port: z.ZodOptional<z.ZodNumber>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"stop-live-server">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"stop-live-server">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"stop-live-server">;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{} & {
    type: z.ZodLiteral<"get-live-server-status">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{} & {
    type: z.ZodLiteral<"get-live-server-status">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{} & {
    type: z.ZodLiteral<"get-live-server-status">;
}, z.ZodTypeAny, "passthrough">>]>;
