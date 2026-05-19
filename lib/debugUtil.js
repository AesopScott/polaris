/**
 * Debug logging utility for Polaris
 * Exposes pushDebugLog() for use in generated code and agent sessions
 */

/**
 * Push a debug log entry to the Polaris UI debug panel
 * @param {string} message - The debug message to log
 * @param {boolean} isError - Whether this is an error (affects styling in UI)
 * @returns {void}
 */
function pushDebugLog(message, isError = false) {
  // This function is meant to be called from generated code and agent sessions.
  // In client code (resources/mockup.html), the function is defined globally.
  // In agent/server contexts that don't have direct access, use the WebSocket fallback.

  if (typeof window !== 'undefined' && window.pushDebugLog) {
    // Client-side context: call the UI's pushDebugLog directly
    window.pushDebugLog(message, isError);
  } else if (typeof process !== 'undefined' && process.send) {
    // Server/agent context: emit via process channel (handled by parent)
    process.send({ type: 'debug-log', message, isError });
  } else {
    // Fallback: log to console if no other mechanism available
    console.log(`[DEBUG${isError ? ' ERROR' : ''}] ${message}`);
  }
}

/**
 * Emit a debug log via WebSocket (fallback when utility unavailable)
 * For use in agents that can't import this module directly
 * @param {object} wsConnection - WebSocket connection object
 * @param {string} message - Debug message
 * @param {boolean} isError - Whether this is an error
 * @returns {void}
 */
function emitDebugLogViaWebSocket(wsConnection, message, isError = false) {
  if (wsConnection && wsConnection.readyState === 1) { // OPEN
    wsConnection.send(JSON.stringify({
      type: 'emit-debug-log',
      message,
      isError
    }));
  }
}

module.exports = {
  pushDebugLog,
  emitDebugLogViaWebSocket
};
