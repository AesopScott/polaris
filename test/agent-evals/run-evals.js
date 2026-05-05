#!/usr/bin/env node
'use strict';

// Polaris agent eval runner — single pass/fail report.
//
// Usage:
//   node test/agent-evals/run-evals.js                       # all fixtures, floor tier
//   node test/agent-evals/run-evals.js --fixtures 01,02      # by id prefix
//   node test/agent-evals/run-evals.js --tier balanced       # override tier
//
// Requires Polaris server running on port 40000 (or POLARIS_PORT).
// Exit code 0 if all pass, 1 if any fail, 2 on harness error.

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

async function main() {
  const argv = parseArgs();
  const fixtureDir = path.join(__dirname, 'fixtures');
  const all = listFixtures(fixtureDir);
  const filter = argv.fixtures ? String(argv.fixtures).split(',').map(s => s.trim()) : null;
  const selected = filter ? all.filter(f => filter.some(p => f.startsWith(p) || f.includes(p))) : all;

  if (!selected.length) {
    console.error(`No fixtures matched filter=${argv.fixtures || '(none)'}`);
    process.exit(2);
  }

  const tier = argv.tier || 'floor';
  console.log(`[evals] ${selected.length} fixture(s), tier=${tier}\n`);

  const results = [];
  for (const f of selected) {
    let fix;
    try { fix = loadFixture(path.join(fixtureDir, f)); }
    catch (e) { console.log(`  ${f} ... LOAD ERROR: ${e.message}`); continue; }
    process.stdout.write(`  ${fix.id} ... `);
    const t0 = Date.now();
    let r;
    try { r = await runOne(fix, { tier }); }
    catch (e) {
      console.log(`HARNESS ERROR (${e.message})`);
      results.push({ pass: false, fixtureId: fix.id, errors: [e.message] });
      continue;
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(r.pass ? `PASS  (${dt}s)` : `FAIL  (${dt}s)`);
    if (r.trace) {
      console.log(`        iters=${r.trace.finalIters} tools=[${r.trace.tools.map(t => t.name).join(',')}] tokens in/out=${r.trace.tokens.in}/${r.trace.tokens.out}`);
    }
    if (!r.pass) for (const e of r.errors) console.log(`        - ${e}`);
    results.push(r);
  }

  const pass = results.filter(r => r.pass).length;
  console.log(`\n[evals] ${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch(e => { console.error(`harness fatal: ${e.message}`); process.exit(2); });
