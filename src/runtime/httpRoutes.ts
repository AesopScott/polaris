/**
 * @module httpRoutes
 * HTTP routing infrastructure and response utilities for Polaris.
 *
 * The Polaris server uses raw Node.js HTTP (no Express). All routing is manual
 * method + URL matching. This module provides:
 *   - RouteHandler / RouteEntry types for the route table
 *   - buildRequestHandler() — compiles a route table into the main HTTP dispatcher
 *   - initHttpRoutes() — wires handler implementations injected from server.js
 *   - parseJsonBody(), sendJson(), sendError(), send404() — shared HTTP utilities
 *
 * Route patterns:
 *   - Exact match  (prefix: false) — req.url must equal path exactly
 *   - Prefix match (prefix: true)  — req.url must start with path
 *
 * Dependencies: Node http
 *
 * Topology: contracts ← httpRoutes ← WebSocket adapter / server.js orchestrator
 */

import { IncomingMessage, ServerResponse } from 'http';
import { ORCHESTRATION_QUIET_MODE } from './featureFlags';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP method strings used in route entries. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

/**
 * A route handler function.
 * Receives the raw request, response, and the already-parsed URL (base = 'http://localhost').
 * Must call res.end() or delegate to another handler — never leave it open.
 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) => void | Promise<void>;

/** A single entry in the route table. */
export interface RouteEntry {
  method: HttpMethod | '*';       // '*' matches any method (used for CORS OPTIONS)
  path: string;                   // URL path to match
  prefix: boolean;                // true = startsWith match; false = exact match
  handler: RouteHandler;
}

/** Function that reads the full request body as a string. */
export type BodyReader = (req: IncomingMessage) => Promise<string>;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HTTP UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Read the full request body as a UTF-8 string. */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Parse the request body as JSON. Throws SyntaxError on invalid JSON. */
export async function parseJsonBody<T = Record<string, any>>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  return JSON.parse(raw) as T;
}

/** Write a JSON response. */
export function sendJson(
  res: ServerResponse,
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

/** Write a JSON error response. */
export function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJson(res, { error: message }, status);
}

/** Write a 404 Not Found response. */
export function send404(res: ServerResponse): void {
  sendJson(res, { error: 'Not found' }, 404);
}

/** Write a 405 Method Not Allowed response. */
export function send405(res: ServerResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, { error: 'Method not allowed' }, 405);
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE TABLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile a route table into a single Node.js HTTP request handler.
 *
 * Matching order: routes are tested in the order they appear in the table.
 * First match wins. A route with prefix: true matches any URL that starts with
 * the given path; prefix: false requires an exact match.
 *
 * The method '*' matches any HTTP method — useful for CORS OPTIONS fallthrough.
 */
export function buildRequestHandler(routes: RouteEntry[]): (req: IncomingMessage, res: ServerResponse) => void {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url || '/';
    const url = new URL(rawUrl, 'http://localhost');
    const method = (req.method || 'GET').toUpperCase() as HttpMethod;
    const urlPath = url.pathname;

    for (const route of routes) {
      const methodMatch = route.method === '*' || route.method === method;
      const pathMatch = route.prefix
        ? urlPath.startsWith(route.path)
        : urlPath === route.path;

      if (methodMatch && pathMatch) {
        try {
          await route.handler(req, res, url);
        } catch (err: any) {
          console.error(`[http] ${method} ${urlPath} threw:`, err?.message ?? err);
          if (!res.headersSent) sendError(res, 'Internal server error');
        }
        return;
      }
    }

    send404(res);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE TABLE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/** Fluent helpers for building RouteEntry arrays. */
export function route(
  method: HttpMethod | '*',
  path: string,
  handler: RouteHandler,
  prefix = false
): RouteEntry {
  return { method, path, prefix, handler };
}

export const GET     = (path: string, h: RouteHandler, prefix = false): RouteEntry => route('GET',     path, h, prefix);
export const POST    = (path: string, h: RouteHandler, prefix = false): RouteEntry => route('POST',    path, h, prefix);
export const OPTIONS = (path: string, h: RouteHandler, prefix = false): RouteEntry => route('OPTIONS', path, h, prefix);
export const ANY     = (path: string, h: RouteHandler, prefix = false): RouteEntry => route('*',       path, h, prefix);

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN ROUTE PATHS (for documentation and registry consistency)
// ─────────────────────────────────────────────────────────────────────────────

/** All registered HTTP route paths in the Polaris server. */
export const HTTP_ROUTES = {
  ROOT:                   '/',
  STATIC_JS:              '/js/',
  STATIC_MONACO:          '/monaco-vs/',
  STATIC_FONTS:           '/fonts/',
  LOCAL_FILE_PREVIEW:     '/local/',
  HEALTH:                 '/health',
  VIDEO_DEPS:             '/video-deps',
  VIDEO_DEPS_INSTALL:     '/video-deps/install',
  RUN_SUMMARY:            '/run-summary',
  API_TIME:               '/api/time',
  SPACE_EVENT:            '/space/event',
  CROSS_CHECK_FROM_HOOK:  '/api/cross-check-from-hook',
  POLARIS_MCP:            '/polaris-mcp',
  MCP_TOOL:               '/mcp/',
  SET_PROJECT:            '/set-project',
  SET_FOCUSED_PROJECT:    '/set-focused-project',
  API_LAUNCH_ROUTINE:     '/api/launch-routine',
  DISPATCH_AGENT:         '/dispatch-agent',
} as const;

export type HttpRoutePath = typeof HTTP_ROUTES[keyof typeof HTTP_ROUTES];

// ─────────────────────────────────────────────────────────────────────────────
// INJECTION INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler implementations injected from server.js.
 * Each key maps to one or more HTTP_ROUTES paths.
 */
export interface HttpRouteHandlers {
  /** GET /  — serve mockup.html */
  serveRoot: RouteHandler;
  /** GET /js/*  — static JS/CSS assets */
  serveStaticJs: RouteHandler;
  /** GET /monaco-vs/*  — Monaco Editor library files */
  serveMonaco: RouteHandler;
  /** GET /fonts/*  — font files */
  serveFonts: RouteHandler;
  /** GET /local/*  — preview panel project file server */
  serveLocalFile: RouteHandler;
  /** GET /health  — health check */
  serveHealth: RouteHandler;
  /** GET /video-deps  — ffmpeg / yt-dlp detection */
  getVideoDeps: RouteHandler;
  /** POST /video-deps/install  — trigger winget install */
  installVideoDeps: RouteHandler;
  /** POST /run-summary  — git repo summary */
  runSummary: RouteHandler;
  /** GET /api/time  — server wall-clock time */
  getServerTime: RouteHandler;
  /** POST /space/event  — space analytics event */
  spaceEvent: RouteHandler;
  /** POST /api/cross-check-from-hook  — PostToolUse hook cross-check */
  crossCheckFromHook: RouteHandler;
  /** OPTIONS /polaris-mcp  — CORS preflight */
  mcpCorsOptions: RouteHandler;
  /** POST /polaris-mcp  — JSON-RPC 2.0 MCP endpoint */
  polarisMcp: RouteHandler;
  /** POST /mcp/*  — native MCP tool dispatch */
  mcpTool: RouteHandler;
  /** POST /set-project  — legacy set-project */
  setProject: RouteHandler;
  /** POST /set-focused-project  — focused project config */
  setFocusedProject: RouteHandler;
  /** POST /api/launch-routine  — launch a scheduled routine */
  launchRoutine: RouteHandler;
  /** POST /dispatch-agent  — agent dispatch from LangGraph */
  dispatchAgent: RouteHandler;
}

// Injected at init
let _handlers: HttpRouteHandlers | null = null;
let _compiledHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

/**
 * Wire handler implementations and compile the route table into the main HTTP dispatcher.
 * Call this once during server startup, then pass the returned function to http.createServer().
 */
export function initHttpRoutes(handlers: HttpRouteHandlers): (req: IncomingMessage, res: ServerResponse) => void {
  _handlers = handlers;

  const routes: RouteEntry[] = [
    // Static assets — prefix-match so trailing path segments are handled by the handler
    GET(HTTP_ROUTES.STATIC_JS,      handlers.serveStaticJs,   true),
    GET(HTTP_ROUTES.STATIC_MONACO,  handlers.serveMonaco,     true),
    GET(HTTP_ROUTES.STATIC_FONTS,   handlers.serveFonts,      true),
    GET(HTTP_ROUTES.LOCAL_FILE_PREVIEW, handlers.serveLocalFile, true),
    // MCP — OPTIONS before POST so preflight is caught first
    OPTIONS(HTTP_ROUTES.POLARIS_MCP, handlers.mcpCorsOptions),
    POST(HTTP_ROUTES.POLARIS_MCP,    handlers.polarisMcp),
    POST(HTTP_ROUTES.MCP_TOOL,       handlers.mcpTool, true),
    // API endpoints
    GET( HTTP_ROUTES.HEALTH,                 handlers.serveHealth),
    GET( HTTP_ROUTES.VIDEO_DEPS,             handlers.getVideoDeps),
    POST(HTTP_ROUTES.VIDEO_DEPS_INSTALL,     handlers.installVideoDeps),
    POST(HTTP_ROUTES.RUN_SUMMARY,            handlers.runSummary),
    GET( HTTP_ROUTES.API_TIME,               handlers.getServerTime),
    POST(HTTP_ROUTES.SPACE_EVENT,            handlers.spaceEvent),
    POST(HTTP_ROUTES.CROSS_CHECK_FROM_HOOK,  handlers.crossCheckFromHook),
    POST(HTTP_ROUTES.SET_PROJECT,            handlers.setProject),
    POST(HTTP_ROUTES.SET_FOCUSED_PROJECT,    handlers.setFocusedProject),
    POST(HTTP_ROUTES.API_LAUNCH_ROUTINE,     handlers.launchRoutine),
    ...(!ORCHESTRATION_QUIET_MODE ? [POST(HTTP_ROUTES.DISPATCH_AGENT, handlers.dispatchAgent)] : []),
    // Root last — catches / after all prefixed routes
    GET(HTTP_ROUTES.ROOT, handlers.serveRoot),
  ];

  _compiledHandler = buildRequestHandler(routes);
  return _compiledHandler;
}

/** Return the compiled handler (throws if initHttpRoutes has not been called). */
export function getHttpHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  if (!_compiledHandler) throw new Error('[httpRoutes] initHttpRoutes() must be called before getHttpHandler()');
  return _compiledHandler;
}
