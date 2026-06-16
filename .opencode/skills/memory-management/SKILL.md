---
name: memory-management
description: "Deep vault operations for knowledge management. Use for batch operations, vault reorganization, knowledge graph queries, and schema migrations."
---

# Memory Management Skill

Use this skill for advanced vault operations beyond simple CRUD.

## Vault Organization

The vault follows the PARA-adjacent structure:

- **sessions/** — Ephemeral: per-session logs, automatically created and summarized
- **learnings/** — Durable: technical patterns, gotchas, configurations, reusable knowledge
- **decisions/** — Durable: architecture decisions with context, rationale, and consequences
- **concepts/** — Durable: domain-specific definitions, terminology, and mental models
- **projects/** — Semi-durable: per-project context briefs, updated as projects evolve
- **references/** — External links, articles, documentation summaries

## Knowledge Graph Operations

Notes use `[[wikilinks]]` to form a knowledge graph. When editing notes:

1. Add `[[wikilinks]]` to related concepts, decisions, and learnings
2. Update the `related` field in frontmatter with note IDs
3. Check for orphans after creating new notes

## Health Maintenance

Run `hermes-health` periodically and fix any issues found:

- **Orphans**: Notes with no backlinks. Either link them from related notes or archive.
- **Broken links**: `[[wikilinks]]` that don't resolve to any note. Fix or remove.
- **Stale pages**: Notes not updated in 90+ days. Review and update if needed.

## Batch Operations

When importing multiple pieces of knowledge:

1. Use `hermes-save` for each item
2. Ensure all items have consistent `project` and `tags` values
3. Link related items by adding their IDs to `related` arrays
4. After batch import, run a health check to catch orphans
