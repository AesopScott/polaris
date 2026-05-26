/**
 * Unit tests for _evaluatePolicyCore (the pure policy evaluator).
 *
 * Tests run without a live server — lib/capabilityPolicy.js has no server
 * dependencies (no WebSocket, no audit file I/O, no Electron globals).
 *
 * Coverage:
 *   - One test per COMMAND_CLASS_REGISTRY entry (6 entries) — each blocked at
 *     standard trust level when present in blockedCommandClasses.
 *   - Write boundary check: path outside allowedRoots is denied.
 *   - Extended write mode: Obsidian path in allowedRoots is allowed.
 *   - Installer gate: blocks when installerAllowed=false.
 *   - Installer gate: allows when installerAllowed=true.
 *
 * Note: Paths use Windows format (C:\...) because Polaris is a Windows-only app.
 */

import { describe, it, expect } from 'vitest';

// CommonJS module — use require() for plain-JS lib files
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  _evaluatePolicyCore,
  DEFAULT_BLOCKED_CLASSES,
  COMMAND_CLASS_REGISTRY,
} = require('../../lib/capabilityPolicy');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WORK_DIR = 'C:\\Work\\Polaris';
const OBSIDIAN_DIR = 'G:\\My Drive\\Aesop Academy\\Obsidian';

/** Standard session policy: project-only writes, all 6 command classes blocked. */
const STANDARD_POLICY = {
  allowedRoots: [WORK_DIR],
  writeMode: 'project-only',
  networkAllowed: true,
  installerAllowed: false,
  blockedCommandClasses: DEFAULT_BLOCKED_CLASSES as string[],
  trustLevel: 'standard',
};

/** Extended policy: also includes the Obsidian vault in allowedRoots. */
const EXTENDED_POLICY = {
  ...STANDARD_POLICY,
  allowedRoots: [WORK_DIR, OBSIDIAN_DIR],
  writeMode: 'extended',
};

// ── COMMAND_CLASS_REGISTRY — one test per entry ───────────────────────────────

describe('COMMAND_CLASS_REGISTRY — each class is blocked at standard trust level', () => {
  // Each tuple: [className, representative triggering command, action]
  const cases: [string, string, string][] = [
    ['GIT_FORCE_PUSH',   'git push -f origin main',    'bash'],
    ['GIT_RESET_HARD',   'git reset --hard HEAD~1',    'bash'],
    ['GIT_CLEAN',        'git clean -fd .',             'bash'],
    ['DRIVE_FORMAT',     'format C:',                   'bash'],
    ['RM_RECURSIVE_ROOT', 'rm -rf /',                   'bash'],
    ['RD_FULL_DRIVE',    'rd /s /q C:\\',               'powershell'],
  ];

  it.each(cases)('%s: blocked when in blockedCommandClasses', (className, command, action) => {
    const result = _evaluatePolicyCore(
      action,
      { command, sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Shell command blocked/);
    expect(result.auditEvent.allowed).toBe(false);
    expect(result.auditEvent.reason).toMatch(/Shell command blocked/);
  });

  it('COMMAND_CLASS_REGISTRY has exactly 6 entries matching DEFAULT_BLOCKED_CLASSES', () => {
    expect(COMMAND_CLASS_REGISTRY.size).toBe(6);
    expect(COMMAND_CLASS_REGISTRY.size).toBe((DEFAULT_BLOCKED_CLASSES as string[]).length);
    for (const name of DEFAULT_BLOCKED_CLASSES as string[]) {
      expect(COMMAND_CLASS_REGISTRY.has(name)).toBe(true);
    }
  });
});

// ── Write boundary ────────────────────────────────────────────────────────────

describe('write boundary check', () => {
  it('blocks a write to a path outside allowedRoots', () => {
    const result = _evaluatePolicyCore(
      'write',
      { filePath: 'C:\\Users\\scott\\Desktop\\evil.txt', sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/outside allowed roots/);
    expect(result.auditEvent.allowed).toBe(false);
  });

  it('allows a write to a path inside allowedRoots', () => {
    const result = _evaluatePolicyCore(
      'write',
      { filePath: `${WORK_DIR}\\src\\index.ts`, sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(true);
    expect(result.auditEvent.allowed).toBe(true);
  });

  it('extended write mode allows a write to the Obsidian path', () => {
    const result = _evaluatePolicyCore(
      'write',
      { filePath: `${OBSIDIAN_DIR}\\Polaris_Build\\note.md`, sessionId: 'test-session' },
      EXTENDED_POLICY,
    );

    expect(result.allowed).toBe(true);
    expect(result.auditEvent.allowed).toBe(true);
  });

  it('read-only policy blocks a write even inside allowedRoots', () => {
    const readOnlyPolicy = { ...STANDARD_POLICY, writeMode: 'read-only' };
    const result = _evaluatePolicyCore(
      'write',
      { filePath: `${WORK_DIR}\\src\\index.ts`, sessionId: 'test-session' },
      readOnlyPolicy,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/read-only/);
  });
});

// ── Installer gate ────────────────────────────────────────────────────────────

describe('installer gate', () => {
  // detectInstallerExe's regex stops at whitespace, so the path must be space-free.
  // C:\Work\Polaris\dist\installer.exe matches the /dist/*.exe detection rule.
  const INSTALLER_CMD = `${WORK_DIR}\\dist\\installer.exe`;

  it('blocks the installer when installerAllowed=false', () => {
    const result = _evaluatePolicyCore(
      'powershell',
      { command: INSTALLER_CMD, sessionId: 'test-session' },
      STANDARD_POLICY, // installerAllowed: false
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Installer blocked/);
    expect(result.auditEvent.allowed).toBe(false);
  });

  it('allows the installer when installerAllowed=true', () => {
    const allowedPolicy = { ...STANDARD_POLICY, installerAllowed: true };
    const result = _evaluatePolicyCore(
      'powershell',
      { command: INSTALLER_CMD, sessionId: 'test-session' },
      allowedPolicy,
    );

    expect(result.allowed).toBe(true);
    // auditEvent.action must be rewritten to 'installer' for the broadcast gate
    expect(result.auditEvent.action).toBe('installer');
    expect(result.auditEvent.commandSnippet).toContain('.exe');
  });
});
