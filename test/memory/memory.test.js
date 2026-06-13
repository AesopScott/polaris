'use strict';

import { describe, expect, it } from 'vitest';
import {
  normalizeImportance,
  initialStrengthForMemory,
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
  });
});
