'use strict';

const WebSocket = require('ws');

const DEFAULT_PORT = Number(process.env.POLARIS_PORT) || 40000;

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
  } = opts;

  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${port}`;
    const ws = new WebSocket(url);
    const events = [];
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
      if (msg.type === 'session-status' && (msg.status === 'done' || msg.status === 'error')) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({ status: msg.status, events });
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
