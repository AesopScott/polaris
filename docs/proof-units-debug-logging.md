# Proof Units for Debug Logging Validation (Task #20)

When implementing error reporting in newly-written code, validate that `pushDebugLog()` is called correctly and logs reach the debug panel. This document defines the proof unit structure for debug-logging-specific features.

## Proof Unit Template for Debug Logging

Use this template when defining proof units for code that includes error reporting.

### Proof Unit N: Debug logging — {feature} reports errors to debug panel

**Expected behavior:**  
When {operation} fails with {error type}, pushDebugLog() is called with a descriptive error message and isError=true, and the message appears in the debug panel.

**Preferred proof type:**  
`failing-test` (recommended) or `smoke-command`

**Exact command:**  
```bash
# For failing-test:
npm test -- {test-file-path}

# Expected test structure:
# 1. Arrange: stub pushDebugLog or mock global.pushDebugLog
# 2. Act: trigger failure condition
# 3. Assert: verify pushDebugLog was called with (message, true)
# 4. Assert: check debug panel or captured logs for the message
```

**Expected initial failure (RED):**  
- Test file does not exist, or
- Test fails with "ReferenceError: pushDebugLog is not defined", or
- Test runs but logs are not captured/verified

**Expected passing evidence (GREEN):**  
- Test passes with no errors
- Grep output shows `expect(...).toHaveBeenCalledWith(expect.stringContaining(...), true)` is satisfied
- Optional: Browser screenshot or test log shows message appeared in debug panel

**Waiver guidance:**  
If automated test is not possible (e.g., testing WebSocket fallback in isolation):
- Manual evidence: "Tested by running Direct agent, triggering failure, observing debug panel message appears. Screen recording: [PR comment with video link]"
- WebSocket fallback proof: "Verified emit-debug-log message structure via Network tab inspection. Message matches schema: {type, message, isError}"

---

## Concrete Examples for Task #20

### Proof Unit 1: Utility exposed — pushDebugLog importable from lib/debugUtil.js

**Expected behavior:**  
`const { pushDebugLog } = require('./lib/debugUtil.js')` succeeds without errors and exports a callable function.

**Preferred proof type:**  
`smoke-command`

**Exact command:**  
```bash
node -e "const { pushDebugLog } = require('./lib/debugUtil.js'); console.log(typeof pushDebugLog === 'function' ? 'OK' : 'FAIL')"
```

**Expected initial failure:**  
File does not exist or export fails: "Error: Cannot find module './lib/debugUtil.js'"

**Expected passing evidence:**  
Command output: `OK` (exit 0, no error)

**Waiver guidance:**  
N/A — this is automatable

---

### Proof Unit 2: Function signature — pushDebugLog accepts message and isError parameters

**Expected behavior:**  
Calling `pushDebugLog(message, isError)` with a string message and boolean isError does not throw an error.

**Preferred proof type:**  
`failing-test`

**Exact command:**  
```bash
npm test -- proof/pushDebugLog-signature.test.js
```

**Test structure:**  
```javascript
test('pushDebugLog accepts message and isError', () => {
  const { pushDebugLog } = require('./lib/debugUtil.js');
  
  // Should not throw
  expect(() => {
    pushDebugLog('Test message', false);
  }).not.toThrow();
  
  expect(() => {
    pushDebugLog('Error message', true);
  }).not.toThrow();
});
```

**Expected initial failure:**  
Test file does not exist or tests fail with assertion error

**Expected passing evidence:**  
Test passes; output shows "2 passing"

**Waiver guidance:**  
N/A — test is automatable

---

### Proof Unit 3: Client context — window.pushDebugLog in Claude Code receives error logs

**Expected behavior:**  
In a Claude Code session running newly-written code, when the code calls `pushDebugLog("error", true)`, the message appears in the debug panel with error styling (red text or error icon).

**Preferred proof type:**  
`ui-check` (manual) with proof of passage

**Exact command:**  
```
1. Open Polaris in Claude Code
2. Start a Direct agent session
3. Run test code: const { pushDebugLog } = require('./lib/debugUtil.js'); pushDebugLog('Test error message', true);
4. Inspect Polaris UI debug panel
5. Verify: message appears in debug panel with error styling
6. Screenshot or record test run for PR evidence
```

**Expected initial failure:**  
- Debug panel does not exist, or
- Message does not appear, or
- Message appears without error styling

**Expected passing evidence:**  
- Screenshot showing message in debug panel with error color/icon
- Or video recording showing error appears immediately after code runs

**Waiver guidance:**  
"Manual evidence: UI inspection recorded in [PR comment with screenshot/video]. Debug panel shows error styled correctly."

---

### Proof Unit 4: Server context — process.send fallback works for Node.js subprocesses

**Expected behavior:**  
When `pushDebugLog()` is called in a Node.js subprocess spawned by server.js (e.g., Direct agent), it sends `{type: 'debug-log', message, isError}` via process.send() without throwing.

**Preferred proof type:**  
`failing-test` (with mock process.send) or `smoke-command`

**Exact command:**  
```bash
npm test -- proof/pushDebugLog-process-send.test.js
```

**Test structure:**  
```javascript
test('pushDebugLog uses process.send in Node subprocess context', () => {
  // Arrange: mock process.send
  const sentMessages = [];
  const originalSend = process.send;
  process.send = jest.fn((msg) => sentMessages.push(msg));
  
  const { pushDebugLog } = require('./lib/debugUtil.js');
  
  // Act
  pushDebugLog('Server error', true);
  
  // Assert
  expect(process.send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'debug-log',
      message: 'Server error',
      isError: true
    })
  );
  
  // Cleanup
  process.send = originalSend;
});
```

**Expected initial failure:**  
Test file does not exist or assertion fails

**Expected passing evidence:**  
Test passes; process.send was called with correct message structure

**Waiver guidance:**  
N/A — test is automatable

---

### Proof Unit 5: WebSocket fallback — emit-debug-log message sent correctly for remote contexts

**Expected behavior:**  
When `emitDebugLogViaWebSocket(wsConnection, message, isError)` is called with an open WebSocket, it sends `{type: 'emit-debug-log', message, isError}` via ws.send() without throwing.

**Preferred proof type:**  
`failing-test` (with mock WebSocket) or `smoke-command`

**Exact command:**  
```bash
npm test -- proof/emitDebugLogViaWebSocket.test.js
```

**Test structure:**  
```javascript
test('emitDebugLogViaWebSocket sends correct message structure', () => {
  // Arrange: mock WebSocket
  const mockWs = {
    readyState: 1, // OPEN
    send: jest.fn()
  };
  
  const { emitDebugLogViaWebSocket } = require('./lib/debugUtil.js');
  
  // Act
  emitDebugLogViaWebSocket(mockWs, 'Network timeout', true);
  
  // Assert
  expect(mockWs.send).toHaveBeenCalledWith(
    JSON.stringify({
      type: 'emit-debug-log',
      message: 'Network timeout',
      isError: true
    })
  );
});
```

**Expected initial failure:**  
Test file does not exist or assertion fails

**Expected passing evidence:**  
Test passes; ws.send was called with correct JSON message

**Waiver guidance:**  
N/A — test is automatable

---

### Proof Unit 6: Error handling pattern — generated code calls pushDebugLog in catch blocks

**Expected behavior:**  
When newly-written code encounters an error and catches it, pushDebugLog("error details", true) is called before the error is handled or re-thrown.

**Preferred proof type:**  
`failing-test` or `manual-script`

**Exact command:**  
```bash
npm test -- proof/error-reporting-pattern.test.js
```

**Test structure:**  
```javascript
test('Generated code reports errors via pushDebugLog', () => {
  // Arrange: mock pushDebugLog
  const logs = [];
  jest.mock('./lib/debugUtil.js', () => ({
    pushDebugLog: (msg, isError) => logs.push({ msg, isError })
  }));
  
  const { someGeneratedFunction } = require('./generated-function');
  
  // Act: trigger error
  try {
    someGeneratedFunction(); // throws
  } catch (e) {
    // Error is expected — generated code should have logged it
  }
  
  // Assert: pushDebugLog was called
  expect(logs).toContainEqual(
    expect.objectContaining({
      msg: expect.stringContaining('failed'),
      isError: true
    })
  );
});
```

**Expected initial failure:**  
Generated function does not exist or logs array is empty

**Expected passing evidence:**  
Test passes; logs array contains error message with isError=true

**Waiver guidance:**  
If test is not automatable: "Manual evidence: Code review shows try-catch block with pushDebugLog call. Runtime test: Direct agent session triggered failure, debug panel shows message. [PR comment with screenshot]"

---

## Integration Checklist

When a task generates code that may fail at runtime:

- [ ] Create or update test file at `proof/{feature-name}.test.js`
- [ ] Test 1: Verify pushDebugLog is importable and callable
- [ ] Test 2: Verify function signature (message, isError)
- [ ] Test 3: Verify error is logged in catch blocks
- [ ] Test 4: Verify message reaches debug panel (UI check or screenshot)
- [ ] All tests pass: `npm test -- proof/*.test.js`
- [ ] Coverage >= 80% for debug-logging code
- [ ] Optional: Screenshot or video of debug panel showing error

## Status in Task #20

- **B.1** ✓ This document — proof unit template for debug logging
- **B.2** (pending) Create example code with test (examples/debug-logging-example.js + test)
- **B.3** (pending) Integrate error-reporting pattern into agent system prompts (update BASE_SYSTEM_PROMPT)

