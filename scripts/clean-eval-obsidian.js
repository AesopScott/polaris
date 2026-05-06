#!/usr/bin/env node
'use strict';

// Clean up 5-Agentic-Benchmark.md after a partial / interrupted run:
//
//   - Build the agent-eval-models queue from models that had network
//     errors only (and no real evaluation) — these need a retry.
//   - Rewrite ## Results section so it ONLY contains rows for cells with
//     real model evaluation (pass / genuine fail / text-only). Drops
//     rows that were pure network failure, dead-slug 4xx, or
//     comment-corrupted "model id with #" attempts.
//
// Categorization per cell:
//   - real        : finished, called tools (real assertion-level result)
//   - text_only   : finished but called no tools (model responded in
//                   prose; counts as a real "model can't drive agent
//                   loop" data point)
//   - network     : ENOTFOUND / ECONNREFUSED / ECONNRESET — retry
//   - http_4xx    : dead slug or model rejected request — drop
//   - http_5xx    : upstream broken — could retry
//   - empty       : EMPTY_RESPONSE without other classification
//   - skip        : model id contained `#` (broken retry-queue cell)
//
// Usage:
//   node scripts/clean-eval-obsidian.js          # writes to Obsidian
//   node scripts/clean-eval-obsidian.js --dry    # prints summary only

const fs = require('fs');
const path = require('path');
const os = require('os');

const APPDATA = process.env.APPDATA || os.homedir();
const POLARIS_DIR = path.join(APPDATA, '.claude', 'polaris');
const LOGS_DIR = path.join(POLARIS_DIR, 'logs');
const CFG_PATH = path.join(POLARIS_DIR, 'config.json');
const dry = process.argv.includes('--dry') || process.argv.includes('--dry-run');

const AGENT_EVAL_FIXTURES = {
  '01-implement-imperative': { expect: { tools_called: ['Read', 'Edit'], min_tool_calls: 2, max_iters: 6, max_seconds: 60 } },
  '02-querymemory-fallback': { expect: { tools_called: ['Read'], min_tool_calls: 1, max_iters: 5, max_seconds: 45 } },
  '03-basic-read':           { expect: { tools_called: ['Read'], min_tool_calls: 1, max_iters: 4, max_seconds: 30 } },
};

function parseDiag(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  const blocks = text.split(/^=== DIAG /m).filter(b => b.trim());
  if (!blocks.length) return null;
  const lines = blocks[blocks.length - 1].split('\n');
  const out = { model: null, tools: [], tokens: { in: 0, out: 0 }, finishedAt: null, finalIters: 0, error: null, emptyResponse: null };
  let curIter = 0;
  for (const l of lines) {
    if (l.startsWith('MODEL: ')) out.model = l.slice(7).trim();
    const m = l.match(/^\[\+([\d.]+)s\]\s+(\w+)(?::\s?(.*))?$/);
    if (!m) continue;
    const [, , label, body] = m;
    const b = body || '';
    switch (label) {
      case 'ITER': curIter = parseInt(b, 10) || curIter; break;
      case 'TOKENS': { const tm = b.match(/in=(\d+)\s+out=(\d+)/); if (tm) { out.tokens.in += +tm[1]; out.tokens.out += +tm[2]; } break; }
      case 'TOOL': { const tm = b.match(/^(\S+)/); out.tools.push({ name: tm ? tm[1] : b.trim() }); break; }
      case 'EMPTY_RESPONSE': out.emptyResponse = b; break;
      case 'ERROR': out.error = b; break;
      case 'DONE': { const dm = b.match(/^([\d.]+)s\s+iters=(\d+)/); if (dm) { out.finishedAt = +dm[1]; out.finalIters = +dm[2]; } break; }
    }
  }
  if (!out.finalIters) out.finalIters = curIter;
  return out;
}

function fixtureFromFilename(f) { const m = f.match(/diag-eval_(\d{2}-[a-z-]+)_/); return m ? m[1] : null; }

function categorize(t) {
  if (t.model && t.model.includes('#')) return 'skip';
  const e = (t.error || '') + ' ' + (t.emptyResponse || '');
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|getaddrinfo|socket hang up/i.test(e)) return 'network';
  if (/HTTP 4\d\d/i.test(e)) return 'http_4xx';
  if (/HTTP 5\d\d/i.test(e)) return 'http_5xx';
  if (t.emptyResponse) return 'empty';
  if (t.finishedAt == null && t.error) return 'error_other';
  if (t.tools.length > 0) return 'real';
  if (t.finishedAt != null) return 'text_only';
  return 'incomplete';
}

function applyAssertions(trace, fixtureId) {
  const fix = AGENT_EVAL_FIXTURES[fixtureId];
  if (!fix) return false;
  const e = fix.expect;
  if (e.session_status === 'done' && trace.finishedAt == null) return false;
  if (typeof e.max_iters === 'number' && trace.finalIters > e.max_iters) return false;
  if (typeof e.max_seconds === 'number' && trace.finishedAt != null && trace.finishedAt > e.max_seconds) return false;
  if (Array.isArray(e.tools_called)) {
    const called = trace.tools.map(t => t.name);
    for (const need of e.tools_called) if (!called.includes(need)) return false;
  }
  if (typeof e.min_tool_calls === 'number' && trace.tools.length < e.min_tool_calls) return false;
  if (trace.error || trace.emptyResponse) return false;
  return true;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// ─── Walk diag files ──────────────────────────────────────────────────────────
const files = fs.readdirSync(LOGS_DIR).filter(f => f.startsWith('diag-eval_') && f.endsWith('.txt'));
const cells = [];
for (const f of files) {
  const t = parseDiag(path.join(LOGS_DIR, f));
  if (!t || !t.model) continue;
  const fix = fixtureFromFilename(f);
  if (!fix) continue;
  const cat = categorize(t);
  if (cat === 'skip') continue;
  cells.push({
    model: t.model, fixture: fix, category: cat, trace: t,
    pass: cat === 'real' && applyAssertions(t, fix),
    elapsedMs: (t.finishedAt || 0) * 1000,
  });
}

// ─── Per-model categorization ─────────────────────────────────────────────────
const byModel = new Map();
for (const c of cells) {
  if (!byModel.has(c.model)) byModel.set(c.model, []);
  byModel.get(c.model).push(c);
}

const retryQueue = [];        // models with network errors that need retrying
const realDataModels = [];    // models with at least one cell that was a real evaluation
const deadSlugModels = [];    // models with only 4xx — never going to work
for (const [model, mc] of byModel) {
  const cats = mc.map(c => c.category);
  const hasNetwork = cats.includes('network');
  const hasReal    = cats.includes('real') || cats.includes('text_only');
  const allDead    = cats.every(c => c === 'http_4xx' || c === 'http_5xx');
  if (hasReal) realDataModels.push(model);
  if (hasNetwork) retryQueue.push(model);
  if (allDead && !hasReal && !hasNetwork) deadSlugModels.push(model);
}

console.log(`Total cells: ${cells.length}`);
console.log(`Unique models seen: ${byModel.size}`);
console.log(`Models with real evaluation data: ${realDataModels.length}`);
console.log(`Models with network errors (retry queue): ${retryQueue.length}`);
console.log(`Models with only 4xx (dead slugs): ${deadSlugModels.length}`);

// ─── Build new Results section (only real-data cells) ─────────────────────────
const realCells = cells.filter(c => c.category === 'real' || c.category === 'text_only');
const groups = new Map();
for (const c of realCells) {
  const key = `${c.model}__${c.fixture}`;
  if (!groups.has(key)) groups.set(key, { model: c.model, fixture: c.fixture, runs: [] });
  groups.get(key).runs.push(c);
}

const stamp = new Date().toISOString().slice(0, 19);
const passes = realCells.filter(c => c.pass).length;
const realFails = realCells.length - passes;
const out = [];
out.push('');
out.push(`### Run ${stamp} (cleaned — real evaluations only)`);
out.push(`Filtered to cells where the model actually responded. Network errors,`);
out.push(`dead-slug 4xx errors, and empty-response cells stripped to keep the`);
out.push(`table honest. ${passes}/${realCells.length} cells passed · ${realFails} real failures.`);
out.push('');
out.push('| Model | Fixture | Pass | Latency med (s) | Iters med | Tokens out med | Tools used |');
out.push('|---|---|---|---:|---:|---:|---|');
const sorted = [...groups.values()].sort((a, b) => (a.model + a.fixture).localeCompare(b.model + b.fixture));
for (const g of sorted) {
  const lats = g.runs.map(r => r.trace.finishedAt || 0);
  const iters = g.runs.map(r => r.trace.finalIters || 0);
  const toks = g.runs.map(r => r.trace.tokens.out || 0);
  const passCount = g.runs.filter(r => r.pass).length;
  const tools = [...new Set(g.runs.flatMap(r => r.trace.tools.map(t => t.name)))].join(', ') || '—';
  out.push(`| \`${g.model}\` | ${g.fixture} | ${passCount}/${g.runs.length} | ${median(lats).toFixed(2)} | ${median(iters)} | ${median(toks)} | ${tools} |`);
}
out.push('');
out.push(`### Models needing retry (${retryQueue.length})`);
out.push('These models had network errors during the run and were not fully evaluated. They are now in the queue for re-running.');
out.push('');
for (const m of retryQueue) out.push(`- \`${m}\``);
out.push('');
out.push(`### Dead slugs dropped (${deadSlugModels.length})`);
out.push('These models returned only HTTP 4xx — likely retired model ids or wrong namespace. Removed from active queue.');
out.push('');
for (const m of deadSlugModels) out.push(`- \`${m}\``);
out.push('');
const resultsBlock = out.join('\n');

// ─── Write to Obsidian ────────────────────────────────────────────────────────
if (dry) {
  console.log('\n--- DRY RUN, NOT WRITING ---\n');
  console.log(resultsBlock);
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const proj = (cfg.projects || []).find(p => p.obsidianDir);
if (!proj) { console.error('No project with obsidianDir configured'); process.exit(1); }
const obsidianFile = path.join(proj.obsidianDir, '5-Agentic-Benchmark.md');
let content = fs.readFileSync(obsidianFile, 'utf8');

// Replace agent-eval-models block with the retry queue (clean ids, no inline #)
const newQueue = [
  '# Retry queue — models with network errors that need re-evaluation.',
  `# ${retryQueue.length} models. Auto-generated by scripts/clean-eval-obsidian.js.`,
  '',
  ...retryQueue,
];
content = content.replace(/```agent-eval-models\n[\s\S]*?```/, '```agent-eval-models\n' + newQueue.join('\n') + '\n```');

// Replace the Results section entirely with the cleaned version
if (/^##\s+Results\b/m.test(content)) {
  // Find ## Results section and replace from there to end of file (or next ## section if any)
  content = content.replace(/^##\s+Results\b[\s\S]*$/m, `## Results${resultsBlock}`);
} else {
  content = content.trimEnd() + '\n\n## Results' + resultsBlock;
}

fs.writeFileSync(obsidianFile, content, 'utf8');
console.log(`\nWrote cleaned 5-Agentic-Benchmark.md`);
console.log(`  Queue: ${retryQueue.length} retry models`);
console.log(`  Results table: ${realCells.length} cells, ${groups.size} (model x fixture) rows`);
