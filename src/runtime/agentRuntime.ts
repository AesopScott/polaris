/**
 * @module agentRuntime
 * Agent spawning, session loop management, and direct API invocation for Polaris.
 *
 * Owns the routing logic that determines which backend handles each session:
 * - Direct agent (runDirectAgent): OpenRouter API, rolling 20-turn window, native tools
 * - Max chat (spawnMaxChat): Claude Max plan via claude CLI
 * - Chat router (spawnChatRouter): dispatches to max or OpenRouter based on config
 * - Codex session (spawnCodexSession): Codex via claude CLI
 * - GPT chat (spawnGptChat): OpenAI API direct
 *
 * Dependencies: contracts (types), sessionStore (state), Node fs/path/child_process
 *
 * Topology: contracts ← sessionStore ← agentRuntime ← WebSocket adapter
 *
 * IMPORTANT: This module defines the interface and types for the agent runtime.
 * The actual spawning implementations delegate to server.js during the incremental
 * refactoring. Full extraction happens in Phase 6 (WebSocket adapter refactoring).
 */

import type { SessionRecord, PendingTurn } from './sessionStore';

// ─────────────────────────────────────────────────────────────────────────────
// AGENT BACKEND TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** The backend engine that handles a session's AI calls. */
export type AgentBackend =
  | 'direct'   // OpenRouter API via runDirectAgent — rolling 20-turn window
  | 'max-chat' // Claude Max plan via claude CLI (spawnMaxChat)
  | 'codex'    // Claude Code CLI codex mode (spawnCodexSession)
  | 'gpt'      // OpenAI API direct (spawnGptChat)
  | 'routine'; // DeepSeek single-turn via spawnDeepSeekRoutine

/** Tier selection for max-chat backend. */
export type ChatTier = 'balanced' | 'power' | 'floor';

/** Full configuration for launching a new agent session. */
export interface AgentLaunchOptions {
  sessionId: string;
  prompt: string;
  displayPrompt?: string;
  workDir?: string | null;
  projectName?: string | null;
  model?: string | null;
  tier?: ChatTier;
  backend?: AgentBackend;
  routineTag?: string | null;
  taskNumber?: number | null;
  taskTitle?: string | null;
  chipLabel?: string | null;
  chipColor?: string | null;
  images?: AttachmentRef[];
  docs?: AttachmentRef[];
  audio?: AttachmentRef[];
  videos?: AttachmentRef[];
}

/** A reference to an attached file sent with a session turn. */
export interface AttachmentRef {
  name: string;
  dataUrl?: string;
  mimeType?: string;
}

/** A resume turn — re-entering an existing session with a new prompt. */
export interface ResumeTurnOptions {
  sessionId: string;
  prompt: string;
  displayPrompt?: string;
  resumeId?: string;
  model?: string | null;
  projectName?: string | null;
  images?: AttachmentRef[];
  docs?: AttachmentRef[];
  audio?: AttachmentRef[];
  videos?: AttachmentRef[];
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND ROUTING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine which backend should handle a session based on its flags.
 * Mirrors the routing logic in server.js handleMessage (launch / resume handlers).
 */
export function resolveBackend(session: Pick<SessionRecord, 'isCodex' | 'isGpt' | 'isChat' | 'routineTag'>): AgentBackend {
  if (session.isCodex) return 'codex';
  if (session.isGpt) return 'gpt';
  if (session.isChat) return 'max-chat';
  return 'direct';
}

/**
 * Resolve the effective model label for a max-chat session.
 * Max plan exposes: Sonnet 4.6 (balanced), Opus 4.7 (power), Haiku 4.5 (floor).
 */
export function resolveMaxChatModel(tier: ChatTier, overrideModel?: string | null): string {
  if (overrideModel) return overrideModel;
  switch (tier) {
    case 'power':   return 'anthropic/claude-opus-4-7 (Max plan)';
    case 'floor':   return 'anthropic/claude-haiku-4-5-20251001 (Max plan)';
    case 'balanced':
    default:        return 'anthropic/claude-sonnet-4-6 (Max plan)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION LIFECYCLE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when a session ends (normally or on error). Clears runtime memory and
 * drains any pending turns into the queue for sequential execution.
 * Mirrors the end-of-turn cleanup in runDirectAgent / spawnMaxChat.
 */
export interface SessionEndCallbacks {
  broadcast: (msg: object) => void;
  saveSessions: () => void;
  releaseSessionMemory: (sessionId: string) => void;
  drainPendingTurns: (sessionId: string) => void;
}

export function handleSessionEnd(
  session: SessionRecord,
  { broadcast, saveSessions, releaseSessionMemory, drainPendingTurns }: SessionEndCallbacks
): void {
  session.status = 'done';
  session.endAt = Date.now();
  broadcast({ type: 'session-status', sessionId: session.id, status: 'done' });
  saveSessions();
  releaseSessionMemory(session.id);
  drainPendingTurns(session.id);
}

export function handleSessionError(
  session: SessionRecord,
  errorText: string,
  { broadcast, saveSessions, releaseSessionMemory, drainPendingTurns }: SessionEndCallbacks
): void {
  session.status = 'error';
  session.endAt = Date.now();
  broadcast({ type: 'line', sessionId: session.id, text: errorText, role: 'error' });
  broadcast({ type: 'session-status', sessionId: session.id, status: 'error' });
  saveSessions();
  releaseSessionMemory(session.id);
  drainPendingTurns(session.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING TURN QUEUE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a turn to a session's pending queue. Used when a prompt arrives while the
 * session is already running — it waits until the current task completes.
 */
export function enqueuePendingTurn(session: SessionRecord, turn: PendingTurn): void {
  if (!Array.isArray(session.pendingTurns)) session.pendingTurns = [];
  session.pendingTurns.push(turn);
}

/**
 * Dequeue the next pending turn for execution. Returns null if queue is empty.
 */
export function dequeuePendingTurn(session: SessionRecord): PendingTurn | null {
  if (!Array.isArray(session.pendingTurns) || session.pendingTurns.length === 0) return null;
  return session.pendingTurns.shift() || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION NAME GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a display name for a session from its opening prompt.
 * Matches the logic in server.js generateSessionName().
 */
export function generateSessionName(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 50 ? words.slice(0, 47) + '...' : words;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKTREE MANAGEMENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of creating a session worktree. Null means worktree creation was
 * skipped (non-git directory, CHAT_DIR, or git command failed).
 */
export interface WorktreeResult {
  worktreePath: string;
  repoWorkDir: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COST & USAGE TRACKING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
}

export interface SessionCostUpdate {
  sessionId: string;
  usage: TokenUsage;
  model?: string;
}
