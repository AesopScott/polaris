const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OBSIDIAN_BUILD = 'G:\\My Drive\\Aesop Academy\\Obsidian\\Polaris_Build';

const failures = [];

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${filePath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(readRequired(path.join(ROOT, 'package.json')));
const server = readRequired(path.join(ROOT, 'server.js'));
const buildPlan = readRequired(path.join(OBSIDIAN_BUILD, '3-Build-Plan.md'));
const changelog = readRequired(path.join(OBSIDIAN_BUILD, '4-Changelog.md'));
const version = packageJson.version;

check(Boolean(version), 'package.json is missing a version.');
check(buildPlan.includes(`v${version}`), `Build plan is not aligned with package version v${version}.`);
check(changelog.includes(`| ${version} |`), `Changelog is missing a row for package version ${version}.`);

const drainCalls = (server.match(/\bdrainPendingTurns\s*\(/g) || []).length;
check(
  /function\s+drainPendingTurns\s*\(\s*sessionId\s*\)/.test(server),
  'server.js calls drainPendingTurns but does not define function drainPendingTurns(sessionId).'
);
check(
  drainCalls >= 2,
  'server.js should call drainPendingTurns from terminal session paths, not only define it.'
);
check(
  /if\s*\(\s*session\.status\s*===\s*['"]running['"]\s*\)\s*{[\s\S]{0,700}session\.pendingTurns\.push\s*\(\s*turn\s*\)/.test(server),
  'resume handler is missing the running-session guard that queues follow-up turns.'
);
check(
  /function\s+drainPendingTurns\s*\(\s*sessionId\s*\)\s*{[\s\S]{0,900}setImmediate\s*\(\s*\(\s*\)\s*=>\s*executeResumeTurn\s*\(\s*sessionId\s*,\s*nextTurn\s*\)\s*\)/.test(server),
  'drainPendingTurns no longer schedules queued turns through executeResumeTurn.'
);
check(
  /if\s*\(\s*type\s*===\s*['"]stop['"]\s*\)\s*{[\s\S]{0,1200}session\.pendingTurns\s*=\s*\[\s*\]/.test(server),
  'Stop handler should clear session.pendingTurns so canceled sessions do not replay queued prompts.'
);
check(
  /function\s+broadcastInitialUserPrompt\s*\(\s*sessionId\s*,\s*prompt\s*,\s*displayPrompt\s*\)/.test(server),
  'server.js is missing broadcastInitialUserPrompt(sessionId, prompt, displayPrompt).'
);
for (const launchType of ['launch-chat', 'launch-gpt', 'launch-codex', 'launch']) {
  check(
    new RegExp(`if\\s*\\(\\s*type\\s*===\\s*['"]${launchType}['"]\\s*\\)[\\s\\S]{0,5000}broadcastInitialUserPrompt\\s*\\(`).test(server),
    `${launchType} should broadcast the initial user prompt after creating the session.`
  );
}
check(
  /async\s+function\s+discoverMcpTools\s*\(\s*allowlist\s*=\s*null\s*\)/.test(server)
    && /getMcpServerConfigs\s*\(\s*normalized\s*\)/.test(server)
    && /matchedProject[\s\S]{0,600}discoverMcpTools\s*\(\s*mcpAllowlist\s*\)/.test(server),
  'Direct-agent MCP discovery should honor the active project mcpServers allowlist.'
);
check(
  /function\s+routineLaunchModelFields\s*\(\s*modelChoice\s*\)/.test(readRequired(path.join(ROOT, 'resources', 'mockup.html')))
    && !/model:\s*resolveModel\s*\(\s*r\.model\s*\|\|\s*['"]balanced['"]\s*\)/.test(readRequired(path.join(ROOT, 'resources', 'mockup.html'))),
  'Routine launchers should send tier/model fields without resolving tier choices client-side.'
);
check(
  /ModGenDev-\$\{courseId\}/.test(server)
    && /ModGenActivate-\$\{courseId\}/.test(server)
    && /\^ModGen\(\?:Dev\|Activate\|Scaffold\)-/.test(server),
  'Course routine API and Courses panel building state should use ModGenDev/Activate/Scaffold routine tags.'
);
check(
  /approval_policy\s*=\s*"never"/.test(server)
    && /sandbox_mode\s*=\s*"danger-full-access"/.test(server)
    && !/default_permissions\s*=/.test(server)
    && /--dangerously-bypass-approvals-and-sandbox/.test(server)
    && /resume',\s*session\.codexThreadId/.test(server)
    && /--skip-git-repo-check',\s*'resume'/.test(server),
  'Codex sessions should use explicit dangerous bypass flags and carry skip-git-repo-check on resume.'
);

if (failures.length > 0) {
  console.error('FAIL polaris-sync');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS polaris-sync v${version}`);
