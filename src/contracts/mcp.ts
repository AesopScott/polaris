import { z } from 'zod';

export const MCPServer = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export type MCPServerType = z.infer<typeof MCPServer>;

export const MCPToolInputSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), z.record(z.string(), z.unknown())),
  required: z.array(z.string()).optional(),
});

export const MCPToolEnvelope = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: MCPToolInputSchema,
});

export type MCPToolEnvelopeType = z.infer<typeof MCPToolEnvelope>;

export const MCPToolCall = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

export const MCPToolResult = z.object({
  content: z.array(
    z.union([
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
      z.object({ type: z.literal('resource'), uri: z.string(), mimeType: z.string().optional(), text: z.string().optional() }),
    ])
  ),
  isError: z.boolean().optional(),
});

export const MCPServerConfig = z.object({
  mcpServers: z.record(z.string(), MCPServer),
});
