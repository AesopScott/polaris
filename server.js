'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');
const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');

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
const HISTORY_PATH  = path.join(POLARIS_DIR, 'prompt-history.json');
const SESSIONS_DIR  = path.join(POLARIS_DIR, 'sessions');
const LOGS_DIR      = path.join(POLARIS_DIR, 'logs');
const SPACE_DIR     = path.join(POLARIS_DIR, 'space');
const SESSIONS_PERSIST_PATH = path.join(POLARIS_DIR, 'sessions-persist.json');
const TICKETS_PATH    = path.join(POLARIS_DIR, 'tickets.json');
const TOKEN_LOG_PATH  = path.join(POLARIS_DIR, 'token-log.jsonl');
const CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json');
const ARCHIVES_DIR    = path.join(POLARIS_DIR, 'archives');
const ARCHIVES_INDEX_PATH = path.join(ARCHIVES_DIR, 'index.json');

// â"€â"€â"€ App-level secrets (gitignored, baked into build) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
let APP_SECRETS = {};
try { APP_SECRETS = require('./secrets'); }
catch { console.log('[polaris] secrets.js not found — Support feature will be disabled'); }

// â"€â"€â"€ MCP Catalog â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const RESOURCES_PATH = process.env.RESOURCES_PATH || path.join(__dirname, 'resources');
let MCP_CATALOG = [];
try { MCP_CATALOG = JSON.parse(fs.readFileSync(path.join(RESOURCES_PATH, 'mcp-catalog.json'), 'utf8')); }
catch (e) { console.log('[polaris] mcp-catalog.json not found:', e.message); }

const GLOBAL_CLAUDE_PATH   = path.join(__dirname, 'CLAUDE.md');
const USER_CLAUDE_PATH     = path.join(os.homedir(), '.claude', 'CLAUDE.md');
const GLOBAL_MEMORY_PATH   = path.join(os.homedir(), '.claude', 'MEMORY.md');
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
  'Be concise. Answer in 1-3 sentences unless the task genuinely requires more. No preamble, no restating the question, no closing summary. Use a short numbered list only when steps are truly sequential. Never pad responses.',
  'Never output raw file contents, JSON, code blocks, or data structures in your responses unless the user explicitly asked to see them. Summarize what you found instead (e.g. "Found 3 courses" not a JSON dump). Tool results are for your context only — the user sees only what you write as plain text.',
  'At the start of every session, your FIRST action must be to call QueryMemory with no arguments. This loads your full project knowledge base — architecture, file map, build plan, changelog. Do not respond to the user or take any other action until you have called QueryMemory. This is mandatory, not optional.',
].join('\n');

function buildSystemPrompt(config) {
  const patterns = config.protectedPatterns || ['*.md', '*.json'];
  const patternRule = `Protected file patterns — these file types require explicit user approval before ANY modification. State the planned change and wait for confirmation before writing: ${patterns.join(', ')}`;
  const mcpServers = Object.keys(readClaudeJson().mcpServers || {});
  const mcpLine = mcpServers.length > 0
    ? `You have the following MCP servers connected and their tools are available to you: ${mcpServers.join(', ')}. Use them proactively when relevant.`
    : '';
  return BASE_SYSTEM_PROMPT + '\n' + patternRule + (mcpLine ? '\n' + mcpLine : '');
}

// â"€â"€â"€ Secret encryption (AES-256-GCM, stable file key) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const SENSITIVE_KEYS = new Set(['openRouterApiKey', 'anthropicApiKey', 'openAiApiKey', 'deepSeekEmail', 'deepSeekPassword', 'deepSeekApiKey', 'elevenLabsApiKey']);
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
const pendingQuestions  = new Map(); // questionId → resolve

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
  if (!APP_SECRETS.brevoApiKey || APP_SECRETS.brevoApiKey === 'PASTE_YOUR_BREVO_KEY_HERE') {
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
    sender:    { email: APP_SECRETS.brevoSenderEmail || 'no-reply@aesopacademy.org', name: 'Polaris Support' },
    to:        [{ email: APP_SECRETS.brevoRecipientEmail || 'scott@aesopacademy.org' }],
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
        'api-key': APP_SECRETS.brevoApiKey,
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
    exec(`git ${args.map(a => `"${a}"`).join(' ')}`, { cwd }, (err, stdout) => {
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
          fs.writeFileSync(dest, `${globalContent}\n\n${PROJECT_SPECIFIC_MARKER}${projectSection}`, 'utf8');
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

function writeJSON(filePath, data) {
  // Back up config before every write so a corrupt write never loses everything
  if (filePath === CONFIG_PATH) {
    try { fs.copyFileSync(CONFIG_PATH, CONFIG_PATH.replace('.json', '.backup.json')); } catch {}
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
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
    "version": "version number like 1.0.61 — only if an explicit version bump was detected, else null",
    "date": "${today}",
    "headline": "one sentence describing the main change this session"
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

  // Changelog: insert table row after the header separator line
  if (extracted.changelog?.version) {
    const clPath = path.join(obsDir, '4-Changelog.md');
    try {
      let clContent = fs.readFileSync(clPath, 'utf8');
      const dividerMatch = clContent.match(/\|[-\s|]+\|\r?\n/);
      if (dividerMatch) {
        const insertAt = clContent.indexOf(dividerMatch[0]) + dividerMatch[0].length;
        const row = `| ${extracted.changelog.version} | ${extracted.changelog.date} | ${extracted.changelog.headline} |\n`;
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
  { type: 'function', function: { name: 'WebSearch', description: 'Search the web and return results. Uses Brave Search if configured, otherwise DuckDuckGo.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, num_results: { type: 'integer', description: 'Max results to return (default 5)' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'AskUserQuestion', description: 'Ask the user a clarifying question and wait for their response before continuing.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'The question to ask' }, options: { type: 'array', items: { type: 'string' }, description: 'Optional predefined answer choices' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'TodoWrite', description: 'Update the task todo list to track progress.', parameters: { type: 'object', properties: { todos: { type: 'array', items: { type: 'string' }, description: 'Each item is "content|status" where status is pending, in_progress, or completed. Example: ["Fix bug|in_progress","Write tests|pending"]' } }, required: ['todos'] } } },
  { type: 'function', function: { name: 'QueryMemory', description: 'Query the project knowledge base loaded from Obsidian. Call with no arguments at session start to load all project context. Pass filename to retrieve a specific file.', parameters: { type: 'object', properties: { filename: { type: 'string', description: 'Optional filename or partial name to retrieve a specific file. Omit to get all project memory.' } }, required: [] } } },
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

      // Obsidian write requirement
      if (matched.obsidianSessionsDir) {
        layers.push(
          `--- Obsidian Writing Requirement ---\n` +
          `Every session MUST be written to Obsidian when complete. No exceptions.\n` +
          `Sessions folder: ${matched.obsidianSessionsDir}\n` +
          `File naming: session_YYYY-MM-DD_short-description.md\n` +
          `After writing, extract relevant content into the numbered files in: ${matched.obsidianDir}`
        );
      }

      // Custom instructions from Projects panel
      if (matched.instructions) layers.push('--- Project Instructions ---\n' + matched.instructions);
    }
  }

  return layers.join('\n\n');
}

// â"€â"€ Tool implementations â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function toolRead({ file_path, offset, limit }) {
  const lines = fs.readFileSync(file_path, 'utf8').split('\n');
  const start = offset ? Math.max(0, offset - 1) : 0;
  const end   = limit  ? Math.min(lines.length, start + limit) : lines.length;
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

// assertWritable — enforces two rules before any write:
//   1. file_path must be inside workDir (hard boundary)
//   2. file must not be locked in the global locks.json
function assertWritable(file_path, workDir) {
  if (!workDir) return; // no workDir (e.g. chat sessions) — skip enforcement

  const resolved = path.resolve(file_path);
  const wd       = path.resolve(workDir);

  // Rule 1: path must be within workDir
  const inside = resolved.toLowerCase() === wd.toLowerCase() ||
                 resolved.toLowerCase().startsWith(wd.toLowerCase() + path.sep);
  if (!inside) {
    throw new Error(
      `Write blocked: "${path.basename(file_path)}" is outside the project working directory.\n` +
      `Allowed: ${workDir}\nAttempted: ${resolved}`
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

function toolWrite({ file_path, content }, workDir) {
  assertWritable(file_path, workDir);
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
  fs.writeFileSync(file_path, content, 'utf8');
  return `Written: ${file_path}`;
}

function toolEdit({ file_path, old_string, new_string, replace_all }, workDir) {
  assertWritable(file_path, workDir);
  const content = fs.readFileSync(file_path, 'utf8');
  if (!content.includes(old_string)) throw new Error(`old_string not found in ${file_path}`);
  const updated = replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, new_string);
  fs.writeFileSync(file_path, updated, 'utf8');
  return `Edited: ${file_path}`;
}

function toolGlob({ pattern, path: searchPath }, workDir) {
  const base = searchPath || workDir || process.cwd();
  // Convert glob to regex — escape special chars first, then expand * and ? wildcards
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex chars (not * or ?)
    .replace(/\*\*/g, 'Â§DSÂ§')              // protect ** before replacing single *
    .replace(/\*/g, '[^/\\\\]*')           // * → any non-separator chars
    .replace(/Â§DSÂ§/g, '.*')               // ** → anything including separators
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

function toolBash({ command, timeout: tms }, workDir) {
  assertSafeCommand(command, workDir);
  try {
    return execSync(command, { cwd: workDir, shell: true, timeout: Math.min(tms || 60000, 120000), maxBuffer: 5 * 1024 * 1024 }).toString();
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : '';
    const err = e.stderr ? e.stderr.toString() : '';
    return (out + (err ? '\n' + err : '') || e.message).trim();
  }
}

function toolPowerShell({ command, timeout: tms }, workDir) {
  assertSafeCommand(command, workDir);
  try {
    return execSync(`powershell.exe -NoProfile -Command ${JSON.stringify(command)}`, { cwd: workDir, timeout: Math.min(tms || 60000, 120000), maxBuffer: 5 * 1024 * 1024 }).toString();
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : '';
    const err = e.stderr ? e.stderr.toString() : '';
    return (out + (err ? '\n' + err : '') || e.message).trim();
  }
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
  if (config.braveSearchApiKey) return braveSearch(query, n, config.braveSearchApiKey);
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
    case 'Read':       return toolRead(input);
    case 'Write':      return toolWrite(input, workDir);
    case 'Edit':       return toolEdit(input, workDir);
    case 'Glob':       return toolGlob(input, workDir);
    case 'Grep':       return toolGrep(input, workDir);
    case 'Bash':       return toolBash(input, workDir);
    case 'PowerShell': return toolPowerShell(input, workDir);
    case 'WebFetch':   return await toolWebFetch(input);
    case 'WebSearch':  return await toolWebSearch(input);
    case 'AskUserQuestion': return await toolAskUserQuestion(input, sessionId);
    case 'TodoWrite':  return toolTodoWrite(input, sessionId);
    case 'QueryMemory': return toolQueryMemory(input, sessionId);
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
      },
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
  session.messages.push({ role: 'user', content: userMessage });
  if (session.messages.length > MAX_AGENT_MESSAGES) session.messages = session.messages.slice(-MAX_AGENT_MESSAGES);

  const tier  = session.tier || 'floor';
  const hasImage = Array.isArray(userMessage)
    ? userMessage.some(p => p.type === 'image_url' || p.type === 'image')
    : false;
  const effectiveTier = hasImage && tier === 'floor' ? 'balanced' : tier;
  const model = effectiveTier === 'power'    ? (config.openRouterOpusModel   || config.openRouterFloorModel || 'google/gemini-2.5-flash')
              : effectiveTier === 'balanced' ? (config.openRouterSonnetModel || config.openRouterFloorModel || 'google/gemini-2.5-flash')
              :                                (config.openRouterFloorModel  || 'google/gemini-2.5-flash');
  const provider = effectiveTier === 'power'    ? (config.openRouterOpusProvider   || null)
                 : effectiveTier === 'balanced' ? (config.openRouterSonnetProvider || null)
                 :                                (config.openRouterFloorProvider  || null);
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
  while (!session.aborted && iterations < 50) {
    iterations++;
    dlog('ITER', iterations);
    const result = await callOpenRouterStream(sessionId, session.messages, systemPrompt, model, config.openRouterApiKey, sessionTools, provider);

    if (result.error) {
      dlog('ERROR', result.error);
      broadcast({ type: 'line', sessionId, text: `API error: ${result.error}`, role: 'error' });
      broadcast({ type: 'session-status', sessionId, status: 'error' });
      const s = sessions.get(sessionId); if (s) { s.status = 'error'; s.endAt = Date.now(); }
      return;
    }

    if (result.usage) {
      const usage = { input_tokens: result.usage.prompt_tokens || 0, output_tokens: result.usage.completion_tokens || 0 };
      appendTokenLog(sessionId, model, usage);
      broadcast({ type: 'context-usage', sessionId, usage, claudeSessionId: null, routineTag: session.routineTag || null });
      dlog('TOKENS', `in=${usage.input_tokens} out=${usage.output_tokens}`);
    }

    // Detect empty response — model returned neither text nor tool calls
    const hasContent = result.textAccum || (result.toolCalls && result.toolCalls.length > 0);
    if (!hasContent) {
      dlog('EMPTY_RESPONSE', `finishReason=${result.finishReason} rawSample=${(result.rawSample || '').slice(0, 600)}`);
      const reason = result.finishReason === 'error'
        ? `The model rejected the request (finish_reason=error). This model may not support tool use or the request format. Try a different model.`
        : `Model returned an empty response (finish_reason=${result.finishReason || 'none'}). Check the diag log for raw SSE details.`;
      broadcast({ type: 'line', sessionId, text: reason, role: 'error' });
      broadcast({ type: 'session-status', sessionId, status: 'error' });
      const s = sessions.get(sessionId); if (s) { s.status = 'error'; s.endAt = Date.now(); }
      return;
    }

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
      broadcast({ type: 'line', sessionId, text: `⚙ ${toolDisplayLabel(tc.name, toolInput)}`, role: 'system' });
      dlog('TOOL', `${tc.name} ${tc.arguments.slice(0,200)}`);
      let toolResult;
      try { toolResult = await executeDirectTool(tc.name, toolInput, workDir, sessionId); }
      catch (err) { toolResult = `Error: ${err.message}`; dlog('TOOL_ERR', err.message); }
      const resultStr = String(toolResult).slice(0, 50000);
      dlog('TOOL_RESULT', resultStr.slice(0, 200));
      session.messages.push({ role: 'tool', tool_call_id: callId, content: resultStr });
    }
  }

  const s = sessions.get(sessionId);
  if (s) { s.status = s.aborted ? 'error' : 'done'; s.endAt = Date.now(); }
  saveSessionMessages(sessionId);
  dlog('DONE', `${((Date.now()-startMs)/1000).toFixed(2)}s iters=${iterations}`);
  broadcast({ type: 'session-status', sessionId, status: s?.aborted ? 'error' : 'done' });
  autoObsidianForSession(sessionId);
  extractSessionToKnowledge(sessionId); // fire-and-forget: distill to numbered Obsidian files
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
        broadcast({ type: 'line', sessionId, text, role: 'assistant' });

        if (data.usage) {
          const usage = {
            input_tokens: data.usage.prompt_tokens || 0,
            output_tokens: data.usage.completion_tokens || 0,
          };
          s.outputTokens = usage.output_tokens;
          appendTokenLog(sessionId, model, usage);
          broadcast({ type: 'context-usage', sessionId, usage, claudeSessionId: null, routineTag: s.routineTag || null });

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
      broadcast({ type: 'context-usage', sessionId, usage: msg.message.usage, claudeSessionId: null, routineTag: s?.routineTag || null });
    }
  }

  if (msg.type === 'result') {
    const s = sessions.get(sessionId);
    if (s) {
      if (msg.usage) s.outputTokens = msg.usage.output_tokens || 0;
      if (msg.session_id) s.claudeSessionId = msg.session_id;
    }
    if (msg.usage) appendTokenLog(sessionId, s?.model, msg.usage);
    broadcast({ type: 'context-usage', sessionId, usage: msg.usage, claudeSessionId: msg.session_id || null, routineTag: s?.routineTag || null });
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
      if (rem) broadcast({ type: 'line', sessionId, text: rem, role: 'assistant' });
      session.chatBuffer = ''; // Clear the buffer after broadcasting remaining content
      session.status = 'done';
      session.endAt  = Date.now();
      broadcast({ type: 'session-status', sessionId, status: 'done' });
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

  res.writeHead(404);
  res.end('Not found');
});

// â"€â"€â"€ WebSocket message handler â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type } = msg;

  if (type === 'launch-chat') {
    const { prompt } = msg;
    if (!prompt) return sendTo(ws, { type: 'error', text: 'Missing prompt' });

    addToHistory(prompt);
    const id   = `chat_${Date.now()}`;
    const name = generateSessionName(prompt);
    const config = readConfig();
    const chatModel = config.chatModel || 'deepseek/deepseek-chat';
    sessions.set(id, {
      id, name, workDir: null, projectName: null,
      isChat: true, model: chatModel,
      status: 'running', startAt: Date.now(),
      proc: null, watcher: null, timeout: null,
      lines: [], lastPrompt: prompt, claudeSessionId: null,
    });
    broadcast({ type: 'session-created', sessionId: id, name, workDir: null, projectName: null, model: chatModel, isChat: true });
    broadcast({ type: 'line', sessionId: id, text: prompt, role: 'user' });
    saveSessions();
    spawnChat(id, prompt, config);
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
    sessions.set(id, { id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: msg.model || null, tier: tier || 'floor', isChat: false, status: 'running', startAt: Date.now(), proc: null, watcher: null, timeout: null, lines: [], lastPrompt: prompt, claudeSessionId: null, routineTag });

    broadcast({ type: 'session-created', sessionId: id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: msg.model || null, routineTag });
    saveSessions();

    // Tier guard — Balanced/Power must be explicitly configured. No silent fallback to Floor.
    if (!routineTag && (tier === 'balanced' || tier === 'power')) {
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

    // Routines go through DeepSeek direct API — no CLI cold-load, ~1000Ã— cheaper per fire
    if (routineTag) {
      const routeMsg = `[routing] routineTag="${routineTag}" → DeepSeek direct API (bypassing Claude CLI)`;
      console.log(routeMsg);
      broadcast({ type: 'line', sessionId: id, text: routeMsg, role: 'system' });
      broadcast({ type: 'line', sessionId: id, text: prompt, role: 'user' });
      spawnDeepSeekRoutine(id, prompt, readConfig());
    } else {
      console.log(`[routing] no routineTag → direct OpenRouter API (model=${msg.model || 'default'})`);
      runDirectAgent(id, prompt, effectiveWorkDir);
    }
    return;
  }

  if (type === 'resume') {
    const { sessionId, prompt, displayPrompt, resumeId, model } = msg;
    const session = sessions.get(sessionId);
    if (!session) return sendTo(ws, { type: 'error', text: 'Session not found' });
    session.status = 'running';
    session.lastPrompt = prompt;
    // Chat: spawnChat doesn't broadcast the user line, so do it here.
    // Agent: runDirectAgent broadcasts the user line itself — skip here to avoid double display.
    if (session.isChat) broadcast({ type: 'line', sessionId, text: displayPrompt || prompt, role: 'user' });
    broadcast({ type: 'session-status', sessionId, status: 'running' });
    if (session.isChat) {
      spawnChat(sessionId, prompt, readConfig());
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

  if (type === 'benchmark-load-queue') {
    const config = readConfig();
    const proj = (config.projects || []).find(p => p.obsidianDir);
    if (!proj) { sendTo(ws, { type: 'benchmark-queue', models: [], error: 'No project with Obsidian dir configured' }); return; }
    const benchFile = path.join(proj.obsidianDir, '5-Benchmarks.md');
    try {
      const content = fs.readFileSync(benchFile, 'utf8');
      const match = content.match(/```benchmark-models\n([\s\S]*?)```/);
      if (!match) { sendTo(ws, { type: 'benchmark-queue', models: [], error: 'No benchmark-models block found in 5-Benchmarks.md' }); return; }
      const models = match[1].split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
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
    const benchFile = path.join(proj.obsidianDir, '5-Benchmarks.md');
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
    const updates = { ...msg.config };
    for (const key of SENSITIVE_KEYS) {
      if (!updates[key] || updates[key] === SECRET_MASK) {
        delete updates[key];
      } else if (updates[key]) {
        updates[key] = encryptSecret(updates[key]);
      }
    }
    writeJSON(CONFIG_PATH, { ...current, ...updates });
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
    sendTo(ws, { type: 'mcp-catalog', catalog: MCP_CATALOG, enabled: getEnabledMcpServers(), credentials: maskedMcpCredentials(), instances: getMcpInstances() });
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
        env[envKey] = credentials[credKey] || (decryptedCreds[credKey] ? decryptSecret(decryptedCreds[credKey]) : '');
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
    const { sessionName, content } = msg;
    const config = readConfig();
    const vaultPath = config.obsidianVaultPath;
    if (!vaultPath) {
      sendTo(ws, { type: 'error', text: 'No Obsidian vault path configured. Open Settings to set one.' });
      return;
    }
    try {
      const dir = path.join(vaultPath, 'Polaris_Sessions');
      fs.mkdirSync(dir, { recursive: true });
      const safeName = (sessionName || 'Session').replace(/[<>:"/\\|?*]/g, '_');
      const filePath = path.join(dir, `${safeName}.md`);
      fs.writeFileSync(filePath, content || '', 'utf8');
      sendTo(ws, { type: 'obsidian-up-done', filePath });
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
    broadcast({ type: 'archive-complete', sessionId });
    return;
  }

  if (type === 'get-archives') {
    sendTo(ws, { type: 'archives-list', archives: readJSON(ARCHIVES_INDEX_PATH, []) });
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

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[polaris] HTTP server listening on http://127.0.0.1:${PORT}`);
  migrateSecretsToEncrypted();
  syncGlobalToProjects();
  watchGlobalFiles();
});

wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[polaris] WebSocket client connected');

  // Send server timezone offset so the renderer can display local time correctly
  sendTo(ws, { type: 'server-tz', tzOffsetMin: new Date().getTimezoneOffset() });

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
    })),
    history: readJSON(HISTORY_PATH, []),
    config:  maskedConfig(readConfig()),
    protectedPatterns: (readConfig().protectedPatterns || ['*.md']),
    installId: getInstallId(),
    supportEnabled: !!(APP_SECRETS.brevoApiKey && APP_SECRETS.brevoApiKey !== 'PASTE_YOUR_BREVO_KEY_HERE'),
    appVersion: require('./package.json').version,
  });

  // Fire one-time `app-update` event if the version has changed since last launch
  try {
    const cfg = readJSON(CONFIG_PATH, {});
    const current = require('./package.json').version;
    if (cfg.lastSeenVersion !== current) {
      const previous = cfg.lastSeenVersion || null;
      cfg.lastSeenVersion = current;
      writeJSON(CONFIG_PATH, cfg);
      // Defer slightly so client init handlers settle first
      setTimeout(() => {
        sendTo(ws, { type: 'event-app-update', from: previous, to: current });
      }, 500);
    }
  } catch (e) { console.error('[app-update] check failed:', e.message); }

  ws.on('message', raw => handleMessage(ws, raw));
  ws.on('close', () => console.log('[polaris] WebSocket client disconnected'));
  ws.on('error', err => console.error('[polaris] WebSocket error:', err));
});

wss.on('error', err => console.error('[polaris] WSS error:', err));
