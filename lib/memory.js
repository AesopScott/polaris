'use strict';

// ─── Polaris Memory Module ─────────────────────────────────────────────────────
// Firestore-backed memory store with BM25 keyword search and Ebbinghaus decay.
//
// Architecture:
//   • Storage:   Firebase Firestore (polaris-9d022, collection: polaris_memories)
//   • Extraction: Codex via OpenRouter (post-session, independent from Claude)
//   • Search:    Firestore compound query + client-side BM25 ranking
//   • Decay:     Ebbinghaus curve applied per memory (strength 0.0–1.0)
//   • Fallback:  Returns [] if Firestore unavailable; callers fall back to Obsidian
// ──────────────────────────────────────────────────────────────────────────────

const admin  = require('firebase-admin');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');

const SERVICE_ACCOUNT_PATH = path.join(
  process.env.APPDATA || os.homedir(),
  '.claude', 'polaris', 'firebase-keys',
  'polaris-9d022-firebase-adminsdk-fbsvc-55d2c70d3f.json'
);

const COLLECTION      = 'polaris_memories';
const DECAY_THRESHOLD = 0.1;   // memories below this are considered archived
const STABILITY_BASE  = 7;     // base half-life in days (no reinforcement)
const MAX_STRENGTH    = 1.0;   // cap so reinforcement doesn't exceed 1
const MIN_INITIAL_STRENGTH = 0.6;
const GLOBAL_MEMORY_PROJECT = 'global';
const DISTILLED_MEMORY_SOURCE = 'memory-distillation';
const DISTILLED_MEMORY_TAG = 'distilled-memory';
const IMPORTANCE_DEFAULTS = {
  decision: 5,
  preference: 4,
  feedback: 4,
  pattern: 3,
  fact: 2,
};
const DECAY_STABILITY_MULTIPLIERS = {
  decision: 3,
  preference: 2,
  feedback: 1.5,
  pattern: 1.25,
  fact: 1,
};

let db = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  if (db) return db;
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.warn('[memory] Firebase service account not found at', SERVICE_ACCOUNT_PATH);
    return null;
  }
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('[memory] ✅ Firestore initialized (polaris-9d022)');
    return db;
  } catch (e) {
    console.error('[memory] Firestore init failed:', e.message);
    return null;
  }
}

function isReady() {
  return !!init();
}

// ─── Write ────────────────────────────────────────────────────────────────────

function normalizeImportance(importance, type = 'fact') {
  if (importance !== null && importance !== undefined && importance !== '') {
    const explicit = Number(importance);
    if (Number.isFinite(explicit)) return Math.max(1, Math.min(5, Math.round(explicit)));
  }
  const key = String(type || 'fact').toLowerCase();
  return Object.prototype.hasOwnProperty.call(IMPORTANCE_DEFAULTS, key)
    ? IMPORTANCE_DEFAULTS[key]
    : IMPORTANCE_DEFAULTS.fact;
}

function initialStrengthForMemory({ importance, type } = {}) {
  const score = normalizeImportance(importance, type);
  const scaled = MIN_INITIAL_STRENGTH + ((score - 1) / 4) * (MAX_STRENGTH - MIN_INITIAL_STRENGTH);
  return Math.round(scaled * 100) / 100;
}

function memoryTypeKey(type = 'fact') {
  const key = String(type || 'fact').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DECAY_STABILITY_MULTIPLIERS, key) ? key : 'fact';
}

function stabilityForMemory(data = {}) {
  const accessCount = Math.max(0, Number(data.accessCount) || 0);
  const typeMultiplier = DECAY_STABILITY_MULTIPLIERS[memoryTypeKey(data.type)];
  return STABILITY_BASE * typeMultiplier * Math.log(accessCount + 2);
}

function hasGlobalProjectTag(tags = []) {
  return normalizeTags(tags).some(tag => tag.replace(/\s+/g, '') === 'project:global');
}

function normalizeMemoryProject(project, tags = []) {
  if (hasGlobalProjectTag(tags)) return GLOBAL_MEMORY_PROJECT;
  return String(project || '').trim().toLowerCase() === GLOBAL_MEMORY_PROJECT
    ? GLOBAL_MEMORY_PROJECT
    : project;
}

function prepareMemoryWrite({ project, content, type, tags = [], sessionId, sessionType, source = 'codex', importance }) {
  const memoryType = type || 'fact';
  const importanceScore = normalizeImportance(importance, memoryType);
  return {
    project:     normalizeMemoryProject(project, tags),
    content,
    type:        memoryType,
    tags:        tags || [],
    sessionId:   sessionId || null,
    sessionType: sessionType || null,
    source:      source || 'codex',
    importance:  importanceScore,
    accessCount: 0,
    strength:    initialStrengthForMemory({ importance: importanceScore, type: memoryType }),
    _archived:   false
  };
}

function normalizeEditableTags(tags = []) {
  if (typeof tags === 'string') {
    return normalizeTags(tags.split(','));
  }
  return normalizeTags(tags);
}

function prepareMemoryEdit({ content, type, tags = [], importance }) {
  const memoryType = type || 'fact';
  const memoryContent = String(content || '').trim();
  if (!memoryContent) throw new Error('Memory content is required');
  const editableTags = normalizeEditableTags(tags);
  const importanceScore = normalizeImportance(importance, memoryType);
  return {
    content:    memoryContent,
    type:       memoryType,
    tags:       editableTags,
    importance: importanceScore,
    strength:   initialStrengthForMemory({ importance: importanceScore, type: memoryType }),
  };
}

function decayedStrengthForMemory(data, nowSec = Date.now() / 1000) {
  const lastSec = data.lastAccessedAt?.seconds || nowSec;
  const daysSince = (nowSec - lastSec) / 86400;
  const stability = stabilityForMemory(data);
  const currentStrength = Number.isFinite(Number(data.strength)) ? Number(data.strength) : MAX_STRENGTH;
  const peakStrength = data.importance == null
    ? MAX_STRENGTH
    : initialStrengthForMemory({ importance: data.importance, type: data.type });
  const decayed = Math.min(peakStrength, peakStrength * Math.exp(-daysSince / stability));
  return Math.min(currentStrength, decayed);
}

function normalizeTags(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : [])
    .map(tag => String(tag || '').trim().toLowerCase())
    .filter(Boolean))];
}

function jaccardSimilarity(a = [], b = []) {
  const left = new Set(normalizeTags(a));
  const right = new Set(normalizeTags(b));
  if (left.size === 0 && right.size === 0) return 0;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const tag of left) if (right.has(tag)) intersection++;
  return intersection / union.size;
}

function normalizeContent(content = '') {
  return String(content || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function longestCommonSubstringLength(a, b) {
  if (!a || !b) return 0;
  const previous = new Array(b.length + 1).fill(0);
  const current = new Array(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : 0;
      if (current[j] > best) best = current[j];
    }
    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }
  return best;
}

function substringOverlap(contentA, contentB) {
  const a = normalizeContent(contentA);
  const b = normalizeContent(contentB);
  if (!a || !b) return 0;
  const shorterLength = Math.min(a.length, b.length);
  const longerLength = Math.max(a.length, b.length);
  if (shorterLength < 24) return 0;
  if ((a.includes(b) || b.includes(a)) && shorterLength / longerLength >= 0.6) return 1;
  const longest = longestCommonSubstringLength(a, b);
  return longest / shorterLength;
}

function memorySimilarity(candidate, existing) {
  const tagScore = jaccardSimilarity(candidate.tags, existing.tags);
  const contentScore = substringOverlap(candidate.content, existing.content);
  if (tagScore === 0 && contentScore < 0.95) return 0;
  return Math.max(contentScore >= 0.95 ? contentScore : 0, (tagScore + contentScore) / 2);
}

function contentTermSimilarity(contentA, contentB) {
  const stem = term => term
    .replace(/ations?$/, 'ate')
    .replace(/ings?$/, '')
    .replace(/s$/, '');
  const terms = content => new Set(normalizeContent(content)
    .split(/\W+/)
    .filter(term => term.length > 3)
    .map(stem)
    .filter(term => term.length > 3));
  const left = terms(contentA);
  const right = terms(contentB);
  if (left.size === 0 || right.size === 0) return 0;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const term of left) if (right.has(term)) intersection++;
  return intersection / union.size;
}

function findDuplicateMemory(candidate, existingMemories = [], threshold = 0.7) {
  let best = null;
  for (const existing of existingMemories) {
    if (candidate.project !== existing.project) continue;
    const score = memorySimilarity(candidate, existing);
    if (score < threshold) continue;
    if (!best || score > best.score) best = { memory: existing, score };
  }
  return best;
}

function planMemoryConsolidation(candidates = [], existingByProject = new Map(), threshold = 0.7) {
  const toWrite = [];
  const toReinforce = [];
  const reinforcedKeys = new Set();
  for (const candidate of candidates) {
    const existing = existingByProject.get(candidate.project) || [];
    const duplicate = findDuplicateMemory(candidate, existing, threshold);
    if (duplicate?.memory) {
      const key = duplicate.memory.id || duplicate.memory.ref?.path || duplicate.memory.content;
      if (!reinforcedKeys.has(key)) {
        toReinforce.push({ candidate, existing: duplicate.memory, score: duplicate.score });
        reinforcedKeys.add(key);
      }
      continue;
    }
    toWrite.push(candidate);
    existing.push(candidate);
    existingByProject.set(candidate.project, existing);
  }
  return { toWrite, toReinforce };
}

function isDistillationCandidate(memory = {}) {
  if (!memory || memory._archived) return false;
  if (memory.source === DISTILLED_MEMORY_SOURCE) return false;
  if (normalizeTags(memory.tags).includes(DISTILLED_MEMORY_TAG)) return false;
  if (!memory.project || !String(memory.content || '').trim()) return false;
  if (String(memory.type || '').toLowerCase() === 'decision') return false;
  return true;
}

function distillationSimilarity(a, b) {
  if (!a || !b || a.project !== b.project) return 0;
  const tagScore = jaccardSimilarity(a.tags, b.tags);
  const contentScore = Math.max(
    substringOverlap(a.content, b.content),
    contentTermSimilarity(a.content, b.content)
  );
  if (contentScore < 0.2) return 0;
  return Math.max(contentScore, (tagScore + contentScore) / 2);
}

function clusterMemoriesForDistillation(memories = [], { threshold = 0.42, minClusterSize = 3 } = {}) {
  const candidates = memories
    .filter(isDistillationCandidate)
    .slice()
    .sort((a, b) => String(a.project || '').localeCompare(String(b.project || ''))
      || String(a.id || '').localeCompare(String(b.id || '')));
  const clusters = [];

  for (const memory of candidates) {
    let bestCluster = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      if (cluster.project !== memory.project) continue;
      const score = cluster.memories.reduce((sum, item) => sum + distillationSimilarity(memory, item), 0) / cluster.memories.length;
      if (score >= threshold && score > bestScore) {
        bestCluster = cluster;
        bestScore = score;
      }
    }
    if (bestCluster) {
      bestCluster.memories.push(memory);
      bestCluster.score = Math.max(bestCluster.score, bestScore);
    } else {
      clusters.push({ project: memory.project, memories: [memory], score: 0 });
    }
  }

  return clusters
    .filter(cluster => cluster.memories.length >= minClusterSize)
    .map(cluster => ({
      ...cluster,
      ids: cluster.memories.map(memory => memory.id).filter(Boolean),
      tags: normalizeTags(cluster.memories.flatMap(memory => memory.tags || [])),
    }));
}

function prepareDistilledMemory({ project, content, type = 'pattern', tags = [], sourceIds = [], importance = 4 }) {
  const sourceTags = sourceIds.length > 0 ? [`source-count:${sourceIds.length}`] : [];
  return {
    ...prepareMemoryWrite({
      project,
      content,
      type,
      tags: normalizeTags([...tags, DISTILLED_MEMORY_TAG, ...sourceTags]),
      source: DISTILLED_MEMORY_SOURCE,
      importance,
    }),
    distilledFrom: sourceIds,
  };
}

/**
 * Add a memory to Firestore.
 * @param {object} opts
 * @param {string} opts.project     — project name (e.g. "Polaris", "The Card")
 * @param {string} opts.content     — the memory text
 * @param {string} opts.type        — "decision" | "preference" | "pattern" | "feedback" | "fact"
 * @param {string[]} [opts.tags]    — keyword tags for retrieval
 * @param {string} [opts.sessionId] — source session ID
 * @param {string} [opts.sessionType] — "agent" | "chat" | "routine"
 * @param {string} [opts.source]    — "codex" | "manual"
 * @param {number} [opts.importance] — 1-5 importance score; defaults by type
 * @returns {Promise<string|null>} — Firestore document ID, or null on failure
 */
async function addMemory({ project, content, type, tags = [], sessionId, sessionType, source = 'codex', importance }) {
  const firestore = init();
  if (!firestore) return null;
  if (!content || !project) return null;

  const doc = {
    ...prepareMemoryWrite({ project, content, type, tags, sessionId, sessionType, source, importance }),
    createdAt:       admin.firestore.FieldValue.serverTimestamp(),
    lastAccessedAt:  admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = await firestore.collection(COLLECTION).add(doc);
    console.log(`[memory] ✅ added ${ref.id} (${type}: ${content.slice(0, 60)}...)`);
    return ref.id;
  } catch (e) {
    console.error('[memory] addMemory failed:', e.message);
    return null;
  }
}

/**
 * Add multiple memories in a single batch write.
 * @param {object[]} memories — array of addMemory opts objects
 * @returns {Promise<string[]>} — array of Firestore document IDs
 */
async function addMemories(memories) {
  const firestore = init();
  if (!firestore || !memories?.length) return [];

  const ids = [];
  const prepared = memories
    .filter(m => m.content && m.project)
    .map(m => prepareMemoryWrite(m));
  if (prepared.length === 0) return [];

  const existingByProject = new Map();
  const projects = [...new Set(prepared.map(m => m.project))];
  for (const project of projects) {
    const snapshot = await firestore.collection(COLLECTION)
      .where('project', '==', project)
      .where('_archived', '==', false)
      .get();
    existingByProject.set(project, snapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() })));
  }

  // Firestore batch limit is 500; memory extractions are typically <20
  const batch = firestore.batch();
  const plan = planMemoryConsolidation(prepared, existingByProject);
  for (const item of plan.toReinforce) {
    if (item.existing?.ref) {
      const current = item.existing.strength || 0;
      batch.update(item.existing.ref, {
        accessCount:    admin.firestore.FieldValue.increment(1),
        lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
        strength:       Math.min(MAX_STRENGTH, current + 0.05)
      });
    }
  }

  for (const m of plan.toWrite) {
    const ref = firestore.collection(COLLECTION).doc();
    batch.set(ref, {
      ...m,
      createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      lastAccessedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });
    ids.push(ref.id);
  }

  try {
    await batch.commit();
    console.log(`[memory] ✅ batch wrote ${ids.length} memories, reinforced ${plan.toReinforce.length}`);
    return ids;
  } catch (e) {
    console.error('[memory] addMemories batch failed:', e.message);
    return [];
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * BM25-style keyword score for a single memory doc.
 * Simplified: no corpus-level IDF (collection is small), but term frequency
 * normalised by document length gives good enough ranking.
 */
function bm25Score(content, tags, queryTerms, k1 = 1.5, b = 0.75) {
  const text  = ((content || '') + ' ' + (tags || []).join(' ')).toLowerCase();
  const words = text.split(/\W+/).filter(Boolean);
  const dl    = words.length;
  const avgdl = 30; // estimated average doc length

  let score = 0;
  for (const term of queryTerms) {
    const tf = words.filter(w => w === term).length;
    if (tf === 0) continue;
    score += (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
  }
  return score;
}

function memoryProjectsForSearch(project) {
  const normalizedProject = String(project || '').trim();
  const projects = normalizedProject ? [normalizedProject] : [];
  if (normalizedProject.toLowerCase() !== GLOBAL_MEMORY_PROJECT) {
    projects.push(GLOBAL_MEMORY_PROJECT);
  }
  return [...new Set(projects)];
}

function rankMemoryResults(memories = [], query = '', limit = 5, nowSec = Date.now() / 1000) {
  const queryTerms = (query || '')
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 2);

  const scored = memories.map(memory => {
    const data = { ...memory };

    const kwScore = queryTerms.length > 0
      ? bm25Score(data.content, data.tags, queryTerms)
      : 0;

    const strengthBoost = (data.strength || 0) * 0.3;

    const lastAccessedSec = data.lastAccessedAt?.seconds || 0;
    const ageDays = lastAccessedSec > 0 ? (nowSec - lastAccessedSec) / 86400 : 999;
    const recencyBoost = Math.max(0, 1 - ageDays / 90) * 0.1;

    data._score = kwScore + strengthBoost + recencyBoost;
    return data;
  });

  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, limit);
}

async function searchMemoryDocs(firestore, project, query, limit = 5) {
  const projects = memoryProjectsForSearch(project);
  const memoriesById = new Map();

  for (const memoryProject of projects) {
    const snapshot = await firestore.collection(COLLECTION)
      .where('project', '==', memoryProject)
      .where('strength', '>', DECAY_THRESHOLD)
      .where('_archived', '==', false)
      .orderBy('strength', 'desc')
      .orderBy('lastAccessedAt', 'desc')
      .limit(50)
      .get();

    for (const doc of snapshot.docs) {
      memoriesById.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  return rankMemoryResults([...memoriesById.values()], query, limit);
}

/**
 * Search memories for a project.
 * Fetches up to 50 live memories from Firestore, ranks by BM25 + strength + recency.
 *
 * @param {string} project  — project name to scope search
 * @param {string} query    — natural-language search query
 * @param {number} [limit]  — max results to return (default 5)
 * @returns {Promise<object[]>} — ranked memory docs with _score field
 */
async function searchMemories(project, query, limit = 5) {
  const firestore = init();
  if (!firestore) return [];

  try {
    return await searchMemoryDocs(firestore, project, query, limit);
  } catch (e) {
    console.error('[memory] searchMemories failed:', e.message);
    return [];
  }
}

// ─── Reinforce ────────────────────────────────────────────────────────────────

/**
 * Reinforce a memory when it's accessed — increments accessCount,
 * updates lastAccessedAt, and gives a small strength boost (capped at 1.0).
 */
async function reinforceMemory(id) {
  const firestore = init();
  if (!firestore || !id) return;
  try {
    const ref  = firestore.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    const current = snap.data().strength || 0;
    const boosted = Math.min(MAX_STRENGTH, current + 0.05);
    await ref.update({
      accessCount:    admin.firestore.FieldValue.increment(1),
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      strength:       boosted
    });
  } catch (e) {
    console.warn('[memory] reinforceMemory failed:', e.message);
  }
}

// ─── Human correction ─────────────────────────────────────────────────────────

async function listMemoryDocs(firestore, project, { includeGlobal = true, limit = 100 } = {}) {
  const projects = includeGlobal ? memoryProjectsForSearch(project) : [String(project || '').trim()].filter(Boolean);
  const memoriesById = new Map();

  for (const memoryProject of projects) {
    const snapshot = await firestore.collection(COLLECTION)
      .where('project', '==', memoryProject)
      .where('_archived', '==', false)
      .orderBy('strength', 'desc')
      .orderBy('lastAccessedAt', 'desc')
      .limit(limit)
      .get();

    for (const doc of snapshot.docs) {
      memoriesById.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  return [...memoriesById.values()];
}

async function listMemoriesForProject(project, opts = {}) {
  const firestore = init();
  if (!firestore || !project) return [];
  try {
    return await listMemoryDocs(firestore, project, opts);
  } catch (e) {
    console.error('[memory] listMemoriesForProject failed:', e.message);
    return [];
  }
}

async function updateMemory(id, patch = {}) {
  const firestore = init();
  if (!firestore || !id) return { ok: false, error: 'Memory id is required' };
  try {
    const payload = prepareMemoryEdit(patch);
    await firestore.collection(COLLECTION).doc(id).update({
      ...payload,
      updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      _archived:      false,
    });
    return { ok: true, id, memory: payload };
  } catch (e) {
    console.error('[memory] updateMemory failed:', e.message);
    return { ok: false, error: e.message };
  }
}

async function archiveMemory(id) {
  const firestore = init();
  if (!firestore || !id) return { ok: false, error: 'Memory id is required' };
  try {
    await firestore.collection(COLLECTION).doc(id).update({
      _archived:  true,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, id };
  } catch (e) {
    console.error('[memory] archiveMemory failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Higher-order distillation ────────────────────────────────────────────────

async function listDistillationCandidates({ limit = 500, pageSize = 500, maxPages = 20 } = {}) {
  const firestore = init();
  if (!firestore) return [];
  try {
    const candidates = [];
    let baseQuery = firestore.collection(COLLECTION)
      .where('_archived', '==', false);
    const documentId = admin.firestore?.FieldPath?.documentId;
    if (documentId) baseQuery = baseQuery.orderBy(documentId());
    let cursor = null;

    for (let page = 0; page < maxPages && candidates.length < limit; page++) {
      let query = baseQuery.limit(pageSize);
      if (cursor && typeof query.startAfter === 'function') query = query.startAfter(cursor);
      const snapshot = await query.get();
      const docs = snapshot.docs || [];
      for (const doc of docs) {
        const memory = { id: doc.id, ref: doc.ref, ...doc.data() };
        if (isDistillationCandidate(memory)) candidates.push(memory);
        if (candidates.length >= limit) break;
      }
      if (docs.length < pageSize) break;
      cursor = docs[docs.length - 1];
      if (!cursor || typeof baseQuery.limit(pageSize).startAfter !== 'function') break;
    }

    return candidates
      .sort((a, b) => (b.strength || 0) - (a.strength || 0));
  } catch (e) {
    console.error('[memory] listDistillationCandidates failed:', e.message);
    return [];
  }
}

async function applyDistilledMemory({ cluster, synthesis }) {
  const firestore = init();
  if (!firestore || !cluster?.memories?.length || !synthesis?.content) {
    return { ok: false, error: 'Cluster and synthesis content are required' };
  }

  try {
    const sourceIds = cluster.memories.map(memory => memory.id).filter(Boolean);
    const sourceRefs = cluster.memories
      .map(memory => memory.ref || (memory.id ? firestore.collection(COLLECTION).doc(memory.id) : null))
      .filter(Boolean);
    const distilled = prepareDistilledMemory({
      project: cluster.project,
      content: synthesis.content,
      type: synthesis.type || 'pattern',
      tags: synthesis.tags || cluster.tags || [],
      sourceIds,
      importance: synthesis.importance || 4,
    });
    const ref = firestore.collection(COLLECTION).doc();
    const applyWrites = writer => {
      writer.set(ref, {
        ...distilled,
        createdAt:      admin.firestore.FieldValue.serverTimestamp(),
        lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      for (const sourceRef of sourceRefs) {
        writer.update(sourceRef, {
          _archived: true,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          distilledInto: ref.id,
        });
      }
    };
    if (typeof firestore.runTransaction === 'function') {
      const txResult = await firestore.runTransaction(async transaction => {
        for (const sourceRef of sourceRefs) {
          const snap = await transaction.get(sourceRef);
          const data = snap.exists ? snap.data() : null;
          if (!data || data._archived || data.distilledInto) {
            return { skipped: true, reason: 'source-already-archived' };
          }
        }
        applyWrites(transaction);
        return { skipped: false };
      });
      if (txResult?.skipped) return { ok: false, skipped: true, error: txResult.reason };
    } else {
      const batch = firestore.batch();
      applyWrites(batch);
      await batch.commit();
    }
    return { ok: true, id: ref.id, archived: sourceIds.length, memory: distilled };
  } catch (e) {
    console.error('[memory] applyDistilledMemory failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Decay ────────────────────────────────────────────────────────────────────

/**
 * Apply Ebbinghaus forgetting curve to all memories.
 * Stability grows logarithmically with access count (more access = slower decay).
 * Memories below DECAY_THRESHOLD are flagged for archival.
 *
 * Run this periodically (e.g. weekly via routine session).
 *
 * @returns {Promise<{updated: number, archived: number}>}
 */
async function decayMemories() {
  const firestore = init();
  if (!firestore) return { updated: 0, archived: 0 };

  const snapshot = await firestore.collection(COLLECTION)
    .where('strength', '>', 0)
    .where('_archived', '==', false)
    .get();

  const now   = Date.now() / 1000;
  const batch = firestore.batch();
  let updated  = 0;
  let archived = 0;

  for (const doc of snapshot.docs) {
    const data          = doc.data();
    const newStrength   = decayedStrengthForMemory(data, now);

    if (Math.abs(newStrength - (data.strength || 0)) < 0.01) continue; // skip negligible change

    if (newStrength < DECAY_THRESHOLD) {
      batch.update(doc.ref, { strength: newStrength, _archived: true });
      archived++;
    } else {
      batch.update(doc.ref, { strength: newStrength });
    }
    updated++;
  }

  if (updated > 0) {
    await batch.commit();
    console.log(`[memory] decay: ${updated} updated, ${archived} archived`);
  }
  return { updated, archived };
}

// ─── Bulk read ────────────────────────────────────────────────────────────────

/**
 * Get all active memories for a project (for Obsidian sync or export).
 */
async function getAllMemories(project) {
  const firestore = init();
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection(COLLECTION)
      .where('project', '==', project)
      .where('_archived', '==', false)
      .orderBy('strength', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error('[memory] getAllMemories failed:', e.message);
    return [];
  }
}

module.exports = {
  isReady,
  addMemory,
  addMemories,
  searchMemories,
  reinforceMemory,
  listMemoriesForProject,
  updateMemory,
  archiveMemory,
  listDistillationCandidates,
  applyDistilledMemory,
  decayMemories,
  getAllMemories,
  normalizeImportance,
  initialStrengthForMemory,
  stabilityForMemory,
  prepareMemoryWrite,
  prepareMemoryEdit,
  decayedStrengthForMemory,
  GLOBAL_MEMORY_PROJECT,
  DISTILLED_MEMORY_SOURCE,
  DISTILLED_MEMORY_TAG,
  normalizeTags,
  normalizeEditableTags,
  hasGlobalProjectTag,
  normalizeMemoryProject,
  jaccardSimilarity,
  substringOverlap,
  memorySimilarity,
  contentTermSimilarity,
  findDuplicateMemory,
  planMemoryConsolidation,
  isDistillationCandidate,
  distillationSimilarity,
  clusterMemoriesForDistillation,
  prepareDistilledMemory,
  memoryProjectsForSearch,
  rankMemoryResults,
  searchMemoryDocs,
  listMemoryDocs,
};
