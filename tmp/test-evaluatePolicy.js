const path = require('path');

const DEFAULT_BLOCKED_CLASSES = Object.freeze([
  'GIT_FORCE_PUSH',
  'GIT_RESET_HARD',
  'GIT_CLEAN',
  'DRIVE_FORMAT',
  'RM_RECURSIVE_ROOT',
  'RD_FULL_DRIVE',
]);

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
    reason: 'git reset --hard is blocked',
    detect: cmd => /\bgit\s+reset\s+--hard\b/i.test(cmd),
  })],
]));

const SHELL_WRITE_VERBS = /\b(rm|del|rd|rmdir|Remove-Item|ri|move|mv|ren|rename|copy|cp|xcopy|robocopy|Set-Content|Out-File|New-Item|Add-Content|Write-Output\s*>|echo\s+.+>)\b/i;

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

function evaluatePolicy(action, context, policy) {
  const ts = new Date().toISOString();
  const auditEvent = {
    ts,
    sessionId: context.sessionId,
    action,
    allowed: true,
  };

  if (action === 'write' || action === 'edit') {
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
      const resolvedRoot = path.resolve(root);
      if (filePath.startsWith(resolvedRoot)) {
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
    auditEvent.commandSnippet = command.slice(0, 120);

    for (const entry of COMMAND_CLASS_REGISTRY.values()) {
      if (entry.detect(command)) {
        if (policy.blockedCommandClasses && policy.blockedCommandClasses.includes(entry.name)) {
          const reason = `Shell command blocked: ${entry.reason}`;
          auditEvent.allowed = false;
          auditEvent.reason = reason;
          return { allowed: false, reason, auditEvent };
        }
      }
    }

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

// Test cases
const policy = {
  allowedRoots: ['C:\\Users\\scott\\Code\\Polaris'],
  writeMode: 'extended',
  networkAllowed: true,
  installerAllowed: false,
  blockedCommandClasses: ['GIT_FORCE_PUSH', 'GIT_RESET_HARD'],
  trustLevel: 'standard',
};

let passed = 0;
let failed = 0;

// Test 1: Allowed write
const test1 = evaluatePolicy('write', { filePath: 'C:\\Users\\scott\\Code\\Polaris\\test.txt', sessionId: 'test' }, policy);
if (test1.allowed === true) {
  console.log('✓ Test 1: allowed write');
  passed++;
} else {
  console.log('✗ Test 1: allowed write -', test1.reason);
  failed++;
}

// Test 2: Blocked write (outside roots)
const test2 = evaluatePolicy('write', { filePath: 'C:\\Users\\scott\\Desktop\\test.txt', sessionId: 'test' }, policy);
if (test2.allowed === false && test2.reason.includes('outside allowed roots')) {
  console.log('✓ Test 2: blocked write (outside roots)');
  passed++;
} else {
  console.log('✗ Test 2: blocked write -', test2.reason);
  failed++;
}

// Test 3: Allowed bash command
const test3 = evaluatePolicy('bash', { command: 'echo hello', sessionId: 'test' }, policy);
if (test3.allowed === true) {
  console.log('✓ Test 3: allowed bash command');
  passed++;
} else {
  console.log('✗ Test 3: allowed bash -', test3.reason);
  failed++;
}

// Test 4: Blocked bash command (git force push)
const test4 = evaluatePolicy('bash', { command: 'git push -f origin main', sessionId: 'test' }, policy);
if (test4.allowed === false && test4.reason.includes('force-push is blocked')) {
  console.log('✓ Test 4: blocked bash (git force push)');
  passed++;
} else {
  console.log('✗ Test 4: blocked bash -', test4.reason);
  failed++;
}

// Test 5: Installer blocked by default
const test5 = evaluatePolicy('powershell', { command: 'C:\\Users\\scott\\Code\\Polaris\\dist\\setup.exe', sessionId: 'test' }, policy);
if (test5.allowed === false && test5.reason.includes('Installer blocked')) {
  console.log('✓ Test 5: blocked installer (default policy)');
  passed++;
} else {
  console.log('✗ Test 5: blocked installer -', test5.reason);
  failed++;
}

// Test 6: Installer allowed when policy allows it
const policy2 = Object.assign({}, policy, { installerAllowed: true });
const test6 = evaluatePolicy('powershell', { command: 'C:\\Users\\scott\\Code\\Polaris\\dist\\setup.exe', sessionId: 'test' }, policy2);
if (test6.allowed === true && test6.auditEvent.action === 'installer') {
  console.log('✓ Test 6: allowed installer (policy enables)');
  passed++;
} else {
  console.log('✗ Test 6: allowed installer -', test6.reason);
  failed++;
}

// Test 7: Read-only policy blocks all writes
const readOnlyPolicy = Object.assign({}, policy, { writeMode: 'read-only' });
const test7 = evaluatePolicy('write', { filePath: 'C:\\Users\\scott\\Code\\Polaris\\test.txt', sessionId: 'test' }, readOnlyPolicy);
if (test7.allowed === false && test7.reason.includes('read-only')) {
  console.log('✓ Test 7: read-only policy blocks writes');
  passed++;
} else {
  console.log('✗ Test 7: read-only policy -', test7.reason);
  failed++;
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
