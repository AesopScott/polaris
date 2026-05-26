/**
 * Unit tests for _evaluatePolicyCore (the pure policy evaluator).
 *
 * Tests run without a live server — lib/capabilityPolicy.js has no server
 * dependencies (no WebSocket, no audit file I/O, no Electron globals).
 *
 * Coverage:
 *   - One test per COMMAND_CLASS_REGISTRY entry (6 entries) — each blocked at
 *     standard trust level when present in blockedCommandClasses.
 *   - Write boundary: path outside allowedRoots denied for write and edit actions.
 *   - Extended write mode: Obsidian path in allowedRoots is allowed.
 *   - Fail-closed: unrecognized writeMode values are denied.
 *   - Missing filePath: denied with clear reason.
 *   - Shell write boundary: uses allowedRoots (same list as write/edit), not workDir.
 *   - Installer gate: blocked when installerAllowed=false, allowed when true.
 *   - buildDefaultPolicy: produces correct allowedRoots structure.
 *   - Known non-matches: git push --force-with-lease is not blocked (documents
 *     the intentional registry boundary).
 *
 * Note: Paths use Windows format (C:\...) because Polaris is a Windows-only app.
 */

import { describe, it, expect } from 'vitest';

// CommonJS module — use require() for plain-JS lib files
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  _evaluatePolicyCore,
  DEFAULT_BLOCKED_CLASSES,
  KNOWN_WRITE_MODES,
  COMMAND_CLASS_REGISTRY,
  buildDefaultPolicy,
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
    ['GIT_FORCE_PUSH',    'git push -f origin main',    'bash'],
    ['GIT_RESET_HARD',    'git reset --hard HEAD~1',    'bash'],
    ['GIT_CLEAN',         'git clean -fd .',             'bash'],
    ['DRIVE_FORMAT',      'format C:',                   'bash'],
    ['RM_RECURSIVE_ROOT', 'rm -rf /',                    'bash'],
    ['RD_FULL_DRIVE',     'rd /s /q C:\\',               'powershell'],
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

  it('git push --force-with-lease IS blocked (--force\\b matches at the hyphen boundary)', () => {
    // \b fires between 'e' and '-' (non-word char), so --force-with-lease is caught
    // by the GIT_FORCE_PUSH detector. Force-with-lease is still a force push.
    const result = _evaluatePolicyCore(
      'bash',
      { command: 'git push --force-with-lease origin main', sessionId: 'test-session' },
      STANDARD_POLICY,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Shell command blocked/);
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

  it('blocks an edit to a path outside allowedRoots (edit uses same boundary as write)', () => {
    const result = _evaluatePolicyCore(
      'edit',
      { filePath: 'C:\\Users\\scott\\Desktop\\evil.txt', sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/outside allowed roots/);
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

  it('missing filePath is denied with a clear reason', () => {
    const result = _evaluatePolicyCore(
      'write',
      { sessionId: 'test-session' }, // no filePath
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no file path/);
  });

  it('relative filePath is rejected — callers must supply an absolute path', () => {
    const result = _evaluatePolicyCore(
      'write',
      { filePath: 'src/index.ts', sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/relative filePath/);
    expect(result.auditEvent.allowed).toBe(false);
  });

  it('unrecognized writeMode fails closed (deny-by-default)', () => {
    const badPolicy = { ...STANDARD_POLICY, writeMode: 'super-extended' };
    const result = _evaluatePolicyCore(
      'write',
      { filePath: `${WORK_DIR}\\src\\index.ts`, sessionId: 'test-session' },
      badPolicy,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/unrecognized writeMode/);
  });

  it('KNOWN_WRITE_MODES contains exactly the three expected values', () => {
    expect([...KNOWN_WRITE_MODES as string[]].sort()).toEqual(
      ['extended', 'project-only', 'read-only'],
    );
  });
});

// ── Shell write boundary ──────────────────────────────────────────────────────

describe('shell write boundary (uses allowedRoots, consistent with write/edit)', () => {
  it('blocks a shell rm targeting a path outside allowedRoots', () => {
    // rm is in SHELL_WRITE_VERBS; path is an absolute Windows path outside WORK_DIR
    const result = _evaluatePolicyCore(
      'bash',
      { command: 'rm C:\\OtherProject\\secret.txt', sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/outside allowed roots/);
  });

  it('allows a shell rm targeting a path inside allowedRoots', () => {
    const result = _evaluatePolicyCore(
      'bash',
      { command: `rm ${WORK_DIR}\\dist\\old-build.js`, sessionId: 'test-session' },
      STANDARD_POLICY,
    );

    expect(result.allowed).toBe(true);
  });

  it('extended policy allows shell write to a space-free Obsidian path', () => {
    // NOTE: The shell path extractor stops at whitespace, so paths with spaces
    // (e.g. "G:\My Drive\...") are not fully extracted and would be falsely blocked.
    // This is a known limitation documented in capabilityPolicy.js. Use a space-free
    // vault path in production shell commands, or route writes through the Write tool.
    const OBSIDIAN_NOSPACE = 'G:\\Obsidian';
    const extendedNoSpace = {
      ...STANDARD_POLICY,
      allowedRoots: [WORK_DIR, OBSIDIAN_NOSPACE],
      writeMode: 'extended',
    };
    const result = _evaluatePolicyCore(
      'bash',
      { command: `copy output.md ${OBSIDIAN_NOSPACE}\\Polaris_Build\\note.md`, sessionId: 'test-session' },
      extendedNoSpace,
    );

    expect(result.allowed).toBe(true);
  });
});

// ── Installer gate ────────────────────────────────────────────────────────────

describe('installer gate', () => {
  // detectInstallerExe's regex stops at whitespace, so path must be space-free.
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

// ── buildDefaultPolicy ────────────────────────────────────────────────────────

describe('buildDefaultPolicy', () => {
  it('session with workDir produces extended policy with workDir in allowedRoots', () => {
    const policy = buildDefaultPolicy(
      { workDir: WORK_DIR },
      { obsidianVaultPath: OBSIDIAN_DIR },
    );

    expect(policy.writeMode).toBe('extended');
    expect(policy.trustLevel).toBe('standard');
    expect(policy.installerAllowed).toBe(false);
    expect(policy.allowedRoots).toContain(WORK_DIR);
    expect(policy.allowedRoots).toContain(OBSIDIAN_DIR);
    expect(policy.blockedCommandClasses).toEqual(DEFAULT_BLOCKED_CLASSES);
  });

  it('session without workDir produces read-only policy with empty allowedRoots', () => {
    const policy = buildDefaultPolicy({}, {});

    expect(policy.writeMode).toBe('read-only');
    expect(policy.trustLevel).toBe('restricted');
    expect(policy.allowedRoots).toHaveLength(0);
  });

  it('buildDefaultPolicy output passes _evaluatePolicyCore write check for workDir path', () => {
    const policy = buildDefaultPolicy(
      { workDir: WORK_DIR },
      { obsidianVaultPath: OBSIDIAN_DIR },
    );

    const result = _evaluatePolicyCore(
      'write',
      { filePath: `${WORK_DIR}\\src\\index.ts`, sessionId: 'test-session' },
      policy,
    );

    expect(result.allowed).toBe(true);
  });

  it('buildDefaultPolicy output blocks write outside allowedRoots', () => {
    const policy = buildDefaultPolicy(
      { workDir: WORK_DIR },
      { obsidianVaultPath: OBSIDIAN_DIR },
    );

    const result = _evaluatePolicyCore(
      'write',
      { filePath: 'C:\\Windows\\System32\\evil.dll', sessionId: 'test-session' },
      policy,
    );

    expect(result.allowed).toBe(false);
  });
});
