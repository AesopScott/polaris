/**
 * @module toolRuntime
 * Tool execution dispatch, schema validation, and result handling for Polaris.
 *
 * All tool calls from the agent loop flow through executeDirectTool(), which:
 * 1. Routes mcp__* prefixed names to the MCP gateway
 * 2. Enforces the worktree ownership guard on write tools
 * 3. Dispatches native tools (Read, Write, Edit, Glob, Grep, Bash, etc.)
 *
 * Native tool implementations (toolRead, toolWrite, etc.) live in server.js
 * during the incremental refactoring and are injected via ToolExecutors at init.
 *
 * Dependencies: contracts (types), sessionStore (worktree guard), mcpGateway (mcp__ routing)
 *
 * Topology: contracts ← sessionStore ← toolRuntime ← agentRuntime, WebSocket adapter
 */

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE TOOL NAMES
// ─────────────────────────────────────────────────────────────────────────────

/** All tool names dispatched natively by Polaris (not via MCP). */
export const NATIVE_TOOL_NAMES = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'Bash', 'PowerShell',
  'WebFetch', 'WebSearch',
  'AskUserQuestion', 'TodoWrite',
  'QueryMemory', 'SetProject', 'SetStatus', 'SetTaskState', 'Skill',
  'GetNavigationSchema', 'GetButton', 'GetPanel', 'FindButtonByLabel',
] as const;

export type NativeToolName = typeof NATIVE_TOOL_NAMES[number];

/** Tools that perform write operations — subject to worktree ownership guard. */
export const WRITE_TOOLS = new Set<string>(['Write', 'Edit', 'Bash', 'PowerShell']);

// ─────────────────────────────────────────────────────────────────────────────
// TOOL SCHEMA (OpenRouter / OpenAI function-calling format)
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenRouterToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, ToolParameterSchema>;
      required?: string[];
    };
  };
}

export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL INPUT / OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadToolInput {
  file_path: string;
  offset?: number;
  limit?: number;
  pages?: string;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface GlobToolInput {
  pattern: string;
  path?: string;
}

export interface GrepToolInput {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  '-i'?: boolean;
  '-n'?: boolean;
  '-C'?: number;
  '-A'?: number;
  '-B'?: number;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
}

export interface BashToolInput {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
}

export interface PowerShellToolInput {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
}

export interface WebFetchToolInput {
  url: string;
  prompt?: string;
  max_length?: number;
  start_index?: number;
}

export interface WebSearchToolInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface AskUserQuestionInput {
  questions: AskUserQuestion[];
  answers?: Record<string, string>;
  annotations?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AskUserQuestion {
  question: string;
  header: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

export interface AskUserOption {
  label: string;
  description: string;
  preview?: string;
}

export interface TodoWriteInput {
  todos: TodoItem[];
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export interface SetProjectInput {
  project: string;
}

export interface SetStatusInput {
  status: string;
}

export interface SetTaskStateInput {
  taskNumber: number;
  state: string;
}

export interface SkillInput {
  skill: string;
  args?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTOR INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Function signature for a native tool implementation.
 * Injected at init so toolRuntime doesn't import server.js directly.
 */
export type ToolExecutorFn = (input: Record<string, any>, workDir: string | null, sessionId: string) => Promise<string> | string;

export type ToolExecutorMap = Partial<Record<string, ToolExecutorFn>>;

/** MCP dispatcher injected at init — routes mcp__* tool calls. */
export type McpDispatchFn = (serverName: string, toolName: string, args: Record<string, any>) => Promise<string>;

/** Worktree guard injected at init — returns an error string if write is blocked, null if allowed. */
export type WorktreeGuardFn = (sessionId: string) => string | null;

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME STATE (injected at init)
// ─────────────────────────────────────────────────────────────────────────────

let _executors: ToolExecutorMap = {};
let _mcpDispatch: McpDispatchFn | null = null;
let _worktreeGuard: WorktreeGuardFn | null = null;

export function initToolRuntime(opts: {
  executors: ToolExecutorMap;
  mcpDispatch: McpDispatchFn;
  worktreeGuard: WorktreeGuardFn;
}): void {
  _executors = opts.executors;
  _mcpDispatch = opts.mcpDispatch;
  _worktreeGuard = opts.worktreeGuard;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL ROUTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main dispatch entry point — mirrors executeDirectTool() in server.js.
 * Routes mcp__* to the MCP gateway, enforces the write-tool worktree guard,
 * then dispatches to the appropriate native executor.
 */
export async function executeDirectTool(
  name: string,
  input: Record<string, any>,
  workDir: string | null,
  sessionId: string
): Promise<string> {
  // MCP tool — delegate to gateway
  if (name.startsWith('mcp__')) {
    if (!_mcpDispatch) return '[toolRuntime] MCP dispatch not initialized';
    const parts = name.split('__');
    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');
    return await _mcpDispatch(serverName, toolName, input);
  }

  // Write tool — enforce worktree guard
  if (WRITE_TOOLS.has(name) && _worktreeGuard) {
    const err = _worktreeGuard(sessionId);
    if (err) return `[Worktree guard] ${err}. Write blocked to prevent cross-session contamination.`;
  }

  // Native tool dispatch
  const executor = _executors[name];
  if (!executor) return `Unknown tool: ${name}`;
  return await executor(input, workDir, sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL LABEL HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for a tool call.
 * Used by the session transcript renderer to show progress lines.
 * Mirrors the switch in server.js that populates session.lines[].
 */
export function toolLabel(name: string, input: Record<string, any>): string {
  const truncate = (s: string, max = 60) => s.length > max ? s.slice(0, max - 1) + '…' : s;
  switch (name) {
    case 'Read':       return `Read  ${truncate(input.file_path || input.path || '')}`;
    case 'Write':      return `Write ${truncate(input.file_path || '')}`;
    case 'Edit':       return `Edit  ${truncate(input.file_path || '')}`;
    case 'Glob':       return `Glob  ${truncate(input.pattern || '')}`;
    case 'Grep':       return `Grep  ${truncate(input.pattern || '')}`;
    case 'Bash':       return `Bash  ${truncate(input.command || '', 80)}`;
    case 'PowerShell': return `PS    ${truncate(input.command || '', 80)}`;
    case 'WebFetch':   return `Fetch ${truncate(input.url || '')}`;
    case 'WebSearch':  return `Search ${truncate(input.query || '')}`;
    default:           return name.startsWith('mcp__') ? `MCP   ${name.slice(5)}` : name;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the name is a known native tool. */
export function isNativeTool(name: string): name is NativeToolName {
  return (NATIVE_TOOL_NAMES as readonly string[]).includes(name);
}

/** Returns true if the name is an MCP tool (mcp__server__tool format). */
export function isMcpTool(name: string): boolean {
  return name.startsWith('mcp__') && name.split('__').length >= 3;
}
