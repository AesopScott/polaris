'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');
const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');

// ─── Paths ────────────────────────────────────────────────────────────────────
const APPDATA      = process.env.APPDATA || os.homedir();
const POLARIS_DIR  = process.env.POLARIS_DIR  || path.join(APPDATA, '.claude', 'polaris');
const MOCKUP_DEST  = process.env.MOCKUP_DEST  || path.join(POLARIS_DIR, 'mockup.html');
const PORT         = Number(process.env.SERVER_PORT) || 40000;

const CONFIG_PATH   = path.join(POLARIS_DIR, 'config.json');
const LOCKS_PATH    = path.join(POLARIS_DIR, 'locks.json');
const VERSIONS_PATH = path.join(POLARIS_DIR, 'file-versions.json');
const HISTORY_PATH  = path.join(POLARIS_DIR, 'prompt-history.json');
const SESSIONS_DIR  = path.join(POLARIS_DIR, 'sessions');
const LOGS_DIR      = path.join(POLARIS_DIR, 'logs');
const SPACE_DIR     = path.join(POLARIS_DIR, 'space');
const SESSIONS_PERSIST_PATH = path.join(POLARIS_DIR, 'sessions-persist.json');

const GLOBAL_CLAUDE_PATH = path.join(__dirname, 'CLAUDE.md');
const GLOBAL_MEMORY_PATH = path.join(os.homedir(), '.claude', 'MEMORY.md');
const PROJECT_SPECIFIC_MARKER = '<!-- PROJECT-SPECIFIC -->';
const CHAT_DIR      = path.join(POLARIS_DIR, 'polaris_chat');

// ─── System prompt injected into every agent session ─────────────────────────
const BASE_SYSTEM_PROMPT = [
  'Path awareness — source directory: C:\\Users\\scott\\Code\\Polaris. Do not read from or write to this directory. It is not the running app.',
  'Path awareness — installed app: C:\\Users\\scott\\AppData\\Local\\Programs\\Polaris\\resources\\. Do not edit files here. Changes are destroyed on reinstall.',
  'Path awareness — config and data: C:\\Users\\scott\\AppData\\Roaming\\.claude\\polaris\\. This is the only location where runtime data is stored.',
  'Never copy files from the source directory into the installed app.',
  'Code changes require a rebuild. Tell Scott. He will edit source, run npm run dist, and reinstall.',
  'Never replace spawnClaude with a direct API call. Agent sessions must run through the Claude CLI.',
  'Always buffer streaming text. Accumulate delta.content in lineBuffer. Only emit when a newline character arrives.',
  'Never restart the server from code. If a restart is needed, tell Scott.',
  'Config path: always use process.env.APPDATA || os.homedir(). Never use process.env.HOME alone.',
  'Locked resources require user approval before modification. Check locks.json before any file write.',
  'Runtime: this session runs inside a Polaris Electron desktop app. There are no browser controls, no DevTools, no window.open, and no browser extensions available.',
  'Platform: Windows. Use Windows-style paths with backslashes. Unix shell commands (ls, grep, cat, sed, awk, chmod, curl) are not available. Use PowerShell cmdlets or Node.js fs module instead.',
  'Path comparisons are always case-insensitive. Windows paths are case-insensitive by the OS. Always use .toLowerCase() or equivalent when comparing or filtering file paths and repo names.',
  'Projects own their working directory and remote git repo. A directory or repo associated with a project must not appear as a standalone saved entry elsewhere in the UI. The project name is the sole entry point for its associated paths.',
  'Before making any code change, file write, or destructive action: state what you plan to do and why, then wait for Scott to confirm before proceeding.',
  'Never assume approval from context. Each proposed action requires an explicit "yes", "go ahead", or equivalent before execution.',
  'File versioning is active. Before modifying a file, state the current version. After modifying it, state the new version. Versions are tracked in file-versions.json in the Polaris data directory.',
].join('\n');

function buildSystemPrompt(config) {
  const patterns = config.protectedPatterns || ['*.md'];
  const patternRule = `Protected file patterns — these file types require explicit user approval before ANY modification. State the planned change and wait for confirmation before writing: ${patterns.join(', ')}`;
  return BASE_SYSTEM_PROMPT + '\n' + patternRule;
}

// ─── Secret encryption (AES-256-GCM, machine-bound key) ──────────────────────
const SENSITIVE_KEYS = new Set(['openRouterApiKey', 'anthropicApiKey', 'openAiApiKey', 'deepSeekEmail', 'deepSeekPassword']);
const SECRET_MASK    = '••••••••';

let _machineKey = null;
function getMachineKey() {
  if (_machineKey) return _machineKey;
  try {
    const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const match = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
    if (match) { _machineKey = crypto.createHash('sha256').update(match[1]).digest(); return _machineKey; }
  } catch {}
  _machineKey = crypto.createHash('sha256').update(`${os.userInfo().username}@${os.hostname()}`).digest();
  return _machineKey;
}

function encryptSecret(plaintext) {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMachineKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(value) {
  if (!value || !value.startsWith('enc:')) return value || '';
  try {
    const buf = Buffer.from(value.slice(4), 'base64');
    const iv = buf.slice(0, 16); const tag = buf.slice(16, 32); const enc = buf.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getMachineKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch { return ''; }
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
    if (raw[key] && !raw[key].startsWith('enc:')) {
      raw[key] = encryptSecret(raw[key]);
      changed = true;
    }
  }
  if (changed) { writeJSON(CONFIG_PATH, raw); console.log('[secrets] Migrated plaintext secrets to encrypted.'); }
}

// ─── Git helper ───────────────────────────────────────────────────────────────
function runGit(args, cwd) {
  return new Promise(resolve => {
    exec(`git ${args.join(' ')}`, { cwd }, (err, stdout) => {
      resolve(err ? '' : stdout.trim());
    });
  });
}

// ─── File sync ───────────────────────────────────────────────────────────────
function syncGlobalToProjects() {
  const config   = readConfig();
  const projects = (config.projects || []).filter(p => p.workDir);
  const vaultPath = config.obsidianVaultPath || '';
  const globalSoulPath = vaultPath ? path.join(vaultPath, 'SOUL.md') : null;

  const fileDefs = [
    { name: 'CLAUDE.md', src: GLOBAL_CLAUDE_PATH,  projectSpecific: true  },
    { name: 'MEMORY.md', src: GLOBAL_MEMORY_PATH,  projectSpecific: true  },
    { name: 'SOUL.md',   src: globalSoulPath,       projectSpecific: false },
  ];

  const results = [];

  for (const { name, src, projectSpecific } of fileDefs) {
    if (!src) { results.push({ file: name, status: 'skipped', reason: 'no source path' }); continue; }
    let globalContent;
    try {
      globalContent = fs.readFileSync(src, 'utf8');
    } catch {
      results.push({ file: name, status: 'skipped', reason: 'source not found' });
      continue;
    }

    for (const project of projects) {
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

// ─── State ────────────────────────────────────────────────────────────────────
const sessions = new Map();   // sessionId → session object
let   wss      = null;

// ─── Session persistence ──────────────────────────────────────────────────────
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
    lines: (s.lines || []).slice(-500),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
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

// ─── File versioning ─────────────────────────────────────────────────────────
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

function watchSessionFiles(sessionId, workDir) {
  if (!fs.existsSync(workDir)) return;
  const watcher = fs.watch(workDir, { recursive: true }, (event, filename) => {
    if (event !== 'change' || !filename) return;
    const full = path.join(workDir, filename);
    const { rel, prev, next } = bumpVersion(full);
    broadcast({ type: 'file-version', sessionId, file: rel, prev, next });
  });
  return watcher;
}

// ─── Lock enforcement ─────────────────────────────────────────────────────────
function isLocked(filePath, sessionId) {
  const locks = readJSON(LOCKS_PATH, {});
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return !!(locks[rel] && locks[rel].sessions && locks[rel].sessions.includes(sessionId));
}

// ─── Prompt history ───────────────────────────────────────────────────────────
function addToHistory(prompt) {
  const history = readJSON(HISTORY_PATH, []);
  const updated = [prompt, ...history.filter(p => p !== prompt)].slice(0, 200);
  writeJSON(HISTORY_PATH, updated);
}

// ─── SPACE event logging ──────────────────────────────────────────────────────
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

// ─── Session name generation ──────────────────────────────────────────────────
const STOP_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','that','this','these','those','it','its','i','you','he','she','we','they','what','which','who','how','when','where','why','not','no','nor','so','yet','both','either','neither','just','also','then','than','as','if','though','although','because','since','unless','while','after','before']);

function generateSessionName(prompt) {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  return words.slice(0, 7).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'New Session';
}

// ─── Spawn Claude session ────────────────────────────────────────────────────
function spawnClaude(sessionId, prompt, workDir, resumeId = null, model = null) {
  const session = sessions.get(sessionId);
  if (!session) return;

  addToHistory(prompt);

  const config = readConfig();
  if (!config.openRouterApiKey) {
    broadcast({ type: 'line', sessionId, text: 'No OpenRouter API key configured. Add one in Settings.', role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
    return;
  }

  const args = ['--output-format', 'stream-json', '--verbose'];
  if (resumeId) args.push('--resume', resumeId);
  const effectiveModel = model || config.openRouterFloorModel || 'openrouter/auto';
  args.push('--model', effectiveModel);
  args.push('--append-system-prompt', buildSystemPrompt(config));
  args.push('-p', prompt);

  const spawnEnv = { ...process.env,
    ANTHROPIC_BASE_URL:   'https://openrouter.ai/api',
    ANTHROPIC_AUTH_TOKEN: config.openRouterApiKey,
    ANTHROPIC_API_KEY:    '',
  };

  const keyPreview = config.openRouterApiKey ? config.openRouterApiKey.slice(0, 12) + '…' : 'MISSING';
  broadcast({ type: 'line', sessionId, text: `[spawn] model=${effectiveModel} base=${spawnEnv.ANTHROPIC_BASE_URL} token=${keyPreview}`, role: 'system' });
  broadcast({ type: 'line', sessionId, text: prompt, role: 'user' });
  console.log(`[spawn] model=${effectiveModel} base=${spawnEnv.ANTHROPIC_BASE_URL} token=${keyPreview} workDir=${workDir}`);

  const proc = spawn('claude', args, {
    cwd: workDir,
    env: spawnEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  session.proc    = proc;
  session.status  = 'running';
  session.startAt = Date.now();

  let lineBuffer = '';

  proc.stdout.on('data', chunk => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleStreamEvent(sessionId, msg);
      } catch {
        broadcast({ type: 'line', sessionId, text: line, role: 'assistant' });
      }
    }
  });

  proc.on('error', err => {
    broadcast({ type: 'line', sessionId, text: `Failed to start Claude: ${err.message}`, role: 'error' });
    broadcast({ type: 'session-status', sessionId, status: 'error' });
  });

  proc.stderr.on('data', chunk => {
    broadcast({ type: 'line', sessionId, text: chunk.toString(), role: 'error' });
  });

  proc.on('close', code => {
    const s = sessions.get(sessionId);
    if (s) {
      s.status = code === 0 ? 'done' : 'error';
      s.endAt  = Date.now();
      if (s.projectName) {
        const duration = s.endAt - (s.startAt || s.endAt);
        if (code === 0) spaceAppendEvent(s.projectName, { type: 'session-done', sessionId, duration, outputTokens: s.outputTokens || 0 });
        else            spaceAppendEvent(s.projectName, { type: 'session-error', sessionId, duration });
      }
    }
    broadcast({ type: 'session-status', sessionId, status: code === 0 ? 'done' : 'error' });
  });

  // Watch for file changes in working directory
  const watcher = watchSessionFiles(sessionId, workDir);
  if (watcher) session.watcher = watcher;

  // Auto-kill at 10-minute timeout (for routines and runaway sessions)
  session.timeout = setTimeout(() => {
    if (proc && !proc.killed) {
      proc.kill();
      broadcast({ type: 'line', sessionId, text: 'Session killed — 10 minute timeout reached.', role: 'error' });
    }
  }, 10 * 60 * 1000);
}

function handleStreamEvent(sessionId, msg) {
  if (!msg || !msg.type) return;

  if (msg.type === 'assistant' && msg.message && msg.message.content) {
    const s = sessions.get(sessionId);
    if (s && !s.firstOutputAt) {
      s.firstOutputAt = Date.now();
      if (s.projectName) spaceAppendEvent(s.projectName, { type: 'first-output', sessionId, elapsed: s.firstOutputAt - (s.startAt || s.firstOutputAt) });
    }
    for (const block of msg.message.content) {
      if (block.type === 'text') {
        broadcast({ type: 'line', sessionId, text: block.text, role: 'assistant' });
      }
    }
  }

  if (msg.type === 'result') {
    const s = sessions.get(sessionId);
    if (s) {
      if (msg.usage) s.outputTokens = msg.usage.output_tokens || 0;
      if (msg.session_id) s.claudeSessionId = msg.session_id;
    }
    broadcast({ type: 'context-usage', sessionId, usage: msg.usage, claudeSessionId: msg.session_id || null });
  }
}


// ─── Spawn DeepSeek chat session ─────────────────────────────────────────────
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
          session.chatBuffer = parts.pop();
          for (const part of parts) {
            if (part.trim()) broadcast({ type: 'line', sessionId, text: part, role: 'assistant' });
          }
        } catch {}
      }
    });
    res.on('end', () => {
      const rem = (session.chatBuffer || '').trim();
      if (rem) broadcast({ type: 'line', sessionId, text: rem, role: 'assistant' });
      session.chatBuffer = '';
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

// ─── HTTP server ──────────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(MOCKUP_DEST, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Could not load mockup.html from AppData');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
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

// ─── WebSocket message handler ────────────────────────────────────────────────
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
    sessions.set(id, { id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: msg.model || null, isChat: false, status: 'running', startAt: Date.now(), proc: null, watcher: null, timeout: null, lines: [], lastPrompt: prompt, claudeSessionId: null });

    broadcast({ type: 'session-created', sessionId: id, name, workDir: effectiveWorkDir, projectName: projectName || null, model: msg.model || null });
    saveSessions();
    if (projectName) spaceAppendEvent(projectName, { type: 'session-launch', sessionId: id, concurrentCount: sessions.size });
    spawnClaude(id, prompt, effectiveWorkDir, null, msg.model || null);
    return;
  }

  if (type === 'resume') {
    const { sessionId, prompt, displayPrompt, resumeId, model } = msg;
    const session = sessions.get(sessionId);
    if (!session) return sendTo(ws, { type: 'error', text: 'Session not found' });
    session.status = 'running';
    session.lastPrompt = prompt;
    broadcast({ type: 'line', sessionId, text: displayPrompt || prompt, role: 'user' });
    broadcast({ type: 'session-status', sessionId, status: 'running' });
    if (session.isChat) {
      spawnChat(sessionId, prompt, readConfig());
    } else {
      spawnClaude(sessionId, prompt, session.workDir, resumeId, model || null);
    }
    return;
  }

  if (type === 'stop') {
    const session = sessions.get(msg.sessionId);
    if (session) {
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
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/models',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
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
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/models',
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
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
    const { model, tier } = msg;
    const config = readConfig();
    const apiKey = config.openRouterApiKey;
    console.log(`[test-model] Testing ${tier} tier — model: ${model}`);
    if (!model) {
      sendTo(ws, { type: 'test-model-result', tier, ok: false, message: 'No model string entered' });
      return;
    }
    if (!apiKey) {
      sendTo(ws, { type: 'test-model-result', tier, ok: false, message: 'No OpenRouter API key configured' });
      return;
    }
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 16, stream: true });
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        console.log(`[test-model] ${tier} (${model}) → HTTP ${res.statusCode}: ${raw.slice(0, 500)}`);
        if (res.statusCode === 200) {
          const firstLine = raw.split('\n').find(l => l.startsWith('data:') && !l.includes('[DONE]'));
          if (firstLine) {
            try {
              const data = JSON.parse(firstLine.slice(5).trim());
              if (data.type || data.choices) {
                sendTo(ws, { type: 'test-model-result', tier, ok: true, message: `Model valid — streaming works (${model})`, detail: null });
              } else {
                sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `Streaming response malformed — model may not support Anthropic streaming`, detail: raw.slice(0, 500) });
              }
            } catch {
              sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `Streaming response not valid JSON — model likely incompatible`, detail: raw.slice(0, 500) });
            }
          } else {
            sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `HTTP 200 but no SSE data received — model may not support Anthropic streaming`, detail: raw.slice(0, 500) });
          }
        } else if (res.statusCode === 401) {
          sendTo(ws, { type: 'test-model-result', tier, ok: false, message: 'Invalid API key (401)', detail: raw.slice(0, 500) });
        } else if (res.statusCode === 404) {
          sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `Model not found (404) — check the model ID`, detail: raw.slice(0, 500) });
        } else {
          try {
            const data = JSON.parse(raw);
            const detail = data?.error?.message || raw.slice(0, 500);
            sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `HTTP ${res.statusCode}: ${detail}`, detail: raw.slice(0, 500) });
          } catch {
            sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `HTTP ${res.statusCode}: ${raw.slice(0, 100)}`, detail: raw.slice(0, 500) });
          }
        }
      });
    });
    req.on('error', err => {
      console.log(`[test-model] ${tier} connection error: ${err.message}`);
      sendTo(ws, { type: 'test-model-result', tier, ok: false, message: `Connection error: ${err.message}` });
    });
    req.write(body);
    req.end();
    return;
  }

  if (type === 'get-space-data') {
    const { projectName } = msg;
    sendTo(ws, { type: 'space-data', projectName, scores: spaceComputeScores(projectName) });
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

  if (type === 'open-url') {
    const { url } = msg;
    if (url && url.startsWith('https://')) {
      exec(`start "" "${url}"`);
    }
    return;
  }

  if (type === 'save-config') {
    const current = readJSON(CONFIG_PATH, {});
    const updates = { ...msg.config };
    for (const key of SENSITIVE_KEYS) {
      if (updates[key] === SECRET_MASK || updates[key] === undefined) {
        delete updates[key];
      } else if (updates[key]) {
        updates[key] = encryptSecret(updates[key]);
      }
    }
    writeJSON(CONFIG_PATH, { ...current, ...updates });
    sendTo(ws, { type: 'config-saved' });
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
    sendTo(ws, { type: 'versions', versions: getVersions() });
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

  if (type === 'obsidian-up') {
    const { sessionName, content } = msg;
    const config = readConfig();
    const vaultPath = config.obsidianVaultPath;
    if (!vaultPath) {
      sendTo(ws, { type: 'error', text: 'No Obsidian vault path configured. Open Settings to set one.' });
      return;
    }
    try {
      const dir = path.join(vaultPath, 'Polaris_Build');
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
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[polaris] HTTP server listening on http://127.0.0.1:${PORT}`);
  migrateSecretsToEncrypted();
  syncGlobalToProjects();
  watchGlobalFiles();
});

wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[polaris] WebSocket client connected');

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
      lines: (s.lines || []).slice(-500),
    })),
    history: readJSON(HISTORY_PATH, []),
    config:  maskedConfig(readConfig()),
    protectedPatterns: (readConfig().protectedPatterns || ['*.md']),
  });

  ws.on('message', raw => handleMessage(ws, raw));
  ws.on('close', () => console.log('[polaris] WebSocket client disconnected'));
  ws.on('error', err => console.error('[polaris] WebSocket error:', err));
});

wss.on('error', err => console.error('[polaris] WSS error:', err));
