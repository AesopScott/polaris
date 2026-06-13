'use strict';

import { describe, expect, it } from 'vitest';
import {
  normalizeImportance,
  initialStrengthForMemory,
  prepareMemoryWrite,
  decayedStrengthForMemory,
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
