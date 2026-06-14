# Notes vs Obsidian Decision

Task #48 asked whether Notes should replace or augment Obsidian in Polaris. The current decision is to keep Obsidian as the markdown knowledge base and session/status note system, and not introduce a second notes system of record without a scoped provider and migration plan.

## Current State

Polaris already uses Obsidian-backed markdown for:

- Session transcript exports through project-specific sessions folders.
- Project status notes under the configured vault.
- Project build knowledge loaded from configured Obsidian project folders.
- QueryMemory retrieval over ranked Obsidian excerpts.
- Knowledge distillation that separates durable Firestore memory from Obsidian project notes.

The build plan also already identifies native RAG as the future replacement path for the Obsidian knowledge dependency. That path is broader than a generic Notes integration because it covers ingestion, chunking, embeddings, retrieval, and session-start context.

## Decision

Do not replace Obsidian with Notes now.

Keep Obsidian as the current human-readable markdown vault and external knowledge base. If Polaris adds a Notes feature later, it should be a new scoped task with an explicit target:

- A provider abstraction for an external notes app.
- An internal Quick Notes panel that writes markdown into the existing Obsidian vault.
- A native RAG-backed knowledge surface that makes Obsidian optional.

Any future task must define sync semantics, search and retrieval behavior, conflict handling, migration expectations, and which store is authoritative.

## Closure Criteria

Task #48 is complete as a product decision. There is no code change because the backlog item did not define a target app, API, data model, UI surface, or migration path.
