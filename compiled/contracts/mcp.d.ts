import { z } from 'zod';
export declare const MCPServer: z.ZodObject<{
    name: z.ZodString;
    command: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    command: string;
    args?: string[] | undefined;
    env?: Record<string, string> | undefined;
}, {
    name: string;
    command: string;
    args?: string[] | undefined;
    env?: Record<string, string> | undefined;
}>;
export type MCPServerType = z.infer<typeof MCPServer>;
export declare const MCPToolInputSchema: z.ZodObject<{
    type: z.ZodLiteral<"object">;
    properties: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required?: string[] | undefined;
}, {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required?: string[] | undefined;
}>;
export declare const MCPToolEnvelope: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    inputSchema: z.ZodObject<{
        type: z.ZodLiteral<"object">;
        properties: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "object";
        properties: Record<string, Record<string, unknown>>;
        required?: string[] | undefined;
    }, {
        type: "object";
        properties: Record<string, Record<string, unknown>>;
        required?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    description: string;
    name: string;
    inputSchema: {
        type: "object";
        properties: Record<string, Record<string, unknown>>;
        required?: string[] | undefined;
    };
}, {
    description: string;
    name: string;
    inputSchema: {
        type: "object";
        properties: Record<string, Record<string, unknown>>;
        required?: string[] | undefined;
    };
}>;
export type MCPToolEnvelopeType = z.infer<typeof MCPToolEnvelope>;
export declare const MCPToolCall: z.ZodObject<{
    name: z.ZodString;
    arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    name: string;
    arguments: Record<string, unknown>;
}, {
    name: string;
    arguments: Record<string, unknown>;
}>;
export declare const MCPToolResult: z.ZodObject<{
    content: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"image">;
        data: z.ZodString;
        mimeType: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "image";
        data: string;
        mimeType: string;
    }, {
        type: "image";
        data: string;
        mimeType: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"resource">;
        uri: z.ZodString;
        mimeType: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "resource";
        uri: string;
        text?: string | undefined;
        mimeType?: string | undefined;
    }, {
        type: "resource";
        uri: string;
        text?: string | undefined;
        mimeType?: string | undefined;
    }>]>, "many">;
    isError: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    content: ({
        type: "text";
        text: string;
    } | {
        type: "image";
        data: string;
        mimeType: string;
    } | {
        type: "resource";
        uri: string;
        text?: string | undefined;
        mimeType?: string | undefined;
    })[];
    isError?: boolean | undefined;
}, {
    content: ({
        type: "text";
        text: string;
    } | {
        type: "image";
        data: string;
        mimeType: string;
    } | {
        type: "resource";
        uri: string;
        text?: string | undefined;
        mimeType?: string | undefined;
    })[];
    isError?: boolean | undefined;
}>;
export declare const MCPServerConfig: z.ZodObject<{
    mcpServers: z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodString;
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        command: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }, {
        name: string;
        command: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    mcpServers: Record<string, {
        name: string;
        command: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }>;
}, {
    mcpServers: Record<string, {
        name: string;
        command: string;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
    }>;
}>;
