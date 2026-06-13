'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { launchAndWait } = require('./lib/wsClient');
const { parseDiag } = require('./lib/diagParser');
const { makeSeedDir, cleanSeedDir } = require('./lib/seed');

const POLARIS_DIR = process.env.POLARIS_DIR
  || path.join(process.env.APPDATA || os.homedir(), '.claude', 'polaris');
const LOGS_DIR = path.join(POLARIS_DIR, 'logs');

async function runOne(fixture, opts = {}) {
  const safeId = fixture.id.replace(/[^a-z0-9_-]/gi, '_');
  const sessionId = `eval_${safeId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const seedDir = makeSeedDir(safeId, fixture.seed?.files || {});
  const startMs = Date.now();
  const expect = fixture.expect || {};
  const timeoutMs = (expect.max_seconds || 60) * 1000 + 30000;

  let launchResult = null;
  let connectError = null;
  try {
    launchResult = await launchAndWait({
      sessionId,
      prompt: fixture.prompt,
      workDir: seedDir,
      tier: opts.tier || fixture.tier || 'floor',
      model: opts.model || fixture.model || null,
      crossCheckBehavior: opts.crossCheckBehavior || fixture.crossCheckBehavior || 'approve',
      timeoutMs,
    });
  } catch (e) {
    connectError = e.message;
  }

  const postFiles = {};
  if (expect.files) {
    for (const rel of Object.keys(expect.files)) {
      try { postFiles[rel] = fs.readFileSync(path.join(seedDir, rel), 'utf8'); }
      catch { postFiles[rel] = null; }
    }
  }

  let trace = null;
  const diagPath = path.join(LOGS_DIR, `diag-${sessionId}.txt`);
  if (fs.existsSync(diagPath)) {
    try { trace = parseDiag(diagPath); } catch (e) { /* parse failure handled via assertions */ }
  }

  const errors = [];
  if (connectError) errors.push(`launch failed: ${connectError}`);
  if (!trace && !connectError) errors.push('no diag file produced');

  if (trace) {
    if (expect.session_status && launchResult?.status !== expect.session_status) {
      errors.push(`status: expected=${expect.session_status} got=${launchResult?.status || 'none'}`);
    }
    if (typeof expect.max_iters === 'number' && trace.finalIters > expect.max_iters) {
      errors.push(`iters: ${trace.finalIters} > max ${expect.max_iters}`);
    }
    if (typeof expect.max_seconds === 'number' && trace.finishedAt != null && trace.finishedAt > expect.max_seconds) {
      errors.push(`time: ${trace.finishedAt}s > max ${expect.max_seconds}s`);
    }
    if (Array.isArray(expect.tools_called)) {
      const calledNames = trace.tools.map(t => t.name);
      for (const need of expect.tools_called) {
        if (!calledNames.includes(need)) {
          errors.push(`expected tool '${need}' to be called; got [${calledNames.join(', ') || '(none)'}]`);
        }
      }
    }
    if (Array.isArray(expect.tools_called_any)) {
      const calledNames = trace.tools.map(t => t.name);
      for (const group of expect.tools_called_any) {
        const options = Array.isArray(group) ? group : [group];
        if (!options.some(name => calledNames.includes(name))) {
          errors.push(`expected one of [${options.join(', ')}] to be called; got [${calledNames.join(', ') || '(none)'}]`);
        }
      }
    }
    if (Array.isArray(expect.tools_not_called)) {
      const calledNames = trace.tools.map(t => t.name);
      for (const forbid of expect.tools_not_called) {
        if (calledNames.includes(forbid)) errors.push(`forbidden tool '${forbid}' was called`);
      }
    }
    if (typeof expect.min_tool_calls === 'number' && trace.tools.length < expect.min_tool_calls) {
      errors.push(`tool calls: ${trace.tools.length} < min ${expect.min_tool_calls}`);
    }
    if (trace.emptyResponse) {
      errors.push(`agent produced empty response: ${trace.emptyResponse.slice(0, 120)}`);
    }
  }

  if (expect.response) {
    const lineText = (launchResult?.events || [])
      .filter(e => e.type === 'line' && (e.role === 'assistant' || e.role === 'system'))
      .map(e => e.text || '')
      .join('\n');
    if (expect.response.contains && !lineText.includes(expect.response.contains)) {
      errors.push(`response missing substring '${expect.response.contains}'`);
    }
    if (expect.response.notContains && lineText.includes(expect.response.notContains)) {
      errors.push(`response contains forbidden substring '${expect.response.notContains}'`);
    }
    if (expect.response.matches && !new RegExp(expect.response.matches, 'i').test(lineText)) {
      errors.push(`response does not match /${expect.response.matches}/i`);
    }
  }

  if (expect.cross_check) {
    const checks = launchResult?.crossChecks || [];
    const minPending = expect.cross_check.min_pending ?? 0;
    if (checks.length < minPending) {
      errors.push(`cross-check pending count: ${checks.length} < min ${minPending}`);
    }
    if (expect.cross_check.decision) {
      const decisions = new Set(checks.map(c => c.decision));
      if (!decisions.has(expect.cross_check.decision)) {
        errors.push(`cross-check decision '${expect.cross_check.decision}' not observed; got [${[...decisions].join(', ') || '(none)'}]`);
      }
    }
  }

  if (expect.files) {
    for (const [rel, check] of Object.entries(expect.files)) {
      const got = postFiles[rel];
      if (got == null) { errors.push(`file '${rel}' missing after run`); continue; }
      if (check.contains && !got.includes(check.contains)) {
        errors.push(`file '${rel}' missing substring '${check.contains}'`);
      }
      if (check.notContains && got.includes(check.notContains)) {
        errors.push(`file '${rel}' contains forbidden substring '${check.notContains}'`);
      }
      if (check.equals != null && got !== check.equals) {
        errors.push(`file '${rel}' content does not match expected exact value`);
      }
      if (check.matches && !new RegExp(check.matches).test(got)) {
        errors.push(`file '${rel}' does not match /${check.matches}/`);
      }
    }
  }

  const elapsedMs = Date.now() - startMs;
  if (!opts.keepSeed) cleanSeedDir(seedDir);

  return {
    fixtureId: fixture.id,
    sessionId,
    status: launchResult?.status || 'error',
    seedDir,
    elapsedMs,
    trace,
    postFiles,
    crossChecks: launchResult?.crossChecks || [],
    pass: errors.length === 0,
    errors,
  };
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFixtures(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
}

module.exports = { runOne, loadFixture, listFixtures };
