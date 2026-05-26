import { z } from 'zod';
export declare const ReadInput: z.ZodObject<{
    file_path: z.ZodString;
    offset: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
    pages: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    file_path: string;
    offset?: number | undefined;
    limit?: number | undefined;
    pages?: string | undefined;
}, {
    file_path: string;
    offset?: number | undefined;
    limit?: number | undefined;
    pages?: string | undefined;
}>;
export declare const WriteInput: z.ZodObject<{
    file_path: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    file_path: string;
}, {
    content: string;
    file_path: string;
}>;
export declare const EditInput: z.ZodObject<{
    file_path: z.ZodString;
    old_string: z.ZodString;
    new_string: z.ZodString;
    replace_all: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean | undefined;
}, {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean | undefined;
}>;
export declare const GlobInput: z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    pattern: string;
    path?: string | undefined;
}, {
    pattern: string;
    path?: string | undefined;
}>;
export declare const GrepInput: z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    glob: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    output_mode: z.ZodOptional<z.ZodEnum<["content", "files_with_matches", "count"]>>;
    context: z.ZodOptional<z.ZodNumber>;
    head_limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    '-i': z.ZodOptional<z.ZodBoolean>;
    '-n': z.ZodOptional<z.ZodBoolean>;
    '-A': z.ZodOptional<z.ZodNumber>;
    '-B': z.ZodOptional<z.ZodNumber>;
    '-C': z.ZodOptional<z.ZodNumber>;
    multiline: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    pattern: string;
    path?: string | undefined;
    type?: string | undefined;
    offset?: number | undefined;
    glob?: string | undefined;
    output_mode?: "content" | "files_with_matches" | "count" | undefined;
    context?: number | undefined;
    head_limit?: number | undefined;
    '-i'?: boolean | undefined;
    '-n'?: boolean | undefined;
    '-A'?: number | undefined;
    '-B'?: number | undefined;
    '-C'?: number | undefined;
    multiline?: boolean | undefined;
}, {
    pattern: string;
    path?: string | undefined;
    type?: string | undefined;
    offset?: number | undefined;
    glob?: string | undefined;
    output_mode?: "content" | "files_with_matches" | "count" | undefined;
    context?: number | undefined;
    head_limit?: number | undefined;
    '-i'?: boolean | undefined;
    '-n'?: boolean | undefined;
    '-A'?: number | undefined;
    '-B'?: number | undefined;
    '-C'?: number | undefined;
    multiline?: boolean | undefined;
}>;
export declare const BashInput: z.ZodObject<{
    command: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
    run_in_background: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    command: string;
    description?: string | undefined;
    timeout?: number | undefined;
    run_in_background?: boolean | undefined;
}, {
    command: string;
    description?: string | undefined;
    timeout?: number | undefined;
    run_in_background?: boolean | undefined;
}>;
export declare const PowerShellInput: z.ZodObject<{
    command: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
    run_in_background: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    command: string;
    description?: string | undefined;
    timeout?: number | undefined;
    run_in_background?: boolean | undefined;
}, {
    command: string;
    description?: string | undefined;
    timeout?: number | undefined;
    run_in_background?: boolean | undefined;
}>;
export declare const WebFetchInput: z.ZodObject<{
    url: z.ZodString;
    method: z.ZodOptional<z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | undefined;
    headers?: Record<string, string> | undefined;
    body?: string | undefined;
}, {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | undefined;
    headers?: Record<string, string> | undefined;
    body?: string | undefined;
}>;
export declare const WebSearchInput: z.ZodObject<{
    query: z.ZodString;
    count: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    query: string;
    count?: number | undefined;
}, {
    query: string;
    count?: number | undefined;
}>;
export declare const AskUserQuestionOption: z.ZodObject<{
    label: z.ZodString;
    description: z.ZodString;
    preview: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    label: string;
    preview?: string | undefined;
}, {
    description: string;
    label: string;
    preview?: string | undefined;
}>;
export declare const AskUserQuestionItem: z.ZodObject<{
    question: z.ZodString;
    header: z.ZodString;
    options: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        description: z.ZodString;
        preview: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        label: string;
        preview?: string | undefined;
    }, {
        description: string;
        label: string;
        preview?: string | undefined;
    }>, "many">;
    multiSelect: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    options: {
        description: string;
        label: string;
        preview?: string | undefined;
    }[];
    question: string;
    header: string;
    multiSelect: boolean;
}, {
    options: {
        description: string;
        label: string;
        preview?: string | undefined;
    }[];
    question: string;
    header: string;
    multiSelect: boolean;
}>;
export declare const AskUserQuestionInput: z.ZodObject<{
    questions: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        header: z.ZodString;
        options: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            description: z.ZodString;
            preview: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            description: string;
            label: string;
            preview?: string | undefined;
        }, {
            description: string;
            label: string;
            preview?: string | undefined;
        }>, "many">;
        multiSelect: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        options: {
            description: string;
            label: string;
            preview?: string | undefined;
        }[];
        question: string;
        header: string;
        multiSelect: boolean;
    }, {
        options: {
            description: string;
            label: string;
            preview?: string | undefined;
        }[];
        question: string;
        header: string;
        multiSelect: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    questions: {
        options: {
            description: string;
            label: string;
            preview?: string | undefined;
        }[];
        question: string;
        header: string;
        multiSelect: boolean;
    }[];
}, {
    questions: {
        options: {
            description: string;
            label: string;
            preview?: string | undefined;
        }[];
        question: string;
        header: string;
        multiSelect: boolean;
    }[];
}>;
export declare const TodoItem: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    status: z.ZodEnum<["pending", "in_progress", "completed"]>;
    priority: z.ZodEnum<["high", "medium", "low"]>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "in_progress" | "completed";
    priority: "high" | "medium" | "low";
    content: string;
    id: string;
}, {
    status: "pending" | "in_progress" | "completed";
    priority: "high" | "medium" | "low";
    content: string;
    id: string;
}>;
export declare const TodoWriteInput: z.ZodObject<{
    todos: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        status: z.ZodEnum<["pending", "in_progress", "completed"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "in_progress" | "completed";
        priority: "high" | "medium" | "low";
        content: string;
        id: string;
    }, {
        status: "pending" | "in_progress" | "completed";
        priority: "high" | "medium" | "low";
        content: string;
        id: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    todos: {
        status: "pending" | "in_progress" | "completed";
        priority: "high" | "medium" | "low";
        content: string;
        id: string;
    }[];
}, {
    todos: {
        status: "pending" | "in_progress" | "completed";
        priority: "high" | "medium" | "low";
        content: string;
        id: string;
    }[];
}>;
export declare const QueryMemoryInput: z.ZodObject<{
    query: z.ZodString;
    project: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    query: string;
    project?: string | undefined;
}, {
    query: string;
    project?: string | undefined;
}>;
export declare const SetProjectInput: z.ZodObject<{
    projectName: z.ZodString;
    workDir: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    projectName: string;
    workDir?: string | undefined;
}, {
    projectName: string;
    workDir?: string | undefined;
}>;
export declare const SetStatusInput: z.ZodObject<{
    status: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: string;
    sessionId?: string | undefined;
}, {
    status: string;
    sessionId?: string | undefined;
}>;
export declare const ToolResult: z.ZodObject<{
    type: z.ZodEnum<["text", "error", "image"]>;
    content: z.ZodUnion<[z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>]>;
    isError: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "text" | "image" | "error";
    content: string | Record<string, unknown>;
    isError?: boolean | undefined;
}, {
    type: "text" | "image" | "error";
    content: string | Record<string, unknown>;
    isError?: boolean | undefined;
}>;
export declare const DIRECT_TOOL_NAMES: readonly ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "PowerShell", "WebFetch", "WebSearch", "AskUserQuestion", "TodoWrite", "QueryMemory", "SetProject", "SetStatus"];
export declare const DirectToolName: z.ZodEnum<["Read", "Write", "Edit", "Glob", "Grep", "Bash", "PowerShell", "WebFetch", "WebSearch", "AskUserQuestion", "TodoWrite", "QueryMemory", "SetProject", "SetStatus"]>;
export type DirectToolNameType = z.infer<typeof DirectToolName>;
