"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectToolName = exports.DIRECT_TOOL_NAMES = exports.ToolResult = exports.SetStatusInput = exports.SetProjectInput = exports.QueryMemoryInput = exports.TodoWriteInput = exports.TodoItem = exports.AskUserQuestionInput = exports.AskUserQuestionItem = exports.AskUserQuestionOption = exports.WebSearchInput = exports.WebFetchInput = exports.PowerShellInput = exports.BashInput = exports.GrepInput = exports.GlobInput = exports.EditInput = exports.WriteInput = exports.ReadInput = void 0;
const zod_1 = require("zod");
// ─── Read ────────────────────────────────────────────────────────────────────
exports.ReadInput = zod_1.z.object({
    file_path: zod_1.z.string(),
    offset: zod_1.z.number().int().nonnegative().optional(),
    limit: zod_1.z.number().int().positive().optional(),
    pages: zod_1.z.string().optional(),
});
// ─── Write ───────────────────────────────────────────────────────────────────
exports.WriteInput = zod_1.z.object({
    file_path: zod_1.z.string(),
    content: zod_1.z.string(),
});
// ─── Edit ────────────────────────────────────────────────────────────────────
exports.EditInput = zod_1.z.object({
    file_path: zod_1.z.string(),
    old_string: zod_1.z.string(),
    new_string: zod_1.z.string(),
    replace_all: zod_1.z.boolean().optional(),
});
// ─── Glob ────────────────────────────────────────────────────────────────────
exports.GlobInput = zod_1.z.object({
    pattern: zod_1.z.string(),
    path: zod_1.z.string().optional(),
});
// ─── Grep ────────────────────────────────────────────────────────────────────
exports.GrepInput = zod_1.z.object({
    pattern: zod_1.z.string(),
    path: zod_1.z.string().optional(),
    glob: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    output_mode: zod_1.z.enum(['content', 'files_with_matches', 'count']).optional(),
    context: zod_1.z.number().int().nonnegative().optional(),
    head_limit: zod_1.z.number().int().nonnegative().optional(),
    offset: zod_1.z.number().int().nonnegative().optional(),
    '-i': zod_1.z.boolean().optional(),
    '-n': zod_1.z.boolean().optional(),
    '-A': zod_1.z.number().int().nonnegative().optional(),
    '-B': zod_1.z.number().int().nonnegative().optional(),
    '-C': zod_1.z.number().int().nonnegative().optional(),
    multiline: zod_1.z.boolean().optional(),
});
// ─── Bash ────────────────────────────────────────────────────────────────────
exports.BashInput = zod_1.z.object({
    command: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    timeout: zod_1.z.number().int().positive().optional(),
    run_in_background: zod_1.z.boolean().optional(),
});
// ─── PowerShell ──────────────────────────────────────────────────────────────
exports.PowerShellInput = zod_1.z.object({
    command: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    timeout: zod_1.z.number().int().positive().optional(),
    run_in_background: zod_1.z.boolean().optional(),
});
// ─── WebFetch ────────────────────────────────────────────────────────────────
exports.WebFetchInput = zod_1.z.object({
    url: zod_1.z.string().url(),
    method: zod_1.z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    body: zod_1.z.string().optional(),
});
// ─── WebSearch ───────────────────────────────────────────────────────────────
exports.WebSearchInput = zod_1.z.object({
    query: zod_1.z.string(),
    count: zod_1.z.number().int().positive().optional(),
});
// ─── AskUserQuestion ─────────────────────────────────────────────────────────
exports.AskUserQuestionOption = zod_1.z.object({
    label: zod_1.z.string(),
    description: zod_1.z.string(),
    preview: zod_1.z.string().optional(),
});
exports.AskUserQuestionItem = zod_1.z.object({
    question: zod_1.z.string(),
    header: zod_1.z.string().max(12),
    options: zod_1.z.array(exports.AskUserQuestionOption).min(2).max(4),
    multiSelect: zod_1.z.boolean(),
});
exports.AskUserQuestionInput = zod_1.z.object({
    questions: zod_1.z.array(exports.AskUserQuestionItem).min(1).max(4),
});
// ─── TodoWrite ───────────────────────────────────────────────────────────────
exports.TodoItem = zod_1.z.object({
    id: zod_1.z.string(),
    content: zod_1.z.string(),
    status: zod_1.z.enum(['pending', 'in_progress', 'completed']),
    priority: zod_1.z.enum(['high', 'medium', 'low']),
});
exports.TodoWriteInput = zod_1.z.object({
    todos: zod_1.z.array(exports.TodoItem),
});
// ─── QueryMemory ─────────────────────────────────────────────────────────────
exports.QueryMemoryInput = zod_1.z.object({
    query: zod_1.z.string(),
    project: zod_1.z.string().optional(),
});
// ─── SetProject ──────────────────────────────────────────────────────────────
exports.SetProjectInput = zod_1.z.object({
    projectName: zod_1.z.string(),
    workDir: zod_1.z.string().optional(),
});
// ─── SetStatus ───────────────────────────────────────────────────────────────
exports.SetStatusInput = zod_1.z.object({
    status: zod_1.z.string(),
    sessionId: zod_1.z.string().optional(),
});
// ─── Tool Result ─────────────────────────────────────────────────────────────
exports.ToolResult = zod_1.z.object({
    type: zod_1.z.enum(['text', 'error', 'image']),
    content: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())]),
    isError: zod_1.z.boolean().optional(),
});
exports.DIRECT_TOOL_NAMES = [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'PowerShell',
    'WebFetch',
    'WebSearch',
    'AskUserQuestion',
    'TodoWrite',
    'QueryMemory',
    'SetProject',
    'SetStatus',
];
exports.DirectToolName = zod_1.z.enum(exports.DIRECT_TOOL_NAMES);
