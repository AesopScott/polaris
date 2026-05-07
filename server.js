'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execFile, execSync } = require('child_process');
const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// â"€â"€â"€ Paths â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const APPDATA      = process.env.APPDATA || os.homedir();
const POLARIS_DIR  = process.env.POLARIS_DIR  || path.join(APPDATA, '.claude', 'polaris');
const MOCKUP_DEST  = process.env.MOCKUP_DEST  || path.join(POLARIS_DIR, 'mockup.html');
const PORT         = Number(process.env.SERVER_PORT) || 40000;

const CONFIG_PATH   = path.join(POLARIS_DIR, 'config.json');
const LOCKS_PATH    = path.join(POLARIS_DIR, 'locks.json');
const VERSIONS_PATH = path.join(POLARIS_DIR, 'file-versions.json');
const VERSIONS_LOG_PATH = path.join(POLARIS_DIR, 'file-versions-log.jsonl');
const VERSIONS_LOG_CAP = 1000;

const CROSS_CHECKS_DIR = path.join(POLARIS_DIR, 'cross-checks');
const SOURCE_BACKUPS_DIR = path.join(POLARIS_DIR, 'source-backups');
const SOURCE_BACKUP_MAX_PER_FILE = 50;
const SOURCE_BACKUP_TOTAL_CAP_BYTES = 100 * 1024 * 1024; // 100 MB total
const SOURCE_BACKUP_MAX_SIZE_BYTES = 5 * 1024 * 1024;    // skip files >5 MB
const MAX_WRITE_BYTES = 1024 * 1024;  // 1 MB hard cap per file write
const MAX_WRITE_LINES = 30000;        // 30K lines hard cap per file write

// OpenRouter model catalog cache. Refreshed daily; powers exact-match cost
// lookups across the UI (API Balance graph, Agent Eval cost column) so brand-
// new models like google/gemini-3-flash-preview don't fall through to the
// hardcoded fallback rate.
const OPENROUTER_CATALOG_PATH = path.join(POLARIS_DIR, 'openrouter-catalog.json');
const OPENROUTER_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_PATH  = path.join(POLARIS_DIR, 'prompt-history.json');
const SESSIONS_DIR  = path.join(POLARIS_DIR, 'sessions');
const LOGS_DIR      = path.join(POLARIS_DIR, 'logs');
const SPACE_DIR     = path.join(POLARIS_DIR, 'space');
const SESSIONS_PERSIST_PATH = path.join(POLARIS_DIR, 'sessions-persist.json');
const TICKETS_PATH    = path.join(POLARIS_DIR, 'tickets.json');
const TOKEN_LOG_PATH  = path.join(POLARIS_DIR, 'token-log.jsonl');
const ROUTINE_NOTIFICATIONS_PATH = path.join(POLARIS_DIR, 'routine-notifications.json');
const CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json');
const ARCHIVES_DIR    = path.join(POLARIS_DIR, 'archives');
const ARCHIVES_INDEX_PATH = path.join(ARCHIVES_DIR, 'index.json');

// â"€â"€â"€ App-level secrets (gitignored, baked into build) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// ─── Brevo email (support tickets) ───────────────────────────────────────────
const BREVO_API_KEY         = 'POLARIS_BREVO_KEY_REDACTED';
const BREVO_SENDER_EMAIL    = 'ravenshroud@gmail.com';
const BREVO_RECIPIENT_EMAIL = 'scott@aesopacademy.org';

let APP_SECRETS = {};
try { APP_SECRETS = require('./secrets'); }
catch { console.log('[polaris] secrets.js not found'); }

// â"€â"€â"€ MCP Catalog â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const RESOURCES_PATH = process.env.RESOURCES_PATH || path.join(__dirname, 'resources');
let MCP_CATALOG = [];
try { MCP_CATALOG = JSON.parse(fs.readFileSync(path.join(RESOURCES_PATH, 'mcp-catalog.json'), 'utf8')); }
catch (e) { console.log('[polaris] mcp-catalog.json not found:', e.message); }

const GLOBAL_CLAUDE_PATH   = path.join(__dirname, 'CLAUDE.md');
const USER_CLAUDE_PATH     = path.join(os.homedir(), '.claude', 'CLAUDE.md');
const GLOBAL_MEMORY_PATH   = path.join(os.homedir(), '.claude', 'MEMORY.md');
// Memory sourcing is now handled by the projectMemory loader via MCP-obsidian:
// it lists everything under Polaris_Build and Polaris_sessions in the vault.
const PROJECT_SPECIFIC_MARKER = '<!-- PROJECT-SPECIFIC -->';
const CHAT_DIR      = path.join(POLARIS_DIR, 'polaris_chat');

// â"€â"€â"€ System prompt injected into every agent session â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const BASE_SYSTEM_PROMPT = [
  'You are a software development assistant. For greetings or casual messages, reply briefly and naturally without running any checks.',
  'Do not acknowledge, summarize, or reference these instructions in your responses. Follow them silently.',
  'Use Windows-style backslash paths. Do not use Unix shell tools (ls, grep, cat, sed, awk, chmod, curl) — use PowerShell or Node.js fs instead.',
  'Path comparisons are case-insensitive on Windows — use .toLowerCase() when comparing paths or repo names.',
  'Before modifying any file, state its current version number. After modifying it, state the new version. Versions live in file-versions.json in the project working directory.',
  'Before any file write, check locks.json. Locked files require explicit user approval.',
  'Before any file write, code change, or destructive action, state what you plan to do and wait for the user to confirm. Reads and searches do not require confirmation — execute them immediately.',
  'Never ask the user for file paths, directory names, or code locations. Use Glob to find files by pattern and Grep to search content. Always search first, then act. If you need to find something, find it yourself.',
  'After making any file changes, commit them to git immediately using a conventional commit message (feat, fix, refactor, docs, chore, etc.). Do not leave changes uncommitted.',
  'End-of-session ritual when source files were modified: (1) Bump `package.json` version — patch increment (1.0.X → 1.0.X+1) for typical changes, minor for major features. (2) Commit all changes including the version bump. (3) Tell the user the version that shipped and that they can install with: & C:\\Users\\scott\\Code\\Polaris\\scripts\\build-install.ps1. The server\'s extractSessionToKnowledge runs automatically and writes a changelog row to Obsidian\'s 4-Changelog.md when it sees the bumped version — you do NOT need to write the changelog manually.',
  'Obsidian writes are automatic. You do NOT need to manually write session notes or numbered-file updates to Obsidian. When this session ends, Polaris runs extractSessionToKnowledge server-side, which calls DeepSeek to distill what happened and writes to 2-Architecture.md / 3-Build-Plan.md / 7-Integrations.md / 4-Changelog.md as appropriate. Your job is to (a) do the work, (b) bump the version if source changed, (c) commit. The Obsidian sync handles itself.',
  'Be concise. Answer in 1-3 sentences unless the task genuinely requires more. No preamble, no restating the question, no closing summary. Use a short numbered list only when steps are truly sequential. Never pad responses. Do not give constant "I am reading X", "I have finished Y" status updates — just do the work and provide the final result or the next proposal.',
  'You have a tool called SetStatus that controls the visual state of your session card in the Polaris UI. Call it explicitly at the end of any response that isn\'t a pure informational reply. The three values and when to use them: (1) SetStatus("test") — after delivering any work Scott must verify before you continue: code changes, builds, UI fixes, commits. The card turns purple and pulses so it\'s visually obvious. (2) SetStatus("waiting") — whenever you have asked a question and need Scott\'s reply before you can proceed. (3) SetStatus("done") — only when the task is fully complete and requires no further verification. The server auto-detects git commits → "test" and a trailing question mark → "waiting" as a fallback, but you must call SetStatus yourself so the intent is explicit and immediate.',
  'When you need to ask the user a question, need clarification, or require their input before proceeding, you MUST use the AskUserQuestion tool — never write the question as plain text in your response. The AskUserQuestion tool renders a visually prominent interactive prompt in the UI and pauses the session so the user cannot miss it. Plain-text questions get buried in terminal output and are routinely missed.',
  'Never output raw file contents, JSON, code blocks, or data structures in your responses unless the user explicitly asked to see them. Summarize what you found instead (e.g. "Found 3 courses" not a JSON dump). Tool results are for your context only — the user sees only what you write as plain text.',
  'At the start of every session, your FIRST action must be to call QueryMemory with no arguments. This loads your full project knowledge base — architecture, file map, build plan, changelog. Do not respond to the user or take any other action until you have called QueryMemory. This is mandatory, not optional.',
  "You may write to the user's Downloads folder ONLY for user-facing artifacts the user is meant to take away — generated documents, exports, logos, scripts intended for the user to download or share. Do NOT use Downloads for code, session-internal artifacts, or working files; those belong in the project workDir.",
  "Source files inside the project workDir are auto-backed-up to %APPDATA%\\.claude\\polaris\\source-backups\\<projectName>\\ before every Edit, Write, or shell-tool write (Set-Content, Out-File, > redirection, etc.). To restore a corrupted file, find the most recent backup at that path (filename: <sanitizedRelPath>.<ISO>.<ext>) and copy it back to the source. Do not assume backups are absent without checking.",
  "Your own behavior in this Polaris project is defined in this same `server.js`. Key locations: `BASE_SYSTEM_PROMPT` (the array of behavioral rules you're reading right now), `runDirectAgent` (the agent loop, including the `projectMemory` loader that reads Obsidian files at session start), `buildDirectSystemPrompt` (assembles the final system prompt), and the tool functions `toolWrite` / `toolEdit` / `toolBash` / `toolPowerShell`. The Obsidian `FileMap.md` lists these and other key functions — consult it via QueryMemory before searching. When asked to modify your startup behavior, what files you read, how you respond, or any rule above, edit the corresponding location in `server.js`. The same propose-before-act rule, cross-check approval gate, and Phase 0 backup all apply — you cannot bypass them, and they make self-modification safe. After a code change, bump `package.json` and tell Scott to reinstall (you cannot restart the server yourself).",
].join('\n');

function buildSystemPrompt(config) {
  const patterns = config.protectedPatterns || ['*.md', '*.json'];
  const patternRule = `Protected file patterns — these file types require explicit user approval before ANY modification. State the planned change and wait for confirmation before writing: ${patterns.join(', ')}`;
  const mcpServers = getConnectedMcpServers();
  const mcpLine = mcpServers.length > 0
    ? `You have the following MCP servers connected and their tools are available to you: ${mcpServers.join(', ')}. Use them proactively when relevant.`
    : '';
  return BASE_SYSTEM_PROMPT + '\n' + patternRule + (mcpLine ? '\n' + mcpLine : '');
}

// â"€â"€â"€ Secret encryption (AES-256-GCM, stable file key) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const SENSITIVE_KEYS = new Set(['openRouterApiKey', 'anthropicApiKey', 'openAiApiKey', 'deepSeekEmail', 'deepSeekPassword', 'deepSeekApiKey', 'elevenLabsApiKey', 'braveSearchApiKey']);
const SECRET_MASK    = '••••••••';
const ENC_KEY_PATH   = path.join(POLARIS_DIR, 'enc-key.bin');

let _stableKey = null;
function getStableKey() {
  if (_stableKey) return _stableKey;
  try {
    const existing = fs.readFileSync(ENC_KEY_PATH);
    if (existing.length === 32) { _stableKey = existing; return _stableKey; }
  } catch {}
  _stableKey = crypto.randomBytes(32);
  try { fs.writeFileSync(ENC_KEY_PATH, _stableKey); } catch (e) {
    console.error('[enc] Failed to persist stable key:', e.message);
  }
  return _stableKey;
}

function getLegacyKey() {
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const match = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
    if (match) return crypto.createHash('sha256').update(match[1]).digest();
  } catch {}
  return crypto.createHash('sha256').update(`${os.userInfo().username}@${os.hostname()}`).digest();
}

function tryDecryptWithKey(value, key) {
  try {
    const buf = Buffer.from(value.slice(4), 'base64');
    const iv = buf.slice(0, 16); const tag = buf.slice(16, 32); const enc = buf.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch { return null; }
}

function encryptSecret(plaintext) {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getStableKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(value) {
  if (!value || !value.startsWith('enc:')) return value || '';
  const result = tryDecryptWithKey(value, getStableKey());
  if (result !== null) return result;
  const legacy = tryDecryptWithKey(value, getLegacyKey());
  if (legacy !== null) { console.log('[enc] Decrypted with legacy key — will migrate on next startup'); return legacy; }
  console.error('[enc] Decryption failed with all keys');
  return '';
}

function readConfig() {
  const raw = readJSON(CONFIG_PATH, {});
  const result = { ...raw };
  for (const key of SENSITIVE_KEYS) { if (result[key]) result[key] = decryptSecret(result[key]); }
  return result;
}

// Extract readable text from a base64-encoded DOCX or PDF file.
async function extractDocText(dataUrl, filename) {
  try {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/s);
    if (!match) return null;
    const buffer = Buffer.from(match[1], 'base64');
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || null;
    }
    if (ext === '.pdf') {
      const data = await pdfParse(buffer);
      return data.text || null;
    }
    return null;
  } catch (e) {
    console.warn(`[docs] text extraction failed for ${filename}:`, e.message);
    return null;
  }
}

function maskedConfig(cfg) {
  const result = { ...cfg };
  for (const key of SENSITIVE_KEYS) { result[key] = cfg[key] ? SECRET_MASK : ''; }
  return result;
}

function migrateSecretsToEncrypted() {
  const raw = readJSON(CONFIG_PATH, {});
  let changed = false;
  for (const key of SENSITIVE_KEYS) {
    if (!raw[key]) continue;
    if (!raw[key].startsWith('enc:')) {
      raw[key] = encryptSecret(raw[key]);
      changed = true;
      console.log(`[enc] Migrated ${key} from plaintext to encrypted`);
    } else if (tryDecryptWithKey(raw[key], getStableKey()) === null) {
      const legacy = tryDecryptWithKey(raw[key], getLegacyKey());
      if (legacy) {
        raw[key] = encryptSecret(legacy);
        changed = true;
        console.log(`[enc] Migrated ${key} from legacy key to stable file key`);
      } else {
        console.error(`[enc] Cannot decrypt ${key} with any known key`);
      }
    }
  }
  if (changed) writeJSON(CONFIG_PATH, raw);
}

// â"€â"€â"€ IPC bridge to main.js â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const pendingDirPicks   = new Map();
const pendingFilePicks  = new Map();
const pendingQuestions    = new Map(); // questionId → resolve
let pendingGitPushes  = 0;  // count of in-flight obsidian-up git operations
let shutdownRequested = false;
function onGitPushComplete() {
  pendingGitPushes--;
  if (shutdownRequested && pendingGitPushes <= 0) {
    try { process.send({ type: 'ready-to-quit' }); } catch {}
  }
}
const pendingCrossChecks  = new Map(); // checkId → { resolve, timer }

if (typeof process.on === 'function') {
  process.on('message', (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'directory-picked') {
      const ws = pendingDirPicks.get(msg.requestId);
      pendingDirPicks.delete(msg.requestId);
      if (ws) sendTo(ws, { type: 'directory-picked', path: msg.path || null, error: msg.error || null });
    } else if (msg.type === 'file-picked') {
      const pending = pendingFilePicks.get(msg.requestId);
      pendingFilePicks.delete(msg.requestId);
      if (pending) sendTo(pending.ws, { type: 'file-picked', path: msg.path || null, error: msg.error || null, replyKey: pending.replyKey });
    } else if (msg.type === 'shutdown') {
      shutdownRequested = true;
      if (pendingGitPushes <= 0) {
        try { process.send({ type: 'ready-to-quit' }); } catch {}
      }
    }
  });
}

// â"€â"€â"€ MCP Catalog helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function readClaudeJson() {
  try {
    if (!fs.existsSync(CLAUDE_JSON_PATH)) return {};
    return JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
  } catch { return {}; }
}

function writeClaudeJson(data) {
  fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getEnabledMcpServers() {
  return Object.keys(readClaudeJson().mcpServers || {});
}

// Returns MCP server names from the actual Claude Code config files:
// ~/.mcp.json (global) and optionally {workDir}/.mcp.json (project-level).
// This reflects what Claude Code actually has connected, unlike ~/.claude.json
// which only tracks Polaris-managed servers.
function getConnectedMcpServers(workDir) {
  const servers = new Set();
  try {
    const g = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mcp.json'), 'utf8'));
    for (const k of Object.keys(g.mcpServers || {})) servers.add(k);
  } catch {}
  if (workDir) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(workDir, '.mcp.json'), 'utf8'));
      for (const k of Object.keys(p.mcpServers || {})) servers.add(k);
    } catch {}
  }
  return [...servers];
}

function getMcpInstances() {
  return (readConfig().mcp_instances || {});
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function maskedMcpCredentials() {
  const cfg = readConfig();
  const creds = cfg.mcp_credentials || {};
  const masked = {};
  for (const [serverId, serverCreds] of Object.entries(creds)) {
    masked[serverId] = {};
    for (const [key, val] of Object.entries(serverCreds)) {
      masked[serverId][key] = val ? '••••••••' : '';
    }
  }
  return masked;
}

// â"€â"€â"€ Support ticket submission â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function getInstallId() {
  const cfg = readJSON(CONFIG_PATH, {});
  if (cfg.installId) return cfg.installId;
  const id = crypto.randomBytes(8).toString('hex');
  cfg.installId = id;
  writeJSON(CONFIG_PATH, cfg);
  return id;
}

function redactDebugLog(lines, maxPrivacy) {
  return lines.map(line => {
    let out = String(line);
    out = out.replace(/enc:[A-Za-z0-9+/=]+/g, '[ENCRYPTED_SECRET]');
    out = out.replace(/sk-[A-Za-z0-9_-]{20,}/g, '[API_KEY]');
    out = out.replace(/xkeysib-[A-Za-z0-9-]+/g, '[BREVO_KEY]');
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
    if (maxPrivacy) {
      out = out.replace(/[A-Z]:\\[^\s]+/g, '[PATH]');
      out = out.replace(/\/[A-Za-z][^\s]*/g, '[PATH]');
    }
    return out;
  });
}

async function submitSupportTicket(ws, msg) {
  if (!BREVO_API_KEY) {
    sendTo(ws, { type: 'support-ticket-result', ok: false, error: 'Brevo API key not configured. Support is unavailable in this build.' });
    return;
  }

  const installId   = getInstallId();
  const config      = readConfig();
  const maxPrivacy  = !!msg.maxPrivacy;
  const ticketId    = crypto.randomBytes(6).toString('hex');
  const submittedAt = Date.now();
  const sessionsArr = Array.from(sessions.values());

  // Auto-included diagnostics (privacy-aware)
  const diagnostics = {
    appVersion:    require('./package.json').version,
    platform:      process.platform,
    osRelease:     os.release(),
    nodeVersion:   process.version,
    installId,
    activeSessions: sessionsArr.length,
    currentProject: maxPrivacy ? '[redacted]' : (config.lastProject || 'none'),
    recentDebugLog: [], // filled by client because debug log lives there
  };

  const userInfo = {
    name:  (msg.userName  || '').trim() || 'Anonymous',
    email: (msg.userEmail || '').trim() || 'not provided',
  };

  const lines = [
    `=== POLARIS SUPPORT TICKET ===`,
    `Ticket ID: ${ticketId}`,
    `Type: ${msg.ticketType || 'Other'}`,
    msg.severity ? `Severity: ${msg.severity}` : null,
    `Submitted: ${new Date(submittedAt).toISOString()}`,
    `Privacy Mode: ${maxPrivacy ? 'MAXIMUM' : 'standard'}`,
    ``,
    `--- USER INFO ---`,
    `Name:  ${userInfo.name}`,
    `Email: ${userInfo.email}`,
    `Install ID: ${installId}`,
    ``,
    `--- ENVIRONMENT ---`,
    `App Version:    ${diagnostics.appVersion}`,
    `Platform:       ${diagnostics.platform}`,
    `OS Release:     ${diagnostics.osRelease}`,
    `Node Version:   ${diagnostics.nodeVersion}`,
    `Active Sessions: ${diagnostics.activeSessions}`,
    `Current Project: ${diagnostics.currentProject}`,
    ``,
    `--- USER MESSAGE ---`,
    `Subject: ${msg.subject || '(no subject)'}`,
    ``,
    msg.description || '(no description)',
    ``,
    `--- RECENT DEBUG LOG (last 50 lines, redacted) ---`,
    ...redactDebugLog(msg.debugLog || [], maxPrivacy),
  ].filter(l => l !== null);

  const textContent = lines.join('\n');
  const htmlContent = `<pre style="font-family:Consolas,monospace;font-size:12px;line-height:1.5;">${textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

  const subject = `[Polaris ${msg.ticketType || 'Other'}${msg.severity ? ' / ' + msg.severity : ''}] ${msg.subject || '(no subject)'}`;

  const attachments = (msg.attachments || []).filter(a => a && a.name && a.base64).slice(0, 5).map(a => ({
    name: a.name,
    content: a.base64,
  }));

  const payload = {
    sender:    { email: BREVO_SENDER_EMAIL, name: 'Polaris Support' },
    to:        [{ email: BREVO_RECIPIENT_EMAIL }],
    cc:        [{ email: 'ravenshroud@gmail.com' }],
    replyTo:   userInfo.email !== 'not provided' ? { email: userInfo.email, name: userInfo.name } : undefined,
    subject,
    htmlContent,
    textContent,
    attachment: attachments.length ? attachments : undefined,
  };

  const ok = await brevoPost(payload).catch(e => ({ ok: false, error: e.message }));

  if (ok.ok === false) {
    sendTo(ws, { type: 'support-ticket-result', ok: false, error: ok.error || 'Email send failed' });
    return;
  }

  // Save local ticket record
  const tickets = readJSON(TICKETS_PATH, []);
  tickets.unshift({
    id: ticketId,
    type: msg.ticketType,
    severity: msg.severity || null,
    subject: msg.subject || '(no subject)',
    submittedAt,
    status: 'open',
    resolvedAt: null,
    attachmentCount: attachments.length,
  });
  writeJSON(TICKETS_PATH, tickets);

  sendTo(ws, { type: 'support-ticket-result', ok: true, ticketId, installId });
  broadcast({ type: 'tickets', tickets, installId });
}

function brevoPost(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const opts = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
        else resolve({ ok: false, error: `Brevo ${res.statusCode}: ${chunks.slice(0, 200)}` });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

// â"€â"€â"€ Git helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function runGit(args, cwd) {
  return new Promise(resolve => {
    exec(`git ${args.map(a => `"${a}"`).join(' ')}`, { cwd, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : stdout.trim());
    });
  });
}

// â"€â"€â"€ File sync â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function syncGlobalToProjects() {
  const config   = readConfig();
  const projects = (config.projects || []).filter(p => p.workDir);
  const vaultPath = config.obsidianVaultPath || '';
  const globalSoulPath = vaultPath ? path.join(vaultPath, 'SOUL.md') : null;

  const fileDefs = [
    { name: 'CLAUDE.md', src: GLOBAL_CLAUDE_PATH,  projectSpecific: true,  polarisOnly: false },
    { name: 'MEMORY.md', src: GLOBAL_MEMORY_PATH,  projectSpecific: true,  polarisOnly: false },
    // SOUL.md is the Polaris brand/mission doc — only sync to the Polaris project, not other projects
    { name: 'SOUL.md',   src: globalSoulPath,       projectSpecific: false, polarisOnly: true  },
  ];

  const results = [];

  for (const { name, src, projectSpecific, polarisOnly } of fileDefs) {
    if (!src) { results.push({ file: name, status: 'skipped', reason: 'no source path' }); continue; }
    let globalContent;
    try {
      globalContent = fs.readFileSync(src, 'utf8');
    } catch {
      results.push({ file: name, status: 'skipped', reason: 'source not found' });
      continue;
    }
    // Strip any existing PROJECT-SPECIFIC section from the source so the Polaris CLAUDE.md
    // (which is both source and destination) doesn't accumulate duplicate markers on each sync.
    if (projectSpecific) {
      const srcMarkerPos = globalContent.indexOf(PROJECT_SPECIFIC_MARKER);
      if (srcMarkerPos !== -1) globalContent = globalContent.slice(0, srcMarkerPos).trimEnd();
    }

    for (const project of projects) {
      if (polarisOnly && (project.name || '').toLowerCase() !== 'polaris') continue;
      if (!fs.existsSync(project.workDir)) continue;
      const dest = path.join(project.workDir, name);
      try {
        if (!projectSpecific) {
          fs.writeFileSync(dest, globalContent, 'utf8');
        } else {
          let projectSection = '';
          if (fs.existsSync(dest)) {
            const existing = fs.readFileSync(dest, 'utf8');
            const idx = existing.indexOf(PROJECT_SPECIFIC_MARKER);
            if (idx !== -1) projectSection = existing.slice(idx + PROJECT_SPECIFIC_MARKER.length);
          }
          const newContent = `${globalContent}\n\n${PROJECT_SPECIFIC_MARKER}${projectSection}`;
          // Skip write if content is unchanged — prevents infinite watch→sync→write→watch loop.
          if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === newContent) {
            results.push({ file: name, project: project.name || project.workDir, status: 'unchanged' });
            continue;
          }
          fs.writeFileSync(dest, newContent, 'utf8');
        }
        results.push({ file: name, project: project.name || project.workDir, status: 'ok' });
      } catch (e) {
        results.push({ file: name, project: project.name || project.workDir, status: 'error', reason: e.message });
      }
    }
  }

  return results;
}

function watchGlobalFiles() {
  const filesToWatch = [GLOBAL_CLAUDE_PATH, GLOBAL_MEMORY_PATH];
  const config = readConfig();
  if (config.obsidianVaultPath) filesToWatch.push(path.join(config.obsidianVaultPath, 'SOUL.md'));

  for (const filePath of filesToWatch) {
    if (!fs.existsSync(filePath)) continue;
    fs.watch(filePath, () => {
      const results = syncGlobalToProjects();
      broadcast({ type: 'sync-complete', results });
    });
  }

}

// â"€â"€â"€ State â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const sessions = new Map();   // sessionId → session object
const forkMap  = new Map();   // primarySessionId → forkSessionId
let   wss      = null;

// â"€â"€â"€ Session persistence â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function serializeSession(s) {
  return {
    id: s.id, name: s.name, workDir: s.workDir, projectName: s.projectName,
    model: s.model || null, isChat: s.isChat || false,
    status: s.status === 'running' ? 'done' : s.status,
    startAt: s.startAt, endAt: s.endAt || null,
    claudeSessionId: s.claudeSessionId || null,
    lastPrompt: s.lastPrompt || null,
    height: s.height || null,
    column: s.column != null ? s.column : null,
    pinned: !!s.pinned,
    lines: (s.lines || []).slice(-300),
    lastUsage: s.lastUsage || null,
    totalCost: s.totalCost || 0,
  };
}

function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_PERSIST_PATH, JSON.stringify(Array.from(sessions.values()).map(serializeSession), null, 2), 'utf8');
  } catch {}
}

function loadPersistedSessions() {
  try {
    const arr = JSON.parse(fs.readFileSync(SESSIONS_PERSIST_PATH, 'utf8'));
    if (!Array.isArray(arr)) return;
    for (const s of arr) {
      if (!s.id) continue;
      sessions.set(s.id, {
        ...s,
        status: s.status === 'running' ? 'done' : s.status,
        proc: null, watcher: null, timeout: null,
        lines: s.lines || [],
      });
    }
  } catch {}
}

loadPersistedSessions();

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

const CONFIG_ARCHIVE_DIR    = path.join(POLARIS_DIR, 'config-archive');
const CONFIG_ARCHIVE_MAX    = 200;                  // keep N most recent supersedes
const CONFIG_ARCHIVE_MAX_MB = 10;                   // also cap at total disk MB
const CONFIG_ARCHIVE_MAX_BYTES = CONFIG_ARCHIVE_MAX_MB * 1024 * 1024;

// mergeConfigDefensively — shallow-merge top-level fields, but deep-merge the
// projects array by project name. The default {...current, ...incoming} pattern
// at the save-config handler clobbers any field the UI doesn't expose: e.g.
// the Settings panel's project entries don't surface obsidianDir / obsidianSessionsDir
// / instructions, so a save-config round-trip used to wipe those for every
// project (the 2026-05-05 incident). Now: each incoming project object is
// merged on top of the matching current project (by name), preserving fields
// the form omitted. Project deletion still works (project absent from incoming
// array → absent from output). Explicit clearing still works (incoming sends
// the field as null/'' → overrides).
//
// Also logs loudly when mcpServers or routines go from populated to empty,
// since those have been clobbered the same way and we want the next instance
// to be detectable in real time.
function mergeConfigDefensively(current, incoming) {
  const out = { ...current, ...incoming };

  if (Array.isArray(incoming.projects) && Array.isArray(current.projects)) {
    out.projects = incoming.projects.map(incomingProj => {
      const currentProj = current.projects.find(p => p.name && p.name === incomingProj.name);
      if (!currentProj) return incomingProj;
      return { ...currentProj, ...incomingProj };
    });
  }

  const detectClobber = (label, cur, inc) => {
    if (inc === undefined) return;
    const curCount = cur ? (Array.isArray(cur) ? cur.length : Object.keys(cur).length) : 0;
    const incCount = inc ? (Array.isArray(inc) ? inc.length : Object.keys(inc).length) : 0;
    if (curCount > 0 && incCount === 0) {
      console.warn(`[save-config] WARN: ${label} going from ${curCount} entries to 0 — likely a partial UI save. Recover from config-archive/ if unintended.`);
    }
  };
  detectClobber('mcpServers', current.mcpServers, incoming.mcpServers);
  detectClobber('routines',   current.routines,   incoming.routines);

  return out;
}

function pruneConfigArchive() {
  let entries;
  try {
    entries = fs.readdirSync(CONFIG_ARCHIVE_DIR)
      .filter(n => /^config\..*\.json$/.test(n))
      .map(n => {
        const full = path.join(CONFIG_ARCHIVE_DIR, n);
        const st = fs.statSync(full);
        return { full, name: n, mtimeMs: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  } catch { return; }

  let totalBytes = entries.reduce((s, e) => s + e.size, 0);
  for (let i = 0; i < entries.length; i++) {
    const overCount = i >= CONFIG_ARCHIVE_MAX;
    const overBytes = totalBytes > CONFIG_ARCHIVE_MAX_BYTES;
    if (!overCount && !overBytes) break;
    try { fs.unlinkSync(entries[i].full); totalBytes -= entries[i].size; } catch {}
  }
}

function writeJSON(filePath, data) {
  // Two-tier backup before every config write:
  //  1. config.backup.json — single-level "last known good" (legacy, kept).
  //  2. config-archive/config.<ISO>.json — append-only archive, every
  //     superseded config preserved up to the size caps below. Required
  //     after the 2026-05-05 incident where a saveSettings round-trip
  //     stripped obsidianDir, MCP servers, and routines from every project
  //     — the single backup had already rotated past the loss point and
  //     recovery was impossible. Storage cost is trivial (~4 KB per write).
  // Caps: 200 files OR 10 MB total, whichever fires first. Oldest pruned.
  if (filePath === CONFIG_PATH && fs.existsSync(CONFIG_PATH)) {
    try { fs.copyFileSync(CONFIG_PATH, CONFIG_PATH.replace('.json', '.backup.json')); } catch {}
    try {
      fs.mkdirSync(CONFIG_ARCHIVE_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.copyFileSync(CONFIG_PATH, path.join(CONFIG_ARCHIVE_DIR, `config.${stamp}.json`));
      pruneConfigArchive();
    } catch {}
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── OpenRouter catalog (model pricing) ──────────────────────────────────────
// Fetches https://openrouter.ai/api/v1/models, caches on disk + in memory,
// builds a {modelId: {in, out}} dict the UI uses for cost calculations. This
// removes the need to maintain a hardcoded MODEL_COSTS table — every model
// OpenRouter knows about gets accurate pricing automatically.
let _orCatalogPromise = null;

function ensureOpenRouterCatalog(force = false) {
  if (!force) {
    try {
      const stat = fs.statSync(OPENROUTER_CATALOG_PATH);
      if (Date.now() - stat.mtimeMs < OPENROUTER_CATALOG_TTL_MS) {
        return Promise.resolve(JSON.parse(fs.readFileSync(OPENROUTER_CATALOG_PATH, 'utf8')));
      }
    } catch {}
  }
  if (_orCatalogPromise) return _orCatalogPromise;
  _orCatalogPromise = new Promise(resolve => {
    const cfg = readConfig();
    const apiKey = cfg.openRouterApiKey ? decryptSecret(cfg.openRouterApiKey) : null;
    const headers = { 'Accept': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/models',
      method: 'GET',
      headers,
      // Defensive fresh agent — same pattern as callOpenRouterStream after
      // the BAD_RECORD_MAC issues on 2026-05-05.
      agent: new https.Agent({ keepAlive: false, maxSockets: 1 }),
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.warn(`[catalog] HTTP ${res.statusCode}: ${body.slice(0, 200)}`);
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(body);
          fs.writeFileSync(OPENROUTER_CATALOG_PATH, JSON.stringify(data), 'utf8');
          console.log(`[catalog] refreshed: ${(data.data || []).length} models`);
          resolve(data);
        } catch (e) {
          console.warn(`[catalog] parse failed: ${e.message}`);
          resolve(null);
        }
      });
    });
    req.on('error', err => {
      console.warn(`[catalog] fetch failed: ${err.message}`);
      resolve(null);
    });
    req.end();
  });
  _orCatalogPromise.finally(() => { _orCatalogPromise = null; });
  return _orCatalogPromise;
}

function buildModelCostsDict() {
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(OPENROUTER_CATALOG_PATH, 'utf8')); }
  catch { return {}; }
  const dict = {};
  for (const m of (catalog.data || [])) {
    if (!m.id || !m.pricing) continue;
    const inp = parseFloat(m.pricing.prompt) || 0;
    const out = parseFloat(m.pricing.completion) || 0;
    if (inp || out) dict[m.id] = { in: inp, out: out };
  }
  return dict;
}

function broadcast(data) {
  // Track lines and status changes in the in-memory session for persistence
  if (data.type === 'line' && data.sessionId) {
    const s = sessions.get(data.sessionId);
    if (s) {
      s.lines.push({ text: data.text, role: data.role });
      if (data.role === 'user') s.lastPrompt = data.text;
      if (data.role === 'assistant') saveSessions();
    }
  }
  if (data.type === 'session-status' && data.sessionId) {
    const s = sessions.get(data.sessionId);
    if (s) {
      s.status = data.status;
      if (data.status === 'done' || data.status === 'error') {
        s.endAt = s.endAt || Date.now();
        saveSessions();
      }
    }
  }
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastUsage(sessionId, usage, claudeSessionId, routineTag) {
  const sess = sessions.get(sessionId);
  if (sess) sess.lastUsage = usage;
  broadcast({ type: 'context-usage', sessionId, usage, claudeSessionId, routineTag });
}

// â"€â"€â"€ File versioning â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function getVersions() {
  return readJSON(VERSIONS_PATH, {});
}

function bumpVersion(filePath) {
  const versions = getVersions();
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const prev = versions[rel] || '1.0';
  const next = (parseFloat(prev) + 0.1).toFixed(1);
  versions[rel] = next;
  writeJSON(VERSIONS_PATH, versions);
  return { rel, prev, next };
}

function isTempFile(filePath) {
  return /\.tmp\.\d+\.[a-f0-9]+$/i.test(path.basename(filePath));
}

function appendVersionLog(entry) {
  try {
    fs.appendFileSync(VERSIONS_LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
    // Cap log: read all, keep last N, rewrite if over cap
    const all = fs.readFileSync(VERSIONS_LOG_PATH, 'utf8').split('\n').filter(Boolean);
    if (all.length > VERSIONS_LOG_CAP) {
      const keep = all.slice(-VERSIONS_LOG_CAP).join('\n') + '\n';
      fs.writeFileSync(VERSIONS_LOG_PATH, keep, 'utf8');
    }
  } catch (e) { console.warn('[versions] log write failed:', e.message); }
}

function readVersionLog() {
  if (!fs.existsSync(VERSIONS_LOG_PATH)) return [];
  try {
    return fs.readFileSync(VERSIONS_LOG_PATH, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

const WATCH_EXCLUDE = /(^|[\\/])(\.git|node_modules|dist|release|\.next|\.cache|__pycache__|\.venv|coverage)([\\/]|$)/i;

// â"€â"€â"€ Live Server (per-project HTTP+WS with live reload) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// One server per project directory. fs.watch with 100ms debounce broadcasts
// `reload` to a separate WS server (path `/__livereload`); injected script in
// served HTML calls `location.reload()` on receipt.
const LIVE_SERVERS = new Map(); // projectDir → instance
const LIVE_SERVER_PORT_START = 5500;
const LIVE_SERVER_INJECT = `
<script>
(function(){
  function connect(){
    var ws = new WebSocket('ws://' + location.host + '/__livereload');
    ws.onmessage = function(e){ if(e.data==='reload') location.reload(); };
    ws.onclose = function(){ setTimeout(connect, 1000); };
  }
  connect();
})();
</script>`;
const MIME = {
  '.html':'text/html', '.htm':'text/html',
  '.css':'text/css', '.js':'application/javascript', '.mjs':'application/javascript',
  '.json':'application/json', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
  '.txt':'text/plain', '.md':'text/markdown',
};

function liveServerFindPort(start) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      if (port - start >= 20) return reject(new Error('No port available in range'));
      const test = http.createServer();
      test.once('error', () => { test.close(); port++; setImmediate(tryPort); });
      test.once('listening', () => { test.close(() => resolve(port)); });
      test.listen(port, '127.0.0.1');
    };
    tryPort();
  });
}

function liveServerLog(inst, message) {
  const entry = { time: new Date().toLocaleTimeString(), message };
  inst.events.unshift(entry);
  if (inst.events.length > 50) inst.events.length = 50;
  broadcast({ type: 'live-server-event', projectDir: inst.projectDir, ...entry });
}

function liveServerBroadcastStatus(inst) {
  broadcast({
    type: 'live-server-status',
    projectDir: inst.projectDir,
    running: true,
    port: inst.port,
    clientCount: inst.clients.size,
    events: inst.events,
  });
}

async function startLiveServer(projectDir) {
  if (LIVE_SERVERS.has(projectDir)) return LIVE_SERVERS.get(projectDir);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    throw new Error(`Not a directory: ${projectDir}`);
  }
  const port = await liveServerFindPort(LIVE_SERVER_PORT_START);
  const clients = new Set();

  const httpServer = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const fullPath = path.normalize(path.join(projectDir, urlPath));
      // Guard against path traversal
      if (!fullPath.startsWith(path.normalize(projectDir))) { res.statusCode = 403; return res.end('Forbidden'); }
      if (!fs.existsSync(fullPath)) { res.statusCode = 404; return res.end(`Not found: ${urlPath}`); }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        // Try index.html first, fall back to a styled directory listing
        const indexFile = path.join(fullPath, 'index.html');
        if (fs.existsSync(indexFile)) return serveFile(indexFile, res);
        const entries = fs.readdirSync(fullPath, { withFileTypes: true }).sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        const base = urlPath.replace(/\/$/, '');
        const rows = entries.map(e => {
          const icon = e.isDirectory() ? 'ðŸ"' : 'ðŸ"„';
          const slash = e.isDirectory() ? '/' : '';
          return `<li style="padding:4px 0;font-family:Consolas,monospace;font-size:13px;"><a href="${base}/${encodeURIComponent(e.name)}${slash}" style="color:#60a5fa;text-decoration:none;">${icon} ${e.name}${slash}</a></li>`;
        }).join('');
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html><head><title>${urlPath}</title><style>body{background:#0a0a14;color:#cbd5e1;font-family:'Segoe UI',sans-serif;padding:24px 32px;margin:0;}h2{color:#60a5fa;font-weight:600;}ul{list-style:none;padding:0;}a:hover{text-decoration:underline;}</style></head><body><h2>ðŸ"‚ ${urlPath || '/'}</h2><ul>${rows}</ul></body></html>`);
      }
      serveFile(fullPath, res);
    } catch (e) {
      res.statusCode = 500;
      res.end(`Error: ${e.message}`);
    }
  });

  function serveFile(fp, res) {
    const ext = path.extname(fp).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (ext === '.html' || ext === '.htm') {
      let html = fs.readFileSync(fp, 'utf8');
      // Inject reload script before </body> (or append if no </body>)
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, LIVE_SERVER_INJECT + '</body>');
      else html += LIVE_SERVER_INJECT;
      res.end(html);
    } else {
      fs.createReadStream(fp).pipe(res);
    }
  }

  // Live-reload WS on /__livereload
  const wss = new WebSocket.Server({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url === '/__livereload') {
      wss.handleUpgrade(req, socket, head, ws => {
        clients.add(ws);
        ws.on('close', () => { clients.delete(ws); liveServerBroadcastStatus(inst); });
        liveServerBroadcastStatus(inst);
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise(r => httpServer.listen(port, '127.0.0.1', r));

  // File watcher (recursive, debounced)
  let debounceTimer = null;
  const watcher = fs.watch(projectDir, { recursive: true }, (event, filename) => {
    if (!filename || WATCH_EXCLUDE.test(filename)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      liveServerLog(inst, `${filename.replace(/\\/g, '/')} changed → reloaded ${clients.size} client(s)`);
      for (const ws of clients) { try { ws.send('reload'); } catch {} }
    }, 100);
  });

  const inst = { projectDir, port, httpServer, wss, watcher, clients, events: [] };
  LIVE_SERVERS.set(projectDir, inst);
  liveServerLog(inst, `Server started on :${port}`);
  liveServerBroadcastStatus(inst);
  return inst;
}

function stopLiveServer(projectDir) {
  const inst = LIVE_SERVERS.get(projectDir);
  if (!inst) return false;
  try { inst.watcher.close(); } catch {}
  for (const ws of inst.clients) { try { ws.close(); } catch {} }
  try { inst.wss.close(); } catch {}
  try { inst.httpServer.close(); } catch {}
  LIVE_SERVERS.delete(projectDir);
  broadcast({ type: 'live-server-status', projectDir, running: false, port: null, clientCount: 0, events: inst.events });
  return true;
}

function stopAllLiveServers() {
  for (const projectDir of [...LIVE_SERVERS.keys()]) stopLiveServer(projectDir);
}

process.on('SIGINT',  () => { stopAllLiveServers(); process.exit(0); });
process.on('SIGTERM', () => { stopAllLiveServers(); process.exit(0); });
process.on('exit',    () => { stopAllLiveServers(); });

function watchSessionFiles(sessionId, workDir) {
  if (!fs.existsSync(workDir)) return;
  const watcher = fs.watch(workDir, { recursive: true }, (event, filename) => {
    if (event !== 'change' || !filename) return;
    if (WATCH_EXCLUDE.test(filename)) return;
    const full = path.join(workDir, filename);
    if (isTempFile(full)) return;
    try { if (!fs.statSync(full).isFile()) return; } catch { return; }
    const { rel, prev, next } = bumpVersion(full);
    // Track modified files on the session for auto-Obsidian-Up at session end
    const s = sessions.get(sessionId);
    if (s) {
      if (!s.modifiedFiles) s.modifiedFiles = new Set();
      s.modifiedFiles.add(rel);
    }
    const ts = Date.now();
    appendVersionLog({ ts, sessionId, sessionName: s?.name || sessionId, file: rel, prev, next });
    broadcast({ type: 'file-version', sessionId, file: rel, prev, next, ts, sessionName: s?.name || sessionId });
  });
  // Unhandled 'error' events on FSWatcher crash the Node process. Common
  // causes: workDir was deleted out from under the watcher (e.g. eval harness
  // tmp dirs cleaned up between fixtures), or permissions revoked. Log and
  // swallow — the session is effectively done if its workDir vanished.
  watcher.on('error', err => {
    console.warn(`[polaris] watcher error on ${workDir} (session ${sessionId}): ${err.message}`);
  });
  return watcher;
}

// Auto-fire Obsidian Up when a session completes with file modifications
function autoObsidianForSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (!s.modifiedFiles || s.modifiedFiles.size === 0) return;
  const config = readConfig();
  const vaultPath = config.obsidianVaultPath;
  if (!vaultPath) return; // No vault configured — silently skip
  const matchedProj = (config.projects || []).find(
    p => p.workDir && s.workDir && p.workDir.toLowerCase() === s.workDir.toLowerCase()
  );
  const sessionsFolder = matchedProj?.obsidianSessionsDir || 'Polaris_Sessions';
  try {
    const dir = path.join(vaultPath, sessionsFolder);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = (s.name || 'Session').replace(/[<>:"/\\|?*]/g, '_').slice(0, 60);
    const filePath = path.join(dir, `${safeName} ${ts}.md`);
    const fileList = [...s.modifiedFiles].sort();
    const transcript = (s.lines || []).map(l => `[${l.role || 'log'}] ${l.text}`).join('\n');
    const content =
      `# ${s.name || 'Session'}\n\n` +
      `- **Project:** ${s.projectName || '(none)'}\n` +
      `- **Working directory:** ${s.workDir || '(none)'}\n` +
      `- **Started:** ${s.startAt ? new Date(s.startAt).toISOString() : ''}\n` +
      `- **Ended:** ${new Date().toISOString()}\n` +
      `- **Status:** ${s.status || 'done'}\n` +
      `- **Files modified (${fileList.length}):**\n${fileList.map(f => `  - ${f}`).join('\n')}\n\n` +
      `## Transcript\n\n\`\`\`\n${transcript}\n\`\`\`\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    broadcast({ type: 'obsidian-auto-pushed', sessionId, filePath, fileCount: fileList.length });
    console.log(`[obsidian-auto] ${sessionId} → ${filePath} (${fileList.length} files)`);
  } catch (e) {
    console.error('[obsidian-auto] failed:', e.message);
  }
}

// Scaffold Obsidian Build + Sessions folders when a new project is created
function scaffoldObsidianProject(project, vaultPath) {
  const name = project.name || 'Project';
  // obsidianDir is often an absolute path — use it directly when so
  const buildPath = project.obsidianDir && path.isAbsolute(path.normalize(project.obsidianDir))
    ? path.normalize(project.obsidianDir)
    : path.join(vaultPath, project.obsidianDir || `${name}_Build`);
  // Derive vault root from buildPath so sessions land next to the build folder
  const vaultRoot = path.dirname(buildPath);
  const sessionsPath = project.obsidianSessionsDir && path.isAbsolute(path.normalize(project.obsidianSessionsDir))
    ? path.normalize(project.obsidianSessionsDir)
    : path.join(vaultRoot, project.obsidianSessionsDir || `${name}_Sessions`);
  try {
    if (!fs.existsSync(buildPath)) {
      fs.mkdirSync(buildPath, { recursive: true });
      const files = {
        '1-Soul.md': `# 1-Soul.md — ${name}\n\n**What this project is:** [Describe the project]\n\n**Why it exists:** [Describe the motivation]\n\n**Non-goals:** [What this is not]\n\n**Connection to the larger mission:** [How it fits]\n`,
        '2-Architecture.md': `# 2-Architecture.md — ${name}\n\n## Tech Stack\n- [List technologies]\n\n## System Overview\n[Describe the system]\n\n## Key Components\n| File | Purpose |\n|------|---------|\n| | |\n`,
        '3-Build-Plan.md': `# 3-Build-Plan.md — ${name}\n\n## Current Phase\n[Describe current focus]\n\n## Roadmap\n| Priority | Item | Status | Notes |\n|----------|------|--------|-------|\n| | | | |\n`,
        '4-Changelog.md': `# 4-Changelog.md — ${name}\n\n| Version | Date | Summary |\n|---------|------|---------|\n| | | |\n`,
        '5-Permissions.md': `# 5-Permissions.md — ${name}\n\n## File Access\n[Describe file access rules]\n\n## Tool Restrictions\n[Describe tool restrictions]\n`,
        '6-Obsidian.md': `# 6-Obsidian.md — ${name}\n\n## Vault Config\n- **Build folder:** ${buildPath}\n- **Sessions folder:** ${sessionsPath}\n`,
        '7-Integrations.md': `# 7-Integrations.md — ${name}\n\n## External APIs\n[List external integrations]\n`,
        '8-Logs.md': `# 8-Logs.md — ${name}\n\n[Logs and diagnostics will be appended here]\n`,
        'FileMap.md': `# FileMap — ${name}\n# Working directory: ${project.workDir || ''}\n\n## Source Files\n| File | Purpose |\n|------|---------|\n| | |\n`,
      };
      for (const [filename, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(buildPath, filename), content, 'utf8');
      }
      console.log(`[obsidian-scaffold] Created ${buildPath} with ${Object.keys(files).length} files`);
    }
    if (!fs.existsSync(sessionsPath)) {
      fs.mkdirSync(sessionsPath, { recursive: true });
      const initNote = path.join(sessionsPath, `_created ${new Date().toISOString().slice(0, 10)}.md`);
      fs.writeFileSync(initNote, `# ${name} Sessions\n\nSession notes will appear here automatically after each agent session.\n`, 'utf8');
      console.log(`[obsidian-scaffold] Created ${sessionsPath}`);
    }
    broadcast({ type: 'obsidian-scaffold-done', project: name, buildPath, sessionsPath });
  } catch (e) {
    console.error('[obsidian-scaffold] failed:', e.message);
  }
  // Fire git scaffolds async — don't block config-saved response
  scaffoldGitRepo(project).catch(e => console.error('[scaffold-git] unhandled:', e.message));
}


async function scaffoldGitRepo(project) {
  const { name, workDir, repo } = project;
  if (!workDir) return;
  const run = (cmd) => new Promise((resolve, reject) =>
    exec(cmd, { cwd: workDir }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())
    )
  );
  try {
    fs.mkdirSync(workDir, { recursive: true });
    const isRepo = fs.existsSync(path.join(workDir, '.git'));
    if (!isRepo) {
      await run('git init');
      await run('git checkout -b main').catch(() => run('git branch -m main'));
    }
    const readmePath = path.join(workDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, `# ${name}\n`, 'utf8');
    }
    const status = await run('git status --porcelain');
    if (status) {
      await run('git add README.md');
      await run('git commit -m "init: initial project setup"');
    }
    // Derive repo name from config field or project name
    const repoName = repo && repo.includes('/')
      ? repo
      : `AesopScott/${(name || 'project').toLowerCase().replace(/\s+/g, '-')}`;
    // Create public GitHub repo, add remote, and push
    await run(`gh repo create ${repoName} --public --source=. --remote=origin --push`);
    broadcast({ type: 'scaffold-git-done', project: name, repo: repoName });
    console.log(`[scaffold-git] ${repoName} created and pushed`);
  } catch (e) {
    console.error(`[scaffold-git] ${name}:`, e.message);
    broadcast({ type: 'scaffold-git-error', project: name, error: e.message });
  }
}

// Extract signal-rich session content and distill into numbered Obsidian knowledge files
async function extractSessionToKnowledge(sessionId) {
  const s = sessions.get(sessionId);
  if (!s || !s.workDir) return;
  const config = readConfig();
  const matched = (config.projects || []).find(
    p => p.workDir && p.workDir.toLowerCase() === s.workDir.toLowerCase()
  );
  if (!matched || !matched.obsidianDir) return;
  if (!config.deepSeekApiKey) return;

  const ACTION_PREFIXES = ['⚙ Write(', '⚙ Edit(', '⚙ Bash(', '⚙ PowerShell('];
  const signalLines = (s.lines || []).filter(l => {
    if (l.role === 'user' || l.role === 'assistant' || l.role === 'error') return true;
    if (l.role === 'system') return ACTION_PREFIXES.some(p => (l.text || '').startsWith(p));
    return false;
  });
  if (signalLines.length === 0) return;

  const rawTranscript = signalLines.map(l => `[${l.role}] ${l.text}`).join('\n');
  const transcript = rawTranscript.length > 8000
    ? rawTranscript.slice(0, 8000) + '\n...[truncated]'
    : rawTranscript;

  const today = new Date().toISOString().slice(0, 10);
  const projectName = matched.name || s.projectName || 'Project';

  const extractionPrompt = `You are a knowledge extractor for a software project called "${projectName}".

Analyze this session transcript and extract structured updates. Return ONLY valid JSON with these keys (omit a key or set to null if nothing relevant was found):

{
  "architecture": "new architectural decisions, patterns, or component changes (string or null)",
  "buildPlan": "roadmap changes, shipped features, open questions, or deferred items (string or null)",
  "integrations": "new external APIs, tools, services, or configuration changes (string or null)",
  "changelog": {
    "version": "version number from a package.json bump, like 1.0.114 — only if an explicit version bump was detected in this session, else null",
    "date": "${today}",
    "description": "Multi-sentence markdown-formatted entry following the project's changelog convention. MUST start with one of these bold-prefixed type tags: **feat:** (new feature), **fix:** (bug fix), **refactor:**, **chore:**, **docs:**, **perf:**, **test:**, **ci:**. Follow the prefix with a detailed description of what landed AND why — root cause if it's a fix, scope if it's a feature. Use backticks around filenames (mockup.html, server.js), function names (runDirectAgent), identifiers, and code-level references. 2-6 sentences typical. Match the depth and tone of existing entries in 4-Changelog.md, e.g.: '**fix:** Critical parser bug — every cell in the eval re-run was failing instantly with HTTP 400 because the queue parser only stripped lines starting with #, not inline trailing comments...'"
  }
}

Session transcript:
${transcript}`;

  let extracted;
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepSeekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: extractionPrompt }],
        temperature: 0.2,
        max_tokens: 1000
      })
    });
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { console.warn('[extract-knowledge] no JSON in DeepSeek response'); return; }
    extracted = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[extract-knowledge] DeepSeek call failed:', e.message);
    return;
  }

  const vaultPath = config.obsidianVaultPath;
  if (!vaultPath) return;
  // obsidianDir may be absolute or relative to vault
  const obsDir = path.isAbsolute(matched.obsidianDir)
    ? matched.obsidianDir
    : path.join(vaultPath, matched.obsidianDir);

  const appendBlock = (fileName, content) => {
    if (!content) return;
    const filePath = path.join(obsDir, fileName);
    const block = `\n\n## Session Update (${today})\n\n${content}\n`;
    try { fs.appendFileSync(filePath, block, 'utf8'); } catch (_e) { /* skip if file missing */ }
  };

  appendBlock('2-Architecture.md', extracted.architecture);
  appendBlock('3-Build-Plan.md', extracted.buildPlan);
  appendBlock('7-Integrations.md', extracted.integrations);

  // Changelog: insert table row after the header separator line.
  // Backwards-compatible: prefers extracted.changelog.description (the new
  // markdown-formatted style with **type:** prefix and multi-sentence
  // detail), falls back to .headline if an older extraction sent that.
  if (extracted.changelog?.version) {
    const clPath = path.join(obsDir, '4-Changelog.md');
    try {
      let clContent = fs.readFileSync(clPath, 'utf8');
      const dividerMatch = clContent.match(/\|[-\s|]+\|\r?\n/);
      if (dividerMatch) {
        const insertAt = clContent.indexOf(dividerMatch[0]) + dividerMatch[0].length;
        const text = extracted.changelog.description || extracted.changelog.headline || '';
        // Strip pipe characters that would break the markdown table.
        const safe = String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
        const row = `| ${extracted.changelog.version} | ${extracted.changelog.date} | ${safe} |\n`;
        clContent = clContent.slice(0, insertAt) + row + clContent.slice(insertAt);
        fs.writeFileSync(clPath, clContent, 'utf8');
        console.log(`[extract-knowledge] changelog row inserted: v${extracted.changelog.version}`);
      }
    } catch (_e) { /* skip */ }
  }

  console.log(`[extract-knowledge] ${sessionId} -> ${projectName} knowledge updated`);
}

//â"€â"€â"€ Lock enforcement â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function isLocked(filePath, sessionId) {
  const locks = readJSON(LOCKS_PATH, {});
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return !!(locks[rel] && locks[rel].sessions && locks[rel].sessions.includes(sessionId));
}

// â"€â"€â"€ Prompt history â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function addToHistory(prompt) {
  const history = readJSON(HISTORY_PATH, []);
  const updated = [prompt, ...history.filter(p => p !== prompt)].slice(0, 200);
  writeJSON(HISTORY_PATH, updated);
}

// â"€â"€â"€ Code Health analysis â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
async function computeCodeHealth(workDir) {
  // Churn: aggregate per-file commit count and line changes from full log
  const numstat = await runGit(['log', '--numstat', '--pretty=format:'], workDir);
  const churnMap = {};
  for (const line of numstat.split('\n')) {
    const m = line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if (!m) continue;
    const file = m[3].trim();
    if (!churnMap[file]) churnMap[file] = { commits: 0, added: 0, deleted: 0 };
    churnMap[file].commits++;
    churnMap[file].added   += parseInt(m[1], 10);
    churnMap[file].deleted += parseInt(m[2], 10);
  }
  const churn = Object.entries(churnMap)
    .map(([file, s]) => ({ file, ...s }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 15);

  // Authors: commits and share per contributor
  const shortlog = await runGit(['shortlog', '-sne', 'HEAD'], workDir);
  const authors = shortlog.split('\n').filter(Boolean).map(line => {
    const m = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+)>$/);
    return m ? { commits: parseInt(m[1], 10), name: m[2], email: m[3] } : null;
  }).filter(Boolean).slice(0, 10);

  // File stats + complexity: walk JS/TS source files
  const jsFiles = [];
  function walkDir(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (['node_modules', '.git', 'dist', 'release'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkDir(full);
      else if (/\.(js|ts|jsx|tsx)$/.test(e.name)) jsFiles.push(full);
    }
  }
  walkDir(workDir);

  const fileStats = jsFiles.map(fp => {
    try {
      const src = fs.readFileSync(fp, 'utf8');
      const lines      = src.split('\n').length;
      const functions  = (src.match(/\bfunction\b|=>|\bclass\b/g) || []).length;
      const branches   = (src.match(/\bif\b|\bswitch\b|\belse\s+if\b|\bcase\b/g) || []).length;
      const loops      = (src.match(/\bfor\b|\bwhile\b|\bdo\b/g) || []).length;
      const complexity = functions + branches + loops;
      return { file: path.relative(workDir, fp), lines, functions, branches, loops, complexity };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.complexity - a.complexity).slice(0, 15);

  return { churn, authors, fileStats };
}

// â"€â"€â"€ SPACE event logging â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function spaceSlug(name) {
  return (name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function spaceAppendEvent(projectName, data) {
  if (!projectName) return;
  const dir = path.join(SPACE_DIR, spaceSlug(projectName));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ ts: Date.now(), ...data }) + '\n', 'utf8');
}

function spaceComputeScores(projectName) {
  const eventsPath = path.join(SPACE_DIR, spaceSlug(projectName), 'events.jsonl');
  if (!fs.existsSync(eventsPath)) return null;
  const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const now = Date.now();
  const dayMs = 86400000;
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = now - (6 - i) * dayMs;
    return events.filter(e => e.ts >= start && e.ts < start + dayMs);
  });

  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function trend(arr) {
    const v = arr.filter(x => x !== null);
    if (v.length < 3) return 'stable';
    const half = Math.floor(v.length / 2);
    const early = avg(v.slice(0, half));
    const late  = avg(v.slice(-half));
    if (late > early + 4) return 'up';
    if (late < early - 4) return 'down';
    return 'stable';
  }

  // S: success rate per day
  const sArr = days.map(d => {
    const done = d.filter(e => e.type === 'session-done').length;
    const err  = d.filter(e => e.type === 'session-error').length;
    return (done + err) > 0 ? Math.round((done / (done + err)) * 100) : null;
  });
  const sScore = avg(sArr.filter(v => v !== null).map(Number));

  // P: avg output tokens per done session (500 tokens = 100)
  const pArr = days.map(d => {
    const done = d.filter(e => e.type === 'session-done' && e.outputTokens);
    if (!done.length) return null;
    return Math.min(100, Math.round((avg(done.map(e => e.outputTokens)) / 500) * 100));
  });
  const pScore = avg(pArr.filter(v => v !== null).map(Number));

  // A: sessions launched per day (5/day = 100)
  const aArr = days.map(d => Math.min(100, Math.round((d.filter(e => e.type === 'session-launch').length / 5) * 100)));
  const aScore = avg(aArr);

  // C: avg concurrent count at launch (2+ parallel = 100)
  const cArr = days.map(d => {
    const launches = d.filter(e => e.type === 'session-launch' && e.concurrentCount > 1);
    if (!launches.length) return null;
    return Math.min(100, Math.round(((avg(launches.map(e => e.concurrentCount)) - 1) / 2) * 100));
  });
  const cScore = avg(cArr.filter(v => v !== null).map(Number));

  // E: time to first output (0ms = 100, 30s = 0)
  const eArr = days.map(d => {
    const fo = d.filter(e => e.type === 'first-output' && e.elapsed != null);
    if (!fo.length) return null;
    return Math.max(0, Math.round(100 - (avg(fo.map(e => e.elapsed)) / 30000) * 100));
  });
  const eScore = avg(eArr.filter(v => v !== null).map(Number));

  return {
    S: { score: Math.round(sScore), trend: trend(sArr), last7: sArr.map(v => v ?? 0) },
    P: { score: Math.round(pScore), trend: trend(pArr), last7: pArr.map(v => v ?? 0) },
    A: { score: Math.round(aScore), trend: trend(aArr), last7: aArr },
    C: { score: Math.round(cScore), trend: trend(cArr), last7: cArr.map(v => v ?? 0) },
    E: { score: Math.round(eScore), trend: trend(eArr), last7: eArr.map(v => v ?? 0) },
  };
}

// â"€â"€â"€ Session name generation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const STOP_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','that','this','these','those','it','its','i','you','he','she','we','they','what','which','who','how','when','where','why','not','no','nor','so','yet','both','either','neither','just','also','then','than','as','if','though','although','because','since','unless','while','after','before']);

function generateSessionName(prompt) {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  return words.slice(0, 7).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'New Session';
}

// â"€â"€â"€ Direct OpenRouter API — agent sessions (no CLI) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// Replaces CLI spawning. Eliminates CLAUDE.md cold-load (~29k tokens), 37-tool
// schema bloat, and unbounded --resume conversation replay. Instead: rolling
// 20-turn window, 9 curated tool schemas, intentional system prompt.

const MAX_AGENT_MESSAGES = 40; // 20 turns Ã— user+assistant

const DIRECT_TOOLS = [
  { type: 'function', function: { name: 'Read', description: 'Read a file. Returns content with line numbers.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, offset: { type: 'integer', description: 'Start line (1-based)' }, limit: { type: 'integer', description: 'Max lines to read' } }, required: ['file_path'] } } },
  { type: 'function', function: { name: 'Write', description: 'Write content to a file, creating it if needed.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] } } },
  { type: 'function', function: { name: 'Edit', description: 'Replace an exact string in a file with a new string. File must be read first.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, old_string: { type: 'string', description: 'Exact text to find — must be unique in the file' }, new_string: { type: 'string', description: 'Replacement text' }, replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' } }, required: ['file_path', 'old_string', 'new_string'] } } },
  { type: 'function', function: { name: 'Glob', description: 'Find files matching a glob pattern. Returns absolute paths sorted by modified time.', parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob e.g. "**/*.js"' }, path: { type: 'string', description: 'Directory to search (default: working dir)' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'Grep', description: 'Search file contents for a regex pattern.', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string', description: 'File or directory to search' }, glob: { type: 'string', description: 'File filter e.g. "*.ts"' }, output_mode: { type: 'string', description: 'One of: content, files_with_matches (default), count' }, context: { type: 'integer', description: 'Lines of context around matches' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'Bash', description: 'Execute a shell command in the session working directory.', parameters: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' }, timeout: { type: 'integer', description: 'Timeout ms, max 120000' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'PowerShell', description: 'Execute a PowerShell command on Windows.', parameters: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' }, timeout: { type: 'integer' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'WebFetch', description: 'Fetch the text content of a URL.', parameters: { type: 'object', properties: { url: { type: 'string' }, prompt: { type: 'string', description: 'What to extract from the page' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'WebSearch', description: 'Search the web and return results. Uses You.com free tier first (no cost), then Brave Search if configured, then DuckDuckGo as fallback. Prefer this tool for all web searches.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, num_results: { type: 'integer', description: 'Max results to return (default 5)' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'AskUserQuestion', description: 'Ask the user a clarifying question and wait for their response before continuing.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'The question to ask' }, options: { type: 'array', items: { type: 'string' }, description: 'Optional predefined answer choices' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'TodoWrite', description: 'Update the task todo list to track progress.', parameters: { type: 'object', properties: { todos: { type: 'array', items: { type: 'string' }, description: 'Each item is "content|status" where status is pending, in_progress, or completed. Example: ["Fix bug|in_progress","Write tests|pending"]' } }, required: ['todos'] } } },
  { type: 'function', function: { name: 'QueryMemory', description: 'Query the project knowledge base loaded from Obsidian. Call with no arguments at session start to load all project context. Pass filename to retrieve a specific file.', parameters: { type: 'object', properties: { filename: { type: 'string', description: 'Optional filename or partial name to retrieve a specific file. Omit to get all project memory.' } }, required: [] } } },
  { type: 'function', function: { name: 'SetProject', description: 'Set the active project for this session. Call this immediately after the user tells you which project they want to work on. Pass the exact project name as shown in the Available projects list, or null for no project (scratch).', parameters: { type: 'object', properties: { projectName: { type: 'string', description: 'Exact project name from the Available projects list, or omit/null for no project.' } }, required: [] } } },
  { type: 'function', function: { name: 'SetStatus', description: 'Set the status of this session card in the Polaris UI. Use "test" after delivering work that needs user verification before continuing. Use "waiting" when paused and expecting user input. Use "done" when the task is fully complete.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['test', 'waiting', 'done'], description: 'The new status to display on the session card.' } }, required: ['status'] } } },
];

function buildDirectSystemPrompt(config, workDir) {
  const layers = [BASE_SYSTEM_PROMPT];

  // Layer 2: Project CLAUDE.md ({workDir}/CLAUDE.md)
  if (workDir) {
    const projectClaudeMd = path.join(workDir, 'CLAUDE.md');
    try { layers.push('--- Project Rules ---\n' + fs.readFileSync(projectClaudeMd, 'utf8')); } catch {}
  }

  // Layer 3: Project config identity and paths
  if (workDir) {
    const matched = (config.projects || []).find(p => p.workDir && p.workDir.toLowerCase() === workDir.toLowerCase());
    if (matched) {
      const configLines = [
        `Project name: ${matched.name}`,
        `Working directory: ${matched.workDir}`,
        matched.repo ? `Remote repository: ${matched.repo}` : null,
        `File versions: ${path.join(matched.workDir, 'file-versions.json')}`,
        `Locks: ${path.join(matched.workDir, 'locks.json')}`,
        `Project rules: ${path.join(matched.workDir, 'CLAUDE.md')}`,
        matched.obsidianDir ? `Obsidian knowledge folder: ${matched.obsidianDir}` : null,
        matched.obsidianSessionsDir ? `Obsidian sessions folder: ${matched.obsidianSessionsDir}` : null,
      ].filter(Boolean).join('\n');
      layers.push('--- Project Configuration ---\n' + configLines);

      // Project memory directive
      if (matched.obsidianDir) {
        layers.push(
          `--- Project Memory (MANDATORY) ---\n` +
          `Your project knowledge base is pre-loaded into Polaris memory. At the start of every session, before responding to any user request, call QueryMemory with no arguments to retrieve your full project context — soul, architecture, build plan, file map, changelog, and technical documentation. Do not skip this step.`
        );
      }

      // Obsidian sync is automatic — make this explicit so agents don't try to
      // duplicate the work (and don't ignore it because the previous mandate
      // sounded contradictory). The server's extractSessionToKnowledge runs
      // when the session ends and writes to numbered Obsidian files.
      if (matched.obsidianSessionsDir) {
        layers.push(
          `--- Obsidian Sync (automatic — no agent action required) ---\n` +
          `When this session ends, Polaris runs extractSessionToKnowledge server-side. It calls DeepSeek to summarize what happened, then writes:\n` +
          `  - architectural changes → 2-Architecture.md\n` +
          `  - roadmap / build-plan updates → 3-Build-Plan.md\n` +
          `  - external API / tool / config changes → 7-Integrations.md\n` +
          `  - changelog row → 4-Changelog.md (only if package.json was bumped)\n` +
          `Sessions folder for transcripts: ${matched.obsidianSessionsDir}\n` +
          `Knowledge base folder: ${matched.obsidianDir}\n` +
          `You do NOT need to manually write to any of these files. To trigger a changelog row at session end, just make sure to bump the version in package.json before stopping work.`
        );
      }

      // Custom instructions from Projects panel
      if (matched.instructions) layers.push('--- Project Instructions ---\n' + matched.instructions);
    }
  }

  return layers.join('\n\n');
}

// â"€â"€ Tool implementations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// Builds a compact Polaris runtime context block injected at the top of every
// Claude Code (Max-plan) stdin prompt so the model always knows its host environment.
function buildPolarisContextBlock(config, session) {
  const projects = (config.projects || [])
    .map(p => `  - ${p.name}${p.workDir ? ` (${p.workDir})` : ''}`)
    .join('\n');

  const routinesList = Array.isArray(config.routines)
    ? config.routines.map(r => `  - ${r.name || r.id || '(unnamed)'}${r.schedule ? ` [${r.schedule}]` : ''}`).join('\n')
    : '';

  const isPolarisSession = !session?.workDir || session.workDir === CHAT_DIR;
  const mcpServers = isPolarisSession
    ? getConnectedMcpServers(session?.workDir)
    : getEnabledMcpServers();

  const lines = [
    '=== POLARIS CONTEXT (injected by server) ===',
    'You are running inside Polaris, a Claude Code SDK-based AI assistant host built by Scott.',
  ];

  if (session && session.id) {
    lines.push('', `Session ID: ${session.id}`);
  }

  // Make the project-picker behavior contractual instead of relying on the
  // model to infer it from a list of options. If a project is set on the
  // session, name it explicitly. If not, instruct the model to ask the user
  // to pick one before doing anything else.
  if (session && session.projectName) {
    lines.push('', `Current session project: ${session.projectName}${session.workDir ? ` (${session.workDir})` : ''}`);
  } else {
    lines.push(
      '',
      'Current session project: (none selected)',
      `BEFORE doing anything else, ask the user which project this session should work in. Use the Available projects list below as the choices, plus a "no project (scratch)" option for one-off tasks. Do not begin the user's actual request until they have picked. Once the user tells you the project, run this command (fill in the exact project name from the list), then continue:\ncurl -s -X POST http://127.0.0.1:${PORT}/set-project -H "Content-Type: application/json" -d "{\\"sessionId\\":\\"${session?.id}\\",\\"projectName\\":\\"PROJECT_NAME\\"}"`,
    );
  }

  if (projects) lines.push('', 'Available projects:', projects);
  if (routinesList) lines.push('', 'Configured routines:', routinesList);
  if (mcpServers.length > 0) lines.push('', `Connected MCP servers: ${mcpServers.join(', ')}`);

  lines.push(
    '',
    'Session card status: Polaris auto-detects your intent from your final response and updates the session card.',
    '  - Committed code or delivered work that needs testing → end your response with "Please test this" or "Try it out" — card goes purple (test).',
    '  - Asking the user a question or waiting for their input → end your response with a "?" — card goes amber (waiting).',
    '  - Task fully done, no action needed → finish normally — card goes green (done).',
    'You do not call any tool for this. The server reads your last message and sets the card automatically.',
  );

  lines.push('=== END POLARIS CONTEXT ===');
  return lines.join('\n');
}

function toolRead({ file_path, offset, limit }, sessionId, workDir) {
  const lines = fs.readFileSync(file_path, 'utf8').split('\n');
  const start = offset ? Math.max(0, offset - 1) : 0;
  const end   = limit  ? Math.min(lines.length, start + limit) : lines.length;
  if (sessionId && workDir && !isTempFile(file_path) && file_path.startsWith(workDir)) {
    try {
      const rel = path.relative(process.cwd(), file_path).replace(/\\/g, '/');
      const version = getVersions()[rel] || '1.0';
      const s = sessions.get(sessionId);
      const ts = Date.now();
      appendVersionLog({ ts, sessionId, sessionName: s?.name || sessionId, file: rel, type: 'read', version });
      broadcast({ type: 'file-read', sessionId, file: rel, version, ts, sessionName: s?.name || sessionId });
    } catch { /* non-critical */ }
  }
  return lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join('\n');
}

function toolQueryMemory({ filename } = {}, sessionId) {
  const session = sessions.get(sessionId);
  const mem = session?.projectMemory;
  if (!mem || Object.keys(mem).length === 0) return 'No project memory loaded for this session.';
  if (filename) {
    const key = Object.keys(mem).find(k => k.toLowerCase().includes(filename.toLowerCase()));
    return key ? `=== ${key} ===\n${mem[key]}` : `File not found in project memory: ${filename}`;
  }
  return Object.entries(mem).map(([k, v]) => `=== ${k} ===\n${v}`).join('\n\n');
}

function toolSetProject({ projectName } = {}, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return 'Session not found.';
  const cfg = readConfig();
  const matched = projectName ? (cfg.projects || []).find(p => p.name === projectName) : null;
  session.projectName = matched ? matched.name : null;
  session.workDir = matched ? (matched.workDir || session.workDir) : session.workDir;
  broadcast({ type: 'session-project-changed', sessionId, projectName: session.projectName, workDir: session.workDir });
  return matched ? `Project set to "${matched.name}".` : 'Project cleared (no project / scratch).';
}

function maybeSetTestOnGitCommit(command, sessionId) {
  if (/\bgit\s+(commit|push)\b/.test(command)) {
    const session = sessions.get(sessionId);
    if (session) session.committedDuringRun = true;
    toolSetStatus({ status: 'test' }, sessionId);
  }
}

const TEST_PHRASES    = /\b(please\s+test|try\s+it\s+out|try\s+this\s+out|test\s+this|let\s+me\s+know\s+if\s+(it|this)\s+works?|try\s+running|you\s+can\s+(?:now\s+)?test|give\s+it\s+a\s+try|give\s+this\s+a\s+try|run\s+the\s+(app|server|test))\b/i;
const WAITING_PHRASES = /\b(what\s+do\s+you\s+(think|want|prefer)|would\s+you\s+like|do\s+you\s+want|should\s+I|shall\s+I|which\s+(would|do)\s+you|any\s+(other\s+)?(questions?|feedback|thoughts?)|want\s+me\s+to|let\s+me\s+know|does\s+that\s+(work|help|make\s+sense))\b|\?(\s*$|\s*\n)/i;

function inferTermStatus(lastText) {
  if (TEST_PHRASES.test(lastText))    return 'test';
  if (WAITING_PHRASES.test(lastText)) return 'waiting';
  return 'done';
}

function toolSetStatus({ status } = {}, sessionId) {
  const ALLOWED = ['test', 'waiting', 'done', 'broken'];
  if (!ALLOWED.includes(status)) return `Invalid status "${status}". Allowed: ${ALLOWED.join(', ')}.`;
  const session = sessions.get(sessionId);
  if (!session) return 'Session not found.';
  session.status = status;
  broadcast({ type: 'session-status', sessionId, status });
  return `Status set to "${status}".`;
}

// assertWritable — enforces two rules before any write:
//   1. file_path must be inside workDir (hard boundary)
//   2. file must not be locked in the global locks.json
function assertWritable(file_path, workDir) {
  if (!workDir) return; // no workDir (e.g. chat sessions) — skip enforcement

  const resolved = path.resolve(file_path);
  const wd       = path.resolve(workDir);

  // Rule 1: path must be within workDir OR the Obsidian vault (agents write session notes/changelog there)
  const isInsideDir = (p, dir) => {
    const d = path.resolve(dir);
    return p.toLowerCase() === d.toLowerCase() || p.toLowerCase().startsWith(d.toLowerCase() + path.sep);
  };
  const cfg = readConfig();
  const downloadsDir = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : null;
  const inWorkDir   = isInsideDir(resolved, wd);
  const inObsidian  = cfg.obsidianVaultPath && isInsideDir(resolved, cfg.obsidianVaultPath);
  const inDownloads = downloadsDir && isInsideDir(resolved, downloadsDir);
  if (!inWorkDir && !inObsidian && !inDownloads) {
    const allowed = [
      `  workDir: ${workDir}`,
      cfg.obsidianVaultPath ? `  Obsidian vault: ${cfg.obsidianVaultPath}` : null,
      downloadsDir ? `  Downloads: ${downloadsDir}` : null,
    ].filter(Boolean).join('\n');
    throw new Error(
      `Write blocked: "${path.basename(file_path)}" is outside any allowed path.\n` +
      `Allowed:\n${allowed}\n` +
      `Attempted: ${resolved}`
    );
  }

  // Rule 2: check global locks.json
  try {
    const locks = readJSON(LOCKS_PATH, {});
    const rel   = path.relative(wd, resolved);
    const isLocked = (
      (locks[resolved]                && locks[resolved].sessions?.length)                ||
      (locks[rel]                     && locks[rel].sessions?.length)                     ||
      (locks[path.basename(resolved)] && locks[path.basename(resolved)].sessions?.length)
    );
    if (isLocked) {
      throw new Error(
        `Write blocked: "${path.basename(file_path)}" is locked. Unlock it in Polaris before writing.`
      );
    }
  } catch (e) {
    if (e.message.startsWith('Write blocked:')) throw e;
    // locks.json missing or unreadable — treat as no locks
  }
}

// assertSafeWriteSize — hard cap on file write size to prevent corruption
// Catches catastrophic writes (e.g. agent interleaving CSS rules between every
// character of an HTML file, exploding 8K lines to 1.7M lines as in v1.0.91).
// Cheaper to reject here than to send to Cross-Check.
function assertSafeWriteSize(content, file_path) {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_WRITE_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Write rejected: "${path.basename(file_path)}" would be ${mb} MB ` +
      `(limit ${MAX_WRITE_BYTES / (1024 * 1024)} MB). ` +
      `This is almost certainly corruption — review the content before retrying.`
    );
  }
  // Count lines without allocating a split array for very large strings
  let lines = 1;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lines++;
  }
  if (lines > MAX_WRITE_LINES) {
    throw new Error(
      `Write rejected: "${path.basename(file_path)}" would be ${lines.toLocaleString()} lines ` +
      `(limit ${MAX_WRITE_LINES.toLocaleString()}). ` +
      `This is almost certainly corruption — review the content before retrying.`
    );
  }
}

// ─── Source-file backup (Phase 0 of write-gate) ─────────────────────────────
// Snapshots a file to %APPDATA%\.claude\polaris\source-backups\ before any
// agent-driven write. Covers Edit, Write, and shell-tool writes (PowerShell
// Set-Content/Add-Content/Out-File, Bash > and >> redirection). Restore is a
// plain file copy from the backup directory — no git archeology needed.
//
// Naming: source-backups/<workDir basename>/<sanitizedRelPath>.<ISO>.<ext>
// Retention: keep last SOURCE_BACKUP_MAX_PER_FILE per file path; prune oldest
// across the whole tree once SOURCE_BACKUP_TOTAL_CAP_BYTES is exceeded.
function backupBeforeWrite(filePath, workDir) {
  if (!filePath || !workDir) return null;
  const resolved = path.resolve(filePath);
  const wd = path.resolve(workDir);
  const f = resolved.toLowerCase();
  const d = wd.toLowerCase();
  const inWorkDir = (f === d || f.startsWith(d + path.sep));
  if (!inWorkDir) return null;
  if (!fs.existsSync(resolved)) return null;
  let stat; try { stat = fs.statSync(resolved); } catch { return null; }
  if (!stat.isFile()) return null;
  if (stat.size > SOURCE_BACKUP_MAX_SIZE_BYTES) return null;

  const projectDir = path.basename(wd);
  const relPath = path.relative(wd, resolved);
  const sanitized = relPath.replace(/[\\\/]/g, '--');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(resolved) || '.bak';
  const base = sanitized.replace(new RegExp(ext.replace('.', '\\.') + '$'), '');
  const targetDir = path.join(SOURCE_BACKUPS_DIR, projectDir);
  const targetPath = path.join(targetDir, `${base}.${ts}${ext}`);
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(resolved, targetPath);
  } catch (e) {
    console.error('[backup] failed', resolved, e.message);
    return null;
  }
  pruneSourceBackupsForFile(targetDir, base, ext);
  pruneSourceBackupsByTotalSize();
  return targetPath;
}

function pruneSourceBackupsForFile(targetDir, basePrefix, ext) {
  let entries;
  try { entries = fs.readdirSync(targetDir); } catch { return; }
  const mine = entries
    .filter(n => n.startsWith(basePrefix + '.') && n.endsWith(ext))
    .map(n => {
      const full = path.join(targetDir, n);
      let st; try { st = fs.statSync(full); } catch { return null; }
      return st ? { full, mtime: st.mtimeMs } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  for (let i = SOURCE_BACKUP_MAX_PER_FILE; i < mine.length; i++) {
    try { fs.unlinkSync(mine[i].full); } catch {}
  }
}

function pruneSourceBackupsByTotalSize() {
  const all = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      let st; try { st = fs.statSync(full); } catch { continue; }
      all.push({ full, mtime: st.mtimeMs, size: st.size });
    }
  }
  walk(SOURCE_BACKUPS_DIR);
  let total = all.reduce((s, b) => s + b.size, 0);
  if (total <= SOURCE_BACKUP_TOTAL_CAP_BYTES) return;
  all.sort((a, b) => a.mtime - b.mtime);
  for (const b of all) {
    if (total <= SOURCE_BACKUP_TOTAL_CAP_BYTES) break;
    try { fs.unlinkSync(b.full); total -= b.size; } catch {}
  }
}

// detectShellWriteTargets — best-effort extraction of file paths a Bash or
// PowerShell command will write to. Catches common dangerous patterns:
// Set-Content / Add-Content / Out-File / Tee-Object / Copy-Item / Move-Item
// and shell redirection > and >>. Returns absolute paths.
function detectShellWriteTargets(command, workDir) {
  if (!command || typeof command !== 'string') return [];
  const targets = new Set();
  const patterns = [
    /(?:Set-Content|Add-Content|Out-File|Tee-Object)\s+(?:-Path\s+|-FilePath\s+|-LiteralPath\s+)?["']?([^"'\s|;]+)["']?/gi,
    /(?:Copy-Item|Move-Item|cp|mv)\s+["']?[^"'\s]+["']?\s+["']?([^"'\s|;]+)["']?/gi,
    />>?\s*["']?([^"'\s|;<&]+)["']?/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(command)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      if (raw.startsWith('-') || raw.startsWith('$')) continue; // flags, vars
      const resolved = path.isAbsolute(raw) ? raw : path.resolve(workDir || process.cwd(), raw);
      targets.add(resolved);
    }
  }
  return Array.from(targets);
}

// ─── Encoding sanity check (Phase 1 of write-gate) ─────────────────────────
// Catches the most common agent-induced corruption: writes performed in the
// wrong encoding (e.g. PowerShell here-strings written as UTF-16 / CP1252,
// rewriting the file with U+FFFD replacement chars and stripping the UTF-8
// BOM). Two checks: (1) auto-preserve BOM if the original had one — fixes
// transparently rather than throwing; (2) reject the write if the new
// content has more U+FFFD replacement chars than the original.
function hasUtf8BOM(buf) {
  return buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
}

function countReplacementChars(text) {
  if (!text) return 0;
  const m = text.match(/�/g);
  return m ? m.length : 0;
}

// preserveBOMAndCheckEncoding — called from toolWrite / toolEdit before
// fs.writeFileSync. Returns the (possibly BOM-prefixed) content to write.
// Throws if encoding corruption is detected.
function preserveBOMAndCheckEncoding(filePath, newContent) {
  if (!fs.existsSync(filePath)) return newContent;  // new file — nothing to compare
  let origBuf;
  try { origBuf = fs.readFileSync(filePath); } catch { return newContent; }

  let finalContent = newContent;
  // Strip any leading BOM the agent may have included; we'll add it back if the original had one.
  if (finalContent.charCodeAt(0) === 0xFEFF) finalContent = finalContent.slice(1);

  const origText = origBuf.toString('utf8').replace(/^﻿/, '');
  const origRepl = countReplacementChars(origText);
  const newRepl  = countReplacementChars(finalContent);
  if (newRepl > origRepl) {
    const projDir = path.basename(path.dirname(filePath));
    throw new Error(
      `Encoding check FAILED for "${path.basename(filePath)}": ` +
      `${newRepl - origRepl} new Unicode replacement char(s) (\\uFFFD) in proposed content. ` +
      `Common cause: write attempted in wrong encoding (UTF-16 / CP1252 instead of UTF-8). ` +
      `Backup of original is at %APPDATA%\\.claude\\polaris\\source-backups\\${projDir}\\. ` +
      `Re-read the file, fix the encoding in your write, and try again.`
    );
  }

  // Auto-preserve UTF-8 BOM if original had one.
  if (hasUtf8BOM(origBuf) && finalContent.charCodeAt(0) !== 0xFEFF) {
    finalContent = '﻿' + finalContent;
  }
  return finalContent;
}

// snapshotForShellEncodingCheck / verifyShellEncoding — called around shell
// command execution. Captures raw bytes of write targets before exec; after
// exec, compares replacement-char counts and BOM presence. Detected damage
// is appended to the tool result as a strong warning so the agent (and the
// human reading the terminal) sees it. The corrupted file is not rolled back
// automatically — the backup taken in Phase 0 is the recovery path.
function snapshotForShellEncodingCheck(targets) {
  const snapshots = new Map();
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    try {
      const buf = fs.readFileSync(target);
      snapshots.set(target, {
        hadBOM: hasUtf8BOM(buf),
        replCount: countReplacementChars(buf.toString('utf8')),
      });
    } catch {}
  }
  return snapshots;
}

function verifyShellEncoding(snapshots) {
  const warnings = [];
  for (const [target, snap] of snapshots) {
    if (!fs.existsSync(target)) continue;
    let buf;
    try { buf = fs.readFileSync(target); } catch { continue; }
    const newRepl  = countReplacementChars(buf.toString('utf8'));
    const newHasBOM = hasUtf8BOM(buf);
    const issues = [];
    if (newRepl > snap.replCount) {
      issues.push(`+${newRepl - snap.replCount} replacement char(s) (\\uFFFD)`);
    }
    if (snap.hadBOM && !newHasBOM) {
      issues.push('UTF-8 BOM was stripped');
    }
    if (issues.length) {
      const projDir = path.basename(path.dirname(target));
      warnings.push(
        `!! ENCODING CORRUPTION in ${target}: ${issues.join(', ')}. ` +
        `Backup at %APPDATA%\\.claude\\polaris\\source-backups\\${projDir}\\.`
      );
    }
  }
  return warnings;
}

// askForCrossCheckApproval — broadcasts cross-check result to UI and waits for
// the user to approve or reject. Mirror of toolAskUserQuestion's pattern.
// pendingCrossChecks holds { resolve, timer } so the WS handler can clear the
// timer when the user responds — otherwise the 10-minute timer pins the event
// loop until it fires.
function askForCrossCheckApproval({ sessionId, filePath, operation, review, originalLines, newLines, originalBytes, newBytes }) {
  return new Promise(resolve => {
    const checkId = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      if (pendingCrossChecks.has(checkId)) {
        pendingCrossChecks.delete(checkId);
        resolve('reject');
      }
    }, 600000); // 10 min timeout — defaults to reject for safety
    pendingCrossChecks.set(checkId, { resolve, timer });
    broadcast({
      type: 'cross-check-pending',
      checkId, sessionId, filePath, operation,
      verdict: review.verdict, summary: review.summary, issues: review.issues,
      model: review.model, ms: review.ms,
      originalLines, newLines, originalBytes, newBytes,
    });
  });
}

// ─── Post-hoc cross-check (Phase 2 extension) ────────────────────────────────
// For writes that have already happened (shell commands, Max CLI sessions),
// the gate runs after the fact. The reviewer sees the same diff, but the UI
// shows "Keep change" / "Restore original" instead of "Approve" / "Reject".
// Restoring writes originalContent back to disk directly.
const pendingPostHocChecks = new Map(); // checkId → { resolve, timer }

async function runPostHocCrossCheck({ sessionId, filePath, operation, originalContent, newContent, workDir }) {
  const cfg = readConfig();
  if (cfg.crossCheckEnabled === false) return;
  const session = sessions.get(sessionId);
  if (session?.evalRunner) return;

  const origBytes = Buffer.byteLength(originalContent, 'utf8');
  const newBytes  = Buffer.byteLength(newContent, 'utf8');
  if (Math.abs(newBytes - origBytes) < 200) return;

  const sessionPrompt  = session?.lastPrompt || '';
  const reviewerModel  = cfg.crossCheckModel || CROSS_CHECK_DEFAULT_MODEL;
  const apiKey         = cfg.openRouterApiKey;

  let review;
  if (!apiKey) {
    review = { verdict: 'ERROR', summary: 'No openRouterApiKey — review skipped, manual approval required', issues: [], model: reviewerModel, ms: 0, usage: null };
  } else {
    review = await crossCheckChange({ sessionId, sessionPrompt, filePath, originalContent, newContent, model: reviewerModel, apiKey });
  }

  const origLines = originalContent.split('\n').length;
  const newLines  = newContent.split('\n').length;

  const decision = await new Promise(resolve => {
    const checkId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      if (pendingPostHocChecks.has(checkId)) {
        pendingPostHocChecks.delete(checkId);
        resolve('keep'); // timeout = keep the already-written change
      }
    }, 600000);
    pendingPostHocChecks.set(checkId, { resolve, timer });
    broadcast({
      type: 'cross-check-post-hoc-pending',
      checkId, sessionId, filePath, operation,
      verdict: review.verdict, summary: review.summary, issues: review.issues,
      model: review.model, ms: review.ms,
      originalLines, newLines, originalBytes: origBytes, newBytes,
    });
  });

  recordCrossCheck(sessionId, {
    ts: new Date().toISOString(),
    sessionId, filePath, operation: `${operation} (post-hoc)`,
    originalLines, newLines, originalBytes: origBytes, newBytes,
    review, userDecision: decision, sessionPrompt,
  });

  if (decision === 'restore') {
    try { fs.writeFileSync(filePath, originalContent, 'utf8'); } catch {}
  }
}

// runCrossCheckAndApproval — orchestrates engine + UI prompt + storage.
// Returns true if user approved (write should proceed), false if rejected.
// Bypasses cross-check entirely if the change delta is under 200 bytes
// (single-char fixes don't need a Sonnet call) or if cross-check is disabled.
async function runCrossCheckAndApproval({ sessionId, filePath, operation, originalContent, newContent }) {
  const cfg = readConfig();
  if (cfg.crossCheckEnabled === false) return true; // explicitly disabled

  // Bypass for Agent Eval sessions — they run unattended in a tmp workdir, so
  // there's no human to approve and the cells need to complete promptly.
  const session = sessions.get(sessionId);
  if (session?.evalRunner) return true;

  const origBytes = Buffer.byteLength(originalContent || '', 'utf8');
  const newBytes  = Buffer.byteLength(newContent, 'utf8');
  if (Math.abs(newBytes - origBytes) < 200) return true; // tiny edit bypass

  const sessionPrompt = session?.lastPrompt || '';
  const reviewerModel = cfg.crossCheckModel || CROSS_CHECK_DEFAULT_MODEL;
  const apiKey = cfg.openRouterApiKey;

  let review;
  if (!apiKey) {
    review = { verdict: 'ERROR', summary: 'No openRouterApiKey configured — review skipped, manual approval required', issues: [], model: reviewerModel, ms: 0, usage: null };
  } else {
    review = await crossCheckChange({
      sessionId, sessionPrompt, filePath,
      originalContent: originalContent || '',
      newContent,
      model: reviewerModel,
      apiKey,
    });
  }

  const origLines = originalContent ? originalContent.split('\n').length : 0;
  const newLines  = newContent.split('\n').length;

  const decision = await askForCrossCheckApproval({
    sessionId, filePath, operation, review,
    originalLines: origLines, newLines, originalBytes: origBytes, newBytes,
  });

  recordCrossCheck(sessionId, {
    ts: new Date().toISOString(),
    sessionId, filePath, operation,
    originalLines: origLines, newLines, originalBytes: origBytes, newBytes,
    review, userDecision: decision,
    sessionPrompt,
    originalContent: origBytes < 200 * 1024 ? originalContent : null,
    newContent: newBytes < 200 * 1024 ? newContent : null,
  });

  return decision === 'approve';
}

async function toolWrite({ file_path, content }, workDir, sessionId) {
  assertWritable(file_path, workDir);
  assertSafeWriteSize(content, file_path);
  backupBeforeWrite(file_path, workDir);
  const originalContent = fs.existsSync(file_path) ? fs.readFileSync(file_path, 'utf8') : '';
  const approved = await runCrossCheckAndApproval({
    sessionId, filePath: file_path, operation: 'Write', originalContent, newContent: content,
  });
  if (!approved) {
    throw new Error(`Cross-Check rejected: write to ${path.basename(file_path)} was not approved by the user.`);
  }
  const finalContent = preserveBOMAndCheckEncoding(file_path, content);
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
  fs.writeFileSync(file_path, finalContent, 'utf8');
  return `Written: ${file_path}`;
}

async function toolEdit({ file_path, old_string, new_string, replace_all }, workDir, sessionId) {
  assertWritable(file_path, workDir);
  backupBeforeWrite(file_path, workDir);
  const content = fs.readFileSync(file_path, 'utf8');
  if (!content.includes(old_string)) throw new Error(`old_string not found in ${file_path}`);
  const updated = replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, new_string);
  assertSafeWriteSize(updated, file_path);
  const approved = await runCrossCheckAndApproval({
    sessionId, filePath: file_path, operation: 'Edit', originalContent: content, newContent: updated,
  });
  if (!approved) {
    throw new Error(`Cross-Check rejected: edit to ${path.basename(file_path)} was not approved by the user.`);
  }
  const finalContent = preserveBOMAndCheckEncoding(file_path, updated);
  fs.writeFileSync(file_path, finalContent, 'utf8');
  return `Edited: ${file_path}`;
}

// Finds the first balanced JSON object in a string, ignoring trailing prose or extra objects.
function extractFirstJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// ─── Cross-Check engine (Phase 2) ────────────────────────────────────────────
// Reviews proposed file changes via a configurable model before they hit disk.
// Returns { verdict, summary, issues, model, ms }. Default is Haiku 4.5 — at
// 90% of Sonnet's capability for ~3x lower cost, it's the right tier for a
// structured-JSON classifier task that fires on every >200-byte write.
// Override via cfg.crossCheckModel.
const CROSS_CHECK_DEFAULT_MODEL = 'anthropic/claude-haiku-4-5';
const CROSS_CHECK_DIFF_BUDGET = 100 * 1024;  // 100 KB max combined before/after sent to reviewer

function buildDiffContext(originalContent, newContent) {
  const totalBytes = Buffer.byteLength(originalContent, 'utf8') + Buffer.byteLength(newContent, 'utf8');
  if (totalBytes <= CROSS_CHECK_DIFF_BUDGET) {
    return { mode: 'full', original: originalContent, after: newContent };
  }
  // Large file — emit a unified diff of just the changed region + context.
  // Finds the longest common prefix and suffix, leaving only the changed block.
  const origLines = originalContent.split('\n');
  const nextLines = newContent.split('\n');
  const minLen = Math.min(origLines.length, nextLines.length);
  let prefix = 0;
  while (prefix < minLen && origLines[prefix] === nextLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    origLines[origLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
  ) suffix++;
  const CTX = 5;
  const oStart = Math.max(0, prefix - CTX);
  const oEnd   = Math.min(origLines.length, origLines.length - suffix + CTX);
  const nEnd   = Math.min(nextLines.length, nextLines.length - suffix + CTX);
  const hunkLines = [
    `@@ -${oStart + 1},${oEnd - oStart} +${oStart + 1},${nEnd - oStart} @@`,
    ...origLines.slice(oStart, prefix).map(l => ` ${l}`),
    ...origLines.slice(prefix, origLines.length - suffix).map(l => `-${l}`),
    ...nextLines.slice(prefix, nextLines.length - suffix).map(l => `+${l}`),
    ...origLines.slice(origLines.length - suffix, oEnd).map(l => ` ${l}`),
  ];
  let diff = hunkLines.join('\n');
  if (Buffer.byteLength(diff, 'utf8') > CROSS_CHECK_DIFF_BUDGET) {
    diff = diff.slice(0, CROSS_CHECK_DIFF_BUDGET) + '\n[... diff truncated ...]';
  }
  return { mode: 'unified-diff', diff };
}

function callOpenRouterOnce(model, apiKey, messages, maxTokens = 800) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens });
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'HTTP-Referer':   'https://polaris.aesopacademy.com',
        'X-Title':        'Polaris',
        'Connection':     'close',
      },
      // Fresh agent per request — see callOpenRouterStream for rationale.
      agent: new https.Agent({ keepAlive: false, maxSockets: 1 }),
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ error: `HTTP ${res.statusCode}: ${body.slice(0, 400)}` });
        try {
          const data = JSON.parse(body);
          resolve({ content: data.choices?.[0]?.message?.content || '', usage: data.usage || null });
        } catch (e) {
          resolve({ error: `Parse failed: ${e.message}` });
        }
      });
    });
    req.on('error', e => resolve({ error: `Network: ${e.message}` }));
    req.write(payload);
    req.end();
  });
}

async function crossCheckChange({ sessionId, sessionPrompt, filePath, originalContent, newContent, model, apiKey, unifiedDiff }) {
  const startMs = Date.now();
  const useModel = model || CROSS_CHECK_DEFAULT_MODEL;
  const origLines = originalContent ? originalContent.split('\n').length : 0;
  const origBytes = originalContent ? Buffer.byteLength(originalContent, 'utf8') : 0;
  const newLines  = newContent ? newContent.split('\n').length : 0;
  const newBytes  = newContent ? Buffer.byteLength(newContent, 'utf8') : 0;

  // Prefer a pre-computed unified diff (e.g. from git diff) over building one in-process.
  let diffSection;
  if (unifiedDiff) {
    let d = unifiedDiff;
    if (Buffer.byteLength(d, 'utf8') > CROSS_CHECK_DIFF_BUDGET) {
      d = d.slice(0, CROSS_CHECK_DIFF_BUDGET) + '\n[... diff truncated ...]';
    }
    diffSection = `UNIFIED DIFF (git):\n\`\`\`diff\n${d}\n\`\`\``;
  } else {
    const diff = buildDiffContext(originalContent || '', newContent || '');
    if (diff.mode === 'full') {
      diffSection = `ORIGINAL CONTENT:\n\`\`\`\n${diff.original}\n\`\`\`\n\nPROPOSED NEW CONTENT:\n\`\`\`\n${diff.after}\n\`\`\``;
    } else {
      diffSection = `UNIFIED DIFF (changed region only):\n\`\`\`diff\n${diff.diff}\n\`\`\``;
    }
  }

  const reviewPrompt = `You are reviewing a file change for the Polaris project.

TASK: ${sessionPrompt || '(not captured)'}
FILE: ${filePath}
SIZE: ${origLines} → ${newLines} lines  /  ${origBytes} → ${newBytes} bytes

${diffSection}

Review for:
1. Corruption — gibberish, structural damage, encoding mojibake, repeated identical content
2. Correctness — does the change actually implement the stated task?
3. Quality — broken syntax, dead code, security issues, malformed HTML/JS/CSS

If the diff is non-empty and the changes look intentional and consistent with the task, verdict is PASS.
Respond ONLY with JSON (no prose): {"verdict":"PASS" or "FAIL","summary":"one-line summary","issues":["issue 1"]}`;

  const result = await callOpenRouterOnce(useModel, apiKey, [{ role: 'user', content: reviewPrompt }], 800);
  const ms = Date.now() - startMs;

  if (result.error) {
    return { verdict: 'ERROR', summary: result.error, issues: [], model: useModel, ms, usage: null };
  }
  // Robust JSON extraction — find the first balanced {} object, ignoring trailing prose/objects.
  const jsonStr = extractFirstJson(result.content || '');
  if (!jsonStr) {
    return { verdict: 'ERROR', summary: 'No JSON in reviewer response', issues: [result.content?.slice(0, 200) || ''], model: useModel, ms, usage: result.usage };
  }
  try {
    const parsed = JSON.parse(jsonStr);
    // Preserve PASS/FAIL/ERROR distinctly so the UI can show "reviewer broke" vs
    // "reviewer flagged a real problem." Anything outside the known set is treated
    // as ERROR so the user sees the raw verdict and can decide manually.
    const rawVerdict = String(parsed.verdict || '').toUpperCase();
    const verdict = (rawVerdict === 'PASS' || rawVerdict === 'FAIL' || rawVerdict === 'ERROR')
      ? rawVerdict
      : 'ERROR';
    return {
      verdict,
      summary: parsed.summary || (verdict === 'ERROR' ? `Unrecognized verdict: ${parsed.verdict}` : '(no summary)'),
      issues:  Array.isArray(parsed.issues) ? parsed.issues : [],
      model:   useModel,
      ms,
      usage:   result.usage,
    };
  } catch (e) {
    return { verdict: 'ERROR', summary: `JSON parse failed: ${e.message}`, issues: [], model: useModel, ms, usage: result.usage };
  }
}

function recordCrossCheck(sessionId, entry) {
  fs.mkdirSync(CROSS_CHECKS_DIR, { recursive: true });
  const file = path.join(CROSS_CHECKS_DIR, `${sessionId}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  pruneOldCrossChecks();
}

// Keep at most 500 entries total across all session JSONL files.
// Deletes the oldest files (by mtime) until under the limit.
function pruneOldCrossChecks() {
  try {
    if (!fs.existsSync(CROSS_CHECKS_DIR)) return;
    const files = fs.readdirSync(CROSS_CHECKS_DIR).filter(f => f.endsWith('.jsonl'));
    let total = 0;
    const stats = files.map(f => {
      const p = path.join(CROSS_CHECKS_DIR, f);
      const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).length;
      total += lines;
      return { path: p, lines, mtime: fs.statSync(p).mtimeMs };
    });
    if (total <= 500) return;
    stats.sort((a, b) => a.mtime - b.mtime);
    for (const f of stats) {
      if (total <= 500) break;
      fs.unlinkSync(f.path);
      total -= f.lines;
    }
  } catch {}
}

function loadCrossChecksForSession(sessionId) {
  const file = path.join(CROSS_CHECKS_DIR, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function loadAllCrossChecks(limit = 200) {
  if (!fs.existsSync(CROSS_CHECKS_DIR)) return [];
  const files = fs.readdirSync(CROSS_CHECKS_DIR).filter(f => f.endsWith('.jsonl'));
  const all = [];
  for (const f of files) {
    const sessionId = f.replace(/\.jsonl$/, '');
    const entries = loadCrossChecksForSession(sessionId);
    for (const e of entries) all.push({ ...e, sessionId });
  }
  return all.sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, limit);
}

// ─── Pre-build cross-check ───────────────────────────────────────────────────
// Aggregate cross-check pass over every file changed since the last check.
// Build button gates on this — if the repo state hasn't been reviewed, build
// is rejected and the UI prompts the user to run the check first.
const PRE_BUILD_CHECK_PATH = path.join(POLARIS_DIR, 'pre-build-check.json');
const LAST_BUILD_HEAD_PATH = path.join(POLARIS_DIR, 'last-build-head.json');

function getRepoSnapshot(sourcePath) {
  try {
    const head = execSync('git rev-parse HEAD', { cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const status = execSync('git status --porcelain', { cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { head, status };
  } catch {
    return { head: null, status: null };
  }
}

function getPreBuildCheckStatus(sourcePath) {
  const current = getRepoSnapshot(sourcePath);
  let state = null;
  try { state = JSON.parse(fs.readFileSync(PRE_BUILD_CHECK_PATH, 'utf8')); } catch {}
  if (!state) return { fresh: false, lastCheckedAt: null, currentSnapshot: current };
  const fresh = state.repoHead === current.head && state.repoStatus === current.status;
  return {
    fresh,
    lastCheckedAt: state.lastCheckedAt,
    lastVerdict: state.verdict,
    fileCount: (state.files || []).length,
    passCount: (state.files || []).filter(f => f.verdict === 'PASS').length,
    failCount: (state.files || []).filter(f => f.verdict === 'FAIL').length,
    errorCount: (state.files || []).filter(f => f.verdict === 'ERROR').length,
  };
}

// List files changed since baseCommit (all commits since last build) plus any
// uncommitted working-tree changes. baseCommit is the git SHA saved when the
// last build was triggered; falls back to uncommitted-only if absent.
function getChangedFiles(sourcePath, baseCommit) {
  const skip = f => f.startsWith('dist/') || f.startsWith('node_modules/') || f.endsWith('.lock');
  const files = new Set();
  try {
    if (baseCommit) {
      const committed = execSync(`git diff "${baseCommit}"..HEAD --name-only`, {
        cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      committed.split('\n').map(l => l.trim()).filter(Boolean).forEach(f => files.add(f));
    }
    const out = execSync('git status --porcelain', { cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    out.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = l.match(/^.{1,3}\s+(?:.+\s->\s)?(.+)$/);
      return m ? m[1].replace(/^"|"$/g, '') : null;
    }).filter(Boolean).forEach(f => files.add(f));
  } catch {}
  return [...files].filter(f => !skip(f));
}

async function runPreBuildCheck(ws, sourcePath) {
  const config = readConfig();
  const apiKey = config.openRouterApiKey ? decryptSecret(config.openRouterApiKey) : null;
  const model = config.crossCheckModel || CROSS_CHECK_DEFAULT_MODEL;

  // Read the git SHA from when the last build was triggered
  let baseCommit = null;
  let baseVersion = null;
  try {
    const saved = JSON.parse(fs.readFileSync(LAST_BUILD_HEAD_PATH, 'utf8'));
    baseCommit = saved.head || null;
    baseVersion = saved.version || null;
  } catch {}

  // Fallback: no saved head — find the commit that bumped package.json to the
  // current version. That's the effective "last build" boundary.
  if (!baseCommit) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8'));
      baseVersion = pkg.version;
      const hashes = execSync('git log --format=%H -- package.json', {
        cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim().split('\n').filter(Boolean);
      for (const hash of hashes) {
        try {
          const pkgAtHash = JSON.parse(
            execSync(`git show "${hash}":package.json`, {
              cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'],
            }).toString()
          );
          if (pkgAtHash.version === pkg.version) {
            baseCommit = hash; // keep updating to get the oldest matching commit
          } else {
            break; // older version found — done
          }
        } catch {}
      }
    } catch {}
  }

  const files = getChangedFiles(sourcePath, baseCommit);
  const baseLabel = baseVersion ? `v${baseVersion}` : (baseCommit ? baseCommit.slice(0, 7) : 'last commit');

  sendTo(ws, { type: 'pre-build-check-progress', phase: 'start', total: files.length, baseLabel });

  if (files.length === 0) {
    const snapshot = getRepoSnapshot(sourcePath);
    fs.writeFileSync(PRE_BUILD_CHECK_PATH, JSON.stringify({
      lastCheckedAt: new Date().toISOString(),
      repoHead: snapshot.head,
      repoStatus: snapshot.status,
      verdict: 'PASS',
      files: [],
      groups: [],
      summary: `No changes since ${baseLabel}.`,
    }, null, 2), 'utf8');
    sendTo(ws, { type: 'pre-build-check-complete', verdict: 'PASS', files: [], groups: [], summary: `No changes since ${baseLabel}.`, baseLabel });
    return;
  }

  if (!apiKey) {
    sendTo(ws, { type: 'pre-build-check-error', message: 'No OpenRouter API key configured — cannot run reviewer model.' });
    return;
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const rel = files[i];
    const abs = path.join(sourcePath, rel);

    // Use git diff for the review — correct multi-hunk output regardless of file size.
    let unifiedDiff = null;
    if (baseCommit) {
      try {
        unifiedDiff = execSync(`git diff "${baseCommit}"..HEAD -- "${rel}"`, {
          cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4 * 1024 * 1024,
        }).toString();
      } catch {}
    }
    // Fallback for uncommitted files: build diff from disk content vs HEAD.
    let newContent = '';
    let originalContent = '';
    if (!unifiedDiff) {
      try { newContent = fs.readFileSync(abs, 'utf8'); } catch {}
      try {
        originalContent = execSync(`git show HEAD:"${rel}"`, { cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      } catch {}
    }

    sendTo(ws, { type: 'pre-build-check-progress', phase: 'reviewing', completed: i, total: files.length, file: rel });

    const review = await crossCheckChange({
      sessionId: 'pre-build-check',
      sessionPrompt: `Pre-build cross-check: all changes since ${baseLabel}.`,
      filePath: abs,
      originalContent,
      newContent,
      model,
      apiKey,
      unifiedDiff,
    });
    results.push({
      file: rel,
      verdict: review.verdict,
      summary: review.summary,
      issues: review.issues || [],
      ms: review.ms,
    });
  }

  // Group results by configured project (match sourcePath → project name)
  const projects = (config.projects || []).filter(p => p.workDir);
  const normSource = sourcePath.replace(/\\/g, '/').toLowerCase();
  const groups = [];

  // Find which configured project owns this sourcePath
  const ownerProject = projects.find(p => p.workDir.replace(/\\/g, '/').toLowerCase() === normSource);
  const projectLabel = ownerProject ? (ownerProject.name || ownerProject.workDir) : 'Polaris';

  // All files belong to the same source dir, so one group
  groups.push({ project: projectLabel, workDir: sourcePath, files: results });

  const verdict = results.some(r => r.verdict === 'FAIL') ? 'FAIL'
                : results.some(r => r.verdict === 'ERROR') ? 'ERROR'
                : 'PASS';
  const passCount = results.filter(r => r.verdict === 'PASS').length;
  const summary = `${passCount}/${results.length} files passed since ${baseLabel} (${model.split('/').pop()}).`;

  const snapshot = getRepoSnapshot(sourcePath);
  fs.writeFileSync(PRE_BUILD_CHECK_PATH, JSON.stringify({
    lastCheckedAt: new Date().toISOString(),
    repoHead: snapshot.head,
    repoStatus: snapshot.status,
    verdict,
    files: results,
    groups,
    summary,
    model,
    baseCommit,
    baseVersion,
  }, null, 2), 'utf8');

  sendTo(ws, { type: 'pre-build-check-complete', verdict, files: results, groups, summary, model, baseLabel });
}

function toolGlob({ pattern, path: searchPath }, workDir) {
  const base = searchPath || workDir || process.cwd();
  // Convert glob to regex — escape special chars first, then expand * and ? wildcards
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex chars (not * or ?)
    .replace(/\*\*/g, '__DSTAR__')           // protect ** before replacing single *
    .replace(/\*/g, '[^/\\\\]*')           // * → any non-separator chars
    .replace(/__DSTAR__/g, '.*')           // ** → anything including separators
    .replace(/\?/g, '[^/\\\\]');           // ? → single non-separator char
  const rx = new RegExp(`(^|[/\\\\])${regexStr}$`, 'i');
  const results = [];
  const walk = (dir, depth) => {
    if (depth > 15) return;
    try {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) { walk(full, depth + 1); }
        else if (rx.test(full.replace(/\\/g, '/'))) { results.push(full); }
      }
    } catch {}
  };
  walk(base, 0);
  return results.slice(0, 500).join('\n') || '(no matches)';
}

function toolGrep({ pattern, path: searchPath, glob: globFilter, output_mode, context: ctx }, workDir) {
  const searchIn = searchPath || workDir || process.cwd();
  const filter   = globFilter ? `*${path.extname(globFilter) || globFilter}` : '*';
  const ctxLines = ctx || 0;
  const ctxFlag  = ctxLines > 0 ? `-Context ${ctxLines},${ctxLines}` : '';
  let   cmd      = `Get-ChildItem -Path "${searchIn}" -Recurse -File -Filter "${filter}" -ErrorAction SilentlyContinue | Select-String -Pattern ${JSON.stringify(pattern)} -ErrorAction SilentlyContinue ${ctxFlag}`;
  if (output_mode === 'files_with_matches') cmd += ' | Select-Object -ExpandProperty Path -Unique';
  else if (output_mode === 'count')         cmd += ' | Measure-Object | Select-Object -ExpandProperty Count';
  try {
    return execSync(`powershell.exe -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }).toString().trim() || '(no matches)';
  } catch (e) { return e.stdout?.toString().trim() || '(no matches)'; }
}

// Shell safety enforcement ─────────────────────────────────────────────────
const SHELL_HARD_BLOCKED = [
  { pattern: /\bgit\s+push\s+(-f\b|--force\b)/i,    reason: 'force-push is blocked — run manually if needed' },
  { pattern: /\bgit\s+reset\s+--hard\b/i,            reason: 'git reset --hard is blocked — run manually if needed' },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/i,         reason: 'git clean -f is blocked — run manually if needed' },
  { pattern: /\bformat\s+[a-zA-Z]:/i,                reason: 'drive format is blocked' },
  { pattern: /\brm\s+-[rRfF ]*[rR][fF]?\s+[/"']*[\/\\]/i, reason: 'recursive delete at filesystem root is blocked' },
  { pattern: /\brd\s+\/s\s+\/q\s+[a-zA-Z]:\\\s*$/i, reason: 'full-drive rd is blocked' },
];

const SHELL_WRITE_VERBS = /\b(rm|del|rd|rmdir|Remove-Item|ri|move|mv|ren|rename|copy|cp|xcopy|robocopy|Set-Content|Out-File|New-Item|Add-Content|Write-Output\s*>|echo\s+.+>)\b/i;

function assertSafeCommand(command, workDir) {
  if (!workDir) return; // no workDir configured — skip enforcement
  const flat = command.replace(/\r?\n/g, ' ');

  // Layer 1: hard-blocked patterns
  for (const { pattern, reason } of SHELL_HARD_BLOCKED) {
    if (pattern.test(flat)) {
      throw new Error(`Shell command blocked: ${reason}.\nCommand: ${flat.slice(0, 120)}`);
    }
  }

  // Layer 2: absolute path boundary check for write-oriented commands
  if (SHELL_WRITE_VERBS.test(flat)) {
    const absPathRe = /[a-zA-Z]:[\\\/][^\s'">,;|&)>]*/g;
    const wd = path.resolve(workDir).toLowerCase();
    for (const p of flat.match(absPathRe) || []) {
      const resolved = path.resolve(p).toLowerCase();
      if (!resolved.startsWith(wd)) {
        throw new Error(
          `Shell command blocked: path "${p}" is outside the project directory.\n` +
          `Allowed: ${workDir}\nAttempted: ${p}`
        );
      }
    }
  }
}

async function toolBash({ command, timeout: tms }, workDir, sessionId) {
  assertSafeCommand(command, workDir);
  const writeTargets = detectShellWriteTargets(command, workDir);
  for (const target of writeTargets) backupBeforeWrite(target, workDir);
  const snapshots = snapshotForShellEncodingCheck(writeTargets);
  // Capture pre-exec content for post-hoc cross-check comparison.
  const priorContents = new Map();
  for (const target of writeTargets) {
    if (fs.existsSync(target)) {
      try { priorContents.set(target, fs.readFileSync(target, 'utf8')); } catch {}
    }
  }
  let output;
  try {
    output = execSync(command, { cwd: workDir, shell: true, timeout: Math.min(tms || 60000, 120000), maxBuffer: 5 * 1024 * 1024 }).toString();
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : '';
    const err = e.stderr ? e.stderr.toString() : '';
    output = (out + (err ? '\n' + err : '') || e.message).trim();
  }
  const warnings = verifyShellEncoding(snapshots);
  // Post-hoc cross-check: review any files that changed.
  for (const target of writeTargets) {
    if (!fs.existsSync(target)) continue;
    try {
      const newContent = fs.readFileSync(target, 'utf8');
      const oldContent = priorContents.get(target) || '';
      if (newContent !== oldContent) {
        await runPostHocCrossCheck({ sessionId, filePath: target, operation: 'Bash', originalContent: oldContent, newContent, workDir });
      }
    } catch {}
  }
  maybeSetTestOnGitCommit(command, sessionId);
  return warnings.length ? output + '\n\n' + warnings.join('\n') : output;
}

async function toolPowerShell({ command, timeout: tms }, workDir, sessionId) {
  assertSafeCommand(command, workDir);
  const writeTargets = detectShellWriteTargets(command, workDir);
  for (const target of writeTargets) backupBeforeWrite(target, workDir);
  const snapshots = snapshotForShellEncodingCheck(writeTargets);
  const priorContents = new Map();
  for (const target of writeTargets) {
    if (fs.existsSync(target)) {
      try { priorContents.set(target, fs.readFileSync(target, 'utf8')); } catch {}
    }
  }
  let output;
  try {
    output = execSync(`powershell.exe -NoProfile -Command ${JSON.stringify(command)}`, { cwd: workDir, timeout: Math.min(tms || 60000, 120000), maxBuffer: 5 * 1024 * 1024 }).toString();
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : '';
    const err = e.stderr ? e.stderr.toString() : '';
    output = (out + (err ? '\n' + err : '') || e.message).trim();
  }
  const warnings = verifyShellEncoding(snapshots);
  for (const target of writeTargets) {
    if (!fs.existsSync(target)) continue;
    try {
      const newContent = fs.readFileSync(target, 'utf8');
      const oldContent = priorContents.get(target) || '';
      if (newContent !== oldContent) {
        await runPostHocCrossCheck({ sessionId, filePath: target, operation: 'PowerShell', originalContent: oldContent, newContent, workDir });
      }
    } catch {}
  }
  maybeSetTestOnGitCommit(command, sessionId);
  return warnings.length ? output + '\n\n' + warnings.join('\n') : output;
}

function toolWebFetch({ url }) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, { headers: { 'User-Agent': 'Polaris/1.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000)));
    }).on('error', err => resolve(`Fetch error: ${err.message}`));
  });
}

function braveSearch(query, count, apiKey) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(query);
    const opts = {
      hostname: 'api.search.brave.com',
      path: `/res/v1/web/search?q=${q}&count=${count}`,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity', 'X-Subscription-Token': apiKey },
    };
    https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) return resolve(`Brave Search error ${res.statusCode}: ${data.slice(0, 200)}`);
          const parsed = JSON.parse(data);
          const results = (parsed.web?.results || []).slice(0, count);
          if (!results.length) return resolve('No results found.');
          resolve(results.map((r, i) => `${i+1}. ${r.title}\n   ${r.url}\n   ${r.description || ''}`).join('\n\n'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject).end();
  });
}

function duckDuckGoSearch(query, count) {
  return new Promise(resolve => {
    const q = encodeURIComponent(query);
    const opts = {
      hostname: 'api.duckduckgo.com',
      path: `/?q=${q}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
      method: 'GET',
      headers: { 'User-Agent': 'Polaris/1.0' },
    };
    https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          const lines = [];
          if (p.Answer)   lines.push(`Answer: ${p.Answer}`);
          if (p.Abstract) lines.push(`Summary: ${p.Abstract}\nSource: ${p.AbstractURL}`);
          const topics = (p.RelatedTopics || []).filter(t => t.FirstURL && t.Text).slice(0, count);
          topics.forEach((t, i) => lines.push(`${i+1}. ${t.Text}\n   ${t.FirstURL}`));
          if (!lines.length) resolve('No instant-answer results. Add braveSearchApiKey in Settings for full web search (search.brave.com — free tier 2000/month).');
          else resolve(lines.join('\n\n') + '\n\n(Tip: add braveSearchApiKey in Settings for full search results)');
        } catch { resolve('Search unavailable. Add braveSearchApiKey in Settings.'); }
      });
    }).on('error', () => resolve('Search unavailable.')).end();
  });
}

async function toolWebSearch({ query, num_results = 5 }) {
  const config = readConfig();
  const n = Math.min(num_results, 10);
  // Priority 1: You.com free tier via MCP (no key required)
  const claudeJson = readClaudeJson();
  if (claudeJson.mcpServers?.['you-com']) {
    try {
      const result = await callMcpTool('you-com', 'you-search', { query, count: n });
      if (result && !String(result).startsWith('Error')) return result;
    } catch { /* fall through */ }
  }
  // Priority 2: Brave Search API (if key configured)
  if (config.braveSearchApiKey) return braveSearch(query, n, config.braveSearchApiKey);
  // Priority 3: DuckDuckGo instant answers (free, no key, limited)
  return duckDuckGoSearch(query, n);
}

function toolAskUserQuestion({ question, options }, sessionId) {
  return new Promise(resolve => {
    const questionId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pendingQuestions.set(questionId, resolve);
    broadcast({ type: 'ask-user-question', sessionId, question, options: options || [], questionId });
    setTimeout(() => {
      if (pendingQuestions.has(questionId)) {
        pendingQuestions.delete(questionId);
        resolve('(No response — question timed out after 5 minutes)');
      }
    }, 300000);
  });
}

function toolTodoWrite({ todos }, sessionId) {
  // Accept both legacy object format and new flat "content|status" string format
  const normalized = (todos || []).map(t => {
    if (typeof t === 'object') return t; // legacy: {content, status}
    const [content, status = 'pending'] = String(t).split('|');
    return { content: content.trim(), status: status.trim() };
  });
  const s = sessions.get(sessionId);
  if (s) s.todos = normalized;
  return 'Todos updated:\n' + normalized.map(t => `[${t.status}] ${t.content}`).join('\n');
}

// â"€â"€ MCP Integration â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const mcpProcesses = new Map(); // serverName → { proc, pending, buffer, nextId }
let mcpToolsCache = null;
let mcpToolsCacheTime = 0;
const MCP_CACHE_TTL = 60000;

function getMcpServerConfigs() {
  return readClaudeJson().mcpServers || {};
}

function mcpSend(state, message) {
  state.proc.stdin.write(JSON.stringify(message) + '\n');
}

function mcpStdioCall(state, method, params, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = state.nextId++;
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`MCP timeout: ${method}`));
    }, timeout);
    state.pending.set(id, {
      resolve: v => { clearTimeout(timer); resolve(v); },
      reject:  e => { clearTimeout(timer); reject(e); },
    });
    mcpSend(state, { jsonrpc: '2.0', id, method, params: params || {} });
  });
}

async function ensureMcpProcess(serverName, serverConfig) {
  const existing = mcpProcesses.get(serverName);
  if (existing && !existing.proc.killed) return existing;

  const cfg = readConfig();
  const creds = (cfg.mcp_credentials || {})[serverName] || {};
  const env = { ...process.env, ...(serverConfig.env || {}), ...creds };

  const proc = spawn(serverConfig.command, serverConfig.args || [], {
    env, stdio: ['pipe', 'pipe', 'pipe'], shell: true, windowsHide: true,
  });

  const state = { proc, pending: new Map(), buffer: '', nextId: 1 };
  mcpProcesses.set(serverName, state);

  proc.stdout.on('data', chunk => {
    state.buffer += chunk.toString();
    let nl;
    while ((nl = state.buffer.indexOf('\n')) !== -1) {
      const line = state.buffer.slice(0, nl).trim();
      state.buffer = state.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && state.pending.has(msg.id)) {
          const { resolve, reject } = state.pending.get(msg.id);
          state.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
          else resolve(msg.result);
        }
      } catch {}
    }
  });

  proc.on('exit', code => { console.warn(`[mcp] ${serverName} exited (${code})`); mcpProcesses.delete(serverName); });
  proc.on('error', err => { console.warn(`[mcp] ${serverName} error:`, err.message); mcpProcesses.delete(serverName); });

  try {
    await mcpStdioCall(state, 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'polaris', version: '1.0' },
    });
    mcpSend(state, { jsonrpc: '2.0', method: 'notifications/initialized' });
  } catch (e) {
    console.warn(`[mcp] ${serverName} init failed:`, e.message);
    proc.kill();
    mcpProcesses.delete(serverName);
    throw e;
  }
  return state;
}

function mcpHttpCall(url, headers, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} });
    let urlObj;
    try { urlObj = new URL(url); } catch { return reject(new Error(`Invalid MCP URL: ${url}`)); }
    const lib = url.startsWith('https') ? https : require('http');
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message || 'MCP HTTP error'));
          else resolve(parsed.result);
        } catch (e) { reject(new Error(`MCP HTTP parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function formatMcpResult(result) {
  if (!result) return '(no result)';
  if (Array.isArray(result.content)) {
    return result.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

async function discoverMcpTools() {
  const now = Date.now();
  if (mcpToolsCache && now - mcpToolsCacheTime < MCP_CACHE_TTL) return mcpToolsCache;

  const servers = getMcpServerConfigs();
  const allTools = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    try {
      let toolsList = [];
      if (serverConfig.url) {
        const result = await mcpHttpCall(serverConfig.url, serverConfig.headers || {}, 'tools/list', {});
        toolsList = result?.tools || [];
      } else if (serverConfig.command) {
        const state = await ensureMcpProcess(serverName, serverConfig);
        const result = await mcpStdioCall(state, 'tools/list', {});
        toolsList = result?.tools || [];
      }
      for (const tool of toolsList) {
        allTools.push({
          type: 'function',
          function: {
            name: `mcp__${serverName}__${tool.name}`,
            description: `[${serverName}] ${(tool.description || tool.name).slice(0, 400)}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
      console.log(`[mcp] ${serverName}: ${toolsList.length} tools`);
    } catch (e) {
      console.warn(`[mcp] ${serverName} discovery failed:`, e.message);
    }
  }

  mcpToolsCache = allTools;
  mcpToolsCacheTime = now;
  return allTools;
}

async function callMcpTool(serverName, toolName, args) {
  const servers = getMcpServerConfigs();
  const serverConfig = servers[serverName];
  if (!serverConfig) throw new Error(`MCP server not configured: ${serverName}`);
  let result;
  if (serverConfig.url) {
    result = await mcpHttpCall(serverConfig.url, serverConfig.headers || {}, 'tools/call', { name: toolName, arguments: args });
  } else if (serverConfig.command) {
    const state = await ensureMcpProcess(serverName, serverConfig);
    result = await mcpStdioCall(state, 'tools/call', { name: toolName, arguments: args }, 30000);
  } else {
    throw new Error(`MCP server ${serverName} has no command or url`);
  }
  return formatMcpResult(result);
}

// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function executeDirectTool(name, input, workDir, sessionId) {
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');
    return await callMcpTool(serverName, toolName, input);
  }
  switch (name) {
    case 'Read':       return toolRead(input, sessionId, workDir);
    case 'Write':      return await toolWrite(input, workDir, sessionId);
    case 'Edit':       return await toolEdit(input, workDir, sessionId);
    case 'Glob':       return toolGlob(input, workDir);
    case 'Grep':       return toolGrep(input, workDir);
    case 'Bash':       return await toolBash(input, workDir, sessionId);
    case 'PowerShell': return await toolPowerShell(input, workDir, sessionId);
    case 'WebFetch':   return await toolWebFetch(input);
    case 'WebSearch':  return await toolWebSearch(input);
    case 'AskUserQuestion': return await toolAskUserQuestion(input, sessionId);
    case 'TodoWrite':  return toolTodoWrite(input, sessionId);
    case 'QueryMemory': return toolQueryMemory(input, sessionId);
    case 'SetProject':  return toolSetProject(input, sessionId);
    case 'SetStatus':   return toolSetStatus(input, sessionId);
    default:           return `Unknown tool: ${name}`;
  }
}

// â"€â"€ Streaming OpenRouter call â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function callOpenRouterStream(sessionId, messages, systemPrompt, model, apiKey, tools = DIRECT_TOOLS, provider = null) {
  return new Promise(resolve => {
    const payloadObj = {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools,
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    };
    if (provider) payloadObj.provider = { only: [provider] };
    const payload = JSON.stringify(payloadObj);
    const opts = {
      hostname: 'openrouter.ai',
      path:     '/api/v1/chat/completions',
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'HTTP-Referer':   'https://polaris.aesopacademy.com',
        'X-Title':        'Polaris',
        'Connection':     'close',
      },
      // Fresh agent per request — forces a new TCP+TLS handshake every call so
      // no Node-internal socket state can be reused across requests. Defensive
      // workaround for the BAD_RECORD_MAC errors observed 2026-05-05 across
      // multiple OpenRouter-routed providers (Google, Mistral). curl with
      // back-to-back requests succeeded; only Node's HTTPS streaming failed,
      // suggesting a Node TLS / Cloudflare-edge interaction we shouldn't try
      // to reproduce on every call.
      agent: new https.Agent({ keepAlive: false, maxSockets: 1 }),
    };
    let textAccum = '', toolMap = {}, finishReason = null, usage = null, sseBuffer = '', rawSample = '';
    const reqStartMs = Date.now();
    let firstTokenMs = null, totalChars = 0, rateInterval = null;
    const req = https.request(opts, res => {
      if (res.statusCode !== 200) {
        let errRaw = '';
        res.on('data', c => errRaw += c);
        res.on('end', () => resolve({ error: `HTTP ${res.statusCode}: ${errRaw.slice(0, 500)}` }));
        return;
      }
      res.on('data', chunk => {
        if (sessions.get(sessionId)?.aborted) { res.destroy(); return; }
        const raw = chunk.toString();
        if (rawSample.length < 800) rawSample += raw;
        sseBuffer += raw;
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            const choice = evt.choices?.[0];
            if (evt.usage) usage = evt.usage;
            if (evt.error) { resolve({ error: `Model error: ${JSON.stringify(evt.error).slice(0, 300)}` }); return; }
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta || {};
            if (delta.content) {
              if (!firstTokenMs) {
                firstTokenMs = Date.now();
                rateInterval = setInterval(() => {
                  const elapsed = (Date.now() - firstTokenMs) / 1000;
                  const tps = elapsed > 0 ? Math.round((totalChars / 4) / elapsed) : 0;
                  broadcast({ type: 'streaming-rate', sessionId, tokensPerSecond: tps, ttft: firstTokenMs - reqStartMs });
                }, 400);
              }
              totalChars += delta.content.length;
              textAccum += delta.content;
              broadcast({ type: 'line', sessionId, text: delta.content, role: 'assistant' });
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolMap[idx]) toolMap[idx] = { id: '', name: '', arguments: '' };
                if (tc.id)                  toolMap[idx].id        += tc.id;
                if (tc.function?.name)      toolMap[idx].name      += tc.function.name;
                if (tc.function?.arguments) toolMap[idx].arguments += tc.function.arguments;
              }
            }
          } catch (parseErr) {
            if (data && data !== '[DONE]') console.warn('[sse-parse] could not parse:', data.slice(0, 200));
          }
        }
      });
      res.on('end', () => {
        if (rateInterval) clearInterval(rateInterval);
        const elapsed = firstTokenMs ? (Date.now() - firstTokenMs) / 1000 : null;
        const finalTps = elapsed && elapsed > 0 ? Math.round((totalChars / 4) / elapsed) : 0;
        if (firstTokenMs) broadcast({ type: 'streaming-rate', sessionId, tokensPerSecond: finalTps, ttft: firstTokenMs - reqStartMs, final: true });
        resolve({ textAccum, toolCalls: Object.values(toolMap).filter(t => t.name), finishReason, usage, rawSample });
      });
    });
    const session = sessions.get(sessionId);
    if (session) session.req = req;
    req.on('error', err => resolve({ error: err.message }));
    req.write(payload);
    req.end();
  });
}

// -- Tool display label --------------------------------------------------

function toolDisplayLabel(name, input = {}) {
  const truncate = (s, n = 60) => (s && s.length > n ? s.slice(0, n) + '...' : s || '');
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const server = parts[1] || '';
    const tool = parts.slice(2).join('__');
    return `[MCP:${server}] ${tool}`;
  }
  switch (name) {
    case 'Read':       return `Read  ${truncate(input.file_path || input.path || '')}`;
    case 'Write':      return `Write  ${truncate(input.file_path || '')}`;
    case 'Edit':       return `Edit  ${truncate(input.file_path || '')}`;
    case 'Glob':       return `Glob  ${truncate(input.pattern || '')}`;
    case 'Grep':       return `Grep  ${truncate(input.pattern || '')}`;
    case 'Bash':       return `Bash  ${truncate(input.command || '', 80)}`;
    case 'PowerShell': return `PS  ${truncate(input.command || '', 80)}`;
    case 'WebFetch':   return `Fetch  ${truncate(input.url || '')}`;
    case 'WebSearch':  return `Search  ${truncate(input.query || '')}`;
    case 'TodoWrite':  return `Todo  (${(input.todos || []).length} items)`;
    default:           return name;
  }
}

// -- Message history persistence -----------------------------------------

function saveSessionMessages(sessionId) {
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const s = sessions.get(sessionId);
    if (!s || !s.messages) return;
    fs.writeFileSync(path.join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(s.messages, null, 2), 'utf8');
  } catch (e) { console.warn('[sessions] message save failed:', e.message); }
}

function loadSessionMessages(sessionId) {
  try {
    const p = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return []; }
}

// â"€â"€ Agentic loop â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function runDirectAgent(sessionId, userMessage, workDir) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const config = readConfig();
  if (!config.openRouterApiKey) {
    broadcast({ type: 'line', sessionId, text: 'No OpenRouter API key configured. Add one in Settings.', role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
    return;
  }

  addToHistory(userMessage);
  broadcast({ type: 'line', sessionId, text: userMessage, role: 'user' });

  // Load project memory from Obsidian once per session (server-side, never sent to API directly)
  if (!session.projectMemory) {
    const matched = (config.projects || []).find(p => p.workDir && workDir && p.workDir.toLowerCase() === workDir.toLowerCase());
    if (matched?.obsidianDir) {
      const mem = {};
      try {
        const files = fs.readdirSync(matched.obsidianDir).filter(f => f.endsWith('.md')).sort();
        for (const f of files) {
          try { mem[f] = fs.readFileSync(path.join(matched.obsidianDir, f), 'utf8'); } catch {}
        }
      } catch {}
      session.projectMemory = mem;
    } else {
      session.projectMemory = {};
    }
  }

  // Restore persisted message history on first use (survives server restarts)
  if (!session.messages) session.messages = loadSessionMessages(sessionId);

  // Extract text from any DOCX/PDF docs and prepend to the user message.
  const agentDocs  = session.pendingDocs  || [];
  const agentAudio = session.pendingAudio || [];
  session.pendingDocs  = [];
  session.pendingAudio = [];
  let effectiveMessage = userMessage;
  for (const doc of agentDocs) {
    if (!doc.dataUrl || !doc.name) continue;
    const text = await extractDocText(doc.dataUrl, doc.name);
    if (text) {
      effectiveMessage = `--- File: ${doc.name} ---\n${text.trim()}\n--- End: ${doc.name} ---\n\n` + effectiveMessage;
      broadcast({ type: 'line', sessionId, text: `[document extracted: ${doc.name} (${text.length} chars)]`, role: 'system' });
    } else {
      broadcast({ type: 'line', sessionId, text: `[document attached: ${doc.name} — could not extract text]`, role: 'system' });
    }
  }

  // Build user message content: attach images and audio as multimodal content blocks.
  const agentImages = session.pendingImages || [];
  session.pendingImages = [];
  let messageContent = effectiveMessage;
  if (agentImages.length || agentAudio.length) {
    const blocks = [{ type: 'text', text: effectiveMessage }];
    for (const img of agentImages) {
      if (img && img.dataUrl) blocks.push({ type: 'image_url', image_url: { url: img.dataUrl } });
    }
    for (const aud of agentAudio) {
      if (aud && aud.dataUrl) {
        const match = aud.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
        if (match) {
          const format = match[1].split('/')[1] || 'mp3';
          blocks.push({ type: 'input_audio', input_audio: { data: match[2], format } });
        }
      }
    }
    if (blocks.length > 1) messageContent = blocks;
  }
  session.messages.push({ role: 'user', content: messageContent });
  if (session.messages.length > MAX_AGENT_MESSAGES) session.messages = session.messages.slice(-MAX_AGENT_MESSAGES);

  const tier  = session.tier || 'floor';
  const hasImage = Array.isArray(messageContent)
    ? messageContent.some(p => p.type === 'image_url' || p.type === 'image')
    : false;
  const effectiveTier = hasImage && tier === 'floor' ? 'balanced' : tier;
  // session.model wins when the launcher specifies an explicit model — used by
  // the Agent Eval runner so a single config can be tested across many models
  // without rewriting config.json. Falls back to tier-mapped config when null.
  const tierModel = effectiveTier === 'power'    ? (config.openRouterOpusModel   || config.openRouterFloorModel || 'google/gemini-2.5-flash')
                  : effectiveTier === 'balanced' ? (config.openRouterSonnetModel || config.openRouterFloorModel || 'google/gemini-2.5-flash')
                  :                                (config.openRouterFloorModel  || 'google/gemini-2.5-flash');
  const model = session.model || tierModel;
  const provider = session.model
    ? null  // explicit model wins; no provider preference unless we add one to launch
    : (effectiveTier === 'power'    ? (config.openRouterOpusProvider   || null)
     : effectiveTier === 'balanced' ? (config.openRouterSonnetProvider || null)
     :                                (config.openRouterFloorProvider  || null));
  if (hasImage && tier === 'floor') broadcast({ type: 'line', sessionId, text: '[auto-escalated to balanced — image detected]', role: 'system' });

  session.status = 'running';
  session.startAt = session.startAt || Date.now();
  if (!session.resolvedModel) session.resolvedModel = model;
  session.aborted = false;

  const systemPrompt = buildDirectSystemPrompt(config, workDir);
  const startMs = Date.now();
  if (!session.claudeSessionId) broadcast({ type: 'line', sessionId, text: `[direct] model=${model}`, role: 'system' });

  // Diag log
  const diagPath = path.join(LOGS_DIR, `diag-${sessionId}.txt`);
  const dlog = (label, text) => { const t = ((Date.now()-startMs)/1000).toFixed(3); try { fs.appendFileSync(diagPath, `[+${t}s] ${label}${text !== undefined ? ': '+String(text).slice(0,500) : ''}\n`, 'utf8'); } catch {} };
  try { fs.appendFileSync(diagPath, `=== DIAG ${new Date().toISOString()} ===\nSESSION: ${sessionId}\nMODEL: ${model}\nMODE: direct-api\nWORKDIR: ${workDir}\n--- USER PROMPT ---\n${userMessage}\n--- LOOP ---\n`, 'utf8'); } catch {}

  // Mark session id (use sessionId as claudeSessionId in direct mode for resume tracking)
  if (!session.claudeSessionId) session.claudeSessionId = sessionId;

  const watcher = watchSessionFiles(sessionId, workDir);
  if (watcher) session.watcher = watcher;

  // Discover MCP tools and merge with native tools for this session
  let sessionTools = DIRECT_TOOLS;
  try {
    const mcpTools = await discoverMcpTools();
    if (mcpTools.length > 0) {
      sessionTools = [...DIRECT_TOOLS, ...mcpTools];
      dlog('MCP_TOOLS', mcpTools.length);
    }
  } catch (e) {
    console.warn('[mcp] discovery failed, using native tools only:', e.message);
  }

    let iterations = 0;
  let retryCount = 0;
  while (!session.aborted && iterations < 50) {
    iterations++;
    dlog('ITER', iterations);
    const result = await callOpenRouterStream(sessionId, session.messages, systemPrompt, model, config.openRouterApiKey, sessionTools, provider);

    if (result.error) {
      if (!session.aborted && retryCount < 3) {
        retryCount++;
        const wait = retryCount * 2000;
        broadcast({ type: 'line', sessionId, text: `⚠️ API error. Retrying (${retryCount}/3) in ${wait/1000}s...`, role: 'system' });
        dlog('RETRY_ERR', `count=${retryCount} err=${result.error}`);
        await new Promise(r => setTimeout(r, wait));
        iterations--;
        continue;
      }
      dlog('ERROR', result.error);
      const isToolUnsupported = result.error.includes('tool choice') || result.error.includes('tool-call-parser') || result.error.includes('enable-auto-tool-choice');
      const errorText = isToolUnsupported
        ? `This model does not support tool calling (required for agent mode). Use it for chat/routine sessions only, or pick a different model.`
        : `API error: ${result.error}`;
      broadcast({ type: 'line', sessionId, text: errorText, role: 'error' });
      broadcast({ type: 'session-status', sessionId, status: 'error' });
      const s = sessions.get(sessionId); if (s) { s.status = 'error'; s.endAt = Date.now(); }
      return;
    }

    if (result.usage) {
      const usage = { input_tokens: result.usage.prompt_tokens || 0, output_tokens: result.usage.completion_tokens || 0 };
      appendTokenLog(sessionId, model, usage);
      broadcastUsage(sessionId, usage, null, session.routineTag || null);
      dlog('TOKENS', `in=${usage.input_tokens} out=${usage.output_tokens}`);
    }

    // Detect empty response — model returned neither text nor tool calls
    const hasContent = result.textAccum || (result.toolCalls && result.toolCalls.length > 0);
    if (!hasContent) {
      if (!session.aborted && retryCount < 3) {
        retryCount++;
        const wait = retryCount * 2000;
        broadcast({ type: 'line', sessionId, text: `⚠️ Empty response. Retrying (${retryCount}/3) in ${wait/1000}s...`, role: 'system' });
        dlog('RETRY_EMPTY', `count=${retryCount} reason=${result.finishReason}`);
        await new Promise(r => setTimeout(r, wait));
        iterations--;
        continue;
      }
      dlog('EMPTY_RESPONSE', `finishReason=${result.finishReason} rawSample=${(result.rawSample || '').slice(0, 600)}`);
      const reason = result.finishReason === 'error'
        ? `The model rejected the request (finish_reason=error). This model may not support tool use or the request format. Try a different model.`
        : `Model returned an empty response (finish_reason=${result.finishReason || 'none'}). Check the diag log for raw SSE details.`;
      broadcast({ type: 'line', sessionId, text: reason, role: 'error' });
      broadcast({ type: 'session-status', sessionId, status: 'error' });
      const s = sessions.get(sessionId); if (s) { s.status = 'error'; s.endAt = Date.now(); }
      return;
    }

    retryCount = 0; // Reset on success

  // Append assistant turn to history
    const assistantMsg = { role: 'assistant', content: result.textAccum || null };
    if (result.toolCalls && result.toolCalls.length > 0) {
      assistantMsg.tool_calls = result.toolCalls.map(tc => ({
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    session.messages.push(assistantMsg);

    if (!result.toolCalls || result.toolCalls.length === 0) break; // natural end

    // Execute tools and append results
    for (let tcIdx = 0; tcIdx < result.toolCalls.length; tcIdx++) {
      const tc = result.toolCalls[tcIdx];
      if (session.aborted) break;
      const callId = assistantMsg.tool_calls[tcIdx]?.id || tc.id;
      let toolInput;
      try { toolInput = JSON.parse(tc.arguments); } catch { toolInput = {}; }
      broadcast({ type: 'line', sessionId, text: `⚙ ${toolDisplayLabel(tc.name, toolInput)}`, role: 'tool' });
      dlog('TOOL', `${tc.name} ${tc.arguments.slice(0,200)}`);
      let toolResult;
      try { toolResult = await executeDirectTool(tc.name, toolInput, workDir, sessionId); }
      catch (err) { toolResult = `Error: ${err.message}`; dlog('TOOL_ERR', err.message); }
      const resultStr = String(toolResult).slice(0, 50000);
      dlog('TOOL_RESULT', resultStr.slice(0, 200));
      broadcast({ type: 'line', sessionId, text: `  ↳ ${resultStr.slice(0, 400)}${resultStr.length > 400 ? '…' : ''}`, role: 'tool' });
      session.messages.push({ role: 'tool', tool_call_id: callId, content: resultStr });
    }
  }

  // Continuation pass: if the loop exited without a final assistant text response
  // (e.g. hit the 50-iteration limit mid-tool-chain), nudge the model once so the
  // user gets an actual answer rather than silence.
  if (!session.aborted) {
    const lastMsg = session.messages[session.messages.length - 1];
    const lastIsAssistantText = lastMsg && lastMsg.role === 'assistant' &&
      lastMsg.content && lastMsg.content.trim().length > 0;
    if (!lastIsAssistantText) {
      dlog('CONTINUATION', 'Loop ended without final assistant text — requesting final answer');
      broadcast({ type: 'line', sessionId, text: '⚙ Requesting final answer...', role: 'tool' });
      session.messages.push({ role: 'user', content: 'Please provide your final answer based on everything you have done so far.' });
      const contResult = await callOpenRouterStream(sessionId, session.messages, systemPrompt, model, config.openRouterApiKey, sessionTools, provider);
      if (!contResult.error && contResult.textAccum) {
        session.messages.push({ role: 'assistant', content: contResult.textAccum });
      } else {
        dlog('CONTINUATION_FAIL', contResult.error || 'empty response on continuation pass');
      }
    }
  }

  const s = sessions.get(sessionId);
  dlog('DONE', `${((Date.now()-startMs)/1000).toFixed(2)}s iters=${iterations}`);
  if (s?.aborted) {
    // Stop handler already set status='done' and broadcast — just persist messages and free memory.
    saveSessionMessages(sessionId);
    releaseSessionMemory(sessionId);
    return;
  }
  // Determine terminal status:
  // 1. 'waiting' always wins — agent explicitly needs user input.
  // 2. Any session that committed during the run ends as 'test', even if the agent set 'done'.
  // 3. Otherwise preserve what the agent set via SetStatus, or auto-detect from the last message.
  let termStatus;
  if (s?.status === 'waiting') {
    termStatus = 'waiting';
  } else if (s?.committedDuringRun || s?.status === 'test') {
    termStatus = 'test';
  } else if (s?.status === 'done') {
    termStatus = 'done';
  } else {
    const msgs = session.messages;
    const lastAssistant = msgs && [...msgs].reverse().find(m => m.role === 'assistant' && m.content?.trim());
    const lastText = lastAssistant?.content?.trim() ?? '';
    termStatus = inferTermStatus(lastText);
  }
  if (s) { s.status = termStatus; s.endAt = Date.now(); }
  saveSessionMessages(sessionId);
  broadcast({ type: 'session-status', sessionId, status: termStatus });
  autoObsidianForSession(sessionId);
  extractSessionToKnowledge(sessionId); // fire-and-forget: distill to numbered Obsidian files
  releaseSessionMemory(sessionId);
}

// Drop heavy per-session fields after the agent loop finishes. The leak
// drivers are projectMemory (full Obsidian dir, ~MB per session) and the
// rolling messages window — both are explicitly null-guarded at the top of
// runDirectAgent and lazy-reload from disk / Obsidian on resume or fork, so
// dropping them is safe. session.lines is intentionally preserved: it's
// display-only state used by the UI's terminal scroll on reload, not
// persisted to disk anywhere, so dropping it would lose user-visible history
// for a done session if the UI is reloaded later.
//
// extractSessionToKnowledge runs fire-and-forget but reads session.lines
// synchronously up to its first await — by the time we get here, its locals
// already hold whatever it needs in their own closures.
function releaseSessionMemory(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.messages = null;
  s.projectMemory = null;
  if (s.watcher) {
    try { s.watcher.close(); } catch {}
    s.watcher = null;
  }
}

function appendTokenLog(sessionId, model, usage) {
  if (!usage) return;
  const inp = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const out = usage.output_tokens || 0;
  if (!inp && !out) return;
  try { fs.appendFileSync(TOKEN_LOG_PATH, JSON.stringify({ ts: Date.now(), sessionId, model: model || 'unknown', input: inp, output: out }) + '\n', 'utf8'); } catch {}
}

// â"€â"€â"€ DeepSeek Direct API for routines â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// Routines fire via api.deepseek.com — bypasses Claude CLI entirely (no 30K-token
// project-context cold load). DeepSeek pricing is ~$0.27/MTok in vs Anthropic's $3.
function spawnDeepSeekRoutine(sessionId, prompt, config) {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (!config.deepSeekApiKey) {
    broadcast({ type: 'line', sessionId, text: 'DeepSeek API key not configured. Go to Settings → DeepSeek to add your key.', role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
    session.status = 'error';
    session.endAt = Date.now();
    return;
  }

  const model = config.deepSeekApiModel || 'deepseek-chat';
  session.model  = model;
  session.status = 'running';
  session.startAt = Date.now();
  const startMs = Date.now();
  const startMsg = `[routine→deepseek] firing | model=${model} | promptLen=${prompt.length} chars | routineTag=${session.routineTag || '(none)'}`;
  console.log(startMsg);
  broadcast({ type: 'line', sessionId, text: startMsg, role: 'system' });

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  });

  const opts = {
    hostname: 'api.deepseek.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.deepSeekApiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  console.log(`[routine→deepseek] sessionId=${sessionId} model=${model} promptLen=${prompt.length}`);

  const req = https.request(opts, res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      const s = sessions.get(sessionId);
      if (!s) return;
      if (res.statusCode !== 200) {
        broadcast({ type: 'line', sessionId, text: `DeepSeek API HTTP ${res.statusCode}: ${raw.slice(0, 300)}`, role: 'error' });
        broadcast({ type: 'session-status', sessionId, status: 'error' });
        s.status = 'error'; s.endAt = Date.now();
        return;
      }
      try {
        const data = JSON.parse(raw);
        const text = data?.choices?.[0]?.message?.content || '(empty response)';
        broadcast({ type: 'line', sessionId, text, role: 'assistant', class: 'ai-text' });

        if (data.usage) {
          const usage = {
            input_tokens: data.usage.prompt_tokens || 0,
            output_tokens: data.usage.completion_tokens || 0,
          };
          s.outputTokens = usage.output_tokens;
          appendTokenLog(sessionId, model, usage);
          broadcastUsage(sessionId, usage, null, s.routineTag || null);

          // Cost estimate for deepseek-chat: $0.27/MTok in, $1.10/MTok out (cache-miss rate)
          const cost = (usage.input_tokens * 0.27 + usage.output_tokens * 1.10) / 1_000_000;
          const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
          const doneMsg = `[routine→deepseek] done | ${elapsed}s | in=${usage.input_tokens} out=${usage.output_tokens} | est cost $${cost.toFixed(6)}`;
          console.log(doneMsg);
          broadcast({ type: 'line', sessionId, text: doneMsg, role: 'system' });
        }

        s.status = 'done'; s.endAt = Date.now();
        broadcast({ type: 'session-status', sessionId, status: 'done' });
      } catch (e) {
        broadcast({ type: 'line', sessionId, text: `DeepSeek parse error: ${e.message}`, role: 'error' });
        broadcast({ type: 'session-status', sessionId, status: 'error' });
        s.status = 'error'; s.endAt = Date.now();
      }
    });
  });
  req.on('error', err => {
    broadcast({ type: 'line', sessionId, text: `DeepSeek connection error: ${err.message}`, role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
    const s = sessions.get(sessionId);
    if (s) { s.status = 'error'; s.endAt = Date.now(); }
  });
  req.write(payload);
  req.end();
}

function handleStreamEvent(sessionId, msg) {
  if (!msg || !msg.type) return;

  // Capture session_id immediately from the CLI init message (before result fires)
  if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
    const s = sessions.get(sessionId);
    if (s && !s.claudeSessionId) s.claudeSessionId = msg.session_id;
  }

  if (msg.type === 'assistant' && msg.message) {
    const s = sessions.get(sessionId);
    // Lock the resolved model on the first response so subsequent spawns don't re-route
    if (s && msg.message.model && !s.resolvedModel) {
      s.resolvedModel = msg.message.model;
      console.log(`[spawn] resolved model for ${sessionId}: ${msg.message.model}`);
    }
    // Support both 'content' (older CLI) and 'container' (newer CLI) field names
    const blocks = msg.message.content || msg.message.container || [];
    if (Array.isArray(blocks) && blocks.length > 0) {
      if (s && !s.firstOutputAt) {
        s.firstOutputAt = Date.now();
        if (s.projectName) spaceAppendEvent(s.projectName, { type: 'first-output', sessionId, elapsed: s.firstOutputAt - (s.startAt || s.firstOutputAt) });
      }
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          broadcast({ type: 'line', sessionId, text: block.text, role: 'assistant' });
        }
      }
    }
    // Live token usage update
    if (msg.message.usage) {
      appendTokenLog(sessionId, s?.model, msg.message.usage);
      broadcastUsage(sessionId, msg.message.usage, null, s?.routineTag || null);
    }
  }

  if (msg.type === 'result') {
    const s = sessions.get(sessionId);
    if (s) {
      if (msg.usage) s.outputTokens = msg.usage.output_tokens || 0;
      if (msg.session_id) s.claudeSessionId = msg.session_id;
    }
    if (msg.usage) appendTokenLog(sessionId, s?.model, msg.usage);
    if (msg.usage) broadcastUsage(sessionId, msg.usage, msg.session_id || null, s?.routineTag || null);
  }
}


// â"€â"€â"€ Spawn DeepSeek chat session â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// spawnMaxChat — chat-mode backend that spawns the Claude Code CLI and bills
// against the user's Max plan instead of OpenRouter API. Conversation history
// is rebuilt into the prompt each turn (no CLI session-id tracking needed —
// Max plan covers the cost). Prompt is piped via stdin to avoid Windows'
// 8191-char command-line limit. Default backend; `config.chatBackend = 'openrouter'`
// switches to the legacy spawnChat path.
async function spawnMaxChat(sessionId, prompt, config) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const startMs = Date.now();
  const diagPath = path.join(LOGS_DIR, `diag-${sessionId}.txt`);
  const dlog = (label, text) => {
    const t = ((Date.now() - startMs) / 1000).toFixed(3);
    try { fs.appendFileSync(diagPath, `[+${t}s] ${label}${text !== undefined ? ': ' + String(text).slice(0, 500) : ''}\n`, 'utf8'); } catch {}
  };

  // Resolve working directory: prefer the session's chosen workDir, fall back
  // to the per-chat scratch dir under POLARIS_DIR if no project was picked.
  const cwd = (session.workDir && fs.existsSync(session.workDir))
    ? session.workDir
    : (() => { if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true }); return CHAT_DIR; })();

  try {
    fs.appendFileSync(diagPath,
      `=== DIAG ${new Date().toISOString()} ===\n` +
      `SESSION: ${sessionId}\n` +
      `MODEL: claude-cli (Max plan)\n` +
      `MODE: max-cli\n` +
      `WORKDIR: ${cwd}\n` +
      `PROJECT: ${session.projectName || '(none)'}\n` +
      `--- USER PROMPT ---\n${prompt}\n` +
      `--- LOOP ---\n`, 'utf8');
  } catch {}

  // Start workdir file watcher so the Preview drawer populates as the CLI
  // edits files (same plumbing runDirectAgent uses).
  if (session.workDir && !session.watcher) {
    try {
      const watcher = watchSessionFiles(sessionId, session.workDir);
      if (watcher) session.watcher = watcher;
      dlog('WATCHER_STARTED', session.workDir);
    } catch (e) { dlog('WATCHER_ERR', e.message); }
  }

  // Snapshot which files are already modified (vs git HEAD) before this turn
  // so we can detect net-new changes the CLI makes during the turn.
  let preTurnDiff = '';
  if (session.workDir) {
    try {
      preTurnDiff = execSync('git diff HEAD --name-only', { cwd: session.workDir, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
    } catch {}
  }

  // On turn 2+, the CLI already has the conversation history stored on disk
  // under session.claudeSessionId — just send the new user message.
  // On turn 1, send full Polaris context + history as before.
  const isResume = !!session.claudeSessionId;
  let fullPrompt;
  if (isResume) {
    fullPrompt = prompt;
  } else {
    const history = (session.lines || [])
      .filter(l => l.role === 'user' || l.role === 'assistant')
      .map(l => `${l.role === 'user' ? 'User' : 'Assistant'}: ${l.text}`)
      .join('\n\n');
    const polarisContext = buildPolarisContextBlock(config, session);
    fullPrompt = polarisContext + '\n\n' + (history || prompt);
  }
  const historyTurns = (session.lines||[]).filter(l=>l.role==='user'||l.role==='assistant').length;
  dlog('PROMPT_BUILD', `resume=${isResume} historyTurns=${historyTurns} bytes=${Buffer.byteLength(fullPrompt,'utf8')}`);

  const claudeBin = config.claudeBinaryPath || 'claude';
  // Translate session tier → Claude Code --model flag.
  // Use full model ID for haiku — the 'haiku' shorthand resolves to 3.5, which isn't on Max.
  const tierForCli = (session.tier || 'balanced').toLowerCase();
  const cliModel = tierForCli === 'power' ? 'opus' : tierForCli === 'floor' ? 'claude-haiku-4-5-20251001' : 'sonnet';
  // stream-json + verbose gives per-event JSON: assistant deltas, tool_use,
  // tool_result, and a final result event with usage tokens. Lets us populate
  // the context bar / token log accurately and surface tool activity.
  // --resume reuses the CLI session on disk (turn 2+), skipping history rebuild.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', cliModel];
  if (isResume) args.push('--resume', session.claudeSessionId);
  const chatImages = session.pendingImages || [];
  const chatDocs   = session.pendingDocs   || [];
  const chatAudio  = session.pendingAudio  || [];
  session.pendingImages = [];
  session.pendingDocs   = [];
  session.pendingAudio  = [];

  // Extract text from DOCX/PDF docs and prepend to the prompt.
  let docTextPrefix = '';
  for (const doc of chatDocs) {
    if (!doc.dataUrl || !doc.name) continue;
    const text = await extractDocText(doc.dataUrl, doc.name);
    if (text) {
      docTextPrefix += `--- File: ${doc.name} ---\n${text.trim()}\n--- End: ${doc.name} ---\n\n`;
      dlog('DOC_EXTRACT', `name=${doc.name} chars=${text.length}`);
      broadcast({ type: 'line', sessionId, text: `[document extracted: ${doc.name} (${text.length} chars)]`, role: 'system' });
    } else {
      broadcast({ type: 'line', sessionId, text: `[document attached: ${doc.name} — could not extract text]`, role: 'system' });
    }
  }
  if (docTextPrefix) fullPrompt = docTextPrefix + fullPrompt;

  // Build stdin payload. When images or audio are attached, switch to stream-json
  // input format so the CLI receives multimodal content blocks.
  // Without binary attachments, plain text is simpler and avoids format quirks.
  const hasMultimodal = chatImages.length > 0 || chatAudio.length > 0;
  let stdinPayload;
  if (hasMultimodal) {
    args.push('--input-format', 'stream-json');
    const contentBlocks = [{ type: 'text', text: fullPrompt }];
    for (const img of chatImages) {
      if (!img.dataUrl) continue;
      const match = img.dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
      if (!match) continue;
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
    }
    for (const aud of chatAudio) {
      if (!aud.dataUrl) continue;
      const match = aud.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) continue;
      contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: match[1], data: match[2] } });
    }
    stdinPayload = JSON.stringify({ type: 'user', message: { role: 'user', content: contentBlocks } }) + '\n';
    if (chatImages.length) {
      dlog('IMAGE_ATTACH', `count=${chatImages.length}`);
      broadcast({ type: 'line', sessionId, text: `[${chatImages.length} image(s) attached: ${chatImages.filter(i=>i.dataUrl).map(i=>i.name).join(', ')}]`, role: 'system' });
    }
    if (chatAudio.length) {
      dlog('AUDIO_ATTACH', `count=${chatAudio.length}`);
      broadcast({ type: 'line', sessionId, text: `[${chatAudio.length} audio file(s) attached: ${chatAudio.filter(a=>a.dataUrl).map(a=>a.name).join(', ')}]`, role: 'system' });
    }
  } else {
    stdinPayload = fullPrompt;
  }
  // Write .mcp.json so the Claude Code CLI can call Polaris-native tools (SetProject, SetStatus).
  // For non-Polaris sessions also inject the servers from ~/.claude.json (Connections panel) so
  // the CLI uses the Polaris-managed config rather than relying on the global ~/.mcp.json.
  try {
    const mcpJsonPath = path.join(cwd, '.mcp.json');
    const existing = readJSON(mcpJsonPath, {});
    const isPolarisChat = cwd === CHAT_DIR;
    const managedServers = isPolarisChat ? {} : (() => {
      const all = readClaudeJson().mcpServers || {};
      const { polaris: _p, ...rest } = all;
      return rest;
    })();
    const mcpConfig = {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers || {}),
        ...managedServers,
        polaris: { url: `http://127.0.0.1:${PORT}/mcp/${sessionId}` },
      },
    };
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
    dlog('MCP_JSON_WRITE', mcpJsonPath);
  } catch (e) {
    dlog('MCP_JSON_WRITE_ERR', e.message);
  }

  dlog('SPAWN', `bin=${claudeBin} args=${args.join(' ')} shell=true cwd=${cwd}`);
  let proc;
  try {
    proc = spawn(claudeBin, args, {
      cwd,
      env: process.env,
      shell: true,  // required on Windows so `claude.cmd` is resolvable
    });
  } catch (e) {
    dlog('SPAWN_ERR', e.message);
    broadcast({ type: 'line', sessionId, text: `Failed to spawn Claude CLI: ${e.message}. Install Claude Code and run "claude login" with your Max account, or set config.chatBackend = "openrouter" to use the API path.`, role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
    session.status = 'error';
    session.endAt = Date.now();
    return;
  }
  session.proc = proc;
  dlog('PID', proc.pid);
  if (session.aborted) { proc.kill(); return; }

  // Stream-json parser: each line is a JSON event. Tolerate non-JSON lines
  // (older CLI builds may emit a banner before events).
  let lineBuf = '';
  let totalOutBytes = 0;
  let eventCount = 0;
  let finalUsage = null;
  let finalModel = null;
  let lastAssistantText = '';
  let committedDuringRun = false;

  proc.stdout.on('data', chunk => {
    totalOutBytes += chunk.length;
    lineBuf += chunk.toString('utf8');
    const lines = lineBuf.split(/\r?\n/);
    lineBuf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try { evt = JSON.parse(line); }
      catch {
        // Not JSON — surface as plain assistant text
        broadcast({ type: 'line', sessionId, text: line, role: 'assistant' });
        dlog('STDOUT_RAW', line.slice(0, 200));
        continue;
      }
      eventCount++;
      const t = evt.type;
      if (t === 'system') {
        if (evt.session_id) session.claudeSessionId = evt.session_id;
        if (evt.model)      finalModel = evt.model;
        dlog('SYSTEM', `session_id=${evt.session_id || ''} model=${evt.model || ''}`);
      } else if (t === 'assistant' && evt.message?.content) {
        lastAssistantText = '';
        for (const part of evt.message.content) {
          if (part.type === 'text' && part.text) {
            lastAssistantText += part.text;
            broadcast({ type: 'line', sessionId, text: part.text, role: 'assistant' });
          } else if (part.type === 'tool_use') {
            const summary = `${part.name || 'tool'}${part.input ? ' ' + JSON.stringify(part.input).slice(0, 120) : ''}`;
            broadcast({ type: 'line', sessionId, text: `⚙ ${summary}`, role: 'tool' });
            dlog('TOOL_USE', summary);
            if ((part.name === 'Bash' || part.name === 'PowerShell' || part.name === 'computer') && /\bgit\s+(commit|push)\b/i.test(JSON.stringify(part.input || {}))) {
              committedDuringRun = true;
            }
          }
        }
      } else if (t === 'user' && evt.message?.content) {
        for (const part of evt.message.content) {
          if (part.type === 'tool_result') {
            const txt = (typeof part.content === 'string' ? part.content : JSON.stringify(part.content || '')).slice(0, 200);
            dlog('TOOL_RESULT', txt);
          }
        }
      } else if (t === 'result') {
        const usage = evt.usage || {};
        finalUsage = {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: usage.cache_read_input_tokens || 0,
        };
        dlog('RESULT_USAGE', `in=${finalUsage.input_tokens} out=${finalUsage.output_tokens} cache_create=${finalUsage.cache_creation_input_tokens} cache_read=${finalUsage.cache_read_input_tokens}`);
      } else {
        dlog('EVENT', `type=${t}`);
      }
    }
  });

  proc.stderr.on('data', chunk => {
    const text = chunk.toString();
    dlog('STDERR', text.slice(0, 400));
    if (/error|fail|invalid|unauthor|rate.?limit|login|claude login/i.test(text)) {
      broadcast({ type: 'line', sessionId, text: `[claude] ${text.slice(0, 800)}`, role: 'error' });
    }
  });

  proc.on('close', async code => {
    dlog('CLOSE', `code=${code} events=${eventCount} bytes=${totalOutBytes}`);
    if (finalUsage) {
      const modelTag = finalModel || 'claude-cli (Max plan)';
      try { appendTokenLog(sessionId, modelTag, finalUsage); } catch {}
      broadcastUsage(sessionId, finalUsage, session.claudeSessionId || null, null);
    }
    // On Windows, Claude CLI exits with code=null when --input-format stream-json
    // is used without --resume. Treat null as success when we received a valid response.
    const effectiveCode = (code === null && finalUsage && eventCount > 0) ? 0 : code;
    let termStatus;
    if (effectiveCode !== 0) {
      termStatus = 'error';
    } else if (committedDuringRun) {
      termStatus = 'test';
    } else {
      termStatus = inferTermStatus(lastAssistantText);
    }
    session.status = termStatus;
    session.endAt = Date.now();
    broadcast({ type: 'session-status', sessionId, status: session.status });

    // Post-hoc cross-check: compare git state after turn to pre-turn snapshot.
    // Files that changed during this Max turn are reviewed via runPostHocCrossCheck.
    if (session.workDir && effectiveCode === 0) {
      try {
        const postTurnDiff = execSync('git diff HEAD --name-only', { cwd: session.workDir, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
        const preDiffs = new Set((preTurnDiff || '').split('\n').filter(Boolean));
        const newlyChanged = (postTurnDiff || '').split('\n').filter(f => f && !preDiffs.has(f));
        for (const relPath of newlyChanged) {
          const fullPath = path.join(session.workDir, relPath);
          if (!fs.existsSync(fullPath)) continue;
          try {
            const newContent = fs.readFileSync(fullPath, 'utf8');
            let originalContent = '';
            try {
              originalContent = execSync(`git show HEAD:${relPath.replace(/\\/g, '/')}`, { cwd: session.workDir, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString();
            } catch {} // new untracked file — originalContent stays ''
            if (newContent !== originalContent) {
              await runPostHocCrossCheck({ sessionId, filePath: fullPath, operation: 'Max', originalContent, newContent, workDir: session.workDir });
            }
          } catch {}
        }
      } catch {}
    }
  });

  proc.on('error', err => {
    dlog('ERROR', err.code === 'ENOENT' ? 'CLI_NOT_FOUND (claude binary missing on PATH)' : `${err.code || ''} ${err.message}`);
    if (err.code === 'ENOENT') {
      broadcast({
        type: 'line', sessionId, role: 'error',
        text: `Claude CLI not found. Install Claude Code (https://docs.claude.com/claude-code), then run "claude login" with your Max account. ` +
              `Or set config.chatBackend = "openrouter" to use the legacy API path.`,
      });
    } else {
      broadcast({ type: 'line', sessionId, text: `Claude CLI error: ${err.message}`, role: 'error' });
    }
    session.status = 'error';
    session.endAt = Date.now();
    broadcast({ type: 'session-status', sessionId, status: 'error' });
  });

  try {
    proc.stdin.write(stdinPayload);
    proc.stdin.end();
    dlog('STDIN_SENT', `bytes=${Buffer.byteLength(stdinPayload,'utf8')}`);
  } catch (e) {
    dlog('STDIN_ERR', e.message);
    broadcast({ type: 'line', sessionId, text: `Failed to send prompt to Claude CLI: ${e.message}`, role: 'error' });
  }
}

// spawnChatRouter — dispatches chat sessions to the configured backend.
// Default 'max' (Claude CLI under Max plan). 'openrouter' uses spawnChat.
function spawnChatRouter(sessionId, prompt, config) {
  const backend = (config.chatBackend || 'max').toLowerCase();
  if (backend === 'openrouter') return spawnChat(sessionId, prompt, config);
  return spawnMaxChat(sessionId, prompt, config);
}

function spawnChat(sessionId, prompt, config) {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (!config.openRouterApiKey) {
    broadcast({ type: 'line', sessionId, text: 'No OpenRouter API key configured. Add one in Settings.', role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
    return;
  }

  const model = config.chatModel || 'deepseek/deepseek-chat';
  const rawLines = (session.lines || []).filter(l => l.role === 'user' || l.role === 'assistant');
  const messages = [];
  for (const l of rawLines) {
    if (messages.length && messages[messages.length - 1].role === l.role) {
      messages[messages.length - 1].content += '\n' + l.text;
    } else {
      messages.push({ role: l.role, content: l.text });
    }
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: prompt });
  }
  const payload = JSON.stringify({ model, messages, stream: true });
  let accText = '';

  const req = https.request({
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${config.openRouterApiKey}`,
      'Content-Length': Buffer.byteLength(payload),
      'HTTP-Referer':  'https://polaris.app',
      'X-Title':       'Polaris',
    },
  }, res => {
    if (res.statusCode !== 200) {
      let errBody = '';
      res.on('data', c => errBody += c.toString());
      res.on('end', () => {
        let msg = `OpenRouter error ${res.statusCode}`;
        try { const j = JSON.parse(errBody); msg += ': ' + (j.error?.message || j.error || errBody); } catch { msg += ': ' + errBody.slice(0, 200); }
        broadcast({ type: 'line', sessionId, text: msg, role: 'error' });
        broadcast({ type: 'session-status', sessionId, status: 'error' });
      });
      return;
    }
    let lineBuffer = '';
    res.on('data', chunk => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer  = lines.pop();
      for (const line of lines) {
        if (!line.trim() || line.trim() === 'data: [DONE]') continue;
        if (!line.startsWith('data: ')) continue;
        try {
          const data    = JSON.parse(line.slice(6));
          const content = data.choices?.[0]?.delta?.content || '';
          if (!content) continue;
          accText += content;
          session.chatBuffer = (session.chatBuffer || '') + content;
          const parts = session.chatBuffer.split('\n');
          for (const part of parts.slice(0, -1)) { // Process all but the last part
            if (part.trim()) broadcast({ type: 'line', sessionId, text: part, role: 'assistant' });
          }
          session.chatBuffer = parts[parts.length - 1] || ''; // Keep only the last (potentially incomplete) part
        } catch {}
      }
    });
    res.on('end', () => {
      const rem = (session.chatBuffer || '').trim();
      if (rem) { accText += rem; broadcast({ type: 'line', sessionId, text: rem, role: 'assistant' }); }
      session.chatBuffer = '';
      const fullText = accText.trim();
      const termStatus = inferTermStatus(fullText);
      session.status = termStatus;
      session.endAt  = Date.now();
      broadcast({ type: 'session-status', sessionId, status: termStatus });
    });
  });

  req.on('error', err => {
    if (err.code === 'ECONNRESET' || err.message === 'socket hang up') return;
    broadcast({ type: 'line', sessionId, text: `Chat error: ${err.message}`, role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
  });

  session.req = req;
  req.write(payload);
  req.end();
}

// â"€â"€â"€ HTTP server â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(MOCKUP_DEST, 'utf8', (err, data) => {
      if (err) {
        console.error('[mockup] readFile error:', err.code, err.path || MOCKUP_DEST);
        res.writeHead(500);
        res.end(`Could not load mockup.html from AppData\nError: ${err.code}\nPath: ${err.path || MOCKUP_DEST}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/js/')) {
    const jsFile = path.basename(req.url.split('?')[0]);
    const jsPath = path.join(RESOURCES_PATH, 'js', jsFile);
    fs.readFile(jsPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(jsFile).toLowerCase();
      const mime = ext === '.css' ? 'text/css' : 'application/javascript';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/monaco-vs/')) {
    const rel = decodeURIComponent(req.url.slice('/monaco-vs/'.length).split('?')[0]);
    const MONACO_BASE = path.join(__dirname, 'node_modules', 'monaco-editor', 'min', 'vs');
    const fullPath = path.normalize(path.join(MONACO_BASE, rel));
    if (!fullPath.startsWith(MONACO_BASE + path.sep) && fullPath !== MONACO_BASE) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(fullPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/fonts/')) {
    const fontFile = path.basename(req.url);
    const fontPath = path.join(RESOURCES_PATH, 'fonts', fontFile);
    const ext = path.extname(fontFile).toLowerCase();
    const mime = ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : 'font/truetype';
    fs.readFile(fontPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Font not found'); return; }
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    });
    return;
  }

  // Preview Panel file server — serves any file from a project's workDir over HTTP so
  // iframe + sibling resources resolve under the same origin as the Polaris UI (file://
  // would be blocked cross-origin). URL: /local/<urlSafeBase64-projectDir>/<relative-path>
  if (req.method === 'GET' && req.url.startsWith('/local/')) {
    try {
      const after = req.url.slice('/local/'.length).split('?')[0];
      const slash = after.indexOf('/');
      if (slash < 0) { res.writeHead(400); return res.end('Bad /local URL'); }
      const b64Dir = after.slice(0, slash);
      const relPath = decodeURIComponent(after.slice(slash + 1));
      // url-safe base64 → standard base64
      let std = b64Dir.replace(/-/g, '+').replace(/_/g, '/');
      while (std.length % 4) std += '=';
      const projectDir = Buffer.from(std, 'base64').toString('utf8');
      // Defense in depth: must be a configured project workDir
      const cfg = readConfig();
      const allowed = (cfg.projects || []).some(p => p.workDir && path.normalize(p.workDir) === path.normalize(projectDir));
      if (!allowed) { res.writeHead(403); return res.end('Project dir not configured'); }
      const fullPath = path.normalize(path.join(projectDir, relPath));
      if (!fullPath.startsWith(path.normalize(projectDir))) { res.writeHead(403); return res.end('Path traversal blocked'); }
      if (!fs.existsSync(fullPath)) { res.writeHead(404); return res.end(`Not found: ${relPath}`); }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) { res.writeHead(403); return res.end('Directory listing disabled for /local'); }
      const ext = path.extname(fullPath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      fs.createReadStream(fullPath).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(`Error: ${e.message}`);
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/time') {
    // Returns the server's wall-clock time. Useful for time-sync routines —
    // the server (Node.js) has unrestricted network access and Windows keeps it NTP-synced.
    const now = new Date();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      utc_datetime: now.toISOString(),
      unixtime_ms:  now.getTime(),
      timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    }));
    return;
  }

  if (req.method === 'POST' && req.url === '/space/event') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.projectName) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'Missing projectName' })); return; }
        spaceAppendEvent(data.projectName, data);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // ─── Polaris MCP endpoint — exposes Polaris tools to Claude Code CLI ──────────
  // Claude Code (Max plan) sessions can't access DIRECT_TOOLS (those go to the
  // OpenRouter path). This HTTP MCP endpoint bridges the gap so SetProject,
  // SetStatus, and QueryMemory are available to the Claude Code harness too.
  if (req.method === 'OPTIONS' && req.url.startsWith('/polaris-mcp')) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/polaris-mcp')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
      let rpc;
      try { rpc = JSON.parse(body); } catch {
        res.writeHead(400, CORS); res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); return;
      }
      const { id, method, params } = rpc;
      const ok  = result => { res.writeHead(200, CORS); res.end(JSON.stringify({ jsonrpc: '2.0', id, result })); };
      const err = (code, message) => { res.writeHead(200, CORS); res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })); };

      if (method === 'initialize') {
        ok({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'polaris', version: '1.0' } });
      } else if (method === 'notifications/initialized') {
        res.writeHead(204); res.end();
      } else if (method === 'tools/list') {
        ok({ tools: [
          {
            name: 'SetProject',
            description: 'Set the active project for this Polaris session. Call immediately after the user tells you which project to work on.',
            inputSchema: { type: 'object', properties: { projectName: { type: 'string', description: 'Exact project name from Available projects, or omit for no project (scratch).' }, polaris_session_id: { type: 'string', description: 'Session ID from the POLARIS CONTEXT block.' } }, required: ['polaris_session_id'] },
          },
          {
            name: 'SetStatus',
            description: 'Set the session card status in the Polaris UI. Use "test" after delivering work, "waiting" when expecting user input, "done" when complete.',
            inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['test', 'waiting', 'done'] }, polaris_session_id: { type: 'string', description: 'Session ID from the POLARIS CONTEXT block.' } }, required: ['status', 'polaris_session_id'] },
          },
          {
            name: 'QueryMemory',
            description: 'Query the project knowledge base loaded from Obsidian. Omit filename to get all project context.',
            inputSchema: { type: 'object', properties: { filename: { type: 'string', description: 'Optional filename or partial name to retrieve a specific file.' }, polaris_session_id: { type: 'string', description: 'Session ID from the POLARIS CONTEXT block.' } }, required: ['polaris_session_id'] },
          },
        ] });
      } else if (method === 'tools/call') {
        const toolName = params && params.name;
        const args = (params && params.arguments) || {};
        const sessionId = args.polaris_session_id;
        if (!sessionId) { err(-32602, 'Missing polaris_session_id'); return; }
        try {
          let result;
          if      (toolName === 'SetProject')   result = toolSetProject(args, sessionId);
          else if (toolName === 'SetStatus')    result = toolSetStatus(args, sessionId);
          else if (toolName === 'QueryMemory')  result = await toolQueryMemory(args, sessionId);
          else { err(-32601, `Unknown tool: ${toolName}`); return; }
          ok({ content: [{ type: 'text', text: String(result) }] });
        } catch (e) {
          err(-32603, e.message);
        }
      } else {
        err(-32601, `Unknown method: ${method}`);
      }
    });
    return;
  }

  // MCP HTTP endpoint — exposes Polaris-native tools (SetProject, SetStatus) to Claude Code CLI
  if (req.method === 'POST' && req.url.startsWith('/mcp/')) {
    const sessionId = req.url.slice(5).split('?')[0];
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let rpc;
      try { rpc = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const { id, method, params } = rpc;
      if (!('id' in rpc)) return res.end(''); // notification — no response
      if (method === 'initialize') {
        return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'polaris-native', version: '1.0.0' },
        }}));
      }
      if (method === 'tools/list') {
        return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: [
          { name: 'SetProject', description: 'Set the active project for this session. Call immediately after the user names their project.', inputSchema: { type: 'object', properties: { projectName: { type: 'string', description: 'Exact project name from the Available projects list, or omit for no project (scratch).' } }, required: [] } },
          { name: 'SetStatus', description: 'Set the status of this session card in the Polaris UI.', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['test', 'waiting', 'done', 'broken'] } }, required: ['status'] } },
        ]}}));
      }
      if (method === 'tools/call') {
        const { name, arguments: args } = params || {};
        let result;
        if (name === 'SetProject') result = toolSetProject(args || {}, sessionId);
        else if (name === 'SetStatus') result = toolSetStatus(args || {}, sessionId);
        else return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } }));
        return res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(result) }] } }));
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/set-project') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { sessionId, projectName } = JSON.parse(body);
        const result = toolSetProject({ projectName }, sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── Agent Eval feature ──────────────────────────────────────────────────────
// Per-model agent-loop evaluation. Drives runDirectAgent against scripted
// fixtures across a queue of models, asserts on tool calls + filesystem state,
// emits per-cell results over WS. Mirrors the chat-style Benchmark Runner
// pattern but exercises agent capability instead of speed/cost.

const AGENT_EVAL_FIXTURES = [
  {
    id: '01-implement-imperative',
    description: "When the user authorizes a change ('implement', 'apply'), agent must call Edit/Write — not just narrate.",
    seed: { files: { 'target.txt': 'the value is original\n' } },
    prompt: "Read target.txt, then use the Edit tool to change the word 'original' to 'updated'. Implement this now.",
    expect: {
      session_status: 'done',
      tools_called: ['Read', 'Edit'],
      min_tool_calls: 2,
      max_iters: 6,
      max_seconds: 60,
      files: { 'target.txt': { contains: 'the value is updated' } },
    },
  },
  {
    id: '02-querymemory-fallback',
    description: 'When project memory is empty, agent must fall back to Read on the filesystem (CLAUDE.md rule 8).',
    seed: { files: { 'secret.md': '# Notes\n\nThe secret token mentioned for this eval is XANADU-7741.\nDo not look elsewhere; the answer is in this file.\n' } },
    prompt: 'What is the secret token mentioned in secret.md? Read the file in the current working directory and tell me the exact token string.',
    expect: {
      session_status: 'done',
      tools_called: ['Read'],
      min_tool_calls: 1,
      max_iters: 5,
      max_seconds: 45,
    },
  },
  {
    id: '03-basic-read',
    description: 'Sanity baseline — simple Read + summarize.',
    seed: { files: { 'config.json': '{ "appName": "Polaris", "version": "1.2.3", "env": "prod" }\n' } },
    prompt: 'Read config.json from the current working directory and tell me the version it specifies.',
    expect: {
      session_status: 'done',
      tools_called: ['Read'],
      min_tool_calls: 1,
      max_iters: 4,
      max_seconds: 30,
    },
  },
];

let currentAgentEvalRun = null;

function loadAgentEvalQueue() {
  const config = readConfig();
  const proj = (config.projects || []).find(p => p.obsidianDir);
  if (!proj) return { models: [], error: 'No project with Obsidian dir configured' };
  const file = path.join(proj.obsidianDir, '5-Agentic-Benchmark.md');
  try {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/```agent-eval-models\n([\s\S]*?)```/);
    if (!match) return { models: [], error: 'No agent-eval-models block found in 5-Agentic-Benchmark.md' };
    // Strip inline `#` comments AND full-line comments so a line like
    // `meta-llama/llama-4-scout  # retried after disconnect` parses as just
    // the model id. Without inline-strip, the entire line including the comment
    // was sent to OpenRouter as the model id, causing "not a valid model" 400s.
    const models = match[1].split('\n')
      .map(l => l.replace(/#.*$/, '').trim())
      .filter(l => l);
    return { models };
  } catch (e) {
    return { models: [], error: e.message };
  }
}

// Same parser logic as test/agent-evals/lib/diagParser.js — kept inline here so
// the packaged Electron build doesn't need to read from the source tree.
function parseAgentEvalDiag(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  const blocks = text.split(/^=== DIAG /m).filter(b => b.trim());
  if (!blocks.length) return null;
  const lines = blocks[blocks.length - 1].split('\n');
  const result = { tools: [], tokens: { in: 0, out: 0 }, finishedAt: null, finalIters: 0, error: null, emptyResponse: null };
  let currentIter = 0;
  for (const l of lines) {
    const m = l.match(/^\[\+([\d.]+)s\]\s+(\w+)(?::\s?(.*))?$/);
    if (!m) continue;
    const [, , label, body] = m;
    const b = body || '';
    switch (label) {
      case 'ITER': currentIter = parseInt(b, 10) || currentIter; break;
      case 'TOKENS': {
        const tm = b.match(/in=(\d+)\s+out=(\d+)/);
        if (tm) { result.tokens.in += parseInt(tm[1], 10); result.tokens.out += parseInt(tm[2], 10); }
        break;
      }
      case 'TOOL': {
        const tm = b.match(/^(\S+)/);
        result.tools.push({ iter: currentIter, name: tm ? tm[1] : b.trim() });
        break;
      }
      case 'EMPTY_RESPONSE': result.emptyResponse = b; break;
      case 'ERROR': result.error = b; break;
      case 'DONE': {
        const dm = b.match(/^([\d.]+)s\s+iters=(\d+)/);
        if (dm) { result.finishedAt = parseFloat(dm[1]); result.finalIters = parseInt(dm[2], 10); }
        break;
      }
    }
  }
  if (!result.finalIters) result.finalIters = currentIter;
  return result;
}

async function runAgentEvalCell({ model, fixture, runIndex }) {
  const safeId = fixture.id.replace(/[^a-z0-9_-]/gi, '_');
  const safeModel = model.replace(/[^a-z0-9_-]/gi, '_');
  const sessionId = `eval_${safeId}_${safeModel}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const seedDir = path.join(os.tmpdir(), `polaris-eval-${safeId}-${stamp}`);

  fs.mkdirSync(seedDir, { recursive: true });
  for (const [rel, content] of Object.entries(fixture.seed?.files || {})) {
    const full = path.join(seedDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }

  // Note: not broadcasting session-created, so the eval session won't appear
  // as a card in the regular session grid. The Agent Eval panel renders its
  // own progress. evalRunner: true bypasses Cross-Check for unattended runs.
  sessions.set(sessionId, {
    id: sessionId, name: `Eval ${fixture.id} / ${model}`,
    workDir: seedDir, projectName: null, model, tier: 'floor',
    isChat: false, status: 'running', startAt: Date.now(),
    proc: null, watcher: null, timeout: null, lines: [],
    lastPrompt: fixture.prompt, claudeSessionId: null, routineTag: null,
    evalRunner: true,
  });

  const startMs = Date.now();
  const timeoutMs = (fixture.expect?.max_seconds || 60) * 1000 + 30000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    const s = sessions.get(sessionId);
    if (s) s.aborted = true;
  }, timeoutMs);

  try { await runDirectAgent(sessionId, fixture.prompt, seedDir); }
  catch {} // runDirectAgent shouldn't throw, but defensive
  finally { clearTimeout(timer); }

  const elapsedMs = Date.now() - startMs;
  const session = sessions.get(sessionId);
  const status = session?.status || 'error';

  const diagPath = path.join(LOGS_DIR, `diag-${sessionId}.txt`);
  const trace = parseAgentEvalDiag(diagPath);

  const expect = fixture.expect || {};
  const postFiles = {};
  if (expect.files) {
    for (const rel of Object.keys(expect.files)) {
      try { postFiles[rel] = fs.readFileSync(path.join(seedDir, rel), 'utf8'); }
      catch { postFiles[rel] = null; }
    }
  }

  const errors = [];
  if (timedOut) errors.push(`hard timeout after ${timeoutMs / 1000}s`);
  if (!trace && !timedOut) errors.push('no diag file produced');
  if (trace) {
    if (expect.session_status && status !== expect.session_status) errors.push(`status: expected=${expect.session_status} got=${status}`);
    if (typeof expect.max_iters === 'number' && trace.finalIters > expect.max_iters) errors.push(`iters: ${trace.finalIters} > max ${expect.max_iters}`);
    if (typeof expect.max_seconds === 'number' && trace.finishedAt != null && trace.finishedAt > expect.max_seconds) errors.push(`time: ${trace.finishedAt}s > max ${expect.max_seconds}s`);
    if (Array.isArray(expect.tools_called)) {
      const calledNames = trace.tools.map(t => t.name);
      for (const need of expect.tools_called) if (!calledNames.includes(need)) errors.push(`tool '${need}' not called`);
    }
    if (typeof expect.min_tool_calls === 'number' && trace.tools.length < expect.min_tool_calls) errors.push(`tool calls: ${trace.tools.length} < min ${expect.min_tool_calls}`);
    if (trace.emptyResponse) errors.push(`empty response: ${trace.emptyResponse.slice(0, 100)}`);
    if (trace.error) errors.push(`agent error: ${trace.error.slice(0, 120)}`);
  }
  if (expect.files) {
    for (const [rel, check] of Object.entries(expect.files)) {
      const got = postFiles[rel];
      if (got == null) { errors.push(`file '${rel}' missing`); continue; }
      if (check.contains && !got.includes(check.contains)) errors.push(`file '${rel}' missing substring '${check.contains}'`);
    }
  }

  // Cleanup: drop session from Map (releaseSessionMemory dropped state already
  // at end of runDirectAgent), then nuke the tmp seed dir.
  sessions.delete(sessionId);
  try { fs.rmSync(seedDir, { recursive: true, force: true }); } catch {}

  return {
    sessionId, fixtureId: fixture.id, model, runIndex,
    status, elapsedMs,
    pass: errors.length === 0,
    errors,
    trace: trace ? {
      iters: trace.finalIters,
      tools: trace.tools.map(t => t.name),
      tokens: trace.tokens,
      finishedAt: trace.finishedAt,
    } : null,
  };
}

// Live-write helpers — append rows to 5-Agentic-Benchmark.md as cells complete
// so the file is readable during a long run, not only after Save to Obsidian.
// Survives WS disconnects since the server writes to disk directly. The final
// aggregated table on agent-eval-complete writes a separate "## Run <stamp>"
// section above this; the live section can be deleted manually after the run.
function _agentEvalObsidianFile() {
  const config = readConfig();
  const proj = (config.projects || []).find(p => p.obsidianDir);
  if (!proj) return null;
  return path.join(proj.obsidianDir, '5-Agentic-Benchmark.md');
}

function appendAgentEvalLiveHeader(stamp, totalCells, runs) {
  const file = _agentEvalObsidianFile();
  if (!file) return;
  try {
    const header = [
      '',
      `### Live run ${stamp} (in progress)`,
      `0/${totalCells} cells · ${runs} run(s) per cell · live-streaming as cells complete`,
      '',
      '| # | Model | Fixture | Run | Result | Iters | Tokens out | Time | Tools |',
      '|---:|---|---|---:|---|---:|---:|---:|---|',
      '',
    ].join('\n');
    let content = fs.readFileSync(file, 'utf8');
    if (/^##\s+Results\b/m.test(content)) {
      content = content.replace(/^##\s+Results\b[^\n]*\n/m, m => m + header);
    } else {
      content = content.trimEnd() + '\n\n## Results\n' + header;
    }
    fs.writeFileSync(file, content, 'utf8');
  } catch {}
}

function appendAgentEvalLiveRow(stamp, cell, completed, totalCells) {
  const file = _agentEvalObsidianFile();
  if (!file) return;
  try {
    const tools = (cell.trace?.tools || []).join(', ') || '—';
    const result = cell.pass ? '✓ PASS' : '✗ FAIL';
    const time = ((cell.elapsedMs || 0) / 1000).toFixed(1) + 's';
    const tokensOut = cell.trace?.tokens?.out ?? 0;
    const iters = cell.trace?.iters ?? '—';
    const errorSuffix = !cell.pass && cell.errors?.length ? ` <!-- ${cell.errors[0].slice(0, 80)} -->` : '';
    const row = `| ${completed}/${totalCells} | \`${cell.model}\` | ${cell.fixtureId || cell.fixture} | ${(cell.runIndex ?? 0) + 1} | ${result} | ${iters} | ${tokensOut} | ${time} | ${tools} |${errorSuffix}`;
    let content = fs.readFileSync(file, 'utf8');
    // Find the live section header and insert the row right after the table header rule
    // (the line starting with "|---").
    const sectionRe = new RegExp(`(### Live run ${stamp.replace(/[-:T]/g, m => '\\' + m)} \\(in progress\\)[\\s\\S]*?\\n\\|---[^\\n]*\\n)`, 'm');
    if (sectionRe.test(content)) {
      content = content.replace(sectionRe, `$1${row}\n`);
    } else {
      content = content.trimEnd() + '\n' + row + '\n';
    }
    fs.writeFileSync(file, content, 'utf8');
  } catch {}
}

async function runAgentEvalSuite({ runId, models, fixtureIds, runs }) {
  currentAgentEvalRun = { runId, cancelled: false };
  const fixtures = AGENT_EVAL_FIXTURES.filter(f => !fixtureIds || fixtureIds.length === 0 || fixtureIds.includes(f.id));
  const totalCells = models.length * fixtures.length * runs;
  let completed = 0;
  const results = [];

  // Open a live section in Obsidian so the user can see progress as it runs,
  // not just at the end. Survives WS disconnects since the server writes
  // directly to disk.
  const liveStamp = new Date().toISOString().slice(0, 19);
  appendAgentEvalLiveHeader(liveStamp, totalCells, runs);

  broadcast({ type: 'agent-eval-progress', runId, phase: 'start', totalCells, completed });

  outer:
  for (const model of models) {
    for (const fixture of fixtures) {
      for (let runIndex = 0; runIndex < runs; runIndex++) {
        if (currentAgentEvalRun?.cancelled) break outer;
        broadcast({
          type: 'agent-eval-progress', runId, phase: 'cell-start',
          completed, totalCells, model, fixture: fixture.id,
          runIndex: runIndex + 1, runs,
        });
        const cell = await runAgentEvalCell({ model, fixture, runIndex });
        results.push(cell);
        completed++;
        broadcast({ type: 'agent-eval-cell-result', runId, completed, totalCells, ...cell });
        // Append the cell as a live row so the file is readable mid-run.
        appendAgentEvalLiveRow(liveStamp, cell, completed, totalCells);
      }
    }
  }

  const wasCancelled = !!currentAgentEvalRun?.cancelled;
  currentAgentEvalRun = null;
  broadcast({
    type: 'agent-eval-complete',
    runId, totalCells, completed,
    cancelled: wasCancelled,
    results: results.map(r => ({
      model: r.model, fixture: r.fixtureId, run: r.runIndex,
      pass: r.pass, errors: r.errors, elapsedMs: r.elapsedMs, trace: r.trace,
    })),
  });
}

// ─── WebSocket message handler ────────────────────────────────────────────────
function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type } = msg;

  if (type === 'launch-chat') {
    const { prompt, workDir, projectName, tier, images, docs, audio } = msg;
    if (!prompt) return sendTo(ws, { type: 'error', text: 'Missing prompt' });

    const effectiveWorkDir = (workDir && workDir.trim()) ? workDir.trim() : null;
    if (effectiveWorkDir && !fs.existsSync(effectiveWorkDir)) {
      return sendTo(ws, { type: 'error', text: `Working directory does not exist: ${effectiveWorkDir}` });
    }

    addToHistory(prompt);
    const id   = `chat_${Date.now()}`;
    const name = generateSessionName(prompt);
    const config = readConfig();
    // Default model label reflects the active backend + chosen tier. Max plan
    // exposes Sonnet 4.6 (balanced), Opus 4.7 (power), Haiku 4.5 (floor).
    // OpenRouter fallback uses config.chatModel.
    const backend = (config.chatBackend || 'max').toLowerCase();
    const chatTier = (tier || 'balanced').toLowerCase();
    const maxModelLabel = chatTier === 'power'
      ? 'anthropic/claude-opus-4-7 (Max plan)'
      : chatTier === 'floor'
        ? 'anthropic/claude-haiku-4-5-20251001 (Max plan)'
        : 'anthropic/claude-sonnet-4-6 (Max plan)';
    const chatModel = backend === 'max'
      ? maxModelLabel
      : (config.chatModel || 'deepseek/deepseek-chat');
    sessions.set(id, {
      id, name, workDir: effectiveWorkDir, projectName: projectName || null,
      isChat: true, model: chatModel, tier: chatTier,
      status: 'running', startAt: Date.now(),
      proc: null, watcher: null, timeout: null,
      lines: [], lastPrompt: prompt, claudeSessionId: null,
      pendingImages: Array.isArray(images) ? images.filter(i => i && typeof i.dataUrl === 'string') : [],
      pendingDocs:   Array.isArray(docs)   ? docs.filter(d => d && typeof d.dataUrl === 'string')   : [],
      pendingAudio:  Array.isArray(audio)  ? audio.filter(a => a && typeof a.dataUrl === 'string')  : [],
    });
    broadcast({ type: 'session-created', sessionId: id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: chatModel, isChat: true });
    const launchAttachments = [
      ...(Array.isArray(images) ? images.filter(i => i?.name).map(i => `📎 ${i.name}`) : []),
      ...(Array.isArray(docs)   ? docs.filter(d => d?.name).map(d => `📄 ${d.name}`)   : []),
      ...(Array.isArray(audio)  ? audio.filter(a => a?.name).map(a => `🎵 ${a.name}`)  : []),
    ];
    const imgLabel = launchAttachments.length ? '\n' + launchAttachments.join('  ') : '';
    broadcast({ type: 'line', sessionId: id, text: prompt + imgLabel, role: 'user' });
    saveSessions();
    spawnChatRouter(id, prompt, config);
    return;
  }

  if (type === 'launch') {
    const { prompt, workDir, projectName, sessionId } = msg;
    if (!prompt) return sendTo(ws, { type: 'error', text: 'Missing prompt' });

    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
    const effectiveWorkDir = (workDir && workDir.trim()) ? workDir.trim() : CHAT_DIR;
    if (workDir && workDir.trim() && !fs.existsSync(effectiveWorkDir)) {
      return sendTo(ws, { type: 'error', text: `Working directory does not exist: ${effectiveWorkDir}` });
    }

    const id   = sessionId || `s_${Date.now()}`;
    const name = generateSessionName(prompt);
    const routineTag = msg.routineTag || null;
    const tier = msg.tier || null;
    const launchImages = Array.isArray(msg.images) ? msg.images.filter(i => i && typeof i.dataUrl === 'string') : [];
    const launchDocs   = Array.isArray(msg.docs)   ? msg.docs.filter(d => d && typeof d.dataUrl === 'string')   : [];
    const launchAudio  = Array.isArray(msg.audio)  ? msg.audio.filter(a => a && typeof a.dataUrl === 'string')  : [];
    sessions.set(id, { id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: msg.model || null, tier: tier || 'floor', isChat: false, status: 'running', startAt: Date.now(), proc: null, watcher: null, timeout: null, lines: [], lastPrompt: prompt, claudeSessionId: null, routineTag, pendingImages: launchImages, pendingDocs: launchDocs, pendingAudio: launchAudio });

    broadcast({ type: 'session-created', sessionId: id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: msg.model || null, routineTag });
    saveSessions();

    // Tier guard — Balanced/Power must be explicitly configured. No silent fallback to Floor.
    // Skipped when an explicit msg.model is provided (Agent Eval runner path) since the
    // explicit model overrides tier mapping anyway.
    if (!routineTag && !msg.model && (tier === 'balanced' || tier === 'power')) {
      const cfg = readConfig();
      const tierKey = tier === 'balanced' ? 'openRouterSonnetModel' : 'openRouterOpusModel';
      const tierName = tier === 'balanced' ? 'Balanced' : 'Power';
      if (!cfg[tierKey] || !cfg.openRouterApiKey) {
        const errMsg = `The ${tierName} model is not configured. Go to Settings → OpenRouter to set up the model string and API key for this tier.`;
        broadcast({ type: 'line', sessionId: id, text: errMsg, role: 'error' });
        broadcast({ type: 'session-status', sessionId: id, status: 'error' });
        const s = sessions.get(id);
        if (s) { s.status = 'error'; s.endAt = Date.now(); }
        return;
      }
    }
    if (projectName) spaceAppendEvent(projectName, { type: 'session-launch', sessionId: id, concurrentCount: sessions.size });

    if (routineTag) {
      const cfg = readConfig();
      const routineModel = msg.model || '';
      if (routineModel === 'chat') {
        const routeMsg = `[routing] routineTag="${routineTag}" model=chat → chat router (${cfg.chatModel || 'deepseek/deepseek-chat'})`;
        console.log(routeMsg);
        broadcast({ type: 'line', sessionId: id, text: routeMsg, role: 'system' });
        broadcast({ type: 'line', sessionId: id, text: prompt, role: 'user' });
        spawnChatRouter(id, prompt, cfg);
      } else {
        const routeMsg = `[routing] routineTag="${routineTag}" → DeepSeek direct API`;
        console.log(routeMsg);
        broadcast({ type: 'line', sessionId: id, text: routeMsg, role: 'system' });
        broadcast({ type: 'line', sessionId: id, text: prompt, role: 'user' });
        spawnDeepSeekRoutine(id, prompt, cfg);
      }
    } else {
      console.log(`[routing] no routineTag → direct OpenRouter API (model=${msg.model || 'default'})`);
      runDirectAgent(id, prompt, effectiveWorkDir);
    }
    return;
  }

  if (type === 'resume') {
    const { sessionId, prompt, displayPrompt, resumeId, model, projectName, images, docs, audio } = msg;
    const session = sessions.get(sessionId);
    if (!session) return sendTo(ws, { type: 'error', text: 'Session not found' });
    session.status = 'running';
    session.lastPrompt = prompt;
    if (projectName !== undefined) {
      const newProject = projectName || null;
      if (newProject !== session.projectName) {
        session.projectName = newProject;
        if (newProject) broadcast({ type: 'session-project-changed', sessionId, projectName: newProject, workDir: session.workDir });
      }
    }
    if (Array.isArray(images) && images.length) session.pendingImages = images.filter(i => i && typeof i.dataUrl === 'string');
    if (Array.isArray(docs)   && docs.length)   session.pendingDocs   = docs.filter(d => d && typeof d.dataUrl === 'string');
    if (Array.isArray(audio)  && audio.length)  session.pendingAudio  = audio.filter(a => a && typeof a.dataUrl === 'string');
    // Chat: spawnChat doesn't broadcast the user line, so do it here.
    // Agent: runDirectAgent broadcasts the user line itself — skip here to avoid double display.
    if (session.isChat) {
      const resumeAttachments = [
        ...(Array.isArray(images) ? images.filter(i => i?.name).map(i => `📎 ${i.name}`) : []),
        ...(Array.isArray(docs)   ? docs.filter(d => d?.name).map(d => `📄 ${d.name}`)   : []),
        ...(Array.isArray(audio)  ? audio.filter(a => a?.name).map(a => `🎵 ${a.name}`)  : []),
      ];
      const imgLabel2 = resumeAttachments.length ? '\n' + resumeAttachments.join('  ') : '';
      broadcast({ type: 'line', sessionId, text: (displayPrompt || prompt) + imgLabel2, role: 'user' });
    }
    broadcast({ type: 'session-status', sessionId, status: 'running' });
    if (session.isChat) {
      spawnChatRouter(sessionId, prompt, readConfig());
    } else {
      runDirectAgent(sessionId, prompt, session.workDir);
      // Mirror prompt to linked fork session
      const forkId = forkMap.get(sessionId);
      if (forkId) {
        const forkSession = sessions.get(forkId);
        if (forkSession) {
          forkSession.status = 'running';
          broadcast({ type: 'session-status', sessionId: forkId, status: 'running' });
          broadcast({ type: 'line', sessionId: forkId, text: displayPrompt || prompt, role: 'user' });
          runDirectAgent(forkId, prompt, forkSession.workDir);
        }
      }
    }
    return;
  }

  if (type === 'user-question-answer') {
    const resolver = pendingQuestions.get(msg.questionId);
    if (resolver) { pendingQuestions.delete(msg.questionId); resolver(msg.answer || '(no answer)'); }
    return;
  }

  if (type === 'cross-check-decision') {
    const pending = pendingCrossChecks.get(msg.checkId);
    if (pending) {
      pendingCrossChecks.delete(msg.checkId);
      clearTimeout(pending.timer);
      pending.resolve(msg.decision === 'approve' ? 'approve' : 'reject');
    }
    return;
  }

  if (type === 'cross-check-post-hoc-decision') {
    const pending = pendingPostHocChecks.get(msg.checkId);
    if (pending) {
      pendingPostHocChecks.delete(msg.checkId);
      clearTimeout(pending.timer);
      pending.resolve(msg.decision === 'restore' ? 'restore' : 'keep');
    }
    return;
  }

  if (type === 'stop') {
    const session = sessions.get(msg.sessionId);
    if (session) {
      // Abort direct-API agent loop
      session.aborted = true;
      // Kill legacy CLI proc if present
      if (session.proc && !session.proc.killed) {
        session.proc.kill();
        if (session.timeout) clearTimeout(session.timeout);
        if (session.watcher) session.watcher.close();
      }
      if (session.req) {
        session.req.destroy();
        session.req = null;
      }
      session.status = 'done';
      session.endAt  = session.endAt || Date.now();
      saveSessions();
      broadcast({ type: 'session-status', sessionId: msg.sessionId, status: 'done' });
    }
    return;
  }

  if (type === 'session-height') {
    const s = sessions.get(msg.sessionId);
    if (s) { s.height = msg.height || null; saveSessions(); }
    return;
  }

  if (type === 'session-column') {
    const s = sessions.get(msg.sessionId);
    if (s) { s.column = msg.column != null ? msg.column : null; saveSessions(); }
    return;
  }

  if (type === 'cost-update') {
    const s = sessions.get(msg.sessionId);
    if (s) { s.totalCost = msg.totalCost || 0; }
    return;
  }

  if (type === 'session-pinned') {
    const s = sessions.get(msg.sessionId);
    if (s) { s.pinned = !!msg.pinned; saveSessions(); broadcast({ type: 'session-pinned', sessionId: msg.sessionId, pinned: s.pinned }); }
    return;
  }

  if (type === 'rename-session') {
    const s = sessions.get(msg.sessionId);
    const newName = (msg.newName || '').trim();
    if (s && newName) {
      s.name = newName;
      saveSessions();
      broadcast({ type: 'session-renamed', sessionId: msg.sessionId, newName });
    }
    return;
  }

  if (type === 'close-session') {
    const session = sessions.get(msg.sessionId);
    if (session) {
      if (session.proc && !session.proc.killed) session.proc.kill();
      if (session.timeout) clearTimeout(session.timeout);
      if (session.watcher) session.watcher.close();
      sessions.delete(msg.sessionId);
      saveSessions();
    }
    broadcast({ type: 'session-closed', sessionId: msg.sessionId });
    return;
  }

  if (type === 'get-history') {
    sendTo(ws, { type: 'history', history: readJSON(HISTORY_PATH, []) });
    return;
  }

  if (type === 'dismiss-routine-notification') {
    const { id } = msg;
    const notifs = readJSON(ROUTINE_NOTIFICATIONS_PATH, []);
    // Mark dismissed but keep for "View Last Run"; trim to latest per routine name
    const marked = notifs.map(n => n.id === id ? { ...n, dismissed: true } : n);
    const seen = new Set();
    const trimmed = [...marked].reverse().filter(n => {
      const key = n.routineName || n.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).reverse();
    writeJSON(ROUTINE_NOTIFICATIONS_PATH, trimmed);
    return;
  }

  if (type === 'get-routine-notifications') {
    const notifications = readJSON(ROUTINE_NOTIFICATIONS_PATH, []);
    sendTo(ws, { type: 'event-routine-notifications', notifications });
    return;
  }

  if (type === 'get-config') {
    sendTo(ws, { type: 'config', config: maskedConfig(readConfig()) });
    return;
  }

  if (type === 'test-openrouter-key') {
    const { apiKey } = msg;
    if (!apiKey) {
      sendTo(ws, { type: 'openrouter-test-result', ok: false, message: 'No API key provided' });
      return;
    }
    const resolvedOrKey = (apiKey === SECRET_MASK) ? readConfig().openRouterApiKey : apiKey;
    if (!resolvedOrKey || /[^\x20-\x7E]/.test(resolvedOrKey)) {
      sendTo(ws, { type: 'openrouter-test-result', ok: false, message: 'Key contains invalid characters — clear the field and re-paste your key' });
      return;
    }
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/models',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${resolvedOrKey}` },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            const count = data?.data?.length || 0;
            sendTo(ws, { type: 'openrouter-test-result', ok: true, message: `Key valid — ${count} models available` });
          } catch {
            sendTo(ws, { type: 'openrouter-test-result', ok: true, message: 'Key valid' });
          }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'openrouter-test-result', ok: false, message: 'Invalid API key (401)' });
        } else {
          sendTo(ws, { type: 'openrouter-test-result', ok: false, message: `Unexpected response (${res.statusCode})` });
        }
      });
    });
    req.on('error', err => {
      sendTo(ws, { type: 'openrouter-test-result', ok: false, message: `Connection error: ${err.message}` });
    });
    req.end();
    return;
  }

  if (type === 'test-anthropic-key') {
    const { apiKey } = msg;
    if (!apiKey) { sendTo(ws, { type: 'anthropic-test-result', ok: false, message: 'No API key provided' }); return; }
    const resolvedAnthKey = (apiKey === SECRET_MASK) ? readConfig().anthropicApiKey : apiKey;
    if (!resolvedAnthKey || /[^\x20-\x7E]/.test(resolvedAnthKey)) { sendTo(ws, { type: 'anthropic-test-result', ok: false, message: 'Key contains invalid characters — clear the field and re-paste your key' }); return; }
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/models',
      method: 'GET',
      headers: { 'x-api-key': resolvedAnthKey, 'anthropic-version': '2023-06-01' },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            const count = data?.data?.length || 0;
            sendTo(ws, { type: 'anthropic-test-result', ok: true, message: `Key valid — ${count} models available` });
          } catch { sendTo(ws, { type: 'anthropic-test-result', ok: true, message: 'Key valid' }); }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'anthropic-test-result', ok: false, message: 'Invalid API key (401)' });
        } else {
          sendTo(ws, { type: 'anthropic-test-result', ok: false, message: `Unexpected response (${res.statusCode})` });
        }
      });
    });
    req.on('error', err => sendTo(ws, { type: 'anthropic-test-result', ok: false, message: `Connection error: ${err.message}` }));
    req.end();
    return;
  }

  if (type === 'test-openai-key') {
    const { apiKey } = msg;
    if (!apiKey) { sendTo(ws, { type: 'openai-test-result', ok: false, message: 'No API key provided' }); return; }
    const resolvedOaiKey = (apiKey === SECRET_MASK) ? readConfig().openAiApiKey : apiKey;
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${resolvedOaiKey}` },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            const count = data?.data?.length || 0;
            sendTo(ws, { type: 'openai-test-result', ok: true, message: `Key valid — ${count} models available` });
          } catch { sendTo(ws, { type: 'openai-test-result', ok: true, message: 'Key valid' }); }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'openai-test-result', ok: false, message: 'Invalid API key (401)' });
        } else {
          sendTo(ws, { type: 'openai-test-result', ok: false, message: `Unexpected response (${res.statusCode})` });
        }
      });
    });
    req.on('error', err => sendTo(ws, { type: 'openai-test-result', ok: false, message: `Connection error: ${err.message}` }));
    req.end();
    return;
  }

  if (type === 'test-elevenlabs-key') {
    const { apiKey } = msg;
    const resolved = (apiKey === SECRET_MASK) ? readConfig().elevenLabsApiKey : apiKey;
    if (!resolved) { sendTo(ws, { type: 'elevenlabs-test-result', ok: false, message: 'No API key provided' }); return; }
    const decrypted = (apiKey === SECRET_MASK && resolved) ? decryptSecret(resolved) : resolved;
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: '/v1/voices',
      method: 'GET',
      headers: { 'xi-api-key': decrypted },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            const count = (data?.voices || []).length;
            sendTo(ws, { type: 'elevenlabs-test-result', ok: true, message: `Key valid — ${count} voices available` });
          } catch { sendTo(ws, { type: 'elevenlabs-test-result', ok: true, message: 'Key valid' }); }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'elevenlabs-test-result', ok: false, message: 'Invalid API key (401)' });
        } else {
          sendTo(ws, { type: 'elevenlabs-test-result', ok: false, message: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on('error', err => sendTo(ws, { type: 'elevenlabs-test-result', ok: false, message: `Connection error: ${err.message}` }));
    req.end();
    return;
  }

  if (type === 'test-brave-key') {
    const { apiKey } = msg;
    const resolved = (apiKey === SECRET_MASK) ? readConfig().braveSearchApiKey : apiKey;
    if (!resolved) { sendTo(ws, { type: 'brave-test-result', ok: false, message: 'No API key provided' }); return; }
    const decrypted = (apiKey === SECRET_MASK && resolved) ? decryptSecret(resolved) : resolved;
    const req = https.request({
      hostname: 'api.search.brave.com',
      path: '/res/v1/web/search?q=polaris+test&count=1',
      method: 'GET',
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': decrypted },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          sendTo(ws, { type: 'brave-test-result', ok: true, message: 'Key valid — search returned results' });
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          sendTo(ws, { type: 'brave-test-result', ok: false, message: `Invalid or unauthorized key (${res.statusCode})` });
        } else if (res.statusCode === 429) {
          sendTo(ws, { type: 'brave-test-result', ok: false, message: 'Rate limit hit (key is valid, but throttled)' });
        } else {
          sendTo(ws, { type: 'brave-test-result', ok: false, message: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on('error', err => sendTo(ws, { type: 'brave-test-result', ok: false, message: `Connection error: ${err.message}` }));
    req.end();
    return;
  }

  if (type === 'test-model') {
    const { model, tier, provider } = msg;
    const config = readConfig();
    const apiKey = config.openRouterApiKey;
    if (!model) { sendTo(ws, { type: 'test-model-result', tier, ok: false, message: 'No model string entered' }); return; }
    if (!apiKey) { sendTo(ws, { type: 'test-model-result', tier, ok: false, message: 'No OpenRouter API key configured' }); return; }
    const bodyObj = {
      model,
      messages: [{ role: 'user', content: 'Count from 1 to 50, one number per line. No other text.' }],
      max_tokens: 600,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (provider) bodyObj.provider = { only: [provider] };
    const body = JSON.stringify(bodyObj);
    const reqStartMs = Date.now();
    let ttftMs = null, totalChars = 0, sseBuffer = '', usage = null;
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'HTTP-Referer': 'https://polaris.aesopacademy.com',
      },
    }, res => {
      let errRaw = '';
      if (res.statusCode !== 200) {
        res.on('data', c => errRaw += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(errRaw);
            const detail = d?.error?.message || errRaw.slice(0, 300);
            sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `HTTP ${res.statusCode}: ${detail}` });
          } catch {
            sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `HTTP ${res.statusCode}: ${errRaw.slice(0, 200)}` });
          }
        });
        return;
      }
      res.on('data', chunk => {
        sseBuffer += chunk.toString();
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.usage) usage = evt.usage;
            const delta = evt.choices?.[0]?.delta || {};
            const content = delta.content || delta.reasoning_content || '';
            if (content) {
              if (!ttftMs) ttftMs = Date.now() - reqStartMs;
              totalChars += content.length;
            }
          } catch {}
        }
      });
      res.on('end', () => {
        const totalMs = Date.now() - reqStartMs;
        const outTokens = usage?.completion_tokens || Math.round(totalChars / 4);
        const streamMs = ttftMs ? totalMs - ttftMs : totalMs;
        const tps = streamMs > 0 ? Math.round(outTokens / (streamMs / 1000)) : 0;
        if (!ttftMs) {
          sendTo(ws, { type: 'test-model-result', tier, ok: false, message: 'No tokens received — model may not support streaming' });
          return;
        }
        sendTo(ws, {
          type: 'test-model-result', tier, ok: true,
          message: `✓ TTFT: ${(ttftMs/1000).toFixed(2)}s · ${tps} tok/s · ${outTokens} tokens · ${(totalMs/1000).toFixed(2)}s total`,
        });
      });
    });
    req.on('error', err => sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `Connection error: ${err.message}` }));
    req.write(body);
    req.end();
    return;
  }

  if (type === 'agent-eval-load-queue') {
    const result = loadAgentEvalQueue();
    sendTo(ws, {
      type: 'agent-eval-queue',
      ...result,
      fixtures: AGENT_EVAL_FIXTURES.map(f => ({ id: f.id, description: f.description })),
    });
    return;
  }

  if (type === 'start-agent-eval') {
    if (currentAgentEvalRun) {
      sendTo(ws, { type: 'agent-eval-error', message: 'An eval run is already in progress' });
      return;
    }
    const models = Array.isArray(msg.models) ? msg.models.filter(Boolean) : [];
    if (!models.length) {
      sendTo(ws, { type: 'agent-eval-error', message: 'No models specified' });
      return;
    }
    const fixtureIds = Array.isArray(msg.fixtures) ? msg.fixtures : null;
    const runs = Math.max(1, Math.min(10, parseInt(msg.runs, 10) || 1));
    const runId = `aer_${Date.now()}`;
    sendTo(ws, { type: 'agent-eval-started', runId, totalCells: models.length * (fixtureIds?.length || AGENT_EVAL_FIXTURES.length) * runs });
    runAgentEvalSuite({ runId, models, fixtureIds, runs }).catch(e => {
      console.error('[agent-eval] suite failed:', e);
      broadcast({ type: 'agent-eval-error', runId, message: e.message });
      currentAgentEvalRun = null;
    });
    return;
  }

  if (type === 'cancel-agent-eval') {
    if (currentAgentEvalRun) currentAgentEvalRun.cancelled = true;
    return;
  }

  if (type === 'refresh-openrouter-catalog') {
    ensureOpenRouterCatalog(true).then(catalog => {
      const dict = buildModelCostsDict();
      const count = Object.keys(dict).length;
      broadcast({ type: 'model-costs', costs: dict });
      sendTo(ws, { type: 'openrouter-catalog-refreshed', count, ok: !!catalog });
    });
    return;
  }

  if (type === 'run-pre-build-check') {
    const sourcePath = msg.sourcePath || 'C:\\Users\\scott\\Code\\Polaris';
    runPreBuildCheck(ws, sourcePath).catch(e => {
      console.error('[pre-build-check] failed:', e);
      sendTo(ws, { type: 'pre-build-check-error', message: e.message });
    });
    return;
  }

  if (type === 'get-pre-build-check-status') {
    const sourcePath = msg.sourcePath || 'C:\\Users\\scott\\Code\\Polaris';
    sendTo(ws, { type: 'pre-build-check-status', ...getPreBuildCheckStatus(sourcePath) });
    return;
  }

  if (type === 'run-build') {
    const sourcePath = msg.sourcePath || 'C:\\Users\\scott\\Code\\Polaris';
    // Pre-build cross-check gate: build only proceeds if a cross-check has been
    // run against the current repo state. If not, return early with a flag the
    // UI uses to prompt the user to run a check first. msg.skipCheck = true
    // bypasses the gate (e.g. the user explicitly chose "build anyway").
    if (!msg.skipCheck) {
      const status = getPreBuildCheckStatus(sourcePath);
      if (!status.fresh) {
        sendTo(ws, { type: 'build-result', ok: false, requiresCheck: true,
          message: status.lastCheckedAt
            ? `Repo state has changed since last cross-check (${status.lastCheckedAt}). Run cross-check first.`
            : 'No cross-check has been run against this repo state yet. Run cross-check first.',
          status,
        });
        return;
      }
    }
    // Direct execution of the build-install script. NOT through an agent
    // session — that path was confused: agent's confirmation rules made it
    // ask before running, paid LLM tokens for a script invocation, and got
    // orphaned mid-execution when the script killed Polaris.
    //
    // Spawns powershell.exe detached so the script survives Polaris's death
    // (build-install.ps1 kills Polaris.exe early to free dist file locks).
    // Routed through "cmd /c start" because Electron is a GUI app with no
    // console — spawning powershell.exe directly produces no visible window
    // even with windowsHide:false. "start" explicitly creates a new console.
    // Save the current git HEAD so the next pre-build check diffs from here
    try {
      const head = execSync('git rev-parse HEAD', { cwd: sourcePath, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      const pkg = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8'));
      fs.writeFileSync(LAST_BUILD_HEAD_PATH, JSON.stringify({ head, version: pkg.version, builtAt: new Date().toISOString() }), 'utf8');
    } catch {}

    const fullScript = path.join(sourcePath, 'scripts', 'build-install.ps1');
    if (!fs.existsSync(fullScript)) {
      sendTo(ws, { type: 'build-result', ok: false, message: `Script not found: ${fullScript}` });
      return;
    }
    try {
      const child = spawn('cmd.exe', [
        '/c', 'start', 'powershell.exe',
        '-NoProfile', '-NoExit',
        '-ExecutionPolicy', 'Bypass',
        '-File', fullScript,
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        cwd: sourcePath,
      });
      child.unref();
      sendTo(ws, { type: 'build-result', ok: true, message: `Build started (pid ${child.pid}). Polaris will close shortly; the new version will install automatically.` });
      console.log(`[run-build] spawned detached powershell pid=${child.pid} script=${fullScript}`);
    } catch (e) {
      sendTo(ws, { type: 'build-result', ok: false, message: `Spawn failed: ${e.message}` });
      console.error('[run-build] spawn error:', e);
    }
    return;
  }

  if (type === 'save-agent-eval-results') {
    const config = readConfig();
    const proj = (config.projects || []).find(p => p.obsidianDir);
    if (!proj) {
      sendTo(ws, { type: 'agent-eval-saved', error: 'No project with Obsidian dir configured' });
      return;
    }
    const file = path.join(proj.obsidianDir, '5-Agentic-Benchmark.md');
    try {
      const results = Array.isArray(msg.results) ? msg.results : [];
      if (!results.length) {
        sendTo(ws, { type: 'agent-eval-saved', error: 'No results to save' });
        return;
      }
      // Aggregate per (model × fixture): pass count, median latency, median iters,
      // median output tokens, union of tools used.
      const cells = new Map();
      for (const r of results) {
        const key = `${r.model}__${r.fixture}`;
        if (!cells.has(key)) cells.set(key, { model: r.model, fixture: r.fixture, runs: [], passes: 0 });
        const cell = cells.get(key);
        cell.runs.push(r);
        if (r.pass) cell.passes++;
      }
      const median = xs => {
        if (!xs.length) return 0;
        const s = [...xs].sort((a, b) => a - b);
        return s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
      };
      const stamp = new Date().toISOString().slice(0, 19);
      const passed = results.filter(r => r.pass).length;
      const out = [];
      out.push(`### Run ${stamp}`);
      out.push(`${passed}/${results.length} cells passed across ${cells.size} (model × fixture) pairs.`);
      out.push('');
      out.push('| Model | Fixture | Pass | Latency med (s) | Iters med | Tokens in med | Tokens out med | Cost total | Tools used |');
      out.push('|---|---|---|---:|---:|---:|---:|---:|---|');
      const sorted = [...cells.values()].sort((a, b) => (a.model + a.fixture).localeCompare(b.model + b.fixture));
      let runTotalCost = 0;
      for (const cell of sorted) {
        const lats = cell.runs.map(r => (r.elapsedMs || 0) / 1000);
        const iters = cell.runs.map(r => r.trace?.iters || 0);
        const tin  = cell.runs.map(r => r.tokensIn ?? r.trace?.tokens?.in  ?? 0);
        const tout = cell.runs.map(r => r.trace?.tokens?.out || 0);
        const cellCost = cell.runs.reduce((s, r) => s + (r.costUsd || 0), 0);
        runTotalCost += cellCost;
        const costStr = cellCost === 0 ? '—' : (cellCost < 0.0001 ? '<$0.0001' : '$' + cellCost.toFixed(4));
        const toolUnion = [...new Set(cell.runs.flatMap(r => r.trace?.tools || []))].join(', ') || '—';
        out.push(`| \`${cell.model}\` | ${cell.fixture} | ${cell.passes}/${cell.runs.length} | ${median(lats).toFixed(2)} | ${median(iters)} | ${median(tin)} | ${median(tout)} | ${costStr} | ${toolUnion} |`);
      }
      out.push('');
      out.push(`Total spend this run: ${runTotalCost === 0 ? '—' : (runTotalCost < 0.01 ? '<$0.01' : '$' + runTotalCost.toFixed(4))}`);
      out.push('');
      // Insert under "## Results" — newest at top.
      let content = fs.readFileSync(file, 'utf8');
      const block = out.join('\n') + '\n';
      if (/^##\s+Results\b/m.test(content)) {
        content = content.replace(/^##\s+Results\b[^\n]*\n/m, m => m + '\n' + block);
      } else {
        content = content.trimEnd() + '\n\n## Results\n\n' + block;
      }
      fs.writeFileSync(file, content, 'utf8');
      sendTo(ws, { type: 'agent-eval-saved', path: '5-Agentic-Benchmark.md' });
    } catch (e) {
      sendTo(ws, { type: 'agent-eval-saved', error: e.message });
    }
    return;
  }

  if (type === 'benchmark-load-queue') {
    const config = readConfig();
    const proj = (config.projects || []).find(p => p.obsidianDir);
    if (!proj) { sendTo(ws, { type: 'benchmark-queue', models: [], error: 'No project with Obsidian dir configured' }); return; }
    const benchFile = path.join(proj.obsidianDir, '5-Performance-Benchmark.md');
    try {
      const content = fs.readFileSync(benchFile, 'utf8');
      const match = content.match(/```benchmark-models\n([\s\S]*?)```/);
      if (!match) { sendTo(ws, { type: 'benchmark-queue', models: [], error: 'No benchmark-models block found in 5-Performance-Benchmark.md' }); return; }
      // Strip inline `#` comments so `model-id  # retry note` parses correctly.
      const models = match[1].split('\n')
        .map(l => l.replace(/#.*$/, '').trim())
        .filter(l => l);
      sendTo(ws, { type: 'benchmark-queue', models });
    } catch (e) {
      sendTo(ws, { type: 'benchmark-queue', models: [], error: e.message });
    }
    return;
  }

  if (type === 'benchmark-save-result') {
    const { model, provider, ttft, tps, tokens, totalMs } = msg;
    const config = readConfig();
    const proj = (config.projects || []).find(p => p.obsidianDir);
    if (!proj) return;
    const benchFile = path.join(proj.obsidianDir, '5-Performance-Benchmark.md');
    try {
      let content = fs.readFileSync(benchFile, 'utf8');
      const date = new Date().toISOString().slice(0, 10);
      const providerLabel = provider || 'auto';
      const row = `| ${date} | ${model} | ${providerLabel} | ${(ttft/1000).toFixed(2)} | ${tps} | ${tokens} | ${(totalMs/1000).toFixed(2)} | ✓ |`;
      content = content.replace(
        /(\| Status \|\n\|[-| ]+\|)/,
        `$1\n${row}`
      );
      fs.writeFileSync(benchFile, content, 'utf8');
    } catch {}
    return;
  }

  if (type === 'get-space-data') {
    const { projectName } = msg;
    sendTo(ws, { type: 'space-data', projectName, scores: spaceComputeScores(projectName) });
    return;
  }

  if (type === 'get-diag') {
    const diagPath = path.join(LOGS_DIR, `diag-${msg.sessionId}.txt`);
    try {
      const content = fs.existsSync(diagPath) ? fs.readFileSync(diagPath, 'utf8') : '(no diag file found for this session)';
      sendTo(ws, { type: 'diag-content', content });
    } catch (e) {
      sendTo(ws, { type: 'diag-content', content: `Error reading diag: ${e.message}` });
    }
    return;
  }

  if (type === 'get-token-log') {
    const since = msg.since || (Date.now() - 24 * 60 * 60 * 1000);
    try {
      const lines = fs.existsSync(TOKEN_LOG_PATH) ? fs.readFileSync(TOKEN_LOG_PATH, 'utf8').split('\n').filter(Boolean) : [];
      const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && e.ts >= since);
      sendTo(ws, { type: 'token-log', entries });
    } catch { sendTo(ws, { type: 'token-log', entries: [] }); }
    return;
  }

  if (type === 'check-openrouter-balance') {
    const config = readConfig();
    const apiKey = config.openRouterApiKey;
    if (!apiKey) {
      sendTo(ws, { type: 'openrouter-balance', ok: false, message: 'No OpenRouter API key configured' });
      return;
    }
    const opts = {
      hostname: 'openrouter.ai',
      path: '/api/v1/credits',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(raw);
            const d = data.data || {};
            const total = d.total_credits ?? null;
            const used  = d.total_usage  ?? 0;
            sendTo(ws, { type: 'openrouter-balance', ok: true, usage: used, limit: total });
          } catch {
            sendTo(ws, { type: 'openrouter-balance', ok: false, message: 'Invalid response from OpenRouter' });
          }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'openrouter-balance', ok: false, message: 'Invalid API key (401)' });
        } else {
          sendTo(ws, { type: 'openrouter-balance', ok: false, message: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on('error', err => {
      sendTo(ws, { type: 'openrouter-balance', ok: false, message: `Connection error: ${err.message}` });
    });
    req.end();
    return;
  }

  if (type === 'check-deepseek-balance') {
    const config = readConfig();
    const apiKey = config.deepSeekApiKey;
    if (!apiKey) {
      sendTo(ws, { type: 'deepseek-balance', ok: false, message: 'No DeepSeek API key configured' });
      return;
    }
    const opts = {
      hostname: 'api.deepseek.com',
      path: '/user/balance',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(raw);
            const info = (data.balance_infos && data.balance_infos[0]) || {};
            sendTo(ws, {
              type: 'deepseek-balance',
              ok: true,
              total: parseFloat(info.total_balance) || 0,
              granted: parseFloat(info.granted_balance) || 0,
              topped_up: parseFloat(info.topped_up_balance) || 0,
              currency: info.currency || 'USD',
              available: !!data.is_available,
            });
          } catch {
            sendTo(ws, { type: 'deepseek-balance', ok: false, message: 'Invalid response from DeepSeek' });
          }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'deepseek-balance', ok: false, message: 'Invalid API key (401)' });
        } else {
          sendTo(ws, { type: 'deepseek-balance', ok: false, message: `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on('error', err => sendTo(ws, { type: 'deepseek-balance', ok: false, message: `Connection error: ${err.message}` }));
    req.end();
    return;
  }

  if (type === 'test-deepseek-key') {
    const apiKey = msg.apiKey || readConfig().deepSeekApiKey;
    if (!apiKey) {
      sendTo(ws, { type: 'deepseek-key-test', ok: false, message: 'No API key provided' });
      return;
    }
    const payload = JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false });
    const opts = {
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode === 200) sendTo(ws, { type: 'deepseek-key-test', ok: true, message: 'Key works' });
        else if (res.statusCode === 401) sendTo(ws, { type: 'deepseek-key-test', ok: false, message: 'Invalid API key (401)' });
        else sendTo(ws, { type: 'deepseek-key-test', ok: false, message: `HTTP ${res.statusCode}: ${raw.slice(0, 200)}` });
      });
    });
    req.on('error', err => sendTo(ws, { type: 'deepseek-key-test', ok: false, message: `Connection error: ${err.message}` }));
    req.write(payload);
    req.end();
    return;
  }

  if (type === 'open-url') {
    const { url } = msg;
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('file:///'))) {
      exec(`start "" "${url}"`);
    }
    return;
  }

  if (type === 'start-live-server') {
    const { projectDir } = msg;
    if (!projectDir) return sendTo(ws, { type: 'live-server-error', projectDir, error: 'Missing projectDir' });
    startLiveServer(projectDir).catch(e => {
      sendTo(ws, { type: 'live-server-error', projectDir, error: e.message });
    });
    return;
  }
  if (type === 'stop-live-server') {
    const { projectDir } = msg;
    if (!projectDir) return;
    const stopped = stopLiveServer(projectDir);
    if (!stopped) sendTo(ws, { type: 'live-server-status', projectDir, running: false, port: null, clientCount: 0, events: [] });
    return;
  }
  if (type === 'get-live-server-status') {
    const { projectDir } = msg;
    if (!projectDir) {
      // Return all
      const all = [...LIVE_SERVERS.values()].map(inst => ({
        projectDir: inst.projectDir, running: true, port: inst.port, clientCount: inst.clients.size, events: inst.events,
      }));
      sendTo(ws, { type: 'live-server-list', servers: all });
    } else {
      const inst = LIVE_SERVERS.get(projectDir);
      sendTo(ws, {
        type: 'live-server-status',
        projectDir,
        running: !!inst,
        port: inst ? inst.port : null,
        clientCount: inst ? inst.clients.size : 0,
        events: inst ? inst.events : [],
      });
    }
    return;
  }

  if (type === 'save-config') {
    const current = readJSON(CONFIG_PATH, {});
    const currentProjectNames = new Set((current.projects || []).map(p => p.name));
    const updates = { ...msg.config };
    for (const key of SENSITIVE_KEYS) {
      if (!updates[key] || updates[key] === SECRET_MASK) {
        delete updates[key];
      } else if (updates[key]) {
        updates[key] = encryptSecret(updates[key]);
      }
    }
    const merged = mergeConfigDefensively(current, updates);
    writeJSON(CONFIG_PATH, merged);
    const vaultPath = merged.obsidianVaultPath;
    if (vaultPath) {
      for (const proj of (merged.projects || [])) {
        if (!currentProjectNames.has(proj.name)) {
          scaffoldObsidianProject(proj, vaultPath);
        }
      }
    }
    sendTo(ws, { type: 'config-saved' });
    return;
  }

  if (type === 'tts-speak') {
    const cfg = readConfig();
    const rawKey = cfg.elevenLabsApiKey ? decryptSecret(cfg.elevenLabsApiKey) : null;
    if (!rawKey) { sendTo(ws, { type: 'tts-audio', error: 'no-key' }); return; }
    const voiceId = cfg.elevenLabsVoiceId || 'Xb7hH8MSUJpSbSDYk0k2'; // Alice — Clear, Engaging Educator (British)
    const body = JSON.stringify({
      text: String(msg.text || '').slice(0, 500),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: { 'xi-api-key': rawKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) { sendTo(ws, { type: 'tts-audio', error: `elevenlabs-${res.statusCode}` }); return; }
        sendTo(ws, { type: 'tts-audio', dataUrl: `data:audio/mpeg;base64,${Buffer.concat(chunks).toString('base64')}` });
      });
    });
    req.on('error', e => sendTo(ws, { type: 'tts-audio', error: e.message }));
    req.write(body);
    req.end();
    return;
  }

  if (type === 'sync-global-files') {
    const results = syncGlobalToProjects();
    const errors  = results.filter(r => r.status === 'error');
    const synced  = results.filter(r => r.status === 'ok').length;
    sendTo(ws, { type: 'sync-complete', results, synced, errors: errors.length });
    return;
  }

  if (type === 'get-locks') {
    sendTo(ws, { type: 'locks', locks: readJSON(LOCKS_PATH, {}) });
    return;
  }

  if (type === 'set-lock') {
    const locks = readJSON(LOCKS_PATH, {});
    const { filePath, sessionId, locked } = msg;
    if (locked) {
      if (!locks[filePath]) locks[filePath] = { sessions: [] };
      if (!locks[filePath].sessions.includes(sessionId)) locks[filePath].sessions.push(sessionId);
    } else {
      if (locks[filePath]) {
        locks[filePath].sessions = locks[filePath].sessions.filter(s => s !== sessionId);
        if (locks[filePath].sessions.length === 0) delete locks[filePath];
      }
    }
    writeJSON(LOCKS_PATH, locks);
    sendTo(ws, { type: 'locks', locks });
    return;
  }

  if (type === 'get-versions') {
    sendTo(ws, { type: 'versions', versions: getVersions(), log: readVersionLog() });
    return;
  }

  if (type === 'reload-ui') {
    broadcast({ type: 'reload' });
    return;
  }

  if (type === 'ping') {
    sendTo(ws, { type: 'pong' });
    return;
  }

  if (type === 'set-session-status') {
    const result = toolSetStatus({ status: msg.status }, msg.sessionId);
    console.log(`[set-session-status] ${msg.sessionId} → ${msg.status}: ${result}`);
    return;
  }

  if (type === 'restart') {
    broadcast({ type: 'line', sessionId: null, text: 'Server restarting…', role: 'error' });
    setTimeout(() => process.exit(0), 300);
    return;
  }

  if (type === 'get-mcp-servers') {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    const cfg = readJSON(claudeConfigPath, {});
    sendTo(ws, { type: 'mcp-servers', servers: cfg.mcpServers || {} });
    return;
  }

  if (type === 'save-mcp-servers') {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    const cfg = readJSON(claudeConfigPath, {});
    cfg.mcpServers = msg.servers || {};
    writeJSON(claudeConfigPath, cfg);
    sendTo(ws, { type: 'mcp-servers-saved' });
    return;
  }

  if (type === 'get-mcp-catalog') {
    const nativeServers = getConnectedMcpServers(); // from ~/.mcp.json (Claude Code native)
    sendTo(ws, { type: 'mcp-catalog', catalog: MCP_CATALOG, enabled: getEnabledMcpServers(), credentials: maskedMcpCredentials(), instances: getMcpInstances(), native: nativeServers });
    return;
  }

  if (type === 'enable-mcp-server') {
    const { id, credentials, instances } = msg;
    const entry = MCP_CATALOG.find(e => e.id === id);
    if (!entry) { sendTo(ws, { type: 'mcp-server-enabled', id, ok: false, error: 'Unknown server' }); return; }

    if (entry.multiInstance) {
      if (!instances || instances.length === 0) {
        sendTo(ws, { type: 'mcp-server-enabled', id, ok: false, error: 'Add at least one project' });
        return;
      }
      const cfg = readJSON(CONFIG_PATH, {});
      cfg.mcp_instances = cfg.mcp_instances || {};
      const builtInstances = instances.map(inst => ({
        name: inst.name,
        slug: `${id}-${slugify(inst.name)}`,
        credPath: inst.credPath
      }));
      cfg.mcp_instances[id] = builtInstances;
      writeJSON(CONFIG_PATH, cfg);
      const cj = readClaudeJson();
      cj.mcpServers = cj.mcpServers || {};
      for (const key of Object.keys(cj.mcpServers)) {
        if (key.startsWith(`${id}-`)) delete cj.mcpServers[key];
      }
      for (const inst of builtInstances) {
        cj.mcpServers[inst.slug] = {
          command: entry.command,
          args: entry.args,
          env: { GOOGLE_APPLICATION_CREDENTIALS: inst.credPath }
        };
      }
      writeClaudeJson(cj);
      sendTo(ws, { type: 'mcp-server-enabled', id, ok: true });
      return;
    }

    for (const credDef of (entry.credentials || [])) {
      if (credDef.required && !credentials[credDef.key]) {
        sendTo(ws, { type: 'mcp-server-enabled', id, ok: false, error: `${credDef.label} is required` });
        return;
      }
    }
    const cfg = readJSON(CONFIG_PATH, {});
    cfg.mcp_credentials = cfg.mcp_credentials || {};
    cfg.mcp_credentials[id] = {};
    for (const credDef of (entry.credentials || [])) {
      const val = credentials[credDef.key] || credDef.default || '';
      cfg.mcp_credentials[id][credDef.key] = credDef.type === 'secret' ? encryptSecret(val) : val;
    }
    writeJSON(CONFIG_PATH, cfg);
    const cj = readClaudeJson();
    cj.mcpServers = cj.mcpServers || {};
    if (entry.transport === 'remote') {
      cj.mcpServers[id] = { url: entry.url, headers: { [entry.headerKey]: credentials[entry.credentials[0].key] } };
    } else {
      const env = {};
      for (const [envKey, template] of Object.entries(entry.env || {})) {
        const credKey = template.replace('{{', '').replace('}}', '');
        const decryptedCreds = cfg.mcp_credentials[id] || {};
        const val = credentials[credKey] || (decryptedCreds[credKey] ? decryptSecret(decryptedCreds[credKey]) : '');
        if (val) env[envKey] = val; // skip empty optional credentials
      }
      cj.mcpServers[id] = { command: entry.command, args: entry.args, env };
    }
    writeClaudeJson(cj);
    sendTo(ws, { type: 'mcp-server-enabled', id, ok: true });
    return;
  }

  if (type === 'disable-mcp-server') {
    const { id, slug } = msg;
    const entry = MCP_CATALOG.find(e => e.id === id);
    const cj = readClaudeJson();
    cj.mcpServers = cj.mcpServers || {};
    if (entry && entry.multiInstance && slug) {
      delete cj.mcpServers[slug];
      const cfg = readJSON(CONFIG_PATH, {});
      cfg.mcp_instances = cfg.mcp_instances || {};
      cfg.mcp_instances[id] = (cfg.mcp_instances[id] || []).filter(i => i.slug !== slug);
      writeJSON(CONFIG_PATH, cfg);
    } else {
      delete cj.mcpServers[id];
    }
    writeClaudeJson(cj);
    sendTo(ws, { type: 'mcp-server-disabled', id, ok: true });
    return;
  }

  if (type === 'gdrive-oauth-start') {
    if (!APP_SECRETS.googleClientId || !APP_SECRETS.googleClientSecret) {
      sendTo(ws, { type: 'gdrive-oauth-complete', ok: false, error: 'Google credentials not configured in secrets.js' });
      return;
    }
    const callbackServer = http.createServer();
    callbackServer.listen(0, '127.0.0.1', () => {
      const port = callbackServer.address().port;
      const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', APP_SECRETS.googleClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      exec(`start "" "${authUrl.toString()}"`, { shell: true });
      const timeout = setTimeout(() => {
        callbackServer.close();
        sendTo(ws, { type: 'gdrive-oauth-complete', ok: false, error: 'Auth timed out (5 minutes)' });
      }, 5 * 60 * 1000);
      callbackServer.once('request', (req, res) => {
        clearTimeout(timeout);
        const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        const code = reqUrl.searchParams.get('code');
        const oauthError = reqUrl.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;padding:40px;background:#111;color:#eee;"><h2 style="color:#86efac;">âœ" Google Drive connected!</h2><p>You can close this tab and return to Polaris.</p></body></html>');
        callbackServer.close();
        if (oauthError || !code) {
          sendTo(ws, { type: 'gdrive-oauth-complete', ok: false, error: oauthError || 'No auth code received' });
          return;
        }
        const body = new URLSearchParams({
          code,
          client_id: APP_SECRETS.googleClientId,
          client_secret: APP_SECRETS.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString();
        const tokenReq = https.request({
          hostname: 'oauth2.googleapis.com',
          path: '/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
        }, tokenRes => {
          let data = '';
          tokenRes.on('data', chunk => data += chunk);
          tokenRes.on('end', () => {
            try {
              const tokens = JSON.parse(data);
              if (tokens.error) {
                sendTo(ws, { type: 'gdrive-oauth-complete', ok: false, error: tokens.error_description || tokens.error });
                return;
              }
              const tokenFile = path.join(POLARIS_DIR, 'gdrive-token.json');
              const tokenData = {
                client_id: APP_SECRETS.googleClientId,
                client_secret: APP_SECRETS.googleClientSecret,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: Date.now() + (tokens.expires_in * 1000),
                token_type: tokens.token_type,
                scope: tokens.scope
              };
              fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2), 'utf8');
              const cj = readClaudeJson();
              cj.mcpServers = cj.mcpServers || {};
              cj.mcpServers['gdrive'] = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-gdrive'], env: { GDRIVE_OAUTH_PATH: tokenFile } };
              writeClaudeJson(cj);
              sendTo(ws, { type: 'gdrive-oauth-complete', ok: true });
            } catch (e) {
              sendTo(ws, { type: 'gdrive-oauth-complete', ok: false, error: 'Failed to parse token response' });
            }
          });
        });
        tokenReq.on('error', e => sendTo(ws, { type: 'gdrive-oauth-complete', ok: false, error: e.message }));
        tokenReq.write(body);
        tokenReq.end();
      });
    });
    return;
  }

  if (type === 'pick-file') {
    if (typeof process.send !== 'function') {
      sendTo(ws, { type: 'file-picked', error: 'File picker only available in the Electron app.', replyKey: msg.replyKey || null });
      return;
    }
    const requestId = crypto.randomBytes(8).toString('hex');
    pendingFilePicks.set(requestId, { ws, replyKey: msg.replyKey || null });
    process.send({ type: 'pick-file', requestId, title: msg.title || 'Select File', filters: msg.filters || [] });
    return;
  }

  if (type === 'get-connections') {
    const config = readConfig();
    const projects = (config.projects || []).filter(p => p.workDir);
    if (!projects.length) {
      sendTo(ws, { type: 'connections', data: [] });
      return;
    }
    Promise.all(projects.map(async p => {
      try {
        const [branch, status, tracking] = await Promise.all([
          runGit(['branch', '--show-current'], p.workDir),
          runGit(['status', '--porcelain'], p.workDir),
          runGit(['rev-list', '--count', '--left-right', '@{upstream}...HEAD'], p.workDir),
        ]);
        const dirty = status.trim().length > 0;
        let ahead = 0, behind = 0;
        if (tracking && tracking.includes('\t')) {
          const parts = tracking.split('\t');
          behind = parseInt(parts[0]) || 0;
          ahead  = parseInt(parts[1]) || 0;
        }
        return { name: p.name, workDir: p.workDir, branch: branch || 'unknown', dirty, ahead, behind };
      } catch (e) {
        return { name: p.name, workDir: p.workDir, branch: '', dirty: false, ahead: 0, behind: 0, error: e.message };
      }
    })).then(data => sendTo(ws, { type: 'connections', data }));
    return;
  }

  if (type === 'pick-directory') {
    if (typeof process.send !== 'function') {
      sendTo(ws, { type: 'error', text: 'Folder picker is only available inside the Electron app.' });
      return;
    }
    const requestId = crypto.randomBytes(8).toString('hex');
    pendingDirPicks.set(requestId, ws);
    process.send({ type: 'pick-directory', requestId, defaultPath: msg.defaultPath || null });
    return;
  }

  if (type === 'list-github-repos') {
    const config = readConfig();
    const username = (config.githubUsername || '').trim();
    if (!username) {
      sendTo(ws, { type: 'github-repos', repos: [], error: 'No GitHub username configured. Add one in Settings.' });
      return;
    }
    console.log(`[github] Fetching repos for username="${username}"`);
    const opts = {
      hostname: 'api.github.com',
      path: `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
      headers: { 'User-Agent': 'Polaris', 'Accept': 'application/vnd.github+json' },
      timeout: 10000,
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log(`[github] Response ${res.statusCode}, ${body.length} bytes`);
        if (res.statusCode !== 200) {
          sendTo(ws, { type: 'github-repos', repos: [], error: `GitHub API ${res.statusCode}: ${body.slice(0, 200)}` });
          return;
        }
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data)) {
            sendTo(ws, { type: 'github-repos', repos: [], error: `Unexpected response shape: ${body.slice(0, 200)}` });
            return;
          }
          const repos = data.map(r => ({ fullName: r.full_name, name: r.name, private: r.private, updatedAt: r.updated_at }));
          sendTo(ws, { type: 'github-repos', repos });
        } catch (e) {
          sendTo(ws, { type: 'github-repos', repos: [], error: `Parse error: ${e.message}` });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      sendTo(ws, { type: 'github-repos', repos: [], error: 'GitHub API request timed out after 10 seconds.' });
    });
    req.on('error', e => sendTo(ws, { type: 'github-repos', repos: [], error: `Network error: ${e.message}` }));
    req.end();
    return;
  }

  if (type === 'read-file') {
    const { filePath } = msg;
    if (!filePath) return;
    try {
      const stat = fs.statSync(filePath);
      const MAX_SIZE = 1024 * 1024; // 1 MB
      if (stat.size > MAX_SIZE) {
        sendTo(ws, { type: 'file-content', filePath, error: `File too large to edit (${(stat.size / 1024).toFixed(0)} KB > 1 MB).` });
        return;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      sendTo(ws, { type: 'file-content', filePath, content, size: stat.size, replyTag: msg.replyTag || null });
    } catch (e) {
      sendTo(ws, { type: 'file-content', filePath, error: e.message });
    }
    return;
  }

  if (type === 'write-file') {
    const { filePath, content } = msg;
    const replyTag = msg.replyTag || null;
    if (!filePath) return;
    const locks = readJSON(LOCKS_PATH, {});
    if (locks[filePath] && locks[filePath].sessions && locks[filePath].sessions.length) {
      sendTo(ws, { type: 'file-write-result', filePath, ok: false, error: 'File is locked by an active session.', replyTag });
      return;
    }
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      const { rel, prev, next } = bumpVersion(filePath);
      const ts = Date.now();
      appendVersionLog({ ts, sessionId: 'editor', sessionName: 'File Editor', file: rel, prev, next });
      sendTo(ws, { type: 'file-write-result', filePath, ok: true, prev, next, replyTag });
      broadcast({ type: 'file-version', sessionId: 'editor', file: rel, prev, next, ts, sessionName: 'File Editor' });
    } catch (e) {
      sendTo(ws, { type: 'file-write-result', filePath, ok: false, error: e.message, replyTag });
    }
    return;
  }

  if (type === 'rename-file') {
    const { filePath, newName } = msg;
    if (!filePath || !newName) return;
    const locks = readJSON(LOCKS_PATH, {});
    if (locks[filePath] && locks[filePath].sessions && locks[filePath].sessions.length) {
      sendTo(ws, { type: 'file-rename-result', filePath, ok: false, error: 'File is locked.' });
      return;
    }
    if (newName.includes('/') || newName.includes('\\')) {
      sendTo(ws, { type: 'file-rename-result', filePath, ok: false, error: 'Name cannot contain slashes.' });
      return;
    }
    try {
      const dir = path.dirname(filePath);
      const newPath = path.join(dir, newName);
      if (fs.existsSync(newPath)) {
        sendTo(ws, { type: 'file-rename-result', filePath, ok: false, error: 'A file with that name already exists.' });
        return;
      }
      fs.renameSync(filePath, newPath);
      sendTo(ws, { type: 'file-rename-result', filePath, ok: true, newPath, parentDir: dir });
    } catch (e) {
      sendTo(ws, { type: 'file-rename-result', filePath, ok: false, error: e.message });
    }
    return;
  }

  if (type === 'delete-file') {
    const { filePath } = msg;
    if (!filePath) return;
    const locks = readJSON(LOCKS_PATH, {});
    if (locks[filePath] && locks[filePath].sessions && locks[filePath].sessions.length) {
      sendTo(ws, { type: 'file-delete-result', filePath, ok: false, error: 'File is locked.' });
      return;
    }
    try {
      const stat = fs.statSync(filePath);
      const parentDir = path.dirname(filePath);
      if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true, force: true });
      else fs.unlinkSync(filePath);
      sendTo(ws, { type: 'file-delete-result', filePath, ok: true, parentDir });
    } catch (e) {
      sendTo(ws, { type: 'file-delete-result', filePath, ok: false, error: e.message });
    }
    return;
  }

  if (type === 'launch-chrome') {
    const chromePaths = [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const chromePath = chromePaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    if (!chromePath) {
      sendTo(ws, { type: 'error', text: 'Chrome not found. Install Google Chrome and try again.' });
      return;
    }
    spawn(chromePath, ['--remote-debugging-port=9222'], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (type === 'open-path') {
    const { filePath } = msg;
    if (!filePath) return;
    if (typeof process.send !== 'function') {
      sendTo(ws, { type: 'error', text: 'Open in OS is only available inside the Electron app.' });
      return;
    }
    process.send({ type: 'open-path', filePath, mode: msg.mode || 'open' });
    return;
  }

  if (type === 'submit-support-ticket') {
    submitSupportTicket(ws, msg).catch(e => {
      sendTo(ws, { type: 'support-ticket-result', ok: false, error: e.message });
    });
    return;
  }

  if (type === 'get-tickets') {
    const tickets = readJSON(TICKETS_PATH, []);
    sendTo(ws, { type: 'tickets', tickets, installId: getInstallId() });
    return;
  }

  if (type === 'update-ticket-status') {
    const tickets = readJSON(TICKETS_PATH, []);
    const t = tickets.find(t => t.id === msg.id);
    if (t) { t.status = msg.status; t.resolvedAt = msg.status === 'resolved' ? Date.now() : null; }
    writeJSON(TICKETS_PATH, tickets);
    sendTo(ws, { type: 'tickets', tickets, installId: getInstallId() });
    return;
  }

  if (type === 'delete-ticket') {
    const tickets = readJSON(TICKETS_PATH, []).filter(t => t.id !== msg.id);
    writeJSON(TICKETS_PATH, tickets);
    sendTo(ws, { type: 'tickets', tickets, installId: getInstallId() });
    return;
  }

  if (type === 'browse-dir') {
    const { dirPath } = msg;
    if (!dirPath) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const SKIP = new Set(['node_modules', '.git', 'dist', 'release']);
      const items = entries
        .filter(e => !SKIP.has(e.name))
        .map(e => ({ name: e.name, isDir: e.isDirectory(), path: path.join(dirPath, e.name) }))
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
      sendTo(ws, { type: 'dir-listing', dirPath, items, replyTag: msg.replyTag || null });
    } catch (e) {
      sendTo(ws, { type: 'error', text: `File Manager: ${e.message}`, replyTag: msg.replyTag || null });
    }
    return;
  }

  if (type === 'get-code-health') {
    const { projectName } = msg;
    const config = readConfig();
    const project = (config.projects || []).find(p => p.name === projectName);
    const workDir = project && project.workDir;
    if (!workDir || !fs.existsSync(workDir)) {
      sendTo(ws, { type: 'error', text: `Code Health: no working directory found for project "${projectName}".` });
      return;
    }
    computeCodeHealth(workDir)
      .then(data => sendTo(ws, { type: 'code-health', data }))
      .catch(e  => sendTo(ws, { type: 'error', text: `Code Health failed: ${e.message}` }));
    return;
  }

  if (type === 'obsidian-up') {
    const { sessionName, content, projectName } = msg;
    const config = readConfig();
    const vaultPath = config.obsidianVaultPath;
    if (!vaultPath) {
      sendTo(ws, { type: 'error', text: 'No Obsidian vault path configured. Open Settings to set one.' });
      return;
    }
    try {
      const proj = (config.projects || []).find(p => p.name === projectName);
      // Derive vault root from the project's absolute obsidianDir, same logic as scaffoldObsidianProject
      const buildPath = proj?.obsidianDir && path.isAbsolute(path.normalize(proj.obsidianDir))
        ? path.normalize(proj.obsidianDir)
        : path.join(vaultPath, proj?.obsidianDir || '');
      const vaultRoot = proj?.obsidianDir ? path.dirname(buildPath) : vaultPath;
      const sessionsDir = proj?.obsidianSessionsDir && path.isAbsolute(path.normalize(proj.obsidianSessionsDir))
        ? path.normalize(proj.obsidianSessionsDir)
        : path.join(vaultRoot, proj?.obsidianSessionsDir || `${projectName || 'Polaris'}_Sessions`);
      fs.mkdirSync(sessionsDir, { recursive: true });
      const safeName = (sessionName || 'Session').replace(/[<>:"/\\|?*]/g, '_');
      const filePath = path.join(sessionsDir, `${safeName}.md`);
      fs.writeFileSync(filePath, content || '', 'utf8');
      sendTo(ws, { type: 'obsidian-progress', step: 'file-written', filePath });
      const codeGit = proj && proj.workDir
        ? runGit(['push'], proj.workDir)
            .then(() => sendTo(ws, { type: 'obsidian-progress', step: 'code-git' }))
        : Promise.resolve();
      pendingGitPushes++;
      Promise.all([codeGit])
        .finally(() => { sendTo(ws, { type: 'obsidian-up-done', filePath }); onGitPushComplete(); });
    } catch (e) {
      sendTo(ws, { type: 'error', text: `Obsidian Up failed: ${e.message}` });
    }
    return;
  }

  // -- Archive handlers -------------------------------------------------

  if (type === 'archive-session') {
    const { sessionId } = msg;
    const s = sessions.get(sessionId);
    if (!s) return sendTo(ws, { type: 'archive-error', error: 'Session not found' });
    s.aborted = true;
    if (s.proc && !s.proc.killed) s.proc.kill();
    if (s.req) { try { s.req.destroy(); } catch {} }
    const archiveData = {
      ...serializeSession(s),
      messages: s.messages || [],
      archivedAt: new Date().toISOString(),
    };
    fs.mkdirSync(ARCHIVES_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARCHIVES_DIR, `${sessionId}.json`), JSON.stringify(archiveData, null, 2), 'utf8');
    const index = readJSON(ARCHIVES_INDEX_PATH, []);
    const entry = {
      sessionId, sessionName: s.name, modelId: s.model,
      projectDir: s.workDir, projectName: s.projectName,
      archivedAt: archiveData.archivedAt,
      messageCount: (s.lines || []).length,
    };
    const existingIdx = index.findIndex(e => e.sessionId === sessionId);
    if (existingIdx >= 0) index[existingIdx] = entry; else index.unshift(entry);
    writeJSON(ARCHIVES_INDEX_PATH, index);
    forkMap.delete(sessionId);
    sessions.delete(sessionId);
    saveSessions();
    broadcast({ type: 'archive-complete', sessionId, entry });
    return;
  }

  if (type === 'get-archives') {
    sendTo(ws, { type: 'archives-list', archives: readJSON(ARCHIVES_INDEX_PATH, []) });
    return;
  }

  if (type === 'get-cross-check-history') {
    sendTo(ws, { type: 'cross-check-history', entries: loadAllCrossChecks(msg.limit || 200) });
    return;
  }

  if (type === 'get-archive-detail') {
    const { sessionId } = msg;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ARCHIVES_DIR, `${sessionId}.json`), 'utf8'));
      sendTo(ws, { type: 'archive-detail', sessionId, lines: data.lines || [] });
    } catch { sendTo(ws, { type: 'archive-error', error: 'Archive not found' }); }
    return;
  }

  if (type === 'reactivate-archive') {
    const { sessionId, projectDir } = msg;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ARCHIVES_DIR, `${sessionId}.json`), 'utf8'));
      const workDir = projectDir || data.workDir || CHAT_DIR;
      const session = { ...data, workDir, status: 'done', proc: null, watcher: null, timeout: null, lines: data.lines || [] };
      sessions.set(sessionId, session);
      saveSessions();
      const index = readJSON(ARCHIVES_INDEX_PATH, []);
      writeJSON(ARCHIVES_INDEX_PATH, index.filter(e => e.sessionId !== sessionId));
      try { fs.unlinkSync(path.join(ARCHIVES_DIR, `${sessionId}.json`)); } catch {}
      broadcast({ type: 'archive-reactivated', session: serializeSession(session) });
    } catch (e) { sendTo(ws, { type: 'archive-error', error: `Reactivate failed: ${e.message}` }); }
    return;
  }

  if (type === 'delete-archive') {
    const { sessionId } = msg;
    try { fs.unlinkSync(path.join(ARCHIVES_DIR, `${sessionId}.json`)); } catch {}
    const index = readJSON(ARCHIVES_INDEX_PATH, []);
    writeJSON(ARCHIVES_INDEX_PATH, index.filter(e => e.sessionId !== sessionId));
    sendTo(ws, { type: 'archives-list', archives: readJSON(ARCHIVES_INDEX_PATH, []) });
    return;
  }

  if (type === 'search-archives') {
    const { query } = msg;
    if (!query || !query.trim()) {
      sendTo(ws, { type: 'archives-list', archives: readJSON(ARCHIVES_INDEX_PATH, []) });
      return;
    }
    const q = query.toLowerCase();
    const index = readJSON(ARCHIVES_INDEX_PATH, []);
    const results = [];
    for (const entry of index) {
      const nameMatch = (entry.sessionName || '').toLowerCase().includes(q);
      const projMatch = (entry.projectName || '').toLowerCase().includes(q);
      const excerpts = [];
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ARCHIVES_DIR, `${entry.sessionId}.json`), 'utf8'));
        for (const line of (data.lines || [])) {
          const text = (line.text || '').toLowerCase();
          if (text.includes(q)) {
            const idx = text.indexOf(q);
            const start = Math.max(0, idx - 80);
            const end = Math.min(line.text.length, idx + q.length + 80);
            excerpts.push(line.text.slice(start, end));
            if (excerpts.length >= 3) break;
          }
        }
      } catch {}
      if (nameMatch || projMatch || excerpts.length > 0) results.push({ ...entry, excerpts });
    }
    sendTo(ws, { type: 'archive-search-results', results });
    return;
  }

  // -- Fork handlers ----------------------------------------------------

  if (type === 'start-fork') {
    const { primarySessionId, forkModelId } = msg;
    const primary = sessions.get(primarySessionId);
    if (!primary) return sendTo(ws, { type: 'archive-error', error: 'Session not found' });
    const forkId = `fork_${Date.now()}`;
    const forkName = `${primary.name} ⑂ Fork`;
    const config = readConfig();
    const model = forkModelId || config.defaultForkModel || config.openRouterFloorModel || 'openrouter/auto';
    sessions.set(forkId, {
      id: forkId, name: forkName,
      workDir: primary.workDir, projectName: primary.projectName,
      model, isChat: primary.isChat, isForked: true, primarySessionId,
      status: 'done', startAt: Date.now(),
      proc: null, watcher: null, timeout: null,
      lines: [], lastPrompt: null, claudeSessionId: null,
    });
    forkMap.set(primarySessionId, forkId);
    saveSessions();
    broadcast({ type: 'session-created', sessionId: forkId, name: forkName, workDir: primary.workDir, projectName: primary.projectName, model, isForked: true, primarySessionId });
    broadcast({ type: 'fork-started', primarySessionId, forkSessionId: forkId });
    return;
  }

  if (type === 'stop-fork') {
    const { primarySessionId } = msg;
    const forkId = forkMap.get(primarySessionId);
    forkMap.delete(primarySessionId);
    broadcast({ type: 'fork-stopped', primarySessionId, forkSessionId: forkId });
    return;
  }

  if (type === 'promote-fork') {
    const { forkSessionId } = msg;
    const s = sessions.get(forkSessionId);
    if (!s) return;
    const primaryId = s.primarySessionId;
    forkMap.delete(primaryId);
    s.isForked = false;
    s.primarySessionId = null;
    saveSessions();
    broadcast({ type: 'fork-promoted', primarySessionId: primaryId, forkSessionId });
    return;
  }
}

// â"€â"€â"€ Boot â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
fs.mkdirSync(ARCHIVES_DIR, { recursive: true });
fs.mkdirSync(SOURCE_BACKUPS_DIR, { recursive: true });

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[polaris] HTTP server listening on http://127.0.0.1:${PORT}`);
  migrateSecretsToEncrypted();
  syncGlobalToProjects();
  watchGlobalFiles();
  // Ensure the 'polaris' MCP server is trusted by the Claude Code CLI
  try {
    const ccSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const ccSettings = readJSON(ccSettingsPath, {});
    const enabled = Array.isArray(ccSettings.enabledMcpjsonServers) ? ccSettings.enabledMcpjsonServers : [];
    if (!enabled.includes('polaris')) {
      ccSettings.enabledMcpjsonServers = [...enabled, 'polaris'];
      writeJSON(ccSettingsPath, ccSettings);
      console.log('[polaris] Added "polaris" to enabledMcpjsonServers in ~/.claude/settings.json');
    }
  } catch (e) {
    console.warn('[polaris] Could not update ~/.claude/settings.json:', e.message);
  }
});

wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[polaris] WebSocket client connected');

  // Send server timezone offset so the renderer can display local time correctly
  sendTo(ws, { type: 'server-tz', tzOffsetMin: new Date().getTimezoneOffset() });

  // Fetch last 5 commits then send init (commits travel in the init payload)
  (async () => {
    let recentCommits = [];
    try {
      const polarisProject = (readConfig().projects || []).find(p => p.name === 'Polaris');
      const gitDir = (polarisProject && polarisProject.workDir) || __dirname;
      const projectName  = polarisProject ? polarisProject.name  : 'Polaris';
      const projectColor = polarisProject ? polarisProject.color : '#4ade80';
      const logOutput = await runGit(['log', '-15', '--format=%h%x09%H%x09%s%x09%an%x09%as'], gitDir);
      if (logOutput) {
        const entries = logOutput.split('\n').filter(Boolean).map(line => {
          const [hash, fullHash, subject, author, date] = line.split('\t');
          return { hash: hash || '', fullHash: fullHash || '', subject: subject || '', author: author || '', date: date || '' };
        }).filter(c => c.hash);
        const rawVersions = await Promise.all(entries.map(c =>
          runGit(['show', `${c.fullHash}:package.json`], gitDir).then(pkg => {
            const m = pkg.match(/"version"\s*:\s*"([^"]+)"/);
            return m ? m[1] : '';
          }).catch(() => '')
        ));
        // Walk newest-first. Commits not yet included in a version bump ship in
        // the currently installed version (which may be ahead of the last commit).
        const currentPkgVer = require('./package.json').version;
        let shippedIn = currentPkgVer;
        recentCommits = entries.map((c, i) => {
          if (rawVersions[i + 1] !== undefined && rawVersions[i] !== rawVersions[i + 1]) {
            shippedIn = rawVersions[i];
          }
          return { hash: c.hash, subject: c.subject, author: c.author, date: c.date, version: shippedIn, projectName, projectColor };
        });
      }
    } catch (e) { console.error('[git-changes] log failed:', e.message); }

    // Send current session list on connect
    sendTo(ws, {
      type: 'init',
      sessions: Array.from(sessions.values()).map(s => ({
        id: s.id, name: s.name, workDir: s.workDir, projectName: s.projectName,
        model: s.model || null, isChat: s.isChat || false,
        status: s.status, startAt: s.startAt, endAt: s.endAt || null,
        resumeId: s.claudeSessionId || null,
        lastPrompt: s.lastPrompt || null,
        height: s.height || null,
        column: s.column != null ? s.column : null,
        pinned: !!s.pinned,
        lines: (s.lines || []).slice(-300),
        lastUsage: s.lastUsage || null,
        totalCost: s.totalCost || 0,
      })),
      history: readJSON(HISTORY_PATH, []),
      config:  maskedConfig(readConfig()),
      protectedPatterns: (readConfig().protectedPatterns || ['*.md']),
      installId: getInstallId(),
      supportEnabled: !!BREVO_API_KEY,
      appVersion: require('./package.json').version,
      recentCommits,
      connectedMcpServers: getEnabledMcpServers().filter(s => s !== 'polaris'),
    });

    // Send the OpenRouter model-costs dict so estimateCost can do exact matches.
    // First send whatever's cached (instant), then trigger a refresh in the
    // background and send the updated dict when ready.
    sendTo(ws, { type: 'model-costs', costs: buildModelCostsDict() });
    ensureOpenRouterCatalog(false).then(() => {
      sendTo(ws, { type: 'model-costs', costs: buildModelCostsDict() });
    }).catch(() => {});

    // Fire one-time `app-update` event if the version has changed since last launch
    try {
      const cfg = readJSON(CONFIG_PATH, {});
      const current = require('./package.json').version;
      if (cfg.lastSeenVersion !== current) {
        const previous = cfg.lastSeenVersion || null;
        cfg.lastSeenVersion = current;
        writeJSON(CONFIG_PATH, cfg);
        setTimeout(() => {
          sendTo(ws, { type: 'event-app-update', from: previous, to: current });
        }, 500);
      }
    } catch (e) { console.error('[app-update] check failed:', e.message); }

    // Fire event-git-changes so routines with that trigger still work
    if (recentCommits.length > 0) {
      sendTo(ws, { type: 'event-git-changes', commits: recentCommits });
    }

    // Send any pending routine notifications (e.g. from the architecture audit routine)
    try {
      const routineNotifs = readJSON(ROUTINE_NOTIFICATIONS_PATH, []);
      if (routineNotifs.length > 0) {
        setTimeout(() => sendTo(ws, { type: 'event-routine-notifications', notifications: routineNotifs }), 1400);
      }
    } catch (e) { console.error('[routine-notifs] read failed:', e.message); }
  })();

  ws.on('message', raw => handleMessage(ws, raw));
  ws.on('close', () => console.log('[polaris] WebSocket client disconnected'));
  ws.on('error', err => console.error('[polaris] WebSocket error:', err));
});

wss.on('error', err => console.error('[polaris] WSS error:', err));

// Watch for routine notifications written by scheduled routines and push to clients
fs.watchFile(ROUTINE_NOTIFICATIONS_PATH, { persistent: false, interval: 2000 }, () => {
  try {
    const notifications = readJSON(ROUTINE_NOTIFICATIONS_PATH, []);
    if (notifications.length > 0) broadcast({ type: 'event-routine-notifications', notifications });
  } catch {}
});
