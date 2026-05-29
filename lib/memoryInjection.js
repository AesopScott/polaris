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
const SEARCH_TIMEOUT_MS = 500;

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
  const lines = [
    '[POLARIS MEMORY — persistent context from past sessions with Scott]',
    'Treat "instruction" entries as rules you must follow. Treat "preference" entries as',
    'strong guidance on how Scott works and what he expects. Treat "fact" entries as',
    'established context. Higher strength = more reinforced over time.',
  ];

  for (const r of memories) {
    const strength = typeof r.strength === 'number' ? r.strength.toFixed(2) : '0.00';
    const fullLine = `• ${r.type || 'fact'} (${strength}): ${r.content || ''}`;

    // Space available for this entry: cap minus current joined length, minus the
    // \n separator before this line (1), minus the trailing \n[END MEMORY] (13).
    const usedLen = lines.join('\n').length;
    const available = cap - usedLen - 1 - 13;

    if (available <= 0) break;

    // Truncate the entry content if it would push the block over the cap.
    const line = fullLine.length <= available ? fullLine : fullLine.slice(0, available);
    lines.push(line);

    // If we had to truncate, we've consumed the budget — stop adding more entries.
    if (line.length < fullLine.length) break;
  }

  // Nothing fit after the header — return empty rather than a bare delimiter pair
  if (lines.length === 1) return '';

  lines.push('[END MEMORY]');
  return lines.join('\n');
}

/**
 * Orchestrate a memory injection block with a trace of what was injected.
 * Returns { block, memories, queryType, effectiveQuery } so callers can log the event.
 *
 * @param {object} memory
 * @param {string|null} project
 * @param {string} query
 * @param {{ cap?: number, searchTimeoutMs?: number }} [opts]
 * @returns {Promise<{ block: string, memories: object[], queryType: string, effectiveQuery: string }>}
 */
async function buildMemoryInjectionBlockWithTrace(memory, project, query, opts = {}) {
  const empty = { block: '', memories: [], queryType: 'low-signal', effectiveQuery: '' };
  if (!project) return empty;

  const { cap, searchTimeoutMs = SEARCH_TIMEOUT_MS } = opts;

  try {
    const { lowSignal, effectiveQuery } = classifyQuery(query);
    const queryType = lowSignal ? 'low-signal' : 'high-signal';

    const timeout = new Promise(resolve => setTimeout(() => resolve([]), searchTimeoutMs));
    const memories = await Promise.race([
      memory.searchMemories(project, effectiveQuery, SEARCH_LIMIT),
      timeout,
    ]);

    if (!memories || memories.length === 0) return { ...empty, queryType, effectiveQuery };

    for (const m of memories) {
      if (m.id) memory.reinforceMemory(m.id).catch(() => {});
    }

    const block = formatMemoryBlock(memories, { cap });
    return { block, memories, queryType, effectiveQuery };
  } catch (e) {
    console.warn('[memoryInjection] buildMemoryInjectionBlockWithTrace failed silently:', e.message);
    return empty;
  }
}

/**
 * Orchestrate a memory injection block for one chat session turn.
 * Classifies the query, fetches top memories, reinforces them, and formats the block.
 *
 * @param {object} memory
 * @param {string|null} project
 * @param {string} query
 * @param {{ cap?: number, searchTimeoutMs?: number }} [opts]
 * @returns {Promise<string>} — '' on any error or no memories
 */
async function buildMemoryInjectionBlock(memory, project, query, opts = {}) {
  const { block } = await buildMemoryInjectionBlockWithTrace(memory, project, query, opts);
  return block;
}

module.exports = { classifyQuery, formatMemoryBlock, buildMemoryInjectionBlock, buildMemoryInjectionBlockWithTrace };
