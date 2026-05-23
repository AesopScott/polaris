/**
 * @module crossCheck
 * Cross-Check approval/rejection gate and audit trail for Polaris.
 *
 * Cross-Check intercepts Write/Edit/Bash operations in the agent loop, sends
 * a diff to a reviewer model (default: claude-haiku-4-5), and blocks execution
 * until the user approves or rejects via the UI. Audit records are persisted as
 * JSONL files in CROSS_CHECKS_DIR (one file per session, pruned to 500 total).
 *
 * Two gate modes:
 * - Pre-approval (runCrossCheckAndApproval): block Write before it executes
 * - Post-hoc (runPostHocCrossCheck): audit Bash/shell writes after execution,
 *   offer "Keep change" / "Restore original" to the user
 *
 * Dependencies: contracts (types), Node fs/path
 *
 * Topology: contracts ← crossCheck ← toolRuntime, agentRuntime, WebSocket adapter
 */

import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const CROSS_CHECK_DEFAULT_MODEL = 'anthropic/claude-haiku-4-5';
/** Max bytes of combined before+after diff sent to the reviewer model. */
export const CROSS_CHECK_DIFF_BUDGET = 100 * 1024;
/** Approval prompt timeout — defaults to reject for safety. */
export const CROSS_CHECK_TIMEOUT_MS = 600_000; // 10 min
/** Installer permission timeout — defaults to reject for safety. */
export const INSTALLER_PERMISSION_TIMEOUT_MS = 300_000; // 5 min
/** Max total cross-check entries retained across all sessions. */
export const CROSS_CHECK_MAX_ENTRIES = 500;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Result produced by the reviewer model for a single diff. */
export interface CrossCheckReview {
  verdict: 'approve' | 'reject' | 'warn';
  summary: string;
  issues: string[];
  model: string;
  ms: number;
}

/** A single cross-check audit record persisted to JSONL. */
export interface CrossCheckEntry {
  ts: string;               // ISO timestamp
  sessionId: string;
  filePath: string;
  operation: string;        // 'write' | 'edit' | 'bash' | 'post-hoc'
  verdict: string;
  decision: 'approved' | 'rejected' | 'auto-approved' | 'timed-out';
  originalBytes?: number;
  newBytes?: number;
  model?: string;
  ms?: number;
}

/** In-flight approval gate waiting for the user's UI response. */
export interface PendingCrossCheck {
  resolve: (decision: 'approve' | 'reject') => void;
  timer: NodeJS.Timeout;
}

/** In-flight installer permission gate. */
export interface PendingInstallerCheck {
  resolve: (decision: 'approve' | 'reject') => void;
  timer: NodeJS.Timeout;
}

/** Arguments for the pre-approval cross-check gate. */
export interface CrossCheckApprovalArgs {
  sessionId: string;
  filePath: string;
  operation: string;
  review: CrossCheckReview;
  originalLines: number;
  newLines: number;
  originalBytes: number;
  newBytes: number;
}

/** Arguments for the post-hoc cross-check gate. */
export interface PostHocCrossCheckArgs {
  sessionId: string;
  filePath: string;
  operation: string;
  originalContent: string;
  newContent: string;
  workDir: string;
}

/** Arguments for the installer permission gate. */
export interface InstallerPermissionArgs {
  sessionId: string;
  exePath: string;
  command: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME STATE
// ─────────────────────────────────────────────────────────────────────────────

/** Live cross-check gates awaiting user decision. checkId → gate state. */
export const pendingCrossChecks = new Map<string, PendingCrossCheck>();

/** Live installer permission gates awaiting user decision. checkId → gate state. */
export const pendingInstallerChecks = new Map<string, PendingInstallerCheck>();

/** Live post-hoc gates awaiting keep/restore decision. checkId → gate state. */
export const pendingPostHocChecks = new Map<string, PendingCrossCheck>();

// Injected at init
let _crossChecksDir: string;
let _broadcast: (msg: object) => void;

export function initCrossCheck(opts: {
  crossChecksDir: string;
  broadcast: (msg: object) => void;
}): void {
  _crossChecksDir = opts.crossChecksDir;
  _broadcast = opts.broadcast;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT TRAIL
// ─────────────────────────────────────────────────────────────────────────────

/** Append a cross-check audit entry to the session's JSONL file. */
export function recordCrossCheck(sessionId: string, entry: CrossCheckEntry): void {
  fs.mkdirSync(_crossChecksDir, { recursive: true });
  const file = path.join(_crossChecksDir, `${sessionId}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  pruneOldCrossChecks();
}

/** Prune oldest JSONL files when total entries exceed CROSS_CHECK_MAX_ENTRIES. */
export function pruneOldCrossChecks(): void {
  try {
    if (!fs.existsSync(_crossChecksDir)) return;
    const files = fs.readdirSync(_crossChecksDir).filter(f => f.endsWith('.jsonl'));
    let total = 0;
    const stats = files.map(f => {
      const p = path.join(_crossChecksDir, f);
      const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).length;
      total += lines;
      return { path: p, lines, mtime: fs.statSync(p).mtimeMs };
    });
    if (total <= CROSS_CHECK_MAX_ENTRIES) return;
    stats.sort((a, b) => a.mtime - b.mtime);
    for (const f of stats) {
      if (total <= CROSS_CHECK_MAX_ENTRIES) break;
      fs.unlinkSync(f.path);
      total -= f.lines;
    }
  } catch {}
}

/** Load all cross-check entries for a single session. */
export function loadCrossChecksForSession(sessionId: string): CrossCheckEntry[] {
  const file = path.join(_crossChecksDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as CrossCheckEntry; } catch { return null; } })
    .filter((e): e is CrossCheckEntry => e !== null);
}

/** Load recent cross-check entries across all sessions, newest first. */
export function loadAllCrossChecks(limit = 200): CrossCheckEntry[] {
  if (!fs.existsSync(_crossChecksDir)) return [];
  const files = fs.readdirSync(_crossChecksDir).filter(f => f.endsWith('.jsonl'));
  const all: CrossCheckEntry[] = [];
  for (const f of files) {
    const sessionId = f.replace(/\.jsonl$/, '');
    const entries = loadCrossChecksForSession(sessionId);
    for (const e of entries) all.push({ ...e, sessionId });
  }
  return all
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL GATES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Broadcast a cross-check result and wait for the user to approve or reject.
 * Times out after CROSS_CHECK_TIMEOUT_MS and defaults to 'reject' for safety.
 * Mirrors askForCrossCheckApproval() in server.js.
 */
export function askForCrossCheckApproval(args: CrossCheckApprovalArgs): Promise<'approve' | 'reject'> {
  return new Promise(resolve => {
    const checkId = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      if (pendingCrossChecks.has(checkId)) {
        pendingCrossChecks.delete(checkId);
        resolve('reject');
      }
    }, CROSS_CHECK_TIMEOUT_MS);
    pendingCrossChecks.set(checkId, { resolve, timer });
    _broadcast({
      type: 'cross-check-pending',
      checkId, sessionId: args.sessionId, filePath: args.filePath, operation: args.operation,
      verdict: args.review.verdict, summary: args.review.summary, issues: args.review.issues,
      model: args.review.model, ms: args.review.ms,
      originalLines: args.originalLines, newLines: args.newLines,
      originalBytes: args.originalBytes, newBytes: args.newBytes,
    });
  });
}

/**
 * Resolve a pending cross-check gate when the user responds via WebSocket.
 * Called by the WebSocket handler for 'cross-check-decision' messages.
 */
export function resolveCrossCheck(checkId: string, decision: 'approve' | 'reject'): boolean {
  const pending = pendingCrossChecks.get(checkId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingCrossChecks.delete(checkId);
  pending.resolve(decision);
  return true;
}

/**
 * Broadcast an installer permission prompt and wait for approval or rejection.
 * Times out after INSTALLER_PERMISSION_TIMEOUT_MS and defaults to 'reject'.
 * Mirrors askForInstallerPermission() in server.js.
 */
export function askForInstallerPermission(args: InstallerPermissionArgs): Promise<'approve' | 'reject'> {
  return new Promise(resolve => {
    const checkId = `ins_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      if (pendingInstallerChecks.has(checkId)) {
        pendingInstallerChecks.delete(checkId);
        resolve('reject');
      }
    }, INSTALLER_PERMISSION_TIMEOUT_MS);
    pendingInstallerChecks.set(checkId, { resolve, timer });
    _broadcast({
      type: 'installer-permission-pending',
      checkId, sessionId: args.sessionId, exePath: args.exePath,
      command: args.command.slice(0, 300),
    });
  });
}

/**
 * Resolve a pending installer permission gate when the user responds.
 * Called by the WebSocket handler for 'installer-permission-decision' messages.
 */
export function resolveInstallerPermission(checkId: string, decision: 'approve' | 'reject'): boolean {
  const pending = pendingInstallerChecks.get(checkId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingInstallerChecks.delete(checkId);
  pending.resolve(decision);
  return true;
}

/**
 * Resolve a pending post-hoc cross-check gate (keep/restore decision).
 * Called by the WebSocket handler for 'cross-check-post-hoc-decision' messages.
 */
export function resolvePostHocCrossCheck(checkId: string, decision: 'approve' | 'reject'): boolean {
  const pending = pendingPostHocChecks.get(checkId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingPostHocChecks.delete(checkId);
  pending.resolve(decision);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIFF HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Truncate a diff string to the budget limit with an ellipsis marker. */
export function truncateDiff(diff: string): string {
  const bytes = Buffer.byteLength(diff, 'utf8');
  if (bytes <= CROSS_CHECK_DIFF_BUDGET) return diff;
  return diff.slice(0, CROSS_CHECK_DIFF_BUDGET) + '\n[... diff truncated ...]';
}

/** Generate a unified diff header prefix for display. */
export function diffHeader(originalBytes: number, newBytes: number, originalLines: number, newLines: number): string {
  const delta = newBytes - originalBytes;
  const sign = delta >= 0 ? '+' : '';
  return `${originalLines}→${newLines} lines, ${sign}${delta} bytes`;
}
