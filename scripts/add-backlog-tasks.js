const fs = require('fs');
const path = 'C:\\Users\\scott\\Code\\Polaris\\docs\\backlog.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const newTasks = [
  {
    number: 49,
    title: "Memory importance scoring at write time",
    description: "When addMemory() is called, score the incoming content for importance before persisting. Importance should be derived from: content type (instruction > observation > conversational), source (explicit Scott statement > extracted from session > routine log), and signal words (e.g. always, never, critical, important). Store the score in a top-level importance field (0.0-1.0) on the memory document and use it as a multiplier in BM25 ranking so high-importance memories surface before equal-strength low-importance ones. Without importance scoring, a trivial throwaway memory can outrank a critical invariant purely by recency.",
    category: "feature",
    priority: 10,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: []
  },
  {
    number: 50,
    title: "Memory consolidation synthesis",
    description: "Periodically detect near-duplicate memories and synthesize them into a single canonical record. Near-duplicates arise naturally: the same fact is extracted from multiple sessions, similar observations accumulate across weeks. Deduplication strategy: run BM25 similarity between existing memories nightly; pairs above a threshold (e.g. 0.85) are candidates. A lightweight LLM call (Haiku) synthesizes the pair into one merged record, preserving the highest strength/importance values and oldest createdAt. The original records are archived (not deleted) so the merge can be audited. Without consolidation, the memory store grows unboundedly and injection quality degrades as the same fact competes with itself for token budget.",
    category: "feature",
    priority: 10,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [49]
  },
  {
    number: 51,
    title: "Proactive memory injection into chat sessions",
    description: "On turn 1 of every chat session, retrieve the top-ranked memories for the active project (BM25 search using the session opening message as query, 800-token cap) and inject them via --append-system-prompt-file before spawning the Claude CLI process. This gives Claude context it would otherwise lose between sessions. Chat sessions are higher priority than agent sessions because they are the primary human-facing interaction mode. See docs/task-51-handoff.md for complete implementation spec including buildMemoryInjectionBlock() function.",
    category: "feature",
    priority: 5,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: []
  },
  {
    number: 52,
    title: "Memory editing UI",
    description: "Add a Memories panel to the Polaris UI that lists all memories for the active project, sorted by strength descending. Each row shows: content preview, type, importance, strength, lastAccessedAt, accessCount. Allow Scott to: edit content inline, adjust importance manually, archive (soft-delete) a memory, and trigger manual consolidation synthesis for a selected pair. Without UI, memories are a black box and Scott cannot correct bad extractions or promote underscored facts.",
    category: "feature",
    priority: 30,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [51]
  },
  {
    number: 53,
    title: "Experience-to-skill distillation",
    description: "After a session closes, run a distillation pass that converts raw session content (tool calls, responses, corrections) into structured skill memories. Skill memories have type=skill and encode what worked, what failed, and any correction Scott made. Unlike observation memories (which are factual), skill memories are procedural: when editing JSON use node -e rather than PowerShell ConvertFrom-Json. Distillation should be gated on session length (skip trivial sessions) and run via Haiku to keep cost low. This is how Polaris accumulates institutional knowledge over months of use.",
    category: "feature",
    priority: 40,
    impact: "major",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [49, 50]
  },
  {
    number: 54,
    title: "Cross-project memory tier",
    description: "Add a project=global tier that holds memories applicable to all projects (e.g. preferences, universal tool behaviors, encoding rules). searchMemories() should always include global-tier results alongside project-specific results. Global memories should have higher base importance so they rank above weak project-specific memories but below strong project-specific ones. Enables sharing learnings from AESOP into Polaris and vice versa without duplicating them in every project namespace.",
    category: "feature",
    priority: 50,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [51]
  },
  {
    number: 55,
    title: "Forgetting curve calibration",
    description: "The current Ebbinghaus decay uses a fixed stability formula: stability = 7 * log(accessCount + 2). This is a reasonable starting point but ignores memory type and importance. Calibrate: instruction memories should decay slower (higher stability multiplier), conversational observations faster. High-importance memories should resist decay. Add a calibration config object to lib/memory.js with per-type stability multipliers and an importance decay resistance factor. Run a one-time migration to recompute stability on all existing memories using the new formula.",
    category: "feature",
    priority: 60,
    impact: "minor",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [49]
  },
  {
    number: 56,
    title: "Trim CLAUDE.md to invariant-only entries",
    description: "CLAUDE.md is currently overloaded with facts that should live in Firestore memories (tool behaviors, encoding rules, session correction history). Once proactive memory injection (#51) is live and proven, audit CLAUDE.md and migrate all non-invariant content into Firestore as high-importance memories. Invariant entries that stay: session startup routine, three-zone file rule, branch isolation policy, build/install commands. Everything else moves to memory. Target: CLAUDE.md shrinks from ~200 lines to ~20-30 invariant lines. Reduces startup token cost and lets memories drift-correct as behavior evolves.",
    category: "chore",
    priority: 20,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [51]
  },
  {
    number: 57,
    title: "Obsidian graph import into polaris_memory_edges",
    description: "Parse the Obsidian vault wiki-links ([[Page Name]] syntax) and create a polaris_memory_edges Firestore collection representing entity relationships. Each edge document: { from, to, type, weight, createdAt }. On import, map Obsidian page titles to memory IDs where a match exists; create stub nodes for unmapped pages. This makes the Obsidian knowledge graph machine-readable for graph traversal queries. Enables edge-ranked retrieval that goes beyond keyword matching to follow semantic relationships.",
    category: "feature",
    priority: 35,
    impact: "major",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [51]
  },
  {
    number: 58,
    title: "Edge ranking and reinforcement in polaris_memory_edges",
    description: "Once the edge collection exists (#57), add a weight field that starts at 1.0 and is reinforced each time a traversal follows the edge to reach a useful memory (i.e. the memory was injected and the session subsequently accessed it). High-weight edges surface faster in graph queries. Apply the same Ebbinghaus decay curve used for memories to edges: unused edges weaken over time, active relationship paths stay strong. This transforms the static Obsidian import into a dynamic knowledge graph that learns from usage patterns.",
    category: "feature",
    priority: 45,
    impact: "standard",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [57]
  },
  {
    number: 59,
    title: "Bi-temporal audit log schema for security tooling (design constraint)",
    description: "Forward reference and design constraint for future Polaris security tools. Any security audit log system built on top of the memory/knowledge infrastructure must use bi-temporal structure: valid_time (when the fact was true in the real world) and transaction_time (when Polaris recorded it). This enables forensic past-state reconstruction: given an arbitrary past moment T, reconstruct exactly what the system knew and what was true, independently. Critical for answering Were we secure at T vs Did we think we were secure at T -- a meaningful distinction for CMMC, HIPAA, and SOC2 compliance. Compound condition detection: graph traversal over bi-temporal edges can find attack windows where multiple conditions overlapped (e.g. suspended account + live access edge = breach window during interval [T1, T2]). Schema sketch: { entityId, attribute, value, validFrom, validTo, txFrom, txTo }. Do not build this as a flat log -- the temporal indexing is load-bearing.",
    category: "feature",
    priority: 70,
    impact: "major",
    status: "backlog",
    created_at: "2026-05-25",
    completed_at: null,
    dependencies: [57, 58]
  }
];

const existingNums = new Set(data.tasks.map(function(t) { return t.number; }));
var toAdd = newTasks.filter(function(t) { return !existingNums.has(t.number); });

if (toAdd.length === 0) {
  console.log('All tasks already present.');
} else {
  data.tasks.push.apply(data.tasks, toAdd);
  fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log('Added ' + toAdd.length + ' tasks: ' + toAdd.map(function(t) { return '#' + t.number; }).join(', '));
}
