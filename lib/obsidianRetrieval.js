'use strict';

// ─── Polaris Obsidian Retrieval ────────────────────────────────────────────────
// Chunks Obsidian markdown by heading, ranks with BM25 + optional cosine
// similarity via OpenRouter embeddings (fail-soft to BM25-only on any error),
// and builds a retrieval trace header for QueryMemory tool responses.
// ──────────────────────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;   // approx: 1 token ≈ 4 chars
const TOKEN_CAP       = 400;
const TOP_N           = 5;
const EXCERPT_MAX     = 250;
const BM25_K1         = 1.5;
const BM25_B          = 0.75;

const EMBED_URL   = 'https://openrouter.ai/api/v1/embeddings';
const EMBED_MODEL = 'openai/text-embedding-3-small';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function approxTokens(text) {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function tokenize(text) {
  return (text || '').toLowerCase().split(/\W+/).filter(t => t.length > 1);
}

// ─── chunkFiles ───────────────────────────────────────────────────────────────

/**
 * Split a { filename → content } map into heading-aware chunks.
 * Each chunk: { file, heading, text, tokenCount }.
 * Sections > 400 tokens are split at paragraph boundaries, then word boundaries.
 * @param {Object|null|undefined} projectMemory
 * @returns {Array<{file:string, heading:string|null, text:string, tokenCount:number}>}
 */
function chunkFiles(projectMemory) {
  if (!projectMemory || typeof projectMemory !== 'object') return [];
  const result = [];
  for (const [file, content] of Object.entries(projectMemory)) {
    if (typeof content !== 'string' || content.trim().length === 0) continue;
    result.push(..._splitFile(file, content));
  }
  return result;
}

function _splitFile(file, content) {
  const lines    = content.split('\n');
  const sections = [];
  let heading    = null;
  let bodyLines  = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      sections.push({ heading, lines: bodyLines });
      heading   = m[2].trim();
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }
  sections.push({ heading, lines: bodyLines });

  const chunks = [];
  for (const sec of sections) {
    const body = sec.lines.join('\n').trim();
    if (!body) continue;
    chunks.push(..._splitBody(file, sec.heading, body));
  }
  return chunks;
}

function _splitBody(file, heading, body) {
  if (approxTokens(body) <= TOKEN_CAP) {
    return [{ file, heading, text: body, tokenCount: approxTokens(body) }];
  }

  const paragraphs = body.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks     = [];
  let batch        = [];
  let batchTokens  = 0;

  for (const para of paragraphs) {
    const pt = approxTokens(para);
    if (pt > TOKEN_CAP) {
      if (batch.length > 0) {
        const t = batch.join('\n\n').trim();
        chunks.push({ file, heading, text: t, tokenCount: approxTokens(t) });
        batch = [];
        batchTokens = 0;
      }
      chunks.push(..._splitWords(file, heading, para));
    } else if (batchTokens + pt > TOKEN_CAP && batch.length > 0) {
      const t = batch.join('\n\n').trim();
      chunks.push({ file, heading, text: t, tokenCount: approxTokens(t) });
      batch       = [para];
      batchTokens = pt;
    } else {
      batch.push(para);
      batchTokens += pt;
    }
  }

  if (batch.length > 0) {
    const t = batch.join('\n\n').trim();
    if (t.length > 0) chunks.push({ file, heading, text: t, tokenCount: approxTokens(t) });
  }

  return chunks;
}

function _splitWords(file, heading, text) {
  const words    = text.split(/\s+/).filter(Boolean);
  const chunks   = [];
  let batch      = [];
  let batchChars = 0;
  const cap      = TOKEN_CAP * CHARS_PER_TOKEN;

  for (const word of words) {
    const wc = word.length + 1;
    if (batchChars + wc > cap && batch.length > 0) {
      const t = batch.join(' ');
      chunks.push({ file, heading, text: t, tokenCount: approxTokens(t) });
      batch      = [word];
      batchChars = wc;
    } else {
      batch.push(word);
      batchChars += wc;
    }
  }

  if (batch.length > 0) {
    const t = batch.join(' ');
    if (t.trim().length > 0) chunks.push({ file, heading, text: t, tokenCount: approxTokens(t) });
  }

  return chunks;
}

// ─── buildBM25Index ──────────────────────────────────────────────────────────

/**
 * Build a BM25 index over an array of chunks.
 * @param {Array} chunks
 * @returns {{ chunks:Array, idf:Object, avgDocLen:number, termFreqs:Array<Map> }}
 */
function buildBM25Index(chunks) {
  if (!chunks || chunks.length === 0) {
    return { chunks: [], idf: {}, avgDocLen: 0, termFreqs: [] };
  }

  const N        = chunks.length;
  const df       = {};
  const termFreqs = [];
  let totalLen   = 0;

  for (const chunk of chunks) {
    const terms = tokenize((chunk.text || '') + ' ' + (chunk.heading || ''));
    const tf    = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    termFreqs.push(tf);
    for (const t of tf.keys()) df[t] = (df[t] || 0) + 1;
    totalLen += terms.length;
  }

  const avgDocLen = totalLen / N;

  const idf = {};
  for (const [term, freq] of Object.entries(df)) {
    idf[term] = Math.log((N - freq + 0.5) / (freq + 0.5) + 1);
  }

  return { chunks, idf, avgDocLen, termFreqs };
}

// ─── embedChunks ─────────────────────────────────────────────────────────────

/**
 * Fetch OpenRouter embeddings for all chunks. Returns null on any failure (fail-soft).
 * @param {Array} chunks
 * @param {string|null|undefined} apiKey
 * @returns {Promise<Array<Array<number>>|null>}
 */
async function embedChunks(chunks, apiKey) {
  if (!apiKey) return null;

  try {
    const texts = chunks.map(c =>
      c.heading ? `${c.heading}\n${c.text}` : c.text
    );

    const resp = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });

    if (!resp.ok) return null;

    const json = await resp.json();
    if (!json.data || !Array.isArray(json.data)) return null;

    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map(d => d.embedding);
  } catch {
    return null;
  }
}

// ─── rankChunks ──────────────────────────────────────────────────────────────

/**
 * Rank chunks by BM25 and optional cosine similarity. Returns top TOP_N results.
 * When chunk embeddings are provided, computes a pseudo-query vector as the
 * IDF-weighted centroid of embeddings for BM25-matching chunks, then blends
 * BM25 (60%) and cosine (40%) into a composite score.
 *
 * @param {{ chunks, idf, avgDocLen, termFreqs }} index
 * @param {string} query
 * @param {Array<Array<number>>|null} embeddings — precomputed chunk embeddings
 * @returns {Array} scored chunks, sorted descending by _score, max TOP_N
 */
function rankChunks(index, query, embeddings) {
  if (!index || !index.chunks || index.chunks.length === 0) return [];

  const { chunks, idf, avgDocLen, termFreqs } = index;
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Precompute pseudo-query embedding when chunk embeddings are available
  const qVec = embeddings ? _pseudoQueryVec(embeddings, termFreqs, queryTerms, idf) : null;

  const scored = chunks.map((chunk, i) => {
    const tf = termFreqs[i];
    const dl = [...tf.values()].reduce((s, v) => s + v, 0);

    let bm25 = 0;
    for (const term of queryTerms) {
      const termTf  = tf.get(term) || 0;
      if (termTf === 0) continue;
      const termIdf = idf[term] || 0;
      bm25 += termIdf * (termTf * (BM25_K1 + 1)) /
              (termTf + BM25_K1 * (1 - BM25_B + BM25_B * dl / (avgDocLen || 1)));
    }

    let score = bm25;

    if (qVec && embeddings && embeddings[i]) {
      const cosine = _cosine(qVec, embeddings[i]);
      score = bm25 * 0.6 + cosine * 0.4;
    }

    return { ...chunk, _score: score };
  });

  return scored
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, TOP_N);
}

function _pseudoQueryVec(embeddings, termFreqs, queryTerms, idf) {
  const dim = embeddings[0] ? embeddings[0].length : 0;
  if (dim === 0) return null;

  const vec    = new Array(dim).fill(0);
  let totWeight = 0;

  for (let i = 0; i < termFreqs.length; i++) {
    if (!embeddings[i]) continue;
    let weight = 0;
    const tf = termFreqs[i];
    for (const term of queryTerms) {
      weight += (tf.get(term) || 0) * (idf[term] || 0);
    }
    if (weight <= 0) continue;
    for (let d = 0; d < dim; d++) vec[d] += embeddings[i][d] * weight;
    totWeight += weight;
  }

  if (totWeight === 0) return null;
  return vec.map(v => v / totWeight);
}

function _cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── buildTrace ───────────────────────────────────────────────────────────────

/**
 * Format ranked results as a retrieval trace header for QueryMemory responses.
 * Format per entry: [N] from {file} § {heading}\n{excerpt}
 * @param {Array|null|undefined} results
 * @returns {string}
 */
function buildTrace(results) {
  const list   = Array.isArray(results) ? results : [];
  const header = `[MEMORY TRACE] — ${list.length} result${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) return header;

  const entries = list.map((r, i) => {
    const label   = `[${i + 1}] from ${r.file}${r.heading ? ` § ${r.heading}` : ''}`;
    const excerpt = (r.text || '').slice(0, EXCERPT_MAX);
    return `${label}\n${excerpt}`;
  });

  return [header, '', ...entries].join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { chunkFiles, buildBM25Index, embedChunks, rankChunks, buildTrace };
