# Error Reporting Pattern for Polaris Generated Code

When writing new functions, features, or generated code in Polaris, always include error reporting so Scott can diagnose failures without manual log inspection.

## Quick Reference

**For Node.js contexts (Claude CLI, Direct agents, server code):**
```javascript
const { pushDebugLog } = require('./lib/debugUtil.js');

try {
  // Your code here
} catch (error) {
  pushDebugLog(`Operation failed: ${error.message}`, true);
  // Handle error appropriately
}
```

**For WebSocket fallback (agents in remote contexts):**
```javascript
ws.send(JSON.stringify({
  type: 'emit-debug-log',
  message: 'Operation failed: connection timeout',
  isError: true
}));
```

---

## When to Use Error Reporting

- **Writing new functions** — include error-reporting in error handlers
- **Features that may fail at runtime** — wrap in try-catch with pushDebugLog
- **Generated code** — all generated functions should report failures
- **External API calls** — always report network errors, timeouts, malformed responses
- **File operations** — report read/write failures, missing files, permission errors
- **Database operations** — report connection failures, query errors, transaction issues

## Contexts and Available Methods

### 1. Claude CLI Sessions (Claude Code)
**Location:** Standard Polaris development environment

**Available:** Full `pushDebugLog()` via require
```javascript
const { pushDebugLog } = require('./lib/debugUtil.js');
pushDebugLog('Operation completed', false);
```

**Why:** Claude CLI code runs in Node.js and has direct filesystem access.

---

### 2. Direct Agent Sessions
**Location:** OpenRouter API → Polaris server → Direct agent

**Available:** Full `pushDebugLog()` via require
```javascript
const { pushDebugLog } = require('./lib/debugUtil.js');
pushDebugLog('Integration test passed', false);
```

**Why:** Direct agent code runs in Node.js subprocess spawned by server.js.

---

### 3. OpenAI Session Generated Code
**Location:** Generated functions in Claude CLI or API responses

**Available:** Full `pushDebugLog()` via require
```javascript
const { pushDebugLog } = require('./lib/debugUtil.js');
pushDebugLog('OpenAI model called successfully', false);
```

**Why:** OpenAI-generated code still runs in Node.js context where modules are importable.

---

### 4. Remote Agent Contexts (WebSocket Fallback)
**Location:** Agents unable to import Node modules, or running outside server process

**Available:** WebSocket connection object

```javascript
// When require() fails or context is sandboxed
const wsConnection = getWebSocketConnection(); // context-dependent
wsConnection.send(JSON.stringify({
  type: 'emit-debug-log',
  message: 'Remote operation completed',
  isError: false
}));
```

**Why:** Some agent environments (e.g., sandboxed JS execution) cannot import Node modules. WebSocket provides a fallback to emit logs to the server, which broadcasts them to the UI.

**Server-side handler (future C.1 phase):**
```javascript
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'emit-debug-log') {
    // Server receives emit-debug-log from agent
    // Rebroadcast as debug-log to all connected UI clients
    broadcast({
      type: 'debug-log',
      message: msg.message,
      isError: msg.isError
    });
  }
});
```

---

## Implementation Checklist

When writing code that may fail at runtime:

- [ ] Wrap risky operations in try-catch
- [ ] Import `pushDebugLog` at the top of the file
- [ ] Call `pushDebugLog(message, true)` in catch blocks with error details
- [ ] Include context in the message (what operation was attempted, what failed)
- [ ] Use `isError: false` for informational logs (optional)
- [ ] Test error path locally before merging (run with simulated failure)

## Message Format Guidelines

**Good error messages:**
- `"Failed to load backlog: ENOENT — file not found"`
- `"Database connection timeout after 5s — check network"`
- `"API returned 429 Too Many Requests — rate limited"`

**Avoid:**
- Generic messages like "Error occurred" — always include the what and why
- Sensitive data (API keys, internal IPs, passwords) — sanitize before logging
- Multiline JSON dumps — extract relevant fields only

---

## Proof Units

For new generated code that uses error-reporting, create a proof unit test:

```javascript
// proof/pushDebugLog-test.js
test('pushDebugLog logs errors to debug panel on failure', () => {
  // 1. Arrange: stub global pushDebugLog or mock WebSocket
  const logs = [];
  global.pushDebugLog = (msg, isError) => logs.push({ msg, isError });

  // 2. Act: call your function and trigger error
  try {
    myFunction(); // throws
  } catch (e) {
    pushDebugLog(`myFunction failed: ${e.message}`, true);
  }

  // 3. Assert: verify error was logged
  expect(logs).toContainEqual({
    msg: expect.stringContaining('myFunction failed'),
    isError: true
  });
});
```

---

## Status in Task #20

- **A.1** ✓ Created `lib/debugUtil.js` with `pushDebugLog()` and `emitDebugLogViaWebSocket()`
- **A.2** ✓ Wired guidance into Claude CLI sessions via `buildPolarisContextBlock()`
- **A.3** ✓ Wired guidance into Direct agent/OpenAI via `buildDirectSystemPrompt()`
- **A.4** ✓ This document — error-reporting pattern reference

---

## Cross-References

- **Registry:** WebSocket event types defined in `docs/registries/websocket-events.md`
  - `emit-debug-log` — agent → server fallback message
  - `debug-log` — server broadcast to all UI clients
- **Utility:** `lib/debugUtil.js` — implementation of `pushDebugLog()` and WebSocket fallback
- **Server context:** `server.js` → `buildDirectSystemPrompt()` and `buildPolarisContextBlock()` for guidance injection
