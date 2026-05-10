const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:40000');
let sessionId = null;
let startTime = Date.now();
let keepAliveDetected = false;

ws.on('open', () => {
  console.log('[0s] ✓ WebSocket connected');
  
  // Launch a session with a task that takes time
  ws.send(JSON.stringify({
    type: 'launch-agent',
    prompt: 'List all files in the Polaris directory with detailed analysis.',
    workDir: 'C:\Users\scott\Code\Polaris',
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    if (msg.type === 'session-created') {
      sessionId = msg.sessionId;
      console.log(`[${elapsed}s] ✓ Session created: ${sessionId}`);
    }
    
    // KEY TEST: Watch for keep-alive injection
    if (msg.type === 'line' && msg.text && msg.text.includes('idle for 45s')) {
      keepAliveDetected = true;
      console.log(`[${elapsed}s] ✓✓✓ KEEP-ALIVE INJECTED: "${msg.text}"`);
      console.log('[SUCCESS] Keep-alive system is working!');
    }
    
    if (msg.type === 'session-stalled' && msg.stallCount === 1) {
      console.log(`[${elapsed}s] · Session idle for ${msg.idleSec}s`);
    }
    if (msg.type === 'session-stalled' && msg.stallCount === 5) {
      console.log(`[${elapsed}s] · Session idle for ${msg.idleSec}s`);
    }
    if (msg.type === 'session-stalled' && msg.stallCount === 10) {
      console.log(`[${elapsed}s] · Session idle for ${msg.idleSec}s`);
    }
    
    if (msg.type === 'session-kick') {
      console.log(`[${elapsed}s] ✗ Session kicked after ${msg.idleSec}s (keep-alive was NOT injected)`);
    }
    
    if (msg.type === 'session-status' && msg.status === 'done') {
      console.log(`[${elapsed}s] ✓ Session completed`);
    }
  } catch (e) {
    // Ignore parse errors
  }
});

ws.on('error', (err) => console.error('WebSocket error:', err));
ws.on('close', () => {
  if (keepAliveDetected) {
    console.log('\n[VERIFIED] Keep-alive prompt injection is working correctly!');
  } else {
    console.log('\n[INFO] Keep-alive was not triggered in this test (session completed before 45s)');
  }
});

setTimeout(() => {
  console.log(`\n[120s] Test timeout`);
  ws.close();
  process.exit(0);
}, 120000);
