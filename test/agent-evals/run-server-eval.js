#!/usr/bin/env node
'use strict';

// Drives the server-side Agent Eval runner via WS. Used to validate 1.0.104
// before the Settings UI panel (1.0.105) lands.
//
// Usage:
//   node test/agent-evals/run-server-eval.js --models deepseek/deepseek-chat-v3-0324,anthropic/claude-haiku-4-5
//   node test/agent-evals/run-server-eval.js --queue                                  # uses 5-Agentic-Benchmark.md
//   node test/agent-evals/run-server-eval.js --queue --fixtures 03 --runs 1          # subset
//
// Requires Polaris running on 40000 (POLARIS_PORT to override).

const WebSocket = require('ws');

const port = Number(process.env.POLARIS_PORT) || 40000;

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

async function main() {
  const argv = parseArgs();
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  let models = [];
  if (argv.queue) {
    const queue = await new Promise((resolve, reject) => {
      const handler = raw => {
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (m.type === 'agent-eval-queue') { ws.off('message', handler); resolve(m); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ type: 'agent-eval-load-queue' }));
      setTimeout(() => reject(new Error('queue load timeout')), 5000);
    });
    if (queue.error) { console.error('queue error:', queue.error); process.exit(1); }
    models = queue.models;
    console.log(`[server-eval] loaded ${models.length} models from 5-Agentic-Benchmark.md`);
  } else if (argv.models) {
    models = String(argv.models).split(',').map(s => s.trim()).filter(Boolean);
  } else {
    console.error('Specify --models a,b,c or --queue');
    process.exit(1);
  }

  const fixtures = argv.fixtures ? String(argv.fixtures).split(',').map(s => s.trim()) : null;
  const runs = Math.max(1, parseInt(argv.runs || '1', 10));

  console.log(`[server-eval] models=${models.length} fixtures=${fixtures || 'all'} runs=${runs}\n`);

  const allResults = [];
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'agent-eval-cell-result') {
      const tag = msg.pass ? 'PASS' : 'FAIL';
      const tools = (msg.trace?.tools || []).join(',') || '(none)';
      const tin = msg.trace?.tokens?.in ?? 0;
      const tout = msg.trace?.tokens?.out ?? 0;
      console.log(`  [${msg.completed}/${msg.totalCells}] ${msg.fixtureId} / ${msg.model} (run ${msg.runIndex + 1}) ${tag} ${(msg.elapsedMs/1000).toFixed(1)}s tools=[${tools}] tokens=${tin}/${tout}`);
      if (!msg.pass) for (const e of msg.errors) console.log(`        - ${e}`);
      allResults.push(msg);
    } else if (msg.type === 'agent-eval-complete') {
      const passed = allResults.filter(r => r.pass).length;
      console.log(`\n[server-eval] ${passed}/${allResults.length} passed${msg.cancelled ? ' (cancelled)' : ''}`);
      ws.close();
      process.exit(passed === allResults.length && !msg.cancelled ? 0 : 1);
    } else if (msg.type === 'agent-eval-error') {
      console.error('agent-eval-error:', msg.message);
      ws.close();
      process.exit(2);
    }
  });

  ws.send(JSON.stringify({ type: 'start-agent-eval', models, fixtures, runs }));
}

main().catch(e => { console.error('fatal:', e.message); process.exit(2); });
