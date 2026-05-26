'use strict';
const fs = require('fs');
const path = require('path');

const backlogPath = path.join(__dirname, '..', 'docs', 'backlog.json');
const b = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
const t = b.tasks.find(x => x.number === 56);
if (!t) { console.error('Task 56 not found'); process.exit(1); }

t.status = 'planned';

t.plan = [
  'Audit ~/.claude/CLAUDE.md and migrate all non-invariant content to Firestore memories via addMemories(), leaving only ~20-30 invariant lines.',
  '',
  'Phase 1 (Audit): Read CLAUDE.md in full, classify every entry as invariant (stays) or migrate (moves to Firestore), produce a reviewed migration table.',
  '',
  'Phase 2 (Migrate): Bulk-insert migrate-tagged entries as instruction-type memories scoped to project Polaris with strength >= 0.8. Verify write count matches input. Spot-check searchMemories returns migrated content.',
  '',
  'Phase 3 (Trim): Remove migrated sections from CLAUDE.md. Target <= 35 lines covering session startup routine, three-zone file rule, branch isolation policy, and build/install commands.',
  '',
  'First Proof Unit: Audit table covering every CLAUDE.md section, reviewed and signed off by Scott before any Firestore writes.',
].join('\n');

t.proofUnits = [
  {
    number: 1,
    title: 'Audit table complete',
    expectedBehavior: 'Every section of ~/.claude/CLAUDE.md is classified as invariant or migrate with type and strength; no entries untagged.',
    proofType: 'waiver',
    exactCommand: '1. Read ~/.claude/CLAUDE.md in full. 2. Produce classification table (entry | invariant/migrate | type | strength). 3. Review with Scott.',
    expectedInitialFailure: 'No classification table exists; CLAUDE.md is unreviewed.',
    expectedPassingEvidence: 'Table covers every non-empty section; Scott confirms classifications correct.',
    waiverGuidance: 'Automated classification not possible -- human judgment required. Scott sign-off is the proof.',
  },
  {
    number: 2,
    title: 'Firestore write count matches input',
    expectedBehavior: 'addMemories() returns array of IDs whose length equals the number of migrate-tagged entries.',
    proofType: 'manual-script',
    exactCommand: 'node scripts/migrate-claude-md.js (to be created during build)',
    expectedInitialFailure: 'Firestore has 0 entries for project Polaris matching migrated content.',
    expectedPassingEvidence: 'Script prints: Wrote N memories. Success: true. No errors.',
    waiverGuidance: 'N/A',
  },
  {
    number: 3,
    title: 'Migrated memories are searchable',
    expectedBehavior: 'searchMemories("Polaris", "") returns at least the migrated entries confirming they are indexed and retrievable by the injection system.',
    proofType: 'manual-script',
    exactCommand: 'node scripts/verify-claude-md-memories.js (to be created during build)',
    expectedInitialFailure: 'searchMemories returns 0 or fewer results than migrated entries.',
    expectedPassingEvidence: 'Script prints: Found N memories. Spot-check shows migrated content strings.',
    waiverGuidance: 'N/A',
  },
  {
    number: 4,
    title: 'CLAUDE.md trimmed to <= 35 lines',
    expectedBehavior: '~/.claude/CLAUDE.md contains only invariant entries, is <= 35 lines, and all four invariant sections are present and intact.',
    proofType: 'smoke-command',
    exactCommand: 'powershell -c "(Get-Content C:/Users/scott/.claude/CLAUDE.md).Count"',
    expectedInitialFailure: 'Line count ~200; non-invariant sections still present.',
    expectedPassingEvidence: 'Count <= 35; four invariant sections (startup routine, three-zone rule, branch isolation, build commands) intact.',
    waiverGuidance: 'N/A',
  },
];

t.objective = {
  statement: 'Trim ~/.claude/CLAUDE.md to invariant-only entries by migrating all non-invariant behavioral rules and corrections to Firestore memories, where the Task #51 injection system will surface them reliably at session start.',
  successCriteria: [
    'Every CLAUDE.md entry is classified as invariant or migrate with no untagged entries',
    'All migrate-tagged entries exist in Firestore as instruction-type memories scoped to Polaris with strength >= 0.8',
    'searchMemories("Polaris", "") returns the migrated entries',
    'CLAUDE.md is <= 35 lines containing only the four invariant sections',
  ],
  nonGoals: [
    'Changes to lib/memoryInjection.js or server.js',
    'Agent session injection (Task #57)',
    'Trimming the Polaris project-root CLAUDE.md (separate follow-up)',
    'Changing memory ranking or reinforcement logic',
  ],
  proofMap: [
    { criterion: 'Every CLAUDE.md entry classified', proofUnit: 1 },
    { criterion: 'Migrate-tagged entries in Firestore with correct fields', proofUnit: 2 },
    { criterion: 'searchMemories returns migrated entries', proofUnit: 3 },
    { criterion: 'CLAUDE.md trimmed to <= 35 invariant lines', proofUnit: 4 },
  ],
  stopConditions: [
    'lib/memory.js cannot be called standalone (no Firestore credentials available) -- stop and resolve credentials before migrating',
    'Scott rejects the classification table -- stop and re-classify before writing to Firestore',
  ],
};

fs.writeFileSync(backlogPath, JSON.stringify(b, null, 2), 'utf8');
console.log('Done. Task 56 status:', t.status, '| proofUnits:', t.proofUnits.length, '| objective:', !!t.objective);
