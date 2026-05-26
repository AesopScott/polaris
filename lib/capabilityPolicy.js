'use strict';

/**
 * capabilityPolicy.js — pure policy logic, no server dependencies.
 *
 * Extracted from server.js so that unit tests can import it without a live
 * server, WebSocket, or audit file. The public evaluatePolicy() in server.js
 * wraps _evaluatePolicyCore() with side-effects (audit JSONL + WS broadcast).
 *
 * Exports:
 *   DEFAULT_BLOCKED_CLASSES  — string[] of command class names blocked at standard trust
 *   COMMAND_CLASS_REGISTRY   — ReadonlyMap<string, CommandClassEntry>
 *   SHELL_WRITE_VERBS        — RegExp matching write-oriented shell verbs
 *   detectInstallerExe       — (command: string) => string | null
 *   buildDefaultPolicy       — (session, config) => CapabilityPolicy (frozen)
 *   _evaluatePolicyCore      — (action, context, policy) => PolicyResult (pure, no I/O)
 */

const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Command class names blocked at standard trust level.
 * @type {ReadonlyArray<string>}
 */
const DEFAULT_BLOCKED_CLASSES = Object.freeze([
  'GIT_FORCE_PUSH',
  'GIT_RESET_HARD',
  'GIT_CLEAN',
  'DRIVE_FORMAT',
  'RM_RECURSIVE_ROOT',
  'RD_FULL_DRIVE',
]);

/**
 * @typedef {Object} CommandClassEntry
 * @property {string} name - Unique identifier for this command class entry
 * @property {string} commandClass - Class name (matches DEFAULT_BLOCKED_CLASSES values from CapabilityPolicy)
 * @property {'any'|'standard'|'restricted'} minimumTrustLevel - Trust level at which this class is blocked
 * @property {string} reason - Human-readable block reason shown in error messages
 * @property {function(string): boolean} detect - Returns true if the flattened command matches this class
 */

/** @type {ReadonlyMap<string, CommandClassEntry>} */
const COMMAND_CLASS_REGISTRY = Object.freeze(new Map([
  ['GIT_FORCE_PUSH', Object.freeze({
    name: 'GIT_FORCE_PUSH',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'force-push is blocked — run manually if needed',
    detect: cmd => /\bgit\s+push\s+(-f\b|--force\b)/i.test(cmd),
  })],
  ['GIT_RESET_HARD', Object.freeze({
    name: 'GIT_RESET_HARD',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'git reset --hard is blocked — run manually if needed',
    detect: cmd => /\bgit\s+reset\s+--hard\b/i.test(cmd),
  })],
  ['GIT_CLEAN', Object.freeze({
    name: 'GIT_CLEAN',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'git clean -f is blocked — run manually if needed',
    detect: cmd => /\bgit\s+clean\s+-[a-zA-Z]*f/i.test(cmd),
  })],
  ['DRIVE_FORMAT', Object.freeze({
    name: 'DRIVE_FORMAT',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'drive format is blocked',
    detect: cmd => /\bformat\s+[a-zA-Z]:/i.test(cmd),
  })],
  ['RM_RECURSIVE_ROOT', Object.freeze({
    name: 'RM_RECURSIVE_ROOT',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'recursive delete at filesystem root is blocked',
    detect: cmd => /\brm\s+-[rRfF ]*[rR][fF]?\s+[/"']*[\/\\]/i.test(cmd),
  })],
  ['RD_FULL_DRIVE', Object.freeze({
    name: 'RD_FULL_DRIVE',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'full-drive rd is blocked',
    detect: cmd => /\brd\s+\/s\s+\/q\s+[a-zA-Z]:\\\s*$/i.test(cmd),
  })],
]));

/** Write-oriented shell verbs — used to gate the path-boundary check. */
const SHELL_WRITE_VERBS = /\b(rm|del|rd|rmdir|Remove-Item|ri|move|mv|ren|rename|copy|cp|xcopy|robocopy|Set-Content|Out-File|New-Item|Add-Content|Write-Output\s*>|echo\s+.+>)\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the first installer-like .exe absolute path found in the command
 * string, or null. Catches dist/*.exe, setup*.exe, and install*.exe paths.
 * @param {string} command
 * @returns {string | null}
 */
function detectInstallerExe(command) {
  const flat = command.replace(/\r?\n/g, ' ');
  const exeRe = /[a-zA-Z]:[\\\/][^\s"'<>|&;,)]+\.exe/gi;
  for (const match of (flat.match(exeRe) || [])) {
    const norm = match.toLowerCase().replace(/\\/g, '/');
    if (/\/(setup|install|installer)[^/]*\.exe/.test(norm)) return match;
    if (/\/dist\/[^/]+\.exe/.test(norm)) return match;
    if (/setup\.exe$/.test(norm)) return match;
  }
  return null;
}

// ── Policy builder ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CapabilityPolicy
 * @property {string[]} allowedRoots    - Absolute paths the session may write to.
 * @property {'read-only'|'project-only'|'extended'} writeMode
 *   - read-only:    no writes permitted
 *   - project-only: workDir only
 *   - extended:     workDir + Obsidian vault + Downloads
 * @property {boolean} networkAllowed   - WebFetch/WebSearch permitted.
 * @property {boolean} installerAllowed - .exe installer execution pre-approved for this session.
 * @property {string[]} blockedCommandClasses - Named command classes blocked at this trust level.
 *   Valid class names: GIT_FORCE_PUSH, GIT_RESET_HARD, GIT_CLEAN, DRIVE_FORMAT,
 *   RM_RECURSIVE_ROOT, RD_FULL_DRIVE.
 * @property {'restricted'|'standard'|'elevated'} trustLevel
 *   - restricted: no workDir configured; writes and shell blocked by default
 *   - standard:   normal agent session
 *   - elevated:   explicitly granted by user (installer allowed, fewer class blocks)
 */

/**
 * Build a frozen CapabilityPolicy for a session. Called once at session launch.
 * @param {{ workDir?: string }} session
 * @param {{ obsidianVaultPath?: string }} config
 * @returns {CapabilityPolicy}
 */
function buildDefaultPolicy(session, config) {
  const wd = session.workDir ? path.resolve(session.workDir) : null;
  const roots = wd ? [wd] : [];
  if (wd) {
    const obsidian = config && config.obsidianVaultPath ? config.obsidianVaultPath : null;
    const downloads = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : null;
    if (obsidian) roots.push(obsidian);
    if (downloads) roots.push(downloads);
  }
  return Object.freeze({
    allowedRoots:          Object.freeze(roots),
    writeMode:             wd ? 'extended' : 'read-only',
    networkAllowed:        true,
    installerAllowed:      false,
    blockedCommandClasses: DEFAULT_BLOCKED_CLASSES,
    trustLevel:            wd ? 'standard' : 'restricted',
  });
}

// ── Core evaluator ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AuditEvent
 * @property {string} ts - ISO timestamp
 * @property {string} sessionId
 * @property {string} action - 'write'|'bash'|'powershell'|'installer'|etc
 * @property {string|null} tool - Tool name as reported by the caller (e.g. 'Write', 'Bash')
 * @property {boolean} allowed
 * @property {string} [reason] - Block reason (if !allowed)
 * @property {string} [commandSnippet] - First 120 chars of command (for shell actions)
 */

/**
 * @typedef {Object} PolicyResult
 * @property {boolean} allowed
 * @property {string} [reason] - Human-readable block reason
 * @property {AuditEvent} auditEvent
 */

/**
 * Inner policy evaluator — pure logic, no side-effects.
 * Callers (evaluatePolicy in server.js) add audit I/O and WebSocket broadcast.
 *
 * @param {string} action - 'write'|'edit'|'bash'|'powershell'
 * @param {{filePath?: string, command?: string, workDir?: string, sessionId: string, tool?: string}} context
 * @param {CapabilityPolicy} policy
 * @returns {PolicyResult}
 */
function _evaluatePolicyCore(action, context, policy) {
  const ts = new Date().toISOString();
  const auditEvent = {
    ts,
    sessionId: context.sessionId,
    action,
    tool: context.tool || null,
    allowed: true,
  };

  if (action === 'write' || action === 'edit') {
    // Write boundary check
    if (policy.writeMode === 'read-only') {
      const reason = 'Write blocked: session is read-only';
      auditEvent.allowed = false;
      auditEvent.reason = reason;
      return { allowed: false, reason, auditEvent };
    }

    const filePath = context.filePath && path.resolve(context.filePath);
    if (!filePath) {
      const reason = 'Write blocked: no file path provided';
      auditEvent.allowed = false;
      auditEvent.reason = reason;
      return { allowed: false, reason, auditEvent };
    }

    let isAllowed = false;
    for (const root of policy.allowedRoots) {
      const rr = path.resolve(root).toLowerCase();
      const fp = filePath.toLowerCase();
      if (fp === rr || fp.startsWith(rr + path.sep)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      const reason = `Write blocked: path "${context.filePath}" is outside allowed roots (${policy.allowedRoots.join(', ')})`;
      auditEvent.allowed = false;
      auditEvent.reason = reason;
      return { allowed: false, reason, auditEvent };
    }
  }

  if (action === 'bash' || action === 'powershell') {
    const command = context.command || '';
    const flat    = command.replace(/\r?\n/g, ' ');  // normalise newlines once; used for both checks below
    auditEvent.commandSnippet = command.slice(0, 120);

    // Command class registry check — use newline-flattened `flat` to match assertSafeCommand behaviour
    for (const entry of COMMAND_CLASS_REGISTRY.values()) {
      if (entry.detect(flat)) {
        if (policy.blockedCommandClasses && policy.blockedCommandClasses.includes(entry.name)) {
          const reason = `Shell command blocked: ${entry.reason}`;
          auditEvent.allowed = false;
          auditEvent.reason = reason;
          return { allowed: false, reason, auditEvent };
        }
      }
    }

    // Write boundary check for shell commands
    if (SHELL_WRITE_VERBS.test(flat)) {
      const absPathRe = /[a-zA-Z]:[\\\/][^\s'">,;|&)>]*/g;
      const wd = context.workDir ? path.resolve(context.workDir).toLowerCase() : null;
      for (const p of (flat.match(absPathRe) || [])) {
        const resolved = path.resolve(p).toLowerCase();
        if (wd && !resolved.startsWith(wd)) {
          const reason = `Shell command blocked: path "${p}" is outside the project directory`;
          auditEvent.allowed = false;
          auditEvent.reason = reason;
          return { allowed: false, reason, auditEvent };
        }
      }
    }

    // Installer detection and gate
    const installerPath = detectInstallerExe(command);
    if (installerPath) {
      if (!policy.installerAllowed) {
        const reason = `Installer blocked: ${installerPath} — installer execution not pre-approved for this session`;
        auditEvent.allowed = false;
        auditEvent.reason = reason;
        return { allowed: false, reason, auditEvent };
      }
      auditEvent.action = 'installer';
      auditEvent.commandSnippet = installerPath;
    }
  }

  auditEvent.allowed = true;
  return { allowed: true, auditEvent };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  DEFAULT_BLOCKED_CLASSES,
  COMMAND_CLASS_REGISTRY,
  SHELL_WRITE_VERBS,
  detectInstallerExe,
  buildDefaultPolicy,
  _evaluatePolicyCore,
};
