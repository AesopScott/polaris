/**
 * Proof Units — Task #36 Orchestrator Endpoints
 *
 * Run after `npm start` with: node proof/task-36-orchestrator.proof.js
 *
 * Tests (aligned to backlog PU numbering):
 *   PU1  GET  /branch-state        → HTTP 200, object response (backlog PU1)
 *   PU2  POST /reserve-merge-slot  → acquired | queued status (backlog PU2)
 *   PU2b POST /release-merge-slot  → released: true, advances queue (backlog PU2 continued)
 *   PU3  POST /dry-run-merge       → { status: 'clean' | 'conflict' } or graceful 400 (backlog PU3)
 *   Note: backlog PU4 (file contention in /branch-state) requires two live sessions — manual verification only
 */

const http = require('http');

const PORT = Number(process.env.SERVER_PORT) || 40000;
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runProofs() {
  console.log(`\nTask #36 Orchestrator — Proof Units 1–4\n${'─'.repeat(50)}`);

  // ── Proof Unit 1: GET /branch-state ──────────────────────────────────────
  console.log('\nPU1  GET /branch-state — returns live session data');
  try {
    const { status, body } = await request('GET', '/branch-state');
    assert('HTTP 200', status === 200, `got ${status}`);
    assert('Response is an object', typeof body === 'object' && body !== null);
    // May be empty {} if no sessions active — that is still a valid response
    console.log(`     Response: ${JSON.stringify(body).slice(0, 120)}`);
  } catch (e) {
    assert('Server reachable', false, e.message);
  }

  // ── Proof Unit 2: POST /reserve-merge-slot ───────────────────────────────
  console.log('\nPU2  POST /reserve-merge-slot — serialize concurrent pushes');
  let slotId1 = null;
  let slotId2 = null;
  try {
    const r1 = await request('POST', '/reserve-merge-slot', { taskNumber: 9901, targetBranch: 'stage', timeout: 60000 });
    assert('First reservation: HTTP 200', r1.status === 200, `got ${r1.status}`);
    assert('First reservation: status=acquired', r1.body.status === 'acquired', JSON.stringify(r1.body));
    assert('First reservation: has slotId', typeof r1.body.slotId === 'string');
    slotId1 = r1.body.slotId;

    const r2 = await request('POST', '/reserve-merge-slot', { taskNumber: 9902, targetBranch: 'stage', timeout: 60000 });
    assert('Second reservation: HTTP 200', r2.status === 200, `got ${r2.status}`);
    assert('Second reservation: status=queued (slot held by first)', r2.body.status === 'queued', JSON.stringify(r2.body));
    assert('Second reservation: position >= 1', r2.body.position >= 1);
    slotId2 = r2.body.slotId;
  } catch (e) {
    assert('PU2 request succeeded', false, e.message);
  }

  // ── Proof Unit 2b: POST /release-merge-slot ──────────────────────────────
  console.log('\nPU2b POST /release-merge-slot — release slot and advance queue');
  try {
    if (!slotId1) throw new Error('No slotId from PU2 — skipping');
    const r = await request('POST', '/release-merge-slot', { slotId: slotId1, status: 'success' });
    assert('HTTP 200', r.status === 200, `got ${r.status}`);
    assert('released: true', r.body.released === true);
    assert('nextInQueue is the queued task', r.body.nextInQueue?.taskNumber === 9902, JSON.stringify(r.body.nextInQueue));

    // Clean up slot2 (it's now active after release)
    if (slotId2) {
      await request('POST', '/release-merge-slot', { slotId: slotId2, status: 'success' });
    }
  } catch (e) {
    assert('PU2b request succeeded', false, e.message);
  }

  // ── Proof Unit 3: POST /dry-run-merge ───────────────────────────────────
  // Automated smoke only — verifies the endpoint responds. Real conflict detection
  // requires two branches with an actual merge conflict and is classified manual (PU3 manual waiver).
  // Provide REPO_PATH env var to point at a real repo for a live dry-run result.
  console.log('\nPU3  POST /dry-run-merge — endpoint responds (conflict proof is manual)');
  try {
    const repoPath = process.env.REPO_PATH || null;
    const payload = { sourceBranch: 'task/99-nonexistent', targetBranch: 'main' };
    if (repoPath) payload.repoPath = repoPath;
    const r = await request('POST', '/dry-run-merge', payload);
    // With no active session and no repoPath, expect 400. With repoPath or active session, expect 200.
    const acceptable = r.status === 200 || (r.status === 400 && !repoPath);
    assert('HTTP 200 (with session) or 400 (no session/no repoPath)', acceptable, `got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.status === 200) {
      assert('status is clean or conflict', r.body.status === 'clean' || r.body.status === 'conflict', JSON.stringify(r.body));
    }
  } catch (e) {
    assert('PU3 request succeeded', false, e.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Result: ${passed}/${total} passed${failed > 0 ? ` (${failed} FAILED)` : ' ✓'}`);
  process.exit(failed > 0 ? 1 : 0);
}

runProofs().catch(e => {
  console.error('Proof runner crashed:', e.message);
  process.exit(1);
});
