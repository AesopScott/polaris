const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:40000');
let sessionId = null;
let startTime = Date.now();

ws.on('open', () => {
  console.log('[0s] ✓ WebSocket connected');
  
  // Launch an agent session
  ws.send(JSON.stringify({
    type: 'launch-agent',
    prompt: 'Count from 1 to 5.',
    workDir: 'C:\Users\scott\Code\Polaris',
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    // Capture session ID
    if (msg.type === 'session-created') {
      sessionId = msg.sessionId;
      console.log(`[${elapsed}s] ✓ Session created: ${sessionId}`);
    }
    
    // Watch for keep-alive injection (the key test!)
    if (msg.type === 'line' && msg.text && msg.text.includes('idle for 45s')) {
      console.log(`[${elapsed}s] ✓✓✓ KEEP-ALIVE INJECTED: "${msg.text}"`);
    }
    
    // Watch for session status changes
    if (msg.type === 'session-stalled') {
      if (msg.stallCount % 5 === 0) console.log(`[${elapsed}s] · Session idle for ${msg.idleSec}s`);
    }
    
    if (msg.type === 'session-kick') {
      console.log(`[${elapsed}s] ✗ Session kicked after ${msg.idleSec}s idle`);
    }
    
    if (msg.type === 'session-status' && msg.status === 'done') {
      console.log(`[${elapsed}s] ✓ Session completed`);
    }
  } catch (e) {
    // Ignore parse errors
  }
});

ws.on('error', (err) => console.error('WebSocket error:', err));
ws.on('close', () => console.log('\nWebSocket closed'));

// Keep the process alive for 120 seconds to observe keep-alive behavior
setTimeout(() => {
  console.log('\n[120s] Test timeout - closing');
  ws.close();
  process.exit(0);
}, 120000);
