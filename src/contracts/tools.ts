import { z } from 'zod';

// ─── Read ────────────────────────────────────────────────────────────────────

export const ReadInput = z.object({
  file_path: z.string(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  pages: z.string().optional(),
});

// ─── Write ───────────────────────────────────────────────────────────────────

export const WriteInput = z.object({
  file_path: z.string(),
  content: z.string(),
});

// ─── Edit ────────────────────────────────────────────────────────────────────

export const EditInput = z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

// ─── Glob ────────────────────────────────────────────────────────────────────

export const GlobInput = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

// ─── Grep ────────────────────────────────────────────────────────────────────

export const GrepInput = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  type: z.string().optional(),
  output_mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
  context: z.number().int().nonnegative().optional(),
  head_limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  '-i': z.boolean().optional(),
  '-n': z.boolean().optional(),
  '-A': z.number().int().nonnegative().optional(),
  '-B': z.number().int().nonnegative().optional(),
  '-C': z.number().int().nonnegative().optional(),
  multiline: z.boolean().optional(),
});

// ─── Bash ────────────────────────────────────────────────────────────────────

export const BashInput = z.object({
  command: z.string(),
  description: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  run_in_background: z.boolean().optional(),
});

// ─── PowerShell ──────────────────────────────────────────────────────────────

export const PowerShellInput = z.object({
  command: z.string(),
  description: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  run_in_background: z.boolean().optional(),
});

// ─── WebFetch ────────────────────────────────────────────────────────────────

export const WebFetchInput = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

// ─── WebSearch ───────────────────────────────────────────────────────────────

export const WebSearchInput = z.object({
  query: z.string(),
  count: z.number().int().positive().optional(),
});

// ─── AskUserQuestion ─────────────────────────────────────────────────────────

export const AskUserQuestionOption = z.object({
  label: z.string(),
  description: z.string(),
  preview: z.string().optional(),
});

export const AskUserQuestionItem = z.object({
  question: z.string(),
  header: z.string().max(12),
  options: z.array(AskUserQuestionOption).min(2).max(4),
  multiSelect: z.boolean(),
});

export const AskUserQuestionInput = z.object({
  questions: z.array(AskUserQuestionItem).min(1).max(4),
});

// ─── TodoWrite ───────────────────────────────────────────────────────────────

export const TodoItem = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['high', 'medium', 'low']),
});

export const TodoWriteInput = z.object({
  todos: z.array(TodoItem),
});

// ─── QueryMemory ─────────────────────────────────────────────────────────────

export const QueryMemoryInput = z.object({
  query: z.string(),
  project: z.string().optional(),
});

// ─── SetProject ──────────────────────────────────────────────────────────────

export const SetProjectInput = z.object({
  projectName: z.string(),
  workDir: z.string().optional(),
});

// ─── SetStatus ───────────────────────────────────────────────────────────────

export const SetStatusInput = z.object({
  status: z.string(),
  sessionId: z.string().optional(),
});

// ─── Tool Result ─────────────────────────────────────────────────────────────

export const ToolResult = z.object({
  type: z.enum(['text', 'error', 'image']),
  content: z.union([z.string(), z.record(z.string(), z.unknown())]),
  isError: z.boolean().optional(),
});

export const DIRECT_TOOL_NAMES = [
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
] as const;

export const DirectToolName = z.enum(DIRECT_TOOL_NAMES);
export type DirectToolNameType = z.infer<typeof DirectToolName>;
