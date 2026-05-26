/**
 * @module wsAdapter
 * WebSocket dispatch infrastructure for Polaris.
 *
 * The Polaris WebSocket server handles ~130 message types via a single
 * `handleMessage(ws, raw)` function in server.js. This module provides
 * the typed dispatch layer:
 *   - WsClient — augmented WebSocket with attached session metadata
 *   - WsMessageHandler — typed handler function signature
 *   - WsHandlerMap — message type → handler registry
 *   - buildWsDispatcher() — compiles a WsHandlerMap into a handleMessage function
 *   - broadcast helpers — sendWs, broadcastAll, broadcastToSession
 *   - initWsAdapter() — dependency-injection entry point
 *
 * Handler implementations (130 message types) live in server.js during the
 * incremental refactoring and are injected as the WsHandlerMap at startup.
 *
 * Dependencies: Node ws
 *
 * Topology: contracts ← crossCheck/backlog/toolRuntime ← wsAdapter (hub)
 */

import { IncomingMessage } from 'http';
import { ORCHESTRATION_QUIET_MODE } from './featureFlags';

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET INTERFACE (minimal — avoids @types/ws dependency)
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of the ws.WebSocket API used by this module. */
export interface RawWsSocket {
  readonly readyState: number;
  send(data: string): void;
}

/** ws.WebSocket.OPEN constant value. */
const WS_OPEN = 1;

/** Opaque raw data type from ws RawData. */
export type WsRawData = Buffer | ArrayBuffer | Buffer[];

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT TYPE
// ─────────────────────────────────────────────────────────────────────────────

/** WebSocket client augmented with session and auth metadata set at connection time. */
export interface WsClient extends RawWsSocket {
  /** Session ID associated with this connection, if any. */
  sessionId?: string;
  /** Whether this client has passed the connection approval gate. */
  approved?: boolean;
  /** Timestamp when the connection was established. */
  connectedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A parsed inbound WebSocket message.
 * The `type` field routes to the appropriate handler; remaining fields are payload.
 */
export interface WsMessage {
  type: string;
  [key: string]: any;
}

/**
 * Handler function for a single WebSocket message type.
 * Receives the sender client, the parsed message, and all connected clients.
 */
export type WsMessageHandler = (
  ws: WsClient,
  data: WsMessage,
  clients: Set<WsClient>
) => void | Promise<void>;

/**
 * Registry mapping message type strings to their handler functions.
 * Keys are the exact `type` values sent by the UI (e.g. `'launch'`, `'stop'`).
 */
export type WsHandlerMap = Record<string, WsMessageHandler>;

// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Send a JSON message to a single WebSocket client. Silently drops if not OPEN. */
export function sendWs(ws: WsClient, msg: object): void {
  if (ws.readyState === WS_OPEN) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }
}

/** Broadcast a JSON message to all open WebSocket clients. */
export function broadcastAll(clients: Set<WsClient>, msg: object): void {
  const serialized = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WS_OPEN) {
      try { client.send(serialized); } catch {}
    }
  }
}

/**
 * Broadcast a JSON message to all clients associated with a specific session.
 * Falls back to all clients when sessionId is null/undefined (global broadcast).
 */
export function broadcastToSession(clients: Set<WsClient>, sessionId: string | null | undefined, msg: object): void {
  if (!sessionId) return broadcastAll(clients, msg);
  const serialized = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WS_OPEN && client.sessionId === sessionId) {
      try { client.send(serialized); } catch {}
    }
  }
}

/**
 * Create a broadcast function bound to the given client set.
 * The returned function accepts any object and sends to all OPEN clients.
 */
export function makeBroadcast(clients: Set<WsClient>): (msg: object) => void {
  return (msg: object) => broadcastAll(clients, msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile a WsHandlerMap into the main WebSocket message handler.
 *
 * The returned function:
 * 1. Parses the raw Buffer/string as JSON
 * 2. Looks up `data.type` in the handler map
 * 3. Calls the handler (awaiting async handlers)
 * 4. Logs unknown types at warn level
 * 5. Catches and logs handler errors without crashing the server
 *
 * Pass `opts.fallback` to handle types not in the map (e.g. a legacy catch-all).
 */
export function buildWsDispatcher(
  handlers: WsHandlerMap,
  clients: Set<WsClient>,
  opts: { fallback?: WsMessageHandler; logUnknown?: boolean } = {}
): (ws: WsClient, raw: WsRawData) => void {
  const { fallback, logUnknown = true } = opts;

  return async (ws: WsClient, raw: WsRawData) => {
    let data: WsMessage;
    try {
      const str = Buffer.isBuffer(raw) ? raw.toString('utf8')
        : raw instanceof ArrayBuffer ? Buffer.from(raw).toString('utf8')
        : Buffer.concat(raw as Buffer[]).toString('utf8');
      data = JSON.parse(str) as WsMessage;
    } catch {
      console.warn('[ws] received non-JSON message');
      return;
    }

    const type: string = data.type || '';
    const handler = handlers[type] ?? fallback;

    if (!handler) {
      if (logUnknown) console.warn(`[ws] unhandled message type: "${type}"`);
      return;
    }

    try {
      if (type === 'set-task-state' && ORCHESTRATION_QUIET_MODE) return;
      await handler(ws, data, clients);
    } catch (err: any) {
      console.error(`[ws] handler for "${type}" threw:`, err?.message ?? err);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN MESSAGE TYPES (for documentation and registry consistency)
// ─────────────────────────────────────────────────────────────────────────────

/** All known WebSocket message type strings handled by the Polaris server. */
export const WS_MESSAGE_TYPES = [
  // Session lifecycle
  'launch', 'launch-chat', 'launch-gpt', 'launch-codex', 'launch-diamond', 'launch-design',
  'launch-factory', 'launch-chrome', 'launch-thecard',
  'resume', 'stop', 'close-session', 'archive-session', 'rename-session',
  'transfer-session', 'set-session-status', 'set-task-state',
  'start-fork', 'stop-fork', 'promote-fork',
  'save-hidden-sessions', 'session-column', 'session-column-span',
  'session-height', 'session-pinned',
  // Agent interactions
  'user-question-answer', 'cost-update',
  // Cross-check / installer approvals
  'cross-check-decision', 'cross-check-post-hoc-decision',
  'installer-permission-decision', 'connect-approval-response',
  // Backlog
  'list-backlogs', 'add-backlog-task', 'update-backlog-task',
  'update-backlog-task-status', 'archive-backlog-tasks',
  // Config & API keys
  'get-config', 'save-config',
  'test-openrouter-key', 'test-anthropic-key', 'test-deepseek-key',
  'test-openai-key', 'test-brave-key', 'test-elevenlabs-key',
  'test-model', 'test-routine-api-model',
  'check-openrouter-balance', 'check-deepseek-balance',
  'refresh-openrouter-catalog',
  // MCP servers
  'get-mcp-servers', 'save-mcp-servers', 'enable-mcp-server', 'disable-mcp-server',
  'get-mcp-catalog', 'get-project-mcp-data',
  // File operations
  'read-file', 'write-file', 'delete-file', 'rename-file',
  'browse-dir', 'pick-file', 'pick-directory', 'sync-global-files',
  // Build system
  'run-build', 'run-pre-build-check', 'get-pending-builds', 'get-pre-build-check-status',
  // Archives
  'get-archives', 'get-archive-detail', 'search-archives',
  'delete-archive', 'reactivate-archive',
  // History & tokens
  'get-history', 'get-token-log',
  // Projects
  'upsert-project', 'delete-project', 'update-project-status',
  'get-project-statuses', 'set-focused-project',
  // Routines
  'upsert-routine', 'delete-routine', 'dismiss-routine-notification',
  'get-routine-notifications',
  // Obsidian
  'obsidian-up', 'obsidian-analyze', 'obsidian-commit-analysis',
  // Analytics / space
  'get-space-data', 'get-space-analysis',
  // Evaluations / benchmarks
  'start-agent-eval', 'cancel-agent-eval', 'save-agent-eval-results',
  'agent-eval-load-queue', 'write-eval-to-obsidian',
  'benchmark-load-queue', 'benchmark-save-result', 'score-eval-benchmark',
  'cleanup-eval-benchmark', 'get-eval-model-list',
  // Connections & live servers
  'get-connections', 'get-live-server-status',
  'start-live-server', 'stop-live-server',
  // Misc
  'ping', 'reload-ui', 'restart', 'get-diag', 'get-versions', 'get-manifest',
  'save-manifest', 'get-locks', 'set-lock', 'save-panel-state',
  'list-github-repos', 'list-skills', 'get-code-health',
  'open-path', 'open-url', 'launch-chrome',
  'get-tickets', 'delete-ticket', 'update-ticket-status', 'submit-support-ticket',
  'delete-queue-message', 'edit-queue-message',
  'get-espanso-replacements', 'save-espanso-replacements',
  'tts-speak', 'gdrive-oauth-start', 'domain-scout', 'domain-scout-clear',
  'emit-debug-log', 'get-course-creator-data',
] as const;

export type WsMessageType = typeof WS_MESSAGE_TYPES[number];

// ─────────────────────────────────────────────────────────────────────────────
// INJECTION INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface WsAdapterOptions {
  /** Handler registry — message type → implementation from server.js. */
  handlers: WsHandlerMap;
  /** Connected client set shared with the WS server. */
  clients: Set<WsClient>;
  /** Called on new connection to perform auth / registration. */
  onConnect?: (ws: WsClient, req: IncomingMessage) => void | Promise<void>;
  /** Called on connection close to clean up session state. */
  onDisconnect?: (ws: WsClient, code: number, reason: Buffer) => void | Promise<void>;
  /** If true, log unhandled message types as warnings. Default: true. */
  logUnknown?: boolean;
}

let _opts: WsAdapterOptions | null = null;
let _dispatcher: ((ws: WsClient, raw: WsRawData) => void) | null = null;

/**
 * Wire the WS adapter at server startup.
 * Returns the compiled message dispatcher — attach to `ws.on('message', ...)`.
 */
export function initWsAdapter(opts: WsAdapterOptions): (ws: WsClient, raw: WsRawData) => void {
  _opts = opts;
  _dispatcher = buildWsDispatcher(opts.handlers, opts.clients, {
    logUnknown: opts.logUnknown ?? true,
  });
  return _dispatcher;
}

/** Returns the compiled message dispatcher (throws if initWsAdapter not called). */
export function getWsDispatcher(): (ws: WsClient, raw: WsRawData) => void {
  if (!_dispatcher) throw new Error('[wsAdapter] initWsAdapter() must be called before getWsDispatcher()');
  return _dispatcher;
}

/** Attach a new WsClient to the WS server, running the onConnect hook if set. */
export async function attachWsClient(ws: WsClient, req: IncomingMessage): Promise<void> {
  if (_opts?.onConnect) await _opts.onConnect(ws, req);
}

/** Detach a WsClient, running the onDisconnect hook if set. */
export async function detachWsClient(ws: WsClient, code: number, reason: Buffer): Promise<void> {
  if (_opts?.onDisconnect) await _opts.onDisconnect(ws, code, reason);
}
