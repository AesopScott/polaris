'use strict';

// ─── Polaris Memory Injection Module ─────────────────────────────────────────
// Builds the [POLARIS MEMORY] block injected into the hidden system prompt at
// chat-session turn 1. Extracted from server.js for testability.
//
// Exports:
//   classifyQuery(query)                         → { lowSignal, effectiveQuery }
//   formatMemoryBlock(memories, opts?)           → string
//   buildMemoryInjectionBlock(memory, project, query, opts?) → Promise<string>
//
// Design contract:
//   • Chat-only scope (#51). Agent injection deferred to #57.
//   • DI pattern: caller passes the `memory` module so tests can stub it.
//   • Never throws — returns '' on any error so callers are safe to fire-and-forget.
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'as', 'is', 'it', 'its', 'be', 'was',
  'are', 'were', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'that', 'this', 'these',
  'those', 'not', 'no', 'so', 'if', 'then', 'than', 'just', 'also', 'we',
  'you', 'he', 'she', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'our',
  'your', 'hi', 'hey', 'hello', 'ok', 'okay', 'yes', 'yeah', 'no',
]);

const MIN_MEANINGFUL_TOKENS = 2;
const DEFAULT_CAP = 3200;
const SEARCH_LIMIT = 10;

/**
 * Classify a user query as low-signal (terse) or high-signal (rich).
 * Low-signal → pass '' to searchMemories so it falls back to strength+recency ranking.
 * High-signal → pass the full query so BM25 keyword scoring activates.
 *
 * @param {string|null|undefined} query
 * @returns {{ lowSignal: boolean, effectiveQuery: string }}
 */
function classifyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { lowSignal: true, effectiveQuery: '' };
  }

  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  const lowSignal = tokens.length < MIN_MEANINGFUL_TOKENS;
  return {
    lowSignal,
    effectiveQuery: lowSignal ? '' : query,
  };
}

/**
 * Format an array of memory docs into a capped [POLARIS MEMORY] block.
 *
 * @param {object[]|null|undefined} memories
 * @param {{ cap?: number }} [opts]
 * @returns {string} — '' if memories is empty/null
 */
function formatMemoryBlock(memories, opts = {}) {
  if (!memories || memories.length === 0) return '';

  const cap = opts.cap ?? DEFAULT_CAP;
  const lines = ['[POLARIS MEMORY]'];

  for (const r of memories) {
    const strength = typeof r.strength === 'number' ? r.strength.toFixed(2) : '0.00';
    const line = `• ${r.type || 'fact'} (${strength}): ${r.content || ''}`;
    lines.push(line);

    const currentLen = lines.join('\n').length + '\n[END MEMORY]'.length;
    if (currentLen >= cap) {
      // Trim the last entry if it pushed us over, then stop
      lines.pop();
      break;
    }
  }

  // Nothing fit after the header — return empty rather than a bare delimiter pair
  if (lines.length === 1) return '';

  lines.push('[END MEMORY]');
  return lines.join('\n');
}

/**
 * Orchestrate a memory injection block for one chat session turn.
 * Classifies the query, fetches top memories, reinforces them, and formats the block.
 *
 * @param {object} memory     — DI: must expose searchMemories(project, query, limit) and reinforceMemory(id)
 * @param {string|null} project
 * @param {string} query      — the user's first message
 * @param {{ cap?: number }}  [opts]
 * @returns {Promise<string>} — '' on any error or no memories
 */
async function buildMemoryInjectionBlock(memory, project, query, opts = {}) {
  if (!project) return '';

  try {
    const { effectiveQuery } = classifyQuery(query);
    const memories = await memory.searchMemories(project, effectiveQuery, SEARCH_LIMIT);

    if (!memories || memories.length === 0) return '';

    // Fire-and-forget reinforcement — don't block session start
    for (const m of memories) {
      if (m.id) memory.reinforceMemory(m.id).catch(() => {});
    }

    return formatMemoryBlock(memories, opts);
  } catch (e) {
    console.warn('[memoryInjection] buildMemoryInjectionBlock failed silently:', e.message);
    return '';
  }
}

module.exports = { classifyQuery, formatMemoryBlock, buildMemoryInjectionBlock };
