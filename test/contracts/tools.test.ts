import { describe, it, expect } from 'vitest';
import {
  ReadInput,
  WriteInput,
  EditInput,
  GlobInput,
  GrepInput,
  BashInput,
  PowerShellInput,
  WebFetchInput,
  WebSearchInput,
  AskUserQuestionInput,
  TodoWriteInput,
  QueryMemoryInput,
  SetProjectInput,
  SetStatusInput,
  ToolResult,
  DirectToolName,
} from '../../src/contracts/tools';

// ─── ReadInput ────────────────────────────────────────────────────────────────

describe('ReadInput', () => {
  it('accepts minimal read with only file_path', () => {
    const result = ReadInput.safeParse({ file_path: 'C:\\file.txt' });
    expect(result.success).toBe(true);
  });

  it('accepts read with offset and limit', () => {
    const result = ReadInput.safeParse({ file_path: 'C:\\file.txt', offset: 10, limit: 50 });
    expect(result.success).toBe(true);
  });

  it('accepts read with pages for PDF', () => {
    const result = ReadInput.safeParse({ file_path: 'C:\\doc.pdf', pages: '1-5' });
    expect(result.success).toBe(true);
  });

  it('rejects missing file_path', () => {
    const result = ReadInput.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('file_path');
  });

  it('rejects negative offset', () => {
    const result = ReadInput.safeParse({ file_path: 'C:\\f.txt', offset: -1 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('offset');
  });

  it('rejects non-positive limit', () => {
    const result = ReadInput.safeParse({ file_path: 'C:\\f.txt', limit: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('limit');
  });
});

// ─── WriteInput ───────────────────────────────────────────────────────────────

describe('WriteInput', () => {
  it('accepts valid write', () => {
    const result = WriteInput.safeParse({ file_path: 'C:\\out.txt', content: 'hello' });
    expect(result.success).toBe(true);
  });

  it('accepts empty content string', () => {
    const result = WriteInput.safeParse({ file_path: 'C:\\out.txt', content: '' });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = WriteInput.safeParse({ file_path: 'C:\\out.txt' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('content');
  });
});

// ─── EditInput ────────────────────────────────────────────────────────────────

describe('EditInput', () => {
  const validEdit = {
    file_path: 'C:\\file.ts',
    old_string: 'foo',
    new_string: 'bar',
  };

  it('accepts minimal edit', () => {
    const result = EditInput.safeParse(validEdit);
    expect(result.success).toBe(true);
  });

  it('accepts edit with replace_all flag', () => {
    const result = EditInput.safeParse({ ...validEdit, replace_all: true });
    expect(result.success).toBe(true);
  });

  it('rejects missing old_string', () => {
    const { old_string: _, ...rest } = validEdit;
    const result = EditInput.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('old_string');
  });

  it('rejects non-boolean replace_all', () => {
    const result = EditInput.safeParse({ ...validEdit, replace_all: 'yes' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('replace_all');
  });
});

// ─── GlobInput ────────────────────────────────────────────────────────────────

describe('GlobInput', () => {
  it('accepts pattern-only glob', () => {
    const result = GlobInput.safeParse({ pattern: '**/*.ts' });
    expect(result.success).toBe(true);
  });

  it('accepts glob with optional path', () => {
    const result = GlobInput.safeParse({ pattern: '*.json', path: 'C:\\src' });
    expect(result.success).toBe(true);
  });

  it('rejects missing pattern', () => {
    const result = GlobInput.safeParse({ path: 'C:\\src' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('pattern');
  });
});

// ─── GrepInput ────────────────────────────────────────────────────────────────

describe('GrepInput', () => {
  it('accepts minimal grep with only pattern', () => {
    const result = GrepInput.safeParse({ pattern: 'foo.*bar' });
    expect(result.success).toBe(true);
  });

  it('accepts grep with all optional fields', () => {
    const result = GrepInput.safeParse({
      pattern: 'import.*zod',
      path: 'C:\\src',
      glob: '**/*.ts',
      type: 'ts',
      output_mode: 'content',
      context: 3,
      head_limit: 100,
      offset: 0,
      '-i': true,
      '-n': true,
      '-A': 2,
      '-B': 1,
      '-C': 2,
      multiline: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid output_mode', () => {
    const result = GrepInput.safeParse({ pattern: 'foo', output_mode: 'lines' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('output_mode');
  });

  it('rejects negative context', () => {
    const result = GrepInput.safeParse({ pattern: 'foo', context: -1 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('context');
  });
});

// ─── BashInput / PowerShellInput ─────────────────────────────────────────────

describe('BashInput', () => {
  it('accepts minimal bash command', () => {
    const result = BashInput.safeParse({ command: 'ls -la' });
    expect(result.success).toBe(true);
  });

  it('accepts bash with all optional fields', () => {
    const result = BashInput.safeParse({
      command: 'npm test',
      description: 'Run tests',
      timeout: 30000,
      run_in_background: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing command', () => {
    const result = BashInput.safeParse({ description: 'no command' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('command');
  });

  it('rejects non-positive timeout', () => {
    const result = BashInput.safeParse({ command: 'ls', timeout: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('timeout');
  });
});

describe('PowerShellInput', () => {
  it('accepts minimal PowerShell command', () => {
    const result = PowerShellInput.safeParse({ command: 'Get-ChildItem' });
    expect(result.success).toBe(true);
  });

  it('accepts PowerShell with timeout and background', () => {
    const result = PowerShellInput.safeParse({
      command: 'Start-Sleep 5',
      timeout: 10000,
      run_in_background: true,
    });
    expect(result.success).toBe(true);
  });
});

// ─── WebFetchInput ────────────────────────────────────────────────────────────

describe('WebFetchInput', () => {
  it('accepts minimal GET request', () => {
    const result = WebFetchInput.safeParse({ url: 'https://api.example.com/data' });
    expect(result.success).toBe(true);
  });

  it('accepts POST with headers and body', () => {
    const result = WebFetchInput.safeParse({
      url: 'https://api.example.com/submit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL format', () => {
    const result = WebFetchInput.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('url');
  });

  it('rejects invalid HTTP method', () => {
    const result = WebFetchInput.safeParse({
      url: 'https://example.com',
      method: 'SEND',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('method');
  });
});

// ─── WebSearchInput ───────────────────────────────────────────────────────────

describe('WebSearchInput', () => {
  it('accepts minimal search query', () => {
    const result = WebSearchInput.safeParse({ query: 'vitest typescript tutorial' });
    expect(result.success).toBe(true);
  });

  it('accepts search with count', () => {
    const result = WebSearchInput.safeParse({ query: 'zod validation', count: 10 });
    expect(result.success).toBe(true);
  });

  it('rejects missing query', () => {
    const result = WebSearchInput.safeParse({ count: 5 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('query');
  });

  it('rejects non-positive count', () => {
    const result = WebSearchInput.safeParse({ query: 'test', count: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('count');
  });
});

// ─── AskUserQuestionInput ─────────────────────────────────────────────────────

describe('AskUserQuestionInput', () => {
  const validQuestion = {
    question: 'Which option do you prefer?',
    header: 'Preference',
    options: [
      { label: 'Option A', description: 'First choice' },
      { label: 'Option B', description: 'Second choice' },
    ],
    multiSelect: false,
  };

  it('accepts a single valid question', () => {
    const result = AskUserQuestionInput.safeParse({ questions: [validQuestion] });
    expect(result.success).toBe(true);
  });

  it('accepts up to 4 questions', () => {
    const questions = Array.from({ length: 4 }, (_, i) => ({
      ...validQuestion,
      question: `Question ${i + 1}?`,
    }));
    const result = AskUserQuestionInput.safeParse({ questions });
    expect(result.success).toBe(true);
  });

  it('accepts options with optional preview', () => {
    const result = AskUserQuestionInput.safeParse({
      questions: [
        {
          ...validQuestion,
          options: [
            { label: 'A', description: 'Option A', preview: '```ts\nconst a = 1;\n```' },
            { label: 'B', description: 'Option B' },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty questions array', () => {
    const result = AskUserQuestionInput.safeParse({ questions: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 questions', () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({
      ...validQuestion,
      question: `Question ${i + 1}?`,
    }));
    const result = AskUserQuestionInput.safeParse({ questions });
    expect(result.success).toBe(false);
  });

  it('rejects header longer than 12 chars', () => {
    const result = AskUserQuestionInput.safeParse({
      questions: [{ ...validQuestion, header: 'TooLongHeader' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('header');
  });

  it('rejects question with only 1 option', () => {
    const result = AskUserQuestionInput.safeParse({
      questions: [
        {
          ...validQuestion,
          options: [{ label: 'Only option', description: 'Solo' }],
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('options');
  });

  it('rejects question with more than 4 options', () => {
    const options = Array.from({ length: 5 }, (_, i) => ({
      label: `Option ${i}`,
      description: `Desc ${i}`,
    }));
    const result = AskUserQuestionInput.safeParse({
      questions: [{ ...validQuestion, options }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('options');
  });
});

// ─── TodoWriteInput ───────────────────────────────────────────────────────────

describe('TodoWriteInput', () => {
  it('accepts empty todos list', () => {
    const result = TodoWriteInput.safeParse({ todos: [] });
    expect(result.success).toBe(true);
  });

  it('accepts valid todos', () => {
    const result = TodoWriteInput.safeParse({
      todos: [
        { id: 't1', content: 'Write tests', status: 'in_progress', priority: 'high' },
        { id: 't2', content: 'Run tests', status: 'pending', priority: 'medium' },
        { id: 't3', content: 'Review code', status: 'completed', priority: 'low' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid todo status', () => {
    const result = TodoWriteInput.safeParse({
      todos: [{ id: 't1', content: 'Task', status: 'done', priority: 'high' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('status');
  });

  it('rejects invalid todo priority', () => {
    const result = TodoWriteInput.safeParse({
      todos: [{ id: 't1', content: 'Task', status: 'pending', priority: 'critical' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('priority');
  });
});

// ─── QueryMemoryInput / SetProjectInput / SetStatusInput ─────────────────────

describe('QueryMemoryInput', () => {
  it('accepts query-only', () => {
    const result = QueryMemoryInput.safeParse({ query: 'recent task progress' });
    expect(result.success).toBe(true);
  });

  it('accepts query with project filter', () => {
    const result = QueryMemoryInput.safeParse({ query: 'architecture', project: 'Polaris' });
    expect(result.success).toBe(true);
  });

  it('rejects missing query', () => {
    const result = QueryMemoryInput.safeParse({ project: 'Polaris' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('query');
  });
});

describe('SetProjectInput', () => {
  it('accepts projectName only', () => {
    const result = SetProjectInput.safeParse({ projectName: 'Polaris' });
    expect(result.success).toBe(true);
  });

  it('accepts projectName with workDir', () => {
    const result = SetProjectInput.safeParse({
      projectName: 'Polaris',
      workDir: 'C:\\Users\\scott\\Code\\Polaris',
    });
    expect(result.success).toBe(true);
  });
});

describe('SetStatusInput', () => {
  it('accepts status only', () => {
    const result = SetStatusInput.safeParse({ status: 'done' });
    expect(result.success).toBe(true);
  });

  it('accepts status with sessionId', () => {
    const result = SetStatusInput.safeParse({ status: 'waiting', sessionId: 's1' });
    expect(result.success).toBe(true);
  });
});

// ─── ToolResult ───────────────────────────────────────────────────────────────

describe('ToolResult', () => {
  it('accepts text result', () => {
    const result = ToolResult.safeParse({ type: 'text', content: 'File read successfully.' });
    expect(result.success).toBe(true);
  });

  it('accepts error result with isError flag', () => {
    const result = ToolResult.safeParse({
      type: 'error',
      content: 'File not found',
      isError: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts image result', () => {
    const result = ToolResult.safeParse({ type: 'image', content: 'base64data' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown result type', () => {
    const result = ToolResult.safeParse({ type: 'video', content: 'data' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].path).toContain('type');
  });
});

// ─── DirectToolName ───────────────────────────────────────────────────────────

describe('DirectToolName', () => {
  const validNames = [
    'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Bash', 'PowerShell', 'WebFetch', 'WebSearch',
    'AskUserQuestion', 'TodoWrite', 'QueryMemory',
    'SetProject', 'SetStatus',
  ] as const;

  it.each(validNames)('accepts tool name "%s"', (name) => {
    const result = DirectToolName.safeParse(name);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown tool name', () => {
    const result = DirectToolName.safeParse('ExecCommand');
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].code).toBe('invalid_enum_value');
  });

  it('rejects lowercase tool name', () => {
    const result = DirectToolName.safeParse('read');
    expect(result.success).toBe(false);
  });
});
