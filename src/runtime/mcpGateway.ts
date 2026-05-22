/**
 * @module mcpGateway
 * MCP (Model Context Protocol) server bridge for Polaris.
 *
 * Manages the lifecycle of connected MCP server processes, handles both
 * stdio-based (command) and HTTP-based (url) MCP servers, discovers available
 * tools, and dispatches tool calls with result normalization.
 *
 * MCP tool naming convention: `mcp__<serverName>__<toolName>`
 * Tool discovery caches results per allowlist key for MCP_CACHE_TTL ms.
 *
 * Dependencies: contracts (types), Node fs/path/child_process/https
 *
 * Topology: contracts ← mcpGateway ← toolRuntime ← agentRuntime, WebSocket adapter
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { ChildProcess } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Tool list cache TTL — 5 minutes. Avoids re-listing tools on every agent turn. */
export const MCP_CACHE_TTL = 5 * 60 * 1000;

/** Path to the global MCP server registry file. */
export const MCP_JSON_PATH = path.join(os.homedir(), '.mcp.json');

// ─────────────────────────────────────────────────────────────────────────────
// MCP SERVER CONFIG TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A single MCP server definition — either stdio-based or HTTP-based. */
export interface McpServerConfig {
  /** stdio: command to spawn (e.g. "node", "python") */
  command?: string;
  /** stdio: args passed to command */
  args?: string[];
  /** stdio: extra environment variables */
  env?: Record<string, string>;
  /** HTTP: base URL for the MCP server */
  url?: string;
  /** HTTP: request headers (auth tokens, etc.) */
  headers?: Record<string, string>;
}

/** Live state of a running stdio MCP process. */
export interface McpProcessState {
  proc: ChildProcess;
  /** Pending JSON-RPC requests: id → {resolve, reject} */
  pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>;
  /** Accumulation buffer for newline-delimited stdout */
  buffer: string;
  /** Auto-incrementing JSON-RPC id */
  nextId: number;
}

/** A tool entry as returned by MCP tools/list and formatted for OpenRouter. */
export interface McpToolEntry {
  type: 'function';
  function: {
    name: string;       // mcp__<server>__<tool>
    description: string;
    parameters: Record<string, any>;
  };
}

/** Cached tool discovery result. */
interface ToolCache {
  tools: McpToolEntry[];
  time: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME STATE
// ─────────────────────────────────────────────────────────────────────────────

/** Live MCP processes keyed by server name. */
export const mcpProcesses = new Map<string, McpProcessState>();

/** Tool discovery cache keyed by normalized allowlist string. */
export const mcpToolsCache = new Map<string, ToolCache>();

// Injected at init
let _readConfig: () => Record<string, any>;
let _readJSON: (p: string, fallback: any) => any;
let _writeJSON: (p: string, data: any) => void;
let _decryptSecret: (v: string) => string;
let _spawn: typeof import('child_process').spawn;

export function initMcpGateway(opts: {
  readConfig: () => Record<string, any>;
  readJSON: (p: string, fallback: any) => any;
  writeJSON: (p: string, data: any) => void;
  decryptSecret: (v: string) => string;
  spawn: typeof import('child_process').spawn;
}): void {
  _readConfig = opts.readConfig;
  _readJSON = opts.readJSON;
  _writeJSON = opts.writeJSON;
  _decryptSecret = opts.decryptSecret;
  _spawn = opts.spawn;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER REGISTRY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the set of MCP server names that Polaris has configured
 * (from ~/.claude.json / config mcpServers field).
 */
export function getEnabledMcpServers(): string[] {
  try {
    const claudeJson = _readJSON(path.join(os.homedir(), '.claude.json'), {});
    return Object.keys(claudeJson.mcpServers || {});
  } catch { return []; }
}

/**
 * Returns MCP server names from the actual Claude Code config files:
 * ~/.mcp.json (global) and optionally {workDir}/.mcp.json (project-level).
 * Reflects what Claude Code has connected, not what Polaris manages.
 */
export function getConnectedMcpServers(workDir?: string | null): string[] {
  const servers = new Set<string>();
  try {
    const g = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mcp.json'), 'utf8'));
    for (const k of Object.keys(g.mcpServers || {})) servers.add(k);
  } catch {}
  if (workDir) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(workDir, '.mcp.json'), 'utf8'));
      for (const k of Object.keys(p.mcpServers || {})) servers.add(k);
    } catch {}
  }
  return [...servers];
}

/** Returns the mcp_instances config block (custom MCP server instances). */
export function getMcpInstances(): Record<string, any> {
  return (_readConfig().mcp_instances || {});
}

/** Returns the full map of configured MCP server configs, optionally filtered by allowlist. */
export function getMcpServerConfigs(allowlist?: string[] | null): Record<string, McpServerConfig> {
  const cfg = _readConfig();
  const all: Record<string, McpServerConfig> = {};
  for (const [k, v] of Object.entries(cfg.mcp_instances || {})) {
    all[k] = v as McpServerConfig;
  }
  if (!allowlist) return all;
  return Object.fromEntries(Object.entries(all).filter(([k]) => allowlist.includes(k)));
}

/** Write a server config into ~/.mcp.json. */
export function syncServerToMcpJson(id: string, serverConfig: McpServerConfig): void {
  const mcp = _readJSON(MCP_JSON_PATH, {});
  mcp.mcpServers = mcp.mcpServers || {};
  mcp.mcpServers[id] = serverConfig;
  _writeJSON(MCP_JSON_PATH, mcp);
}

/** Remove a server from ~/.mcp.json. */
export function removeServerFromMcpJson(id: string): void {
  const mcp = _readJSON(MCP_JSON_PATH, {});
  if (mcp.mcpServers) delete mcp.mcpServers[id];
  _writeJSON(MCP_JSON_PATH, mcp);
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLOWLIST NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeMcpAllowlist(allowlist: any): string[] | null {
  if (!allowlist || !Array.isArray(allowlist) || allowlist.length === 0) return null;
  return allowlist.filter((s: any) => typeof s === 'string');
}

// ─────────────────────────────────────────────────────────────────────────────
// STDIO TRANSPORT
// ─────────────────────────────────────────────────────────────────────────────

/** Send a JSON-RPC notification (no reply expected). */
export function mcpSend(state: McpProcessState, msg: object): void {
  try { state.proc.stdin?.write(JSON.stringify(msg) + '\n'); } catch {}
}

/** Send a JSON-RPC request and await the response (with timeout). */
export function mcpStdioCall(
  state: McpProcessState,
  method: string,
  params: object,
  timeoutMs = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = state.nextId++;
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`MCP stdio timeout: ${method}`));
    }, timeoutMs);
    state.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
    });
    mcpSend(state, { jsonrpc: '2.0', id, method, params });
  });
}

/**
 * Ensure the named stdio MCP server process is running and initialized.
 * Returns the live process state; starts the process if needed.
 * Mirrors ensureMcpProcess() in server.js.
 */
export async function ensureMcpProcess(
  serverName: string,
  serverConfig: McpServerConfig
): Promise<McpProcessState> {
  const existing = mcpProcesses.get(serverName);
  if (existing && !existing.proc.killed) return existing;

  const cfg = _readConfig();
  const rawCreds: Record<string, string> = {};
  for (const [k, v] of Object.entries((cfg.mcp_credentials || {})[serverName] || {})) {
    rawCreds[k] = (typeof v === 'string' && v.startsWith('enc:')) ? _decryptSecret(v) : v as string;
  }
  const env = { ...process.env, ...(serverConfig.env || {}), ...rawCreds };

  const proc = _spawn(serverConfig.command!, serverConfig.args || [], {
    env, stdio: ['pipe', 'pipe', 'pipe'], shell: true, windowsHide: true,
  });

  const state: McpProcessState = { proc, pending: new Map(), buffer: '', nextId: 1 };
  mcpProcesses.set(serverName, state);

  proc.stdout?.on('data', (chunk: Buffer) => {
    state.buffer += chunk.toString();
    let nl: number;
    while ((nl = state.buffer.indexOf('\n')) !== -1) {
      const line = state.buffer.slice(0, nl).trim();
      state.buffer = state.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && state.pending.has(msg.id)) {
          const { resolve, reject } = state.pending.get(msg.id)!;
          state.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
          else resolve(msg.result);
        }
      } catch {}
    }
  });

  proc.on('exit', (code: number | null) => {
    console.warn(`[mcp] ${serverName} exited (${code})`);
    mcpProcesses.delete(serverName);
  });
  proc.on('error', (err: Error) => {
    console.warn(`[mcp] ${serverName} error:`, err.message);
    mcpProcesses.delete(serverName);
  });

  try {
    await mcpStdioCall(state, 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'polaris', version: '1.0' },
    });
    mcpSend(state, { jsonrpc: '2.0', method: 'notifications/initialized' });
  } catch (e: any) {
    console.warn(`[mcp] ${serverName} init failed:`, e.message);
    proc.kill();
    mcpProcesses.delete(serverName);
    throw e;
  }
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP TRANSPORT
// ─────────────────────────────────────────────────────────────────────────────

/** Send a JSON-RPC request to an HTTP MCP server. */
export function mcpHttpCall(
  url: string,
  headers: Record<string, string>,
  method: string,
  params: object,
  timeoutMs = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} });
    let urlObj: URL;
    try { urlObj = new URL(url); } catch { return reject(new Error(`Invalid MCP URL: ${url}`)); }
    const lib: typeof https | typeof http = url.startsWith('https') ? https : http;
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const req = lib.request(opts, (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (c: Buffer) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message || 'MCP HTTP error'));
          else resolve(parsed.result);
        } catch (e: any) { reject(new Error(`MCP HTTP parse: ${e.message}`)); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`MCP HTTP timeout: ${url}`)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize an MCP tool result to a plain string for the agent loop. */
export function formatMcpResult(result: any): string {
  if (!result) return '(no result)';
  if (Array.isArray(result.content)) {
    return result.content.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover all tools from configured MCP servers, optionally filtered by allowlist.
 * Results are cached for MCP_CACHE_TTL ms per allowlist combination.
 * Mirrors discoverMcpTools() in server.js.
 */
export async function discoverMcpTools(allowlist?: string[] | null): Promise<McpToolEntry[]> {
  const now = Date.now();
  const normalized = normalizeMcpAllowlist(allowlist);
  const cacheKey = normalized === null ? '__all__' : normalized.sort().join('\n');
  const cached = mcpToolsCache.get(cacheKey);
  if (cached && now - cached.time < MCP_CACHE_TTL) return cached.tools;

  const servers = getMcpServerConfigs(normalized);
  const allTools: McpToolEntry[] = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    try {
      let toolsList: any[] = [];
      if (serverConfig.url) {
        const result = await mcpHttpCall(serverConfig.url, serverConfig.headers || {}, 'tools/list', {});
        toolsList = result?.tools || [];
      } else if (serverConfig.command) {
        const state = await ensureMcpProcess(serverName, serverConfig);
        const result = await mcpStdioCall(state, 'tools/list', {});
        toolsList = result?.tools || [];
      }
      for (const tool of toolsList) {
        allTools.push({
          type: 'function',
          function: {
            name: `mcp__${serverName}__${tool.name}`,
            description: `[${serverName}] ${(tool.description || tool.name).slice(0, 400)}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
      console.log(`[mcp] ${serverName}: ${toolsList.length} tools`);
    } catch (e: any) {
      console.warn(`[mcp] ${serverName} discovery failed:`, e.message);
    }
  }

  mcpToolsCache.set(cacheKey, { tools: allTools, time: now });
  return allTools;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call a single named MCP tool on the named server and return a formatted string result.
 * Mirrors callMcpTool() in server.js.
 */
export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  const servers = getMcpServerConfigs();
  const serverConfig = servers[serverName];
  if (!serverConfig) throw new Error(`MCP server not configured: ${serverName}`);
  let result: any;
  if (serverConfig.url) {
    result = await mcpHttpCall(serverConfig.url, serverConfig.headers || {}, 'tools/call', { name: toolName, arguments: args });
  } else if (serverConfig.command) {
    const state = await ensureMcpProcess(serverName, serverConfig);
    result = await mcpStdioCall(state, 'tools/call', { name: toolName, arguments: args }, 30000);
  } else {
    throw new Error(`MCP server ${serverName} has no command or url`);
  }
  return formatMcpResult(result);
}
