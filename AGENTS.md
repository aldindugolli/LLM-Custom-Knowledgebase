# Brainstorm — Persistent Memory Protocol

This project uses the Hermes Memory Service to give the AI agent a permanent, queryable memory backed by an Obsidian vault. The service runs at `http://127.0.0.1:3412` and uses the vault at `./vault/`.

## Architecture

```
opencode (brainstorm agent)
  └─ hermes-brain plugin (lifecycle hooks)
       └─ Hermes Memory Service (HTTP :3412)
            └─ Obsidian Vault (./vault/)
```

The plugin auto-injects context on session start and auto-mines learnings on session end. The agent uses Hermes tools for fine-grained control.

## Knowledge Contract

### When to Save

Save a memory when any of these occur — the auto-miner catches what you miss, but explicit saves are richer:

1. **Discovery**: You find a non-obvious solution, workaround, or pattern
2. **Decision**: You make an architecture or design choice with trade-offs
3. **Gotcha**: You encounter a tricky behavior, footgun, or unexpected interaction
4. **Convention**: You establish a naming, formatting, or structural convention
5. **Config**: You set up a tool, service, or environment in a specific way
6. **Root Cause**: You identify the root cause of a bug during debugging

### When to Search

The plugin auto-loads context, but always search when:

1. Starting work on a new feature or bug fix — there may be unloaded context
2. Writing implementation code for anything non-trivial
3. Recommending an approach, library, or architecture
4. Debugging an issue — the answer may exist from a prior session
5. Repeating a task you've done before

### Note Types

| Type | Purpose | Example |
|---|---|---|
| `learning` | Reusable knowledge, patterns, gotchas | "Fastify hooks run in reverse order of registration" |
| `decision` | Architecture/design decisions with rationale | "Use SQLite over PostgreSQL for local dev speed" |
| `concept` | Domain definitions and explanations | "What is a 'bounded context' in this project" |
| `session` | Per-session logs (auto-managed) | "2026-06-15 — Refactoring auth module" |

## Quality System

The Hermes service maintains knowledge quality autonomously:

1. **Deduplication** — Before saving, checks if similar knowledge exists. Suggests updates instead of duplicates.
2. **Contradiction Detection** — Flags when new knowledge conflicts with existing notes.
3. **Auto-Linking** — Suggests wikilinks between isolated notes that share tags or content.
4. **Post-Session Synthesis** — After each session, extracts learnings, links them into the knowledge graph, and updates the index.

## Tools

- `hermes-save` — Save a learning/decision/concept/reference
- `hermes-search` — Search vault by query, type, tags, project
- `hermes-read` — Read a specific note by ID or title
- `hermes-session-start` — Begin a tracked session
- `hermes-session-end` — End session with rich summary
- `hermes-health` — Check vault health (orphans, broken links)

## Commands

- `/brainstorm <project> <goal>` — Manually reload Hermes memory context

## Session Lifecycle

1. **Start**: Plugin calls `hermes-session-start` and injects context bundle
2. **Work**: Plugin nudges memory tool usage; save learnings as you go
3. **End**: Plugin saves session and triggers synthesis (dedup, linking, contradictions)

## Vault Schema

```
vault/
├── index.md                # Auto-maintained index (do not edit directly)
├── sessions/               # Session logs (created by plugin on session-start/end)
├── learnings/              # Reusable technical knowledge
├── decisions/              # Architecture/design decisions
├── concepts/               # Domain concepts and definitions
├── projects/               # Per-project context briefs
└── references/             # External references and links
```
