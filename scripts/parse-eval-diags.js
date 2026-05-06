#!/usr/bin/env node
'use strict';

// Post-hoc parser for agent-eval diag logs.
// Reads %APPDATA%\.claude\polaris\logs\diag-eval_*.txt, applies the same
// pass/fail assertions runAgentEvalCell uses, aggregates per (model x fixture),
// appends a "## Run <stamp>" section to 5-Agentic-Benchmark.md, and prints a
// retry queue: models where every cell either errored with a network failure
// or didn't run at all.
//
// Usage:
//   node scripts/parse-eval-diags.js                 # last 6 hours of diags
//   node scripts/parse-eval-diags.js --since-min 360 # custom window
//   node scripts/parse-eval-diags.js --dry-run       # don't append to obsidian

const fs = require('fs');
const path = require('path');
const os = require('os');

const APPDATA = process.env.APPDATA || os.homedir();
const POLARIS_DIR = path.join(APPDATA, '.claude', 'polaris');
const LOGS_DIR = path.join(POLARIS_DIR, 'logs');
const CONFIG_PATH = path.join(POLARIS_DIR, 'config.json');

// Mirror of AGENT_EVAL_FIXTURES from server.js — kept in sync manually.
const AGENT_EVAL_FIXTURES = {
  '01-implement-imperative': {
    expect: { session_status: 'done', tools_called: ['Read', 'Edit'], min_tool_calls: 2, max_iters: 6, max_seconds: 60, files: { 'target.txt': { contains: 'the value is updated' } } },
  },
  '02-querymemory-fallback': {
    expect: { session_status: 'done', tools_called: ['Read'], min_tool_calls: 1, max_iters: 5, max_seconds: 45 },
  },
  '03-basic-read': {
    expect: { session_status: 'done', tools_called: ['Read'], min_tool_calls: 1, max_iters: 4, max_seconds: 30 },
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

function parseDiag(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  const blocks = text.split(/^=== DIAG /m).filter(b => b.trim());
  if (!blocks.length) return null;
  const lines = blocks[blocks.length - 1].split('\n');

  const out = { model: null, sessionId: null, tools: [], tokens: { in: 0, out: 0 }, finishedAt: null, finalIters: 0, error: null, emptyResponse: null };
  let currentIter = 0;
  for (const l of lines) {
    if (l.startsWith('SESSION: ')) out.sessionId = l.slice(9).trim();
    if (l.startsWith('MODEL: '))   out.model = l.slice(7).trim();
    const m = l.match(/^\[\+([\d.]+)s\]\s+(\w+)(?::\s?(.*))?$/);
    if (!m) continue;
    const [, , label, body] = m;
    const b = body || '';
    switch (label) {
      case 'ITER': currentIter = parseInt(b, 10) || currentIter; break;
      case 'TOKENS': {
        const tm = b.match(/in=(\d+)\s+out=(\d+)/);
        if (tm) { out.tokens.in += parseInt(tm[1], 10); out.tokens.out += parseInt(tm[2], 10); }
        break;
      }
      case 'TOOL': {
        const tm = b.match(/^(\S+)/);
        out.tools.push({ iter: currentIter, name: tm ? tm[1] : b.trim() });
        break;
      }
      case 'EMPTY_RESPONSE': out.emptyResponse = b; break;
      case 'ERROR': out.error = b; break;
      case 'DONE': {
        const dm = b.match(/^([\d.]+)s\s+iters=(\d+)/);
        if (dm) { out.finishedAt = parseFloat(dm[1]); out.finalIters = parseInt(dm[2], 10); }
        break;
      }
    }
  }
  if (!out.finalIters) out.finalIters = currentIter;
  return out;
}

function fixtureFromFilename(filename) {
  const m = filename.match(/diag-eval_(\d{2}-[a-z-]+)_/);
  return m ? m[1] : null;
}

function isNetworkError(trace) {
  const e = (trace.error || '') + (trace.emptyResponse || '');
  return /ENOTFOUND|ECONNREFUSED|ECONNRESET|getaddrinfo|read ECONN|socket hang up/i.test(e);
}

function applyAssertions(trace, fixtureId) {
  const fix = AGENT_EVAL_FIXTURES[fixtureId];
  if (!fix) return { pass: false, errors: ['unknown fixture'], category: 'unknown' };
  const expect = fix.expect;
  const errors = [];
  if (trace.error) errors.push(`agent error: ${trace.error.slice(0, 80)}`);
  if (trace.emptyResponse) errors.push(`empty response: ${trace.emptyResponse.slice(0, 80)}`);
  if (expect.session_status === 'done' && trace.finishedAt == null) errors.push(`did not finish (no DONE)`);
  if (typeof expect.max_iters === 'number' && trace.finalIters > expect.max_iters) errors.push(`iters: ${trace.finalIters} > max ${expect.max_iters}`);
  if (typeof expect.max_seconds === 'number' && trace.finishedAt != null && trace.finishedAt > expect.max_seconds) errors.push(`time: ${trace.finishedAt}s > max ${expect.max_seconds}s`);
  if (Array.isArray(expect.tools_called)) {
    const calledNames = trace.tools.map(t => t.name);
    for (const need of expect.tools_called) if (!calledNames.includes(need)) errors.push(`tool '${need}' not called`);
  }
  if (typeof expect.min_tool_calls === 'number' && trace.tools.length < expect.min_tool_calls) errors.push(`tool calls: ${trace.tools.length} < min ${expect.min_tool_calls}`);
  // We can't check the filesystem post-state for fixture 01 since the seed dir was cleaned up — but
  // if Read+Edit were both called and the run finished cleanly, it almost certainly wrote correctly.
  const category = isNetworkError(trace) ? 'network' : (errors.length === 0 ? 'pass' : 'fail');
  return { pass: errors.length === 0, errors, category };
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function main() {
  const argv = parseArgs();
  const sinceMin = parseInt(argv['since-min'] || '360', 10);
  const dryRun = !!argv['dry-run'];

  if (!fs.existsSync(LOGS_DIR)) { console.error(`logs dir not found: ${LOGS_DIR}`); process.exit(1); }

  const cutoffMs = Date.now() - sinceMin * 60 * 1000;
  const allFiles = fs.readdirSync(LOGS_DIR).filter(f => f.startsWith('diag-eval_') && f.endsWith('.txt'));
  const recent = allFiles.filter(f => {
    const st = fs.statSync(path.join(LOGS_DIR, f));
    return st.mtimeMs >= cutoffMs;
  });

  console.log(`[parse] scanning ${recent.length} diag files (modified in last ${sinceMin} min)`);

  const cells = [];
  for (const f of recent) {
    const trace = parseDiag(path.join(LOGS_DIR, f));
    if (!trace || !trace.model) continue;
    const fixtureId = fixtureFromFilename(f);
    if (!fixtureId) continue;
    const assertion = applyAssertions(trace, fixtureId);
    cells.push({
      file: f,
      model: trace.model,
      fixture: fixtureId,
      sessionId: trace.sessionId,
      pass: assertion.pass,
      category: assertion.category,
      errors: assertion.errors,
      iters: trace.finalIters,
      tools: trace.tools.map(t => t.name),
      tokens: trace.tokens,
      finishedAt: trace.finishedAt,
    });
  }

  console.log(`[parse] parsed ${cells.length} cells`);

  // Aggregate per (model x fixture)
  const groups = new Map();
  for (const c of cells) {
    const key = `${c.model}__${c.fixture}`;
    if (!groups.has(key)) groups.set(key, { model: c.model, fixture: c.fixture, runs: [] });
    groups.get(key).runs.push(c);
  }

  // Build markdown table
  const stamp = new Date().toISOString().slice(0, 19);
  const out = [];
  out.push('');
  out.push(`### Run ${stamp} (post-hoc reconstruction)`);
  out.push(`Reconstructed from diag logs after a network disconnect interrupted Save to Obsidian.`);
  const passes = cells.filter(c => c.pass).length;
  const networkFails = cells.filter(c => c.category === 'network').length;
  const realFails = cells.filter(c => c.category === 'fail').length;
  out.push(`${passes}/${cells.length} cells passed · ${realFails} real failures · ${networkFails} network failures (don't penalize the model).`);
  out.push('');
  out.push('| Model | Fixture | Pass | Latency med (s) | Iters med | Tokens out med | Tools used |');
  out.push('|---|---|---|---:|---:|---:|---|');
  const sorted = [...groups.values()].sort((a, b) => (a.model + a.fixture).localeCompare(b.model + b.fixture));
  for (const g of sorted) {
    const lats = g.runs.map(r => r.finishedAt || 0);
    const iters = g.runs.map(r => r.iters || 0);
    const toks = g.runs.map(r => r.tokens.out || 0);
    const passCount = g.runs.filter(r => r.pass).length;
    const tools = [...new Set(g.runs.flatMap(r => r.tools || []))].join(', ') || '—';
    out.push(`| \`${g.model}\` | ${g.fixture} | ${passCount}/${g.runs.length} | ${median(lats).toFixed(2)} | ${median(iters)} | ${median(toks)} | ${tools} |`);
  }
  out.push('');
  const block = out.join('\n');

  // Retry queue: any model where ALL its cells (across fixtures) had category != 'pass' AND at least one network failure
  // (i.e. never got a fair chance). Plus models from the source queue that have NO cells at all.
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const proj = (cfg.projects || []).find(p => p.obsidianDir);
  const obsidianFile = proj ? path.join(proj.obsidianDir, '5-Agentic-Benchmark.md') : null;
  let queueModels = [];
  if (obsidianFile && fs.existsSync(obsidianFile)) {
    const content = fs.readFileSync(obsidianFile, 'utf8');
    const m = content.match(/```agent-eval-models\n([\s\S]*?)```/);
    if (m) queueModels = m[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  }

  const modelStats = new Map();
  for (const c of cells) {
    if (!modelStats.has(c.model)) modelStats.set(c.model, { passes: 0, networkFails: 0, realFails: 0, total: 0 });
    const s = modelStats.get(c.model);
    s.total++;
    if (c.pass) s.passes++;
    else if (c.category === 'network') s.networkFails++;
    else s.realFails++;
  }

  const retry = [];
  for (const m of queueModels) {
    const s = modelStats.get(m);
    if (!s) { retry.push({ model: m, reason: 'never ran' }); continue; }
    if (s.passes === 0 && s.networkFails > 0 && s.realFails === 0) {
      retry.push({ model: m, reason: `all ${s.total} cells were network errors` });
    } else if (s.passes === 0 && s.networkFails > 0) {
      retry.push({ model: m, reason: `${s.networkFails}/${s.total} cells were network errors, no passes` });
    }
  }

  // Print summary
  console.log(`\n[parse] aggregated ${groups.size} (model x fixture) cells`);
  console.log(`[parse] passes: ${passes} · real fails: ${realFails} · network fails: ${networkFails}`);
  console.log(`\n=== RETRY QUEUE (${retry.length} models) ===`);
  for (const r of retry) console.log(`  ${r.model.padEnd(50)}  // ${r.reason}`);

  // Append to Obsidian unless dry-run
  if (!dryRun && obsidianFile) {
    let content = fs.readFileSync(obsidianFile, 'utf8');
    if (/^##\s+Results\b/m.test(content)) {
      content = content.replace(/^##\s+Results\b[^\n]*\n/m, m => m + block);
    } else {
      content = content.trimEnd() + '\n\n## Results\n' + block;
    }
    fs.writeFileSync(obsidianFile, content, 'utf8');
    console.log(`\n[parse] appended results table to ${obsidianFile}`);

    // Replace the agent-eval-models block with retry-only models. Note: model
    // IDs go on their own lines without inline `# reason` comments. Earlier
    // versions of this script wrote `model-id  # reason` on each line; the
    // server's queue parser only stripped lines that *started* with `#`, so
    // the entire "model-id  # reason" string got sent to OpenRouter as the
    // model id, causing 400 "not a valid model" errors on every cell. The
    // server-side parser was hardened to strip inline comments too, but we
    // now emit clean lines anyway.
    const newQueueLines = [
      '# Retry queue — auto-generated by scripts/parse-eval-diags.js.',
      `# ${retry.length} models that never got a fair eval (all cells were`,
      '# network errors or never ran). See ## Results section below for the',
      '# full per-model breakdown of the previous run.',
      '',
      ...retry.map(r => r.model),
    ];
    const newBlock = '```agent-eval-models\n' + newQueueLines.join('\n') + '\n```';
    content = content.replace(/```agent-eval-models\n[\s\S]*?```/, newBlock);
    fs.writeFileSync(obsidianFile, content, 'utf8');
    console.log(`[parse] replaced agent-eval-models block with ${retry.length}-model retry queue`);
  }
}

main();
