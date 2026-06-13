#!/usr/bin/env node
'use strict';

// Polaris agent eval runner — single pass/fail report.
//
// Usage:
//   node test/agent-evals/run-evals.js                       # all fixtures, floor tier
//   node test/agent-evals/run-evals.js --fixtures 01,02      # by id prefix
//   node test/agent-evals/run-evals.js --tier balanced       # override tier
//   node test/agent-evals/run-evals.js --suite acceptance    # fixtures tagged with suite
//   node test/agent-evals/run-evals.js --json out.json       # write machine-readable scorecard
//   node test/agent-evals/run-evals.js --markdown out.md     # write markdown scorecard
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

function fixtureMatches(fixture, argv) {
  if (argv.suite && fixture.suite !== argv.suite) return false;
  if (argv.tags) {
    const required = String(argv.tags).split(',').map(s => s.trim()).filter(Boolean);
    const tags = new Set(fixture.tags || []);
    for (const tag of required) if (!tags.has(tag)) return false;
  }
  return true;
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function compactResult(result) {
  const trace = result.trace || {};
  return {
    id: result.fixtureId,
    pass: !!result.pass,
    status: result.status,
    elapsedMs: result.elapsedMs || 0,
    finalIters: trace.finalIters || 0,
    tools: (trace.tools || []).map(t => t.name),
    toolCallCount: (trace.tools || []).length,
    tokensIn: trace.tokens?.in || 0,
    tokensOut: trace.tokens?.out || 0,
    diagSeconds: trace.finishedAt ?? null,
    crossCheckCount: (result.crossChecks || []).length,
    errors: result.errors || [],
  };
}

function writeJsonScorecard(filePath, scorecard) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');
}

function writeMarkdownScorecard(filePath, scorecard) {
  const lines = [
    `# Polaris Agent Eval Scorecard`,
    '',
    `- Generated: ${scorecard.generatedAt}`,
    `- Tier: ${scorecard.tier}`,
    `- Fixtures: ${scorecard.passed}/${scorecard.total} passed`,
    `- Suite: ${scorecard.suite || 'all'}`,
    '',
    '| Fixture | Pass | Status | Seconds | Iters | Tools | Tokens In | Tokens Out | Errors |',
    '| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- |',
  ];
  for (const r of scorecard.fixtures) {
    const errors = (r.errors || []).map(markdownCell).join('<br>') || '-';
    lines.push(`| ${markdownCell(r.id)} | ${r.pass ? 'yes' : 'no'} | ${markdownCell(r.status || '')} | ${(r.elapsedMs / 1000).toFixed(1)} | ${r.finalIters} | ${markdownCell(r.tools.join(', ') || '-')} | ${r.tokensIn} | ${r.tokensOut} | ${errors} |`);
  }
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

async function main() {
  const argv = parseArgs();
  const fixtureDir = path.join(__dirname, 'fixtures');
  const all = listFixtures(fixtureDir);
  const filter = argv.fixtures ? String(argv.fixtures).split(',').map(s => s.trim()) : null;
  const candidateFiles = filter ? all.filter(f => filter.some(p => f.startsWith(p) || f.includes(p))) : all;
  const selected = [];
  for (const fileName of candidateFiles) {
    try {
      const fixture = loadFixture(path.join(fixtureDir, fileName));
      if (!fixtureMatches(fixture, argv)) continue;
      selected.push({ fileName, fixture });
    } catch (e) {
      selected.push({ fileName, loadError: e });
    }
  }

  if (!selected.length) {
    console.error(`No fixtures matched filter=${argv.fixtures || '(none)'}`);
    process.exit(2);
  }

  const tier = argv.tier || 'floor';
  console.log(`[evals] ${selected.length} fixture(s), tier=${tier}\n`);

  const results = [];
  for (const entry of selected) {
    if (entry.loadError) {
      console.log(`  ${entry.fileName} ... LOAD ERROR: ${entry.loadError.message}`);
      results.push({ pass: false, fixtureId: entry.fileName, status: 'load-error', errors: [entry.loadError.message] });
      continue;
    }
    const fix = entry.fixture;
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

  const scorecard = {
    generatedAt: new Date().toISOString(),
    tier,
    suite: argv.suite || null,
    tags: argv.tags ? String(argv.tags).split(',').map(s => s.trim()).filter(Boolean) : [],
    total: results.length,
    passed: pass,
    passRate: results.length ? pass / results.length : 0,
    fixtures: results.map(compactResult),
  };
  if (argv.json) {
    writeJsonScorecard(argv.json, scorecard);
    console.log(`[evals] wrote json scorecard ${argv.json}`);
  }
  if (argv.markdown) {
    writeMarkdownScorecard(argv.markdown, scorecard);
    console.log(`[evals] wrote markdown scorecard ${argv.markdown}`);
  }
  process.exit(pass === results.length ? 0 : 1);
}

main().catch(e => { console.error(`harness fatal: ${e.message}`); process.exit(2); });
