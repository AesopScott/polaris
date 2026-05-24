import { describe, it, expect } from 'vitest';
import {
  MCPServer,
  MCPToolInputSchema,
  MCPToolEnvelope,
  MCPToolCall,
  MCPToolResult,
  MCPServerConfig,
} from '../../src/contracts/mcp';

// ─── MCPServer ────────────────────────────────────────────────────────────────

describe('MCPServer', () => {
  it('accepts minimal server with name and command', () => {
    const result = MCPServer.safeParse({ name: 'obsidian', command: 'npx' });
    expect(result.success).toBe(true);
  });

  it('accepts full server with args and env', () => {
    const result = MCPServer.safeParse({
      name: 'mcp-obsidian',
      command: 'npx',
      args: ['-y', 'mcp-obsidian', '--vault', 'G:\\Vault'],
      env: { OBSIDIAN_API_KEY: 'abc123' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts server without optional args', () => {
    const result = MCPServer.safeParse({ name: 'my-server', command: 'node', env: {} });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = MCPServer.safeParse({ command: 'node' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('name');
  });

  it('rejects missing command', () => {
    const result = MCPServer.safeParse({ name: 'my-server' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('command');
  });

  it('rejects non-string args elements', () => {
    const result = MCPServer.safeParse({ name: 's', command: 'c', args: [42] });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('args');
  });

  it('rejects non-string env values', () => {
    const result = MCPServer.safeParse({
      name: 's',
      command: 'c',
      env: { KEY: 123 },
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('env');
  });
});

// ─── MCPToolInputSchema ───────────────────────────────────────────────────────

describe('MCPToolInputSchema', () => {
  it('accepts a valid input schema with properties', () => {
    const result = MCPToolInputSchema.safeParse({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        count: { type: 'number' },
      },
      required: ['query'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts schema without optional required array', () => {
    const result = MCPToolInputSchema.safeParse({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty properties object', () => {
    const result = MCPToolInputSchema.safeParse({
      type: 'object',
      properties: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects wrong type value', () => {
    const result = MCPToolInputSchema.safeParse({
      type: 'array',
      properties: {},
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('type');
  });

  it('rejects missing properties', () => {
    const result = MCPToolInputSchema.safeParse({ type: 'object' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('properties');
  });
});

// ─── MCPToolEnvelope ──────────────────────────────────────────────────────────

describe('MCPToolEnvelope', () => {
  const validEnvelope = {
    name: 'obsidian_get_file_contents',
    description: 'Get the content of a file in the Obsidian vault',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filepath: { type: 'string', description: 'Path to the file' },
      },
      required: ['filepath'],
    },
  };

  it('accepts a valid tool envelope', () => {
    const result = MCPToolEnvelope.safeParse(validEnvelope);
    expect(result.success).toBe(true);
  });

  it('accepts envelope without required in inputSchema', () => {
    const result = MCPToolEnvelope.safeParse({
      ...validEnvelope,
      inputSchema: { type: 'object' as const, properties: {} },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing description', () => {
    const { description: _, ...rest } = validEnvelope;
    const result = MCPToolEnvelope.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('description');
  });

  it('rejects missing inputSchema', () => {
    const { inputSchema: _, ...rest } = validEnvelope;
    const result = MCPToolEnvelope.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('inputSchema');
  });

  it('rejects envelope with wrong inputSchema type', () => {
    const result = MCPToolEnvelope.safeParse({
      ...validEnvelope,
      inputSchema: { type: 'array', properties: {} },
    });
    expect(result.success).toBe(false);
  });
});

// ─── MCPToolCall ──────────────────────────────────────────────────────────────

describe('MCPToolCall', () => {
  it('accepts minimal tool call with no arguments', () => {
    const result = MCPToolCall.safeParse({ name: 'list_files', arguments: {} });
    expect(result.success).toBe(true);
  });

  it('accepts tool call with string arguments', () => {
    const result = MCPToolCall.safeParse({
      name: 'obsidian_get_file_contents',
      arguments: { filepath: 'Polaris_Build/Soul.md' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts tool call with mixed argument types', () => {
    const result = MCPToolCall.safeParse({
      name: 'search_tool',
      arguments: {
        query: 'zod',
        limit: 10,
        includeArchive: false,
        tags: ['typescript', 'validation'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = MCPToolCall.safeParse({ arguments: {} });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('name');
  });

  it('rejects missing arguments', () => {
    const result = MCPToolCall.safeParse({ name: 'my_tool' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('arguments');
  });

  it('rejects non-object arguments', () => {
    const result = MCPToolCall.safeParse({ name: 'my_tool', arguments: 'string-args' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('arguments');
  });
});

// ─── MCPToolResult ────────────────────────────────────────────────────────────

describe('MCPToolResult', () => {
  it('accepts a text content result', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'text', text: 'File contents here' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an image content result', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'image', data: 'base64encodeddata==', mimeType: 'image/png' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a resource content result', () => {
    const result = MCPToolResult.safeParse({
      content: [
        {
          type: 'resource',
          uri: 'file:///vault/Soul.md',
          mimeType: 'text/markdown',
          text: '# Soul',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts resource without optional mimeType and text', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'resource', uri: 'file:///vault/note.md' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple content items of different types', () => {
    const result = MCPToolResult.safeParse({
      content: [
        { type: 'text', text: 'Summary:' },
        { type: 'image', data: 'imgdata', mimeType: 'image/jpeg' },
      ],
      isError: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts error result with isError=true', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'text', text: 'Tool execution failed: file not found' }],
      isError: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty content array (no minimum item constraint in schema)', () => {
    // Empty array is valid per the schema — the array type has no minLength constraint
    const result = MCPToolResult.safeParse({ content: [] });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = MCPToolResult.safeParse({ isError: false });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('content');
  });

  it('rejects unknown content type', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'video', url: 'https://example.com/vid' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects text content missing the text field', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'text' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects image content missing mimeType', () => {
    const result = MCPToolResult.safeParse({
      content: [{ type: 'image', data: 'base64data' }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── MCPServerConfig ──────────────────────────────────────────────────────────

describe('MCPServerConfig', () => {
  it('accepts a valid config with one server', () => {
    const result = MCPServerConfig.safeParse({
      mcpServers: {
        'mcp-obsidian': {
          name: 'mcp-obsidian',
          command: 'npx',
          args: ['-y', 'mcp-obsidian'],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty mcpServers object', () => {
    const result = MCPServerConfig.safeParse({ mcpServers: {} });
    expect(result.success).toBe(true);
  });

  it('accepts config with multiple servers', () => {
    const result = MCPServerConfig.safeParse({
      mcpServers: {
        obsidian: { name: 'obsidian', command: 'npx', args: ['-y', 'mcp-obsidian'] },
        brave: { name: 'brave', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing mcpServers', () => {
    const result = MCPServerConfig.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('mcpServers');
  });

  it('rejects invalid server value inside mcpServers', () => {
    const result = MCPServerConfig.safeParse({
      mcpServers: {
        bad: { name: 'bad' }, // missing command
      },
    });
    expect(result.success).toBe(false);
  });
});
