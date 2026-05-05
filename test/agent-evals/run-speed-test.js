#!/usr/bin/env node
'use strict';

// Polaris agent speed test — repeatable perf benchmark.
//
// Runs each (fixture x tier) cell N times, aggregates median/p95 latency,
// iteration count, token usage, and tool-call counts. Writes a markdown
// scorecard to test/agent-evals/results/speed-<timestamp>.md.
//
// Usage:
//   node test/agent-evals/run-speed-test.js
//   node test/agent-evals/run-speed-test.js --runs 3 --tiers floor,balanced
//   node test/agent-evals/run-speed-test.js --fixtures 01,03 --runs 5
//
// Requires Polaris server running on port 40000 (or POLARIS_PORT).

const fs = require('fs');
const path = require('path');
const { runOne, loadFixture, listFixtures } = require('./runner');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) { out[a.slice(2)] = true; }
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function p95(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

async function main() {
  const argv = parseArgs();
  const runs = Math.max(1, parseInt(argv.runs || '3', 10));
  const tiers = String(argv.tiers || 'floor').split(',').map(s => s.trim()).filter(Boolean);

  const fixtureDir = path.join(__dirname, 'fixtures');
  const all = listFixtures(fixtureDir);
  const filter = argv.fixtures ? String(argv.fixtures).split(',').map(s => s.trim()) : null;
  const selected = filter ? all.filter(f => filter.some(p => f.startsWith(p) || f.includes(p))) : all;

  if (!selected.length) {
    console.error(`No fixtures matched filter=${argv.fixtures || '(none)'}`);
    process.exit(2);
  }

  const totalCells = selected.length * tiers.length * runs;
  console.log(`[speed] runs/cell=${runs} tiers=[${tiers.join(',')}] fixtures=${selected.length} total runs=${totalCells}\n`);

  const cells = [];
  for (const f of selected) {
    const fix = loadFixture(path.join(fixtureDir, f));
    for (const tier of tiers) {
      const samples = [];
      for (let i = 0; i < runs; i++) {
        process.stdout.write(`  ${pad(fix.id, 30)} ${pad(tier, 9)} run ${i + 1}/${runs} ... `);
        const t0 = Date.now();
        let r;
        try { r = await runOne(fix, { tier }); }
        catch (e) {
          console.log(`HARNESS ERROR (${e.message})`);
          samples.push({ pass: false, trace: null, elapsedMs: Date.now() - t0, errors: [e.message] });
          continue;
        }
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`${r.pass ? 'PASS' : 'FAIL'} (${dt}s, iters=${r.trace?.finalIters ?? '?'})`);
        samples.push(r);
      }

      const passes = samples.filter(s => s.pass).length;
      const lat = samples.map(s => (s.trace?.finishedAt != null ? s.trace.finishedAt : s.elapsedMs / 1000));
      const tin = samples.map(s => s.trace?.tokens.in || 0);
      const tout = samples.map(s => s.trace?.tokens.out || 0);
      const iters = samples.map(s => s.trace?.finalIters || 0);
      const tools = samples.map(s => s.trace?.tools.length || 0);

      cells.push({
        fixture: fix.id,
        tier,
        runs,
        passes,
        latencyMedian: median(lat),
        latencyP95: p95(lat),
        itersMedian: median(iters),
        tokensInMedian: median(tin),
        tokensOutMedian: median(tout),
        toolCallsMedian: median(tools),
        failures: samples.filter(s => !s.pass).map(s => s.errors || []).flat(),
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..*/, '');
  const out = [];
  out.push(`# Polaris agent speed test - ${stamp}`);
  out.push('');
  out.push(`runs/cell: ${runs} | tiers: ${tiers.join(', ')} | fixtures: ${selected.length}`);
  out.push('');
  out.push('| Fixture | Tier | Pass | Latency med (s) | Latency p95 (s) | Iters med | Tokens in med | Tokens out med | Tool calls med |');
  out.push('|---|---|---|---:|---:|---:|---:|---:|---:|');
  for (const c of cells) {
    out.push(`| ${c.fixture} | ${c.tier} | ${c.passes}/${c.runs} | ${c.latencyMedian.toFixed(2)} | ${c.latencyP95.toFixed(2)} | ${c.itersMedian} | ${c.tokensInMedian} | ${c.tokensOutMedian} | ${c.toolCallsMedian} |`);
  }
  const failingCells = cells.filter(c => c.passes < c.runs);
  if (failingCells.length) {
    out.push('');
    out.push('## Failures');
    for (const c of failingCells) {
      out.push(`- **${c.fixture}** / ${c.tier} (${c.runs - c.passes}/${c.runs} failed)`);
      const seen = new Set();
      for (const e of c.failures) {
        if (seen.has(e)) continue;
        seen.add(e);
        out.push(`  - ${e}`);
      }
    }
  }
  const md = out.join('\n') + '\n';
  console.log('\n' + md);

  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `speed-${stamp}.md`);
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch(e => { console.error(`harness fatal: ${e.message}`); process.exit(2); });
