/**
 * Cross-Check approval/rejection gate and audit trail for Polaris.
 * Transliterated from src/runtime/crossCheck.ts
 */

const fs = require('fs');
const path = require('path');

// Constants
const CROSS_CHECK_DEFAULT_MODEL = 'anthropic/claude-haiku-4-5';
const CROSS_CHECK_DIFF_BUDGET = 100 * 1024;
const CROSS_CHECK_TIMEOUT_MS = 600_000;
const INSTALLER_PERMISSION_TIMEOUT_MS = 300_000;
const CROSS_CHECK_MAX_ENTRIES = 500;

// Runtime state
const pendingCrossChecks = new Map();
const pendingInstallerChecks = new Map();
const pendingPostHocChecks = new Map();

let _crossChecksDir = null;
let _broadcast = null;

function initCrossCheck(opts) {
  if (!opts) throw new Error('initCrossCheck requires options');
  _crossChecksDir = opts.crossChecksDir;
  _broadcast = opts.broadcast;
  if (!_crossChecksDir || typeof _crossChecksDir !== 'string') {
    throw new Error('initCrossCheck: crossChecksDir must be a string');
  }
  if (!_broadcast || typeof _broadcast !== 'function') {
    throw new Error('initCrossCheck: broadcast must be a function');
  }
}

function recordCrossCheck(sessionId, entry) {
  if (!_crossChecksDir) {
    console.warn('[cross-check] recordCrossCheck called before initCrossCheck');
    return;
  }
  try {
    fs.mkdirSync(_crossChecksDir, { recursive: true });
    const file = path.join(_crossChecksDir, `${sessionId}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    pruneOldCrossChecks();
  } catch (e) {
    console.error('[cross-check] recordCrossCheck failed:', e.message);
  }
}

function pruneOldCrossChecks() {
  if (!_crossChecksDir) return;
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
  } catch (e) {
    console.warn('[cross-check] pruneOldCrossChecks error:', e.message);
  }
}

function loadCrossChecksForSession(sessionId) {
  if (!_crossChecksDir) return [];
  const file = path.join(_crossChecksDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e !== null);
  } catch (e) {
    console.warn('[cross-check] loadCrossChecksForSession error:', e.message);
    return [];
  }
}

function loadAllCrossChecks(limit = 200) {
  if (!_crossChecksDir || !fs.existsSync(_crossChecksDir)) return [];
  try {
    const files = fs.readdirSync(_crossChecksDir).filter(f => f.endsWith('.jsonl'));
    const all = [];
    for (const f of files) {
      const sessionId = f.replace(/\.jsonl$/, '');
      const entries = loadCrossChecksForSession(sessionId);
      for (const e of entries) {
        all.push({ ...e, sessionId });
      }
    }
    return all
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
      .slice(0, limit);
  } catch (e) {
    console.warn('[cross-check] loadAllCrossChecks error:', e.message);
    return [];
  }
}

function askForCrossCheckApproval(args) {
  if (!_broadcast) {
    console.warn('[cross-check] askForCrossCheckApproval called before initCrossCheck');
    return Promise.resolve('reject');
  }
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

function resolveCrossCheck(checkId, decision) {
  const pending = pendingCrossChecks.get(checkId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingCrossChecks.delete(checkId);
  pending.resolve(decision);
  return true;
}

function askForInstallerPermission(args) {
  if (!_broadcast) {
    console.warn('[cross-check] askForInstallerPermission called before initCrossCheck');
    return Promise.resolve('reject');
  }
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

function resolveInstallerPermission(checkId, decision) {
  const pending = pendingInstallerChecks.get(checkId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingInstallerChecks.delete(checkId);
  pending.resolve(decision);
  return true;
}

function resolvePostHocCrossCheck(checkId, decision) {
  const pending = pendingPostHocChecks.get(checkId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingPostHocChecks.delete(checkId);
  pending.resolve(decision);
  return true;
}

function truncateDiff(diff) {
  const bytes = Buffer.byteLength(diff, 'utf8');
  if (bytes <= CROSS_CHECK_DIFF_BUDGET) return diff;
  return diff.slice(0, CROSS_CHECK_DIFF_BUDGET) + '\n[... diff truncated ...]';
}

function diffHeader(originalBytes, newBytes, originalLines, newLines) {
  const delta = newBytes - originalBytes;
  const sign = delta >= 0 ? '+' : '';
  return `${originalLines}→${newLines} lines, ${sign}${delta} bytes`;
}

module.exports = {
  CROSS_CHECK_DEFAULT_MODEL,
  CROSS_CHECK_DIFF_BUDGET,
  CROSS_CHECK_TIMEOUT_MS,
  INSTALLER_PERMISSION_TIMEOUT_MS,
  CROSS_CHECK_MAX_ENTRIES,
  pendingCrossChecks,
  pendingInstallerChecks,
  pendingPostHocChecks,
  initCrossCheck,
  recordCrossCheck,
  pruneOldCrossChecks,
  loadCrossChecksForSession,
  loadAllCrossChecks,
  askForCrossCheckApproval,
  resolveCrossCheck,
  askForInstallerPermission,
  resolveInstallerPermission,
  resolvePostHocCrossCheck,
  truncateDiff,
  diffHeader,
};
