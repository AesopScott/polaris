'use strict';

import { describe, expect, it } from 'vitest';
import {
  normalizeImportance,
  initialStrengthForMemory,
  prepareMemoryWrite,
  decayedStrengthForMemory,
  jaccardSimilarity,
  substringOverlap,
  memorySimilarity,
  findDuplicateMemory,
  planMemoryConsolidation,
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
