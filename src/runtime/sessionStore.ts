/**
 * @module sessionStore
 * Session state management and persistence for Polaris.
 *
 * Owns the authoritative in-memory sessions Map and forkMap, plus all
 * read/write operations against the persistence layer (sessions-persist.json
 * and per-session message files). No agent logic lives here — this module is
 * a pure state store with typed accessors.
 *
 * Dependencies: contracts (types only), Node fs/path (no network calls)
 *
 * Topology: contracts (leaf) ← sessionStore ← agentRuntime, httpRoutes, WebSocket adapter
 */

import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// PATHS (injected at init; defaults mirror server.js constants)
// ─────────────────────────────────────────────────────────────────────────────

let SESSIONS_DIR: string;
let SESSIONS_PERSIST_PATH: string;

export function initSessionStore(opts: { sessionsDir: string; sessionsPersistPath: string }): void {
  SESSIONS_DIR = opts.sessionsDir;
  SESSIONS_PERSIST_PATH = opts.sessionsPersistPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STATE
// ─────────────────────────────────────────────────────────────────────────────

/** Primary session registry. sessionId → session object. */
export const sessions = new Map<string, SessionRecord>();

/** Fork relationships. primarySessionId → forked sessionId. */
export const forkMap = new Map<string, string>();

// ─────────────────────────────────────────────────────────────────────────────
// SESSION SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  name: string;
  workDir: string | null;
  projectName: string | null;
  chipLabel: string | null;
  chipColor: string | null;
  model: string | null;
  isChat: boolean;
  isGpt: boolean;
  isCodex: boolean;
  status: 'running' | 'done' | 'error' | 'paused';
  startAt: number;
  endAt: number | null;
  claudeSessionId: string | null;
  codexThreadId: string | null;
  lastPrompt: string | null;
  height: number | null;
  column: number | null;
  pinned: boolean;
  lines: SessionLine[];
  lastUsage: any | null;
  totalCost: number;
  isForked: boolean;
  primarySessionId: string | null;
  taskNumber: number | null;
  taskState: string | null;
  lastSkill: string | null;
  // Runtime-only fields (not persisted)
  proc: any;
  watcher: any;
  timeout: NodeJS.Timeout | null;
  messages?: any[];
  pendingTurns?: PendingTurn[];
  steeringQueue?: SteeringItem[];
  pendingImages?: any[];
  pendingDocs?: any[];
  pendingAudio?: any[];
  pendingVideos?: any[];
  repoWorkDir?: string;
  worktreePath?: string;
  tier?: string;
  routineTag?: string;
}

export interface SessionLine {
  role: string;
  text: string;
  timestamp?: number;
}

export interface PendingTurn {
  prompt: string;
  displayPrompt?: string;
  resumeId?: string;
  model?: string;
  projectName?: string;
  images?: any[];
  docs?: any[];
  audio?: any[];
  videos?: any[];
  displayed?: boolean;
}

export interface SteeringItem {
  text: string;
  displayText?: string;
  displayed?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK STATE INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

/** Maps backlog task status → the last skill that produced it. */
const BACKLOG_STATUS_TO_LAST_SKILL: Record<string, string> = {
  'planned':        'plan-task',
  'ready':          'plan-task',
  'build-started':  'start-build',
  'in-progress':    'start-build',
  'build-finished': 'finish-build',
  'in-review':      'finish-build',
  'review-blocked': 'codex-review',
  'pr-reviewed':    'review-pr',
  'staged':         'promote-stage',
  'production':     'promote-to-prod',
  'complete':       'mark-tasks-complete',
  'done':           'promote-stage',
};

export function inferTaskState(session: Pick<SessionRecord, 'name' | 'workDir'>): {
  taskNumber: number;
  taskState: string;
  lastSkill: string | null;
} | null {
  const match = (session.name || '').match(/^Task #(\d+):/);
  if (!match) return null;
  const taskNumber = parseInt(match[1], 10);
  if (!session.workDir) return null;
  const backlogPath = path.join(session.workDir, 'docs', 'backlog.json');
  try {
    const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    const tasks = Array.isArray(backlog) ? backlog : (backlog.tasks || []);
    const task = tasks.find((t: any) => t.number === taskNumber);
    if (!task || !task.status) return null;
    return {
      taskNumber,
      taskState: task.status,
      lastSkill: BACKLOG_STATUS_TO_LAST_SKILL[task.status] || null,
    };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

export function serializeSession(s: SessionRecord): object {
  return {
    id: s.id, name: s.name, workDir: s.workDir, projectName: s.projectName,
    chipLabel: s.chipLabel || null, chipColor: s.chipColor || null,
    model: s.model || null, isChat: s.isChat || false, isGpt: s.isGpt || false, isCodex: s.isCodex || false,
    status: s.status === 'running' ? 'done' : s.status,
    startAt: s.startAt, endAt: s.endAt || null,
    claudeSessionId: s.claudeSessionId || null,
    codexThreadId: s.codexThreadId || null,
    lastPrompt: s.lastPrompt || null,
    height: s.height || null,
    column: s.column != null ? s.column : null,
    pinned: !!s.pinned,
    lines: (s.lines || []).slice(-300),
    lastUsage: s.lastUsage || null,
    totalCost: s.totalCost || 0,
    isForked: !!s.isForked,
    primarySessionId: s.primarySessionId || null,
    taskNumber: s.taskNumber || null,
    taskState: s.taskState || null,
    lastSkill: s.lastSkill || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

/** Persist all sessions to disk. Called after any state mutation that should survive restart. */
export function saveSessions(): void {
  try {
    fs.writeFileSync(
      SESSIONS_PERSIST_PATH,
      JSON.stringify(Array.from(sessions.values()).map(serializeSession), null, 2),
      'utf8'
    );
  } catch { /* non-fatal */ }
}

/** Load sessions from disk at startup. Restores state without runtime fields. */
export function loadPersistedSessions(): void {
  try {
    const arr = JSON.parse(fs.readFileSync(SESSIONS_PERSIST_PATH, 'utf8'));
    if (!Array.isArray(arr)) return;
    for (const s of arr) {
      if (!s.id) continue;
      const loaded: SessionRecord = {
        ...s,
        status: s.status === 'running' ? 'done' : s.status,
        proc: null, watcher: null, timeout: null,
        lines: s.lines || [],
      };
      if (!loaded.taskNumber) {
        const inferred = inferTaskState(loaded);
        if (inferred) {
          loaded.taskNumber = inferred.taskNumber;
          loaded.taskState  = loaded.taskState  || inferred.taskState;
          loaded.lastSkill  = loaded.lastSkill  || inferred.lastSkill;
        }
      }
      sessions.set(s.id, loaded);
    }
    for (const s of arr) {
      if (s.isForked && s.primarySessionId) {
        forkMap.set(s.primarySessionId, s.id);
      }
    }
  } catch { /* no file on first run */ }
}

/** Save message history for a single session to its own file. */
export function saveSessionMessages(sessionId: string): void {
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const s = sessions.get(sessionId);
    if (!s || !s.messages) return;
    fs.writeFileSync(
      path.join(SESSIONS_DIR, `${sessionId}.json`),
      JSON.stringify(s.messages, null, 2),
      'utf8'
    );
  } catch (e: any) { console.warn('[sessions] message save failed:', e.message); }
}

/** Load message history for a single session from disk. */
export function loadSessionMessages(sessionId: string): any[] {
  try {
    const p = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPED ACCESSORS
// ─────────────────────────────────────────────────────────────────────────────

export function getSession(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, record: SessionRecord): void {
  sessions.set(sessionId, record);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
  // clean up any fork relationship
  forkMap.delete(sessionId);
  for (const [primary, fork] of forkMap.entries()) {
    if (fork === sessionId) forkMap.delete(primary);
  }
}

export function listSessionIds(): string[] {
  return Array.from(sessions.keys());
}

export function listActiveSessions(): SessionRecord[] {
  return Array.from(sessions.values()).filter(s => s.status === 'running');
}

export function getForkId(primarySessionId: string): string | undefined {
  return forkMap.get(primarySessionId);
}

export function registerFork(primarySessionId: string, forkSessionId: string): void {
  forkMap.set(primarySessionId, forkSessionId);
}
