'use strict';

const WebSocket = require('ws');

const DEFAULT_PORT = Number(process.env.POLARIS_PORT) || 40000;

// crossCheckBehavior controls how the harness responds to cross-check-pending
// events fired by Cross-Check (Phase 3). Real users click Approve/Reject; the
// harness has no clicker, so it auto-responds. Default 'approve' so write/edit
// fixtures can complete end-to-end. Set 'reject' to test the rejection path,
// or 'wait' to let Polaris's 10-min server-side timeout fire (which itself
// auto-rejects, but exercises the timeout code path).
function launchAndWait(opts = {}) {
  const {
    port = DEFAULT_PORT,
    sessionId,
    prompt,
    workDir,
    tier = 'floor',
    model = null,
    projectName = null,
    timeoutMs = 120000,
    crossCheckBehavior = 'approve',
  } = opts;

  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${port}`;
    const ws = new WebSocket(url);
    const events = [];
    const crossChecks = [];
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch {}
      reject(new Error(`timeout after ${timeoutMs}ms (no terminal status)`));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'launch',
        sessionId,
        prompt,
        workDir,
        projectName,
        tier,
        model,
      }));
    });

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.sessionId && msg.sessionId !== sessionId) return;
      events.push(msg);

      if (msg.type === 'cross-check-pending' && msg.checkId) {
        crossChecks.push({
          checkId: msg.checkId,
          filePath: msg.filePath,
          operation: msg.operation,
          verdict: msg.verdict,
          decision: crossCheckBehavior,
          ts: new Date().toISOString(),
        });
        if (crossCheckBehavior === 'approve' || crossCheckBehavior === 'reject') {
          ws.send(JSON.stringify({
            type: 'cross-check-decision',
            checkId: msg.checkId,
            decision: crossCheckBehavior,
          }));
        }
        // 'wait' = no response; server's 10-min timeout will fire and reject.
      }

      if (msg.type === 'session-status' && (msg.status === 'done' || msg.status === 'error')) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({ status: msg.status, events, crossChecks });
      }
    });

    ws.on('error', err => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      reject(new Error(`ws: ${err.message}`));
    });
  });
}

module.exports = { launchAndWait, DEFAULT_PORT };
