"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServerConfig = exports.MCPToolResult = exports.MCPToolCall = exports.MCPToolEnvelope = exports.MCPToolInputSchema = exports.MCPServer = void 0;
const zod_1 = require("zod");
exports.MCPServer = zod_1.z.object({
    name: zod_1.z.string(),
    command: zod_1.z.string(),
    args: zod_1.z.array(zod_1.z.string()).optional(),
    env: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
});
exports.MCPToolInputSchema = zod_1.z.object({
    type: zod_1.z.literal('object'),
    properties: zod_1.z.record(zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())),
    required: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.MCPToolEnvelope = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    inputSchema: exports.MCPToolInputSchema,
});
exports.MCPToolCall = zod_1.z.object({
    name: zod_1.z.string(),
    arguments: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
exports.MCPToolResult = zod_1.z.object({
    content: zod_1.z.array(zod_1.z.union([
        zod_1.z.object({ type: zod_1.z.literal('text'), text: zod_1.z.string() }),
        zod_1.z.object({ type: zod_1.z.literal('image'), data: zod_1.z.string(), mimeType: zod_1.z.string() }),
        zod_1.z.object({ type: zod_1.z.literal('resource'), uri: zod_1.z.string(), mimeType: zod_1.z.string().optional(), text: zod_1.z.string().optional() }),
    ])),
    isError: zod_1.z.boolean().optional(),
});
exports.MCPServerConfig = zod_1.z.object({
    mcpServers: zod_1.z.record(zod_1.z.string(), exports.MCPServer),
});
