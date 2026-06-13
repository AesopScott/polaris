'use strict';

import { describe, expect, it } from 'vitest';
import {
  normalizeImportance,
  initialStrengthForMemory,
  prepareMemoryWrite,
  prepareMemoryEdit,
  decayedStrengthForMemory,
  GLOBAL_MEMORY_PROJECT,
  DISTILLED_MEMORY_SOURCE,
  DISTILLED_MEMORY_TAG,
  hasGlobalProjectTag,
  normalizeMemoryProject,
  normalizeEditableTags,
  jaccardSimilarity,
  substringOverlap,
  memorySimilarity,
  findDuplicateMemory,
  planMemoryConsolidation,
  isDistillationCandidate,
  clusterMemoriesForDistillation,
  prepareDistilledMemory,
  memoryProjectsForSearch,
  rankMemoryResults,
  searchMemoryDocs,
  listMemoryDocs,
} from '../../lib/memory.js';

describe('memory importance scoring', () => {
  it('defaults importance by memory type', () => {
    expect(normalizeImportance(undefined, 'decision')).toBe(5);
    expect(normalizeImportance(undefined, 'preference')).toBe(4);
    expect(normalizeImportance(undefined, 'feedback')).toBe(4);
    expect(normalizeImportance(undefined, 'pattern')).toBe(3);
    expect(normalizeImportance(undefined, 'fact')).toBe(2);
  });

  it('clamps explicit importance scores to the 1-5 range', () => {
    expect(normalizeImportance(0, 'decision')).toBe(1);
    expect(normalizeImportance(6, 'fact')).toBe(5);
    expect(normalizeImportance(3.7, 'fact')).toBe(4);
  });

  it('maps importance onto initial strength from 0.6 to 1.0', () => {
    expect(initialStrengthForMemory({ importance: 1 })).toBe(0.6);
    expect(initialStrengthForMemory({ importance: 2 })).toBe(0.7);
    expect(initialStrengthForMemory({ importance: 3 })).toBe(0.8);
    expect(initialStrengthForMemory({ importance: 4 })).toBe(0.9);
    expect(initialStrengthForMemory({ importance: 5 })).toBe(1);
  });

  it('uses type defaults when explicit importance is missing or invalid', () => {
    expect(initialStrengthForMemory({ type: 'decision' })).toBe(1);
    expect(initialStrengthForMemory({ type: 'preference' })).toBe(0.9);
    expect(initialStrengthForMemory({ importance: 'nope', type: 'pattern' })).toBe(0.8);
    expect(initialStrengthForMemory({ importance: '', type: 'feedback' })).toBe(0.9);
    expect(initialStrengthForMemory({ type: 'unknown' })).toBe(0.7);
    expect(initialStrengthForMemory({ type: 'constructor' })).toBe(0.7);
  });

  it('prepares write payloads with normalized importance and derived strength', () => {
    const doc = prepareMemoryWrite({
      project: 'Polaris',
      content: 'Scott prefers concise summaries',
      type: 'preference',
      importance: '5',
      tags: ['style'],
      sessionId: 's1',
      sessionType: 'chat',
    });

    expect(doc).toMatchObject({
      project: 'Polaris',
      content: 'Scott prefers concise summaries',
      type: 'preference',
      tags: ['style'],
      sessionId: 's1',
      sessionType: 'chat',
      source: 'codex',
      importance: 5,
      strength: 1,
      accessCount: 0,
      _archived: false,
    });
  });

  it('routes project-global tagged writes into the global memory tier', () => {
    expect(GLOBAL_MEMORY_PROJECT).toBe('global');
    expect(hasGlobalProjectTag(['Project: Global'])).toBe(true);
    expect(hasGlobalProjectTag(['project:global'])).toBe(true);
    expect(normalizeMemoryProject('Polaris', ['project: global'])).toBe('global');

    const doc = prepareMemoryWrite({
      project: 'Polaris',
      content: 'Scott prefers direct progress updates across projects.',
      type: 'preference',
      tags: ['style', 'project: global'],
    });

    expect(doc.project).toBe('global');
  });

  it('prepares human memory edits with normalized tags and reset strength', () => {
    const edit = prepareMemoryEdit({
      content: ' Scott prefers direct task status updates. ',
      type: 'preference',
      tags: 'Style, project: global, style',
      importance: 4,
    });

    expect(normalizeEditableTags('Style, project: global, style')).toEqual(['style', 'project: global']);
    expect(edit).toEqual({
      content: 'Scott prefers direct task status updates.',
      type: 'preference',
      tags: ['style', 'project: global'],
      importance: 4,
      strength: 0.9,
    });
  });

  it('rejects empty human memory edit content', () => {
    expect(() => prepareMemoryEdit({ content: '   ', type: 'fact' })).toThrow('Memory content is required');
  });

  it('decays from the importance-derived peak without raising strength', () => {
    const now = 1_800_000;
    const freshFact = {
      type: 'fact',
      importance: 2,
      strength: 0.7,
      accessCount: 0,
      lastAccessedAt: { seconds: now },
    };
    expect(decayedStrengthForMemory(freshFact, now)).toBe(0.7);

    const staleFact = {
      ...freshFact,
      lastAccessedAt: { seconds: now - 86400 * 7 },
    };
    expect(decayedStrengthForMemory(staleFact, now)).toBeLessThan(0.7);
  });

  it('keeps legacy memories without importance on the old 1.0 peak', () => {
    const now = 1_800_000;
    expect(decayedStrengthForMemory({
      type: 'fact',
      strength: 1,
      accessCount: 0,
      lastAccessedAt: { seconds: now },
    }, now)).toBe(1);
  });
});

describe('memory write deduplication', () => {
  it('scores tag overlap with Jaccard similarity', () => {
    expect(jaccardSimilarity(['memory', 'firestore'], ['firestore', 'memory'])).toBe(1);
    expect(jaccardSimilarity(['memory'], ['memory', 'search'])).toBe(0.5);
    expect(jaccardSimilarity(['memory'], ['policy'])).toBe(0);
  });

  it('scores substring overlap on normalized content', () => {
    expect(substringOverlap(
      'Scott prefers concise summaries.',
      'Future sessions should remember that Scott prefers concise summaries.'
    )).toBeGreaterThan(0.7);
    expect(substringOverlap('memory importance scoring', 'unrelated policy gate')).toBeLessThan(0.7);
  });

  it('combines tag and content similarity for duplicate detection', () => {
    const candidate = {
      project: 'Polaris',
      content: 'Scott prefers concise summaries.',
      tags: ['preference', 'style'],
    };
    const existing = {
      id: 'mem1',
      project: 'Polaris',
      content: 'Future sessions should remember that Scott prefers concise summaries.',
      tags: ['style', 'preference'],
    };

    expect(memorySimilarity(candidate, existing)).toBeGreaterThan(0.7);
    expect(findDuplicateMemory(candidate, [existing])?.memory.id).toBe('mem1');
  });

  it('does not dedupe a short generic substring without tag support', () => {
    const candidate = {
      project: 'Polaris',
      content: 'Use Firestore',
      tags: ['auth'],
    };
    const existing = {
      id: 'mem1',
      project: 'Polaris',
      content: 'Use Firestore for durable project memory.',
      tags: ['memory'],
    };

    expect(substringOverlap(candidate.content, existing.content)).toBe(0);
    expect(memorySimilarity(candidate, existing)).toBe(0);
    expect(findDuplicateMemory(candidate, [existing])).toBe(null);
  });

  it('does not match memories across projects', () => {
    const candidate = {
      project: 'Polaris',
      content: 'Scott prefers concise summaries.',
      tags: ['style'],
    };
    const existing = {
      id: 'mem1',
      project: 'GAIN',
      content: 'Scott prefers concise summaries.',
      tags: ['style'],
    };

    expect(findDuplicateMemory(candidate, [existing])).toBe(null);
  });

  it('splits batch candidates into writes and reinforcements', () => {
    const existingByProject = new Map([
      ['Polaris', [{
        id: 'existing-1',
        project: 'Polaris',
        content: 'Future sessions should remember that Scott prefers concise summaries.',
        tags: ['style', 'preference'],
      }]],
    ]);
    const candidates = [
      {
        project: 'Polaris',
        content: 'Scott prefers concise summaries.',
        tags: ['preference', 'style'],
      },
      {
        project: 'Polaris',
        content: 'Use Firestore for durable project memory.',
        tags: ['architecture', 'memory'],
      },
    ];

    const plan = planMemoryConsolidation(candidates, existingByProject);
    expect(plan.toReinforce).toHaveLength(1);
    expect(plan.toReinforce[0].existing.id).toBe('existing-1');
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].content).toContain('Firestore');
  });

  it('deduplicates repeated candidates within the same extraction batch', () => {
    const existingByProject = new Map();
    const candidates = [
      {
        project: 'Polaris',
        content: 'Use Firestore for durable project memory.',
        tags: ['architecture', 'memory'],
      },
      {
        project: 'Polaris',
        content: 'Use Firestore for durable project memory.',
        tags: ['memory', 'architecture'],
      },
    ];

    const plan = planMemoryConsolidation(candidates, existingByProject);
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toReinforce).toHaveLength(1);
  });

  it('collapses multiple candidates matching the same existing memory into one reinforcement', () => {
    const existingByProject = new Map([
      ['Polaris', [{
        id: 'existing-1',
        project: 'Polaris',
        content: 'Future sessions should remember that Scott prefers concise summaries.',
        tags: ['style', 'preference'],
      }]],
    ]);
    const candidates = [
      {
        project: 'Polaris',
        content: 'Scott prefers concise summaries.',
        tags: ['preference', 'style'],
      },
      {
        project: 'Polaris',
        content: 'Scott prefers concise summaries in updates.',
        tags: ['style', 'preference'],
      },
    ];

    const plan = planMemoryConsolidation(candidates, existingByProject);
    expect(plan.toWrite).toHaveLength(0);
    expect(plan.toReinforce).toHaveLength(1);
    expect(plan.toReinforce[0].existing.id).toBe('existing-1');
  });
});

describe('cross-project memory search tier', () => {
  it('searches the requested project and the global tier', () => {
    expect(memoryProjectsForSearch('Polaris')).toEqual(['Polaris', 'global']);
    expect(memoryProjectsForSearch('global')).toEqual(['global']);
    expect(memoryProjectsForSearch('  global  ')).toEqual(['global']);
  });

  it('ranks project and global memories together', () => {
    const now = 2_000_000;
    const ranked = rankMemoryResults([
      {
        id: 'project-low',
        project: 'Polaris',
        content: 'Use terse updates for local UI work.',
        tags: ['updates'],
        strength: 0.8,
        lastAccessedAt: { seconds: now },
      },
      {
        id: 'global-high',
        project: 'global',
        content: 'Scott prefers concise summaries and direct progress updates.',
        tags: ['project: global', 'preference', 'updates'],
        strength: 0.9,
        lastAccessedAt: { seconds: now },
      },
    ], 'concise progress updates', 2, now);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].id).toBe('global-high');
    expect(ranked[0]._score).toBeGreaterThan(ranked[1]._score);
  });

  it('queries Firestore for requested and global projects before ranking', async () => {
    const queriedProjects = [];
    const docsByProject = {
      Polaris: [{
        id: 'project-memory',
        data: () => ({
          project: 'Polaris',
          content: 'Use terse updates for local UI work.',
          tags: ['updates'],
          strength: 0.8,
          lastAccessedAt: { seconds: 2_000_000 },
        }),
      }],
      global: [{
        id: 'global-memory',
        data: () => ({
          project: 'global',
          content: 'Scott prefers concise summaries and direct progress updates.',
          tags: ['project: global', 'preference', 'updates'],
          strength: 0.9,
          lastAccessedAt: { seconds: 2_000_000 },
        }),
      }],
    };

    const firestore = {
      collection: () => {
        const chain = {
          project: null,
          where(field, op, value) {
            if (field === 'project' && op === '==') this.project = value;
            return this;
          },
          orderBy() {
            return this;
          },
          limit() {
            return this;
          },
          async get() {
            queriedProjects.push(this.project);
            return { docs: docsByProject[this.project] || [] };
          },
        };
        return chain;
      },
    };

    const results = await searchMemoryDocs(firestore, 'Polaris', 'concise progress updates', 2);

    expect(queriedProjects).toEqual(['Polaris', 'global']);
    expect(results.map(result => result.id)).toEqual(['global-memory', 'project-memory']);
  });
});

describe('memory correction listing', () => {
  it('lists requested and global active memories through Firestore', async () => {
    const queriedProjects = [];
    const docsByProject = {
      Polaris: [{
        id: 'project-memory',
        data: () => ({
          project: 'Polaris',
          content: 'Project-specific memory',
          tags: ['memory'],
          strength: 0.8,
          accessCount: 2,
          lastAccessedAt: { seconds: 2_000_000 },
        }),
      }],
      global: [{
        id: 'global-memory',
        data: () => ({
          project: 'global',
          content: 'Global memory',
          tags: ['project: global'],
          strength: 0.9,
          accessCount: 5,
          lastAccessedAt: { seconds: 2_000_000 },
        }),
      }],
    };

    const firestore = {
      collection: () => {
        const chain = {
          project: null,
          where(field, op, value) {
            if (field === 'project' && op === '==') this.project = value;
            return this;
          },
          orderBy() {
            return this;
          },
          limit() {
            return this;
          },
          async get() {
            queriedProjects.push(this.project);
            return { docs: docsByProject[this.project] || [] };
          },
        };
        return chain;
      },
    };

    const results = await listMemoryDocs(firestore, 'Polaris', { includeGlobal: true, limit: 50 });

    expect(queriedProjects).toEqual(['Polaris', 'global']);
    expect(results.map(result => result.id)).toEqual(['project-memory', 'global-memory']);
  });
});

describe('higher-order memory distillation', () => {
  it('filters out archived, decision, and already-distilled memories', () => {
    expect(isDistillationCandidate({
      id: 'active',
      project: 'Polaris',
      content: 'Use concise updates.',
      type: 'preference',
      tags: ['style'],
    })).toBe(true);
    expect(isDistillationCandidate({
      id: 'archived',
      project: 'Polaris',
      content: 'Old memory',
      _archived: true,
    })).toBe(false);
    expect(isDistillationCandidate({
      id: 'decision',
      project: 'Polaris',
      content: 'Use Firestore.',
      type: 'decision',
    })).toBe(false);
    expect(isDistillationCandidate({
      id: 'distilled',
      project: 'Polaris',
      content: 'A synthesized memory.',
      source: DISTILLED_MEMORY_SOURCE,
    })).toBe(false);
  });

  it('clusters repeated episodic memories by project and similarity', () => {
    const memories = [
      {
        id: 'a',
        project: 'Polaris',
        content: 'Scott prefers concise status updates during long orchestration work.',
        type: 'preference',
        tags: ['style', 'updates'],
      },
      {
        id: 'b',
        project: 'Polaris',
        content: 'Scott prefers concise status updates during multi-agent orchestration.',
        type: 'feedback',
        tags: ['updates', 'style'],
      },
      {
        id: 'c',
        project: 'Polaris',
        content: 'Keep progress updates concise and direct when orchestrating agents.',
        type: 'pattern',
        tags: ['style', 'updates'],
      },
      {
        id: 'other-project',
        project: 'GAIN',
        content: 'Scott prefers concise status updates during long orchestration work.',
        type: 'preference',
        tags: ['style', 'updates'],
      },
    ];

    const clusters = clusterMemoriesForDistillation(memories, { threshold: 0.3, minClusterSize: 3 });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].project).toBe('Polaris');
    expect(clusters[0].ids).toEqual(['a', 'b', 'c']);
    expect(clusters[0].tags).toEqual(['style', 'updates']);
  });

  it('prepares distilled memory payloads with provenance tags and source ids', () => {
    const distilled = prepareDistilledMemory({
      project: 'Polaris',
      content: 'Scott prefers concise orchestration status updates.',
      type: 'preference',
      tags: ['style', 'updates'],
      sourceIds: ['a', 'b', 'c'],
      importance: 4,
    });

    expect(distilled).toMatchObject({
      project: 'Polaris',
      content: 'Scott prefers concise orchestration status updates.',
      type: 'preference',
      source: DISTILLED_MEMORY_SOURCE,
      importance: 4,
      strength: 0.9,
      distilledFrom: ['a', 'b', 'c'],
    });
    expect(distilled.tags).toContain(DISTILLED_MEMORY_TAG);
    expect(distilled.tags).toContain('source-count:3');
  });
});
