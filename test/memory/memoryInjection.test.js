'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyQuery,
  formatMemoryBlock,
  buildMemoryInjectionBlock,
} from '../../lib/memoryInjection.js';

// ─── PU1: classifyQuery routes terse vs rich queries ─────────────────────────

describe('classifyQuery', () => {
  it('flags empty string as low signal', () => {
    const result = classifyQuery('');
    expect(result.lowSignal).toBe(true);
    expect(result.effectiveQuery).toBe('');
  });

  it('flags single short word as low signal', () => {
    expect(classifyQuery('hi').lowSignal).toBe(true);
    expect(classifyQuery('ok').lowSignal).toBe(true);
  });

  it('flags message with only stop words / short tokens as low signal', () => {
    // "can we" — tokens: "can"(3), "we"(2) → only "can" passes length>2 but it's a stop word
    // classifyQuery strips stop words too; "can we" => 0 meaningful tokens => low signal
    expect(classifyQuery('can we').lowSignal).toBe(true);
  });

  it('flags a greeting as low signal', () => {
    expect(classifyQuery('hey').lowSignal).toBe(true);
    expect(classifyQuery('hello').lowSignal).toBe(true);
  });

  it('returns low signal for null/undefined', () => {
    expect(classifyQuery(null).lowSignal).toBe(true);
    expect(classifyQuery(undefined).lowSignal).toBe(true);
  });

  it('treats rich query as high signal', () => {
    const result = classifyQuery('how does memory injection work in polaris');
    expect(result.lowSignal).toBe(false);
    expect(result.effectiveQuery).toBe('how does memory injection work in polaris');
  });

  it('treats two meaningful tokens as high signal', () => {
    const result = classifyQuery('memory injection');
    expect(result.lowSignal).toBe(false);
    expect(result.effectiveQuery).toBe('memory injection');
  });

  it('returns effectiveQuery = "" when low signal', () => {
    expect(classifyQuery('hey').effectiveQuery).toBe('');
    expect(classifyQuery('').effectiveQuery).toBe('');
  });

  it('preserves effectiveQuery value when high signal', () => {
    const q = 'check the firestore config for polaris';
    expect(classifyQuery(q).effectiveQuery).toBe(q);
  });
});

// ─── PU2: formatMemoryBlock formats memories into capped block ───────────────

describe('formatMemoryBlock', () => {
  const memories = [
    { type: 'decision', strength: 0.9, content: 'Use Firestore for memory storage' },
    { type: 'preference', strength: 0.75, content: 'Scott prefers concise summaries' },
    { type: 'pattern', strength: 0.6, content: 'Always use node -e with utf8 encoding on Windows' },
  ];

  it('returns empty string for empty memories array', () => {
    expect(formatMemoryBlock([])).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatMemoryBlock(null)).toBe('');
    expect(formatMemoryBlock(undefined)).toBe('');
  });

  it('wraps output in [POLARIS MEMORY] delimiters', () => {
    const result = formatMemoryBlock(memories);
    expect(result).toMatch(/^\[POLARIS MEMORY\]/);
    expect(result).toMatch(/\[END MEMORY\]$/);
  });

  it('formats each memory as bullet with type, strength, and content', () => {
    const result = formatMemoryBlock(memories);
    expect(result).toContain('• decision (0.90): Use Firestore for memory storage');
    expect(result).toContain('• preference (0.75): Scott prefers concise summaries');
  });

  it('respects token cap by truncating output', () => {
    const longMemories = Array.from({ length: 50 }, (_, i) => ({
      type: 'fact',
      strength: 0.8,
      content: `This is a fairly long memory entry number ${i} that takes up a good amount of space when formatted`,
    }));
    const result = formatMemoryBlock(longMemories, { cap: 3200 });
    expect(result.length).toBeLessThanOrEqual(3200);
  });

  it('uses default cap of 3200 chars', () => {
    const longMemories = Array.from({ length: 100 }, (_, i) => ({
      type: 'fact',
      strength: 0.8,
      content: `Memory entry number ${i} with enough text to trigger cap enforcement easily here`,
    }));
    const result = formatMemoryBlock(longMemories);
    expect(result.length).toBeLessThanOrEqual(3200);
  });

  it('includes all memories when they fit within cap', () => {
    const result = formatMemoryBlock(memories);
    expect(result).toContain('Always use node -e with utf8 encoding on Windows');
  });
});

// ─── PU3: buildMemoryInjectionBlock DI + orchestration ───────────────────────

describe('buildMemoryInjectionBlock', () => {
  let fakeMemory;

  beforeEach(() => {
    fakeMemory = {
      searchMemories: vi.fn(),
      reinforceMemory: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('calls searchMemories with empty effectiveQuery on low-signal input', async () => {
    fakeMemory.searchMemories.mockResolvedValue([]);
    await buildMemoryInjectionBlock(fakeMemory, 'Polaris', 'hi');
    expect(fakeMemory.searchMemories).toHaveBeenCalledWith('Polaris', '', 10);
  });

  it('calls searchMemories with full query on high-signal input', async () => {
    fakeMemory.searchMemories.mockResolvedValue([]);
    await buildMemoryInjectionBlock(fakeMemory, 'Polaris', 'how does memory injection work');
    expect(fakeMemory.searchMemories).toHaveBeenCalledWith('Polaris', 'how does memory injection work', 10);
  });

  it('returns empty string when no memories found', async () => {
    fakeMemory.searchMemories.mockResolvedValue([]);
    const result = await buildMemoryInjectionBlock(fakeMemory, 'Polaris', 'test query');
    expect(result).toBe('');
  });

  it('returns formatted block when memories exist', async () => {
    fakeMemory.searchMemories.mockResolvedValue([
      { id: 'abc', type: 'decision', strength: 0.9, content: 'Use Firestore' },
    ]);
    const result = await buildMemoryInjectionBlock(fakeMemory, 'Polaris', 'test');
    expect(result).toContain('[POLARIS MEMORY]');
    expect(result).toContain('Use Firestore');
  });

  it('calls reinforceMemory fire-and-forget for each result', async () => {
    fakeMemory.searchMemories.mockResolvedValue([
      { id: 'id1', type: 'fact', strength: 0.8, content: 'First memory' },
      { id: 'id2', type: 'fact', strength: 0.7, content: 'Second memory' },
    ]);
    await buildMemoryInjectionBlock(fakeMemory, 'Polaris', 'test query here');
    expect(fakeMemory.reinforceMemory).toHaveBeenCalledWith('id1');
    expect(fakeMemory.reinforceMemory).toHaveBeenCalledWith('id2');
  });

  it('returns empty string and does not throw when searchMemories rejects', async () => {
    fakeMemory.searchMemories.mockRejectedValue(new Error('Firestore unavailable'));
    const result = await buildMemoryInjectionBlock(fakeMemory, 'Polaris', 'test query here');
    expect(result).toBe('');
  });

  it('handles missing project gracefully', async () => {
    fakeMemory.searchMemories.mockResolvedValue([]);
    const result = await buildMemoryInjectionBlock(fakeMemory, null, 'test');
    expect(result).toBe('');
    expect(fakeMemory.searchMemories).not.toHaveBeenCalled();
  });
});
