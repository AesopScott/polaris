'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chunkFiles,
  buildBM25Index,
  embedChunks,
  rankChunks,
  buildTrace,
} from '../../lib/obsidianRetrieval.js';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const MULTI_HEADING_MD = `# Introduction

QueryMemory architecture stores and retrieves chunks.

# Implementation

The BM25 algorithm ranks results by term frequency.

## Details

Additional detail about ranking and scoring composite scores.
`;

const NO_HEADING_MD = `Some content without any headings at all.
This is just plain text with no structure.
`;

const LONG_SECTION_MD = `# Big Section

${'This is a long paragraph that repeats many words about retrieval and ranking. '.repeat(30)}

A second paragraph also in the same section.
`;

// ─── chunkFiles ───────────────────────────────────────────────────────────────

describe('chunkFiles', () => {
  it('returns empty array for empty projectMemory', () => {
    expect(chunkFiles({})).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(chunkFiles(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(chunkFiles(undefined)).toEqual([]);
  });

  it('produces chunks with required fields', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    expect(chunks.length).toBeGreaterThan(0);
    const c = chunks[0];
    expect(c).toHaveProperty('file');
    expect(c).toHaveProperty('heading');
    expect(c).toHaveProperty('text');
    expect(c).toHaveProperty('tokenCount');
  });

  it('assigns correct file name to every chunk', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    expect(chunks.every(c => c.file === 'intro.md')).toBe(true);
  });

  it('splits on H1 headings', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const headings = chunks.map(c => c.heading).filter(Boolean);
    expect(headings).toContain('Introduction');
    expect(headings).toContain('Implementation');
  });

  it('captures H2 headings as distinct chunks', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const headings = chunks.map(c => c.heading).filter(Boolean);
    expect(headings).toContain('Details');
  });

  it('includes body text in each chunk', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const introChunk = chunks.find(c => c.heading === 'Introduction');
    expect(introChunk).toBeDefined();
    expect(introChunk.text).toContain('QueryMemory architecture');
  });

  it('handles file with no headings as a single chunk', () => {
    const chunks = chunkFiles({ 'plain.md': NO_HEADING_MD });
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('plain text');
  });

  it('tokenCount is a positive integer for each chunk', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    for (const c of chunks) {
      expect(typeof c.tokenCount).toBe('number');
      expect(Number.isInteger(c.tokenCount)).toBe(true);
      expect(c.tokenCount).toBeGreaterThan(0);
    }
  });

  it('does not exceed 400-token cap per chunk', () => {
    const chunks = chunkFiles({ 'big.md': LONG_SECTION_MD });
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(400);
    }
  });

  it('chunks multiple files independently with correct file attribution', () => {
    const chunks = chunkFiles({
      'file-a.md': MULTI_HEADING_MD,
      'file-b.md': NO_HEADING_MD,
    });
    expect(chunks.some(c => c.file === 'file-a.md')).toBe(true);
    expect(chunks.some(c => c.file === 'file-b.md')).toBe(true);
  });
});

// ─── buildBM25Index ──────────────────────────────────────────────────────────

describe('buildBM25Index', () => {
  it('returns an object for empty chunks array', () => {
    const idx = buildBM25Index([]);
    expect(idx).toBeDefined();
    expect(typeof idx).toBe('object');
  });

  it('index exposes chunks array matching input length', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const idx = buildBM25Index(chunks);
    expect(Array.isArray(idx.chunks)).toBe(true);
    expect(idx.chunks.length).toBe(chunks.length);
  });

  it('index has idf map for term-frequency scoring', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const idx = buildBM25Index(chunks);
    expect(idx.idf).toBeDefined();
    expect(typeof idx.idf).toBe('object');
  });

  it('index has avgDocLen for BM25 length normalization', () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const idx = buildBM25Index(chunks);
    expect(typeof idx.avgDocLen).toBe('number');
    expect(idx.avgDocLen).toBeGreaterThan(0);
  });
});

// ─── embedChunks ─────────────────────────────────────────────────────────────

describe('embedChunks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when apiKey is null', async () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    expect(await embedChunks(chunks, null)).toBeNull();
  });

  it('returns null when apiKey is undefined', async () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    expect(await embedChunks(chunks, undefined)).toBeNull();
  });

  it('returns null (fail-soft) when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    expect(await embedChunks(chunks, 'fake-key')).toBeNull();
  });

  it('returns null (fail-soft) when API returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate limited' }),
    }));
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    expect(await embedChunks(chunks, 'fake-key')).toBeNull();
  });

  it('does not throw on any fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    await expect(embedChunks(chunks, 'any-key')).resolves.toBeNull();
  });

  it('returns array of float arrays matching chunk count on success', async () => {
    const chunks = chunkFiles({ 'intro.md': MULTI_HEADING_MD });
    const fakeVectors = chunks.map(() => Array.from({ length: 1536 }, () => Math.random()));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: fakeVectors.map((e, i) => ({ object: 'embedding', index: i, embedding: e })),
      }),
    }));
    const result = await embedChunks(chunks, 'fake-key');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(chunks.length);
    expect(Array.isArray(result[0])).toBe(true);
    expect(result[0].length).toBe(1536);
  });
});

// ─── rankChunks ──────────────────────────────────────────────────────────────

describe('rankChunks', () => {
  let index;
  let chunks;

  beforeEach(() => {
    chunks = chunkFiles({
      'arch.md': [
        '# QueryMemory Architecture',
        '',
        'QueryMemory retrieves ranked excerpts from Obsidian memory files.',
        '',
        '# Unrelated Topic',
        '',
        'Content about fish and aquariums completely unrelated to retrieval.',
      ].join('\n'),
    });
    index = buildBM25Index(chunks);
  });

  it('returns an array when embeddings is null (BM25-only)', () => {
    expect(Array.isArray(rankChunks(index, 'QueryMemory architecture', null))).toBe(true);
  });

  it('returns non-empty results for a relevant query', () => {
    expect(rankChunks(index, 'QueryMemory architecture', null).length).toBeGreaterThan(0);
  });

  it('top result has positive _score for a matching query (Proof Unit 6)', () => {
    const results = rankChunks(index, 'QueryMemory architecture', null);
    expect(results[0]._score).toBeGreaterThan(0);
  });

  it('results are sorted descending by _score', () => {
    const results = rankChunks(index, 'QueryMemory architecture', null);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]._score).toBeGreaterThanOrEqual(results[i]._score);
    }
  });

  it('returns at most 5 results by default', () => {
    const bigChunks = chunkFiles({
      'many.md': Array.from({ length: 10 }, (_, i) =>
        `# Section ${i + 1}\n\nContent about topic ${i + 1} with some words here.\n`
      ).join('\n'),
    });
    const results = rankChunks(buildBM25Index(bigChunks), 'content topic', null);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('each result carries file, heading, and text from source chunk', () => {
    const results = rankChunks(index, 'QueryMemory ranked excerpts', null);
    const top = results[0];
    expect(top).toHaveProperty('file');
    expect(top).toHaveProperty('heading');
    expect(top).toHaveProperty('text');
  });

  it('relevant chunk ranks above irrelevant chunk', () => {
    const results = rankChunks(index, 'QueryMemory ranked excerpts', null);
    expect(results[0].heading).toBe('QueryMemory Architecture');
  });

  it('accepts embeddings array and returns results without throwing', () => {
    const fakeEmbeddings = chunks.map(() => Array.from({ length: 8 }, () => Math.random()));
    const results = rankChunks(index, 'QueryMemory architecture', fakeEmbeddings);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty index', () => {
    expect(rankChunks(buildBM25Index([]), 'anything', null)).toEqual([]);
  });
});

// ─── buildTrace ───────────────────────────────────────────────────────────────

describe('buildTrace', () => {
  const sampleResults = [
    { file: 'Architecture.md', heading: 'QueryMemory', text: 'QueryMemory retrieves ranked excerpts from Obsidian.', _score: 0.9 },
    { file: 'Build_Plan.md', heading: 'Phase 1', text: 'Phase 1 covers the retrieval module implementation.', _score: 0.7 },
  ];

  it('returns a string', () => {
    expect(typeof buildTrace(sampleResults)).toBe('string');
  });

  it('begins with [MEMORY TRACE] header', () => {
    expect(buildTrace(sampleResults)).toMatch(/^\[MEMORY TRACE\]/);
  });

  it('includes [MEMORY TRACE] header even for empty results', () => {
    expect(buildTrace([])).toMatch(/\[MEMORY TRACE\]/);
  });

  it('formats each entry as [N] from {file} § {heading}', () => {
    const trace = buildTrace(sampleResults);
    expect(trace).toContain('[1] from Architecture.md § QueryMemory');
    expect(trace).toContain('[2] from Build_Plan.md § Phase 1');
  });

  it('includes excerpt text for each entry', () => {
    const trace = buildTrace(sampleResults);
    expect(trace).toContain('ranked excerpts');
    expect(trace).toContain('retrieval module');
  });

  it('caps each entry block to at most 400 chars', () => {
    const longResults = [
      { file: 'long.md', heading: 'Big', text: 'x'.repeat(2000), _score: 1.0 },
    ];
    const trace = buildTrace(longResults);
    const entryStart = trace.indexOf('[1]');
    const afterEntry = trace.indexOf('\n\n', entryStart);
    const entryBlock = afterEntry > -1 ? trace.slice(entryStart, afterEntry) : trace.slice(entryStart);
    expect(entryBlock.length).toBeLessThanOrEqual(400);
  });

  it('does not throw for null input', () => {
    expect(() => buildTrace(null)).not.toThrow();
  });

  it('does not throw for undefined input', () => {
    expect(() => buildTrace(undefined)).not.toThrow();
  });
});
