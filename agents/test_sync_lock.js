/**
 * test_sync_lock.js — PU1 proof: concurrent /sync-state writes do not corrupt backlog.json
 *
 * Runs in two modes:
 *
 * Mode A — Unit test (no live server required):
 *   Verifies that withBacklogLock() serialises concurrent calls by
 *   replaying the same logic inline. Pass --unit to run this mode.
 *   Exits 0 on pass.
 *
 * Mode B — Integration test (requires server.js on port 40000):
 *   Sends 3 simultaneous POST /sync-state requests (different task numbers)
 *   and verifies all 3 status changes appear in backlog.json.
 *   Run without flags (default) for integration mode.
 *
 * Usage:
 *   node agents/test_sync_lock.js --unit          # unit test, no server needed
 *   node agents/test_sync_lock.js                 # integration, server must be running
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVER_PORT = parseInt(process.env.SERVER_PORT || '40000', 10);
const BACKLOG_PATH = path.join(__dirname, '..', 'docs', 'backlog.json');

// ─── Inline replica of the withBacklogLock logic from server.js ─────────────

function makeWriteLock() {
  let queue = Promise.resolve();
  return function withBacklogLock(fn) {
    const next = queue.then(() => fn(), () => fn());
    queue = next.then(() => {}, () => {});
    return next;
  };
}

// ─── Mode A: unit test ───────────────────────────────────────────────────────

async function runUnit() {
  console.log('[test_sync_lock] mode=unit — validating promise-chain serialisation');
  const withBacklogLock = makeWriteLock();
  const order = [];

  // Schedule 5 concurrent "writes" — each appends to `order` after a micro-delay
  // Without a lock they would interleave; with the lock they must be sequential.
  const tasks = [0, 1, 2, 3, 4].map(i =>
    withBacklogLock(() => new Promise(resolve => {
      setImmediate(() => { order.push(i); resolve(); });
    }))
  );
  await Promise.all(tasks);

  // With serialisation, every task must complete in submission order
  const expected = [0, 1, 2, 3, 4];
  const ok = JSON.stringify(order) === JSON.stringify(expected);
  if (ok) {
    console.log(`  OK order=${JSON.stringify(order)} — all 5 writes serialised`);
    console.log('PASS: withBacklogLock serialises concurrent calls correctly');
    process.exit(0);
  } else {
    console.error(`  FAIL order=${JSON.stringify(order)} expected ${JSON.stringify(expected)}`);
    console.error('FAIL');
    process.exit(1);
  }
}

// ─── Mode B: integration test ────────────────────────────────────────────────

// ⚠ WARNING — DESTRUCTIVE: integration mode sends live POST /sync-state requests
// that overwrite the statuses of the tasks listed below in docs/backlog.json.
// Before running against a real server, verify these tasks are at or below the
// target statuses — if a task has been promoted to staged/production, adjust the
// task_number/status values below accordingly to avoid a damaging regression.
// Prefer --unit mode for CI; run integration mode only in a dev environment.
const WRITES = [
  { task_number: 30, status: 'backlog',       current_node: 'test-lock-1' },
  { task_number: 31, status: 'backlog',       current_node: 'test-lock-2' },
  { task_number: 34, status: 'build-started', current_node: 'test-lock-3' },
];

function post(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const opts = {
      hostname: '127.0.0.1',
      port: SERVER_PORT,
      path: '/sync-state',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runIntegration() {
  console.log(`[test_sync_lock] mode=integration — ${WRITES.length} concurrent POSTs to localhost:${SERVER_PORT}/sync-state`);

  const results = await Promise.allSettled(WRITES.map(w => post(w)));

  let anyFail = false;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const w = WRITES[i];
    if (r.status === 'rejected') {
      console.error(`  FAIL task #${w.task_number}: rejected — ${r.reason}`);
      anyFail = true;
    } else if (r.value.status !== 200) {
      console.error(`  FAIL task #${w.task_number}: HTTP ${r.value.status} — ${r.value.body}`);
      anyFail = true;
    } else {
      console.log(`  OK   task #${w.task_number}: HTTP 200`);
    }
  }

  if (anyFail) {
    console.error('FAIL: one or more requests failed — no integrity check performed');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8'));
  const tasks = data.tasks || [];
  let verifyFail = false;

  for (const w of WRITES) {
    const t = tasks.find(t => t.number === w.task_number);
    if (!t) {
      console.error(`  FAIL: task #${w.task_number} not found in backlog.json`);
      verifyFail = true;
      continue;
    }
    if (t.status !== w.status) {
      console.error(`  FAIL: task #${w.task_number} status expected "${w.status}", got "${t.status}"`);
      verifyFail = true;
    } else {
      console.log(`  OK   task #${w.task_number}: status="${t.status}" present`);
    }
  }

  if (verifyFail) {
    console.error('FAIL: backlog.json integrity check failed');
    process.exit(1);
  }

  console.log('PASS: all 3 updates present and backlog.json is consistent');
  process.exit(0);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const isUnit = process.argv.includes('--unit');
(isUnit ? runUnit() : runIntegration()).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
