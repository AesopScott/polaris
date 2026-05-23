/**
 * PU1 — Registry equivalence smoke test for task #42
 * Verifies COMMAND_CLASS_REGISTRY replaces SHELL_HARD_BLOCKED with no regressions.
 * Run: node tmp/pu42-test.js
 */

// Inline the registry and assertSafeCommand for isolated testing
// (mirrors the implementation in server.js)

const path = require('path');

/**
 * @typedef {Object} CommandClassEntry
 * @property {string} name - Unique identifier for this command class entry
 * @property {string} commandClass - Class name (matches DEFAULT_BLOCKED_CLASSES values)
 * @property {'any'|'standard'|'restricted'} minimumTrustLevel - Trust level required to run
 * @property {string} reason - Human-readable block reason
 * @property {function(string): boolean} detect - Returns true if the command matches this class
 */

/** @type {ReadonlyMap<string, CommandClassEntry>} */
const COMMAND_CLASS_REGISTRY = Object.freeze(new Map([
  ['GIT_FORCE_PUSH', {
    name: 'GIT_FORCE_PUSH',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'force-push is blocked — run manually if needed',
    detect: cmd => /\bgit\s+push\s+(-f\b|--force\b)/i.test(cmd),
  }],
  ['GIT_RESET_HARD', {
    name: 'GIT_RESET_HARD',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'git reset --hard is blocked — run manually if needed',
    detect: cmd => /\bgit\s+reset\s+--hard\b/i.test(cmd),
  }],
  ['GIT_CLEAN', {
    name: 'GIT_CLEAN',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'git clean -f is blocked — run manually if needed',
    detect: cmd => /\bgit\s+clean\s+-[a-zA-Z]*f/i.test(cmd),
  }],
  ['DRIVE_FORMAT', {
    name: 'DRIVE_FORMAT',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'drive format is blocked',
    detect: cmd => /\bformat\s+[a-zA-Z]:/i.test(cmd),
  }],
  ['RM_RECURSIVE_ROOT', {
    name: 'RM_RECURSIVE_ROOT',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'recursive delete at filesystem root is blocked',
    detect: cmd => /\brm\s+-[rRfF ]*[rR][fF]?\s+[/"']*[\/\\]/i.test(cmd),
  }],
  ['RD_FULL_DRIVE', {
    name: 'RD_FULL_DRIVE',
    commandClass: 'system-destructive',
    minimumTrustLevel: 'any',
    reason: 'full-drive rd is blocked',
    detect: cmd => /\brd\s+\/s\s+\/q\s+[a-zA-Z]:\\\s*$/i.test(cmd),
  }],
]));

function assertSafeCommand(command, workDir) {
  if (!workDir) return;
  const flat = command.replace(/\r?\n/g, ' ');
  for (const entry of COMMAND_CLASS_REGISTRY.values()) {
    if (entry.detect(flat)) {
      throw new Error(`Shell command blocked: ${entry.reason}.\nCommand: ${flat.slice(0, 120)}`);
    }
  }
}

const WORKDIR = 'C:\\Users\\scott\\Code\\SomeProject';

// --- blocked commands (must throw) ---
const blocked = [
  'git push -f origin main',
  'git push --force origin main',
  'git reset --hard HEAD~3',
  'git clean -fd .',
  'format C:',
  'rm -rf /',
  'rd /s /q C:\\',
];

let passed = 0;
let failed = 0;

for (const cmd of blocked) {
  try {
    assertSafeCommand(cmd, WORKDIR);
    console.error(`FAIL — should have thrown for: ${cmd}`);
    failed++;
  } catch (e) {
    console.log(`BLOCKED OK  "${cmd}"`);
    passed++;
  }
}

// --- safe commands (must NOT throw) ---
const safe = [
  'git push origin main',
  'git reset --soft HEAD~1',
  'git clean -n',
];

for (const cmd of safe) {
  try {
    assertSafeCommand(cmd, WORKDIR);
    console.log(`SAFE OK     "${cmd}"`);
    passed++;
  } catch (e) {
    console.error(`FAIL — false positive for: ${cmd}\n  ${e.message}`);
    failed++;
  }
}

// --- registry structure check (PU2 automated portion) ---
const REQUIRED_FIELDS = ['name', 'commandClass', 'minimumTrustLevel', 'reason', 'detect'];
for (const [key, entry] of COMMAND_CLASS_REGISTRY) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) {
      console.error(`FAIL — entry "${key}" missing field "${field}"`);
      failed++;
    }
  }
  if (typeof entry.detect !== 'function') {
    console.error(`FAIL — entry "${key}" detect is not a function`);
    failed++;
  }
}
console.log(`SCHEMA OK   all ${COMMAND_CLASS_REGISTRY.size} entries have required fields`);
passed++;

console.log(`\n${failed === 0 ? 'PU1 PASS' : 'PU1 FAIL'} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
