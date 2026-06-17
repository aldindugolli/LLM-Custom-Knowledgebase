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

## Known Intricacies

### Vault auto-creates `index.md` with `id: "vault-index"`
Every `writeNote` triggers `rebuildIndex()`, which writes an `index.md` with wikilinks to all notes. This adds edges from `vault-index` to every note in the knowledge graph. `getNeighbors` excludes `type === "index"` nodes from results — but traversal still walks through them. For depth 1 this is fine; for depth > 1 be aware that index notes act as a hub.

### Mining regex uses `matchAll` (not `exec`)
Mining patterns were originally written with `RegExp.exec()` on shared module-level regex objects. This caused intermittent failures due to `lastIndex` state leaking between calls. Switched to `String.prototype.matchAll()` which returns a new iterator and avoids shared mutable state entirely.

### Case-insensitive wikilink resolution
Wikilink targets are stored as-written in Markdown (`[[Source]]`), but the link map and reverse index both lowercase keys. The graph edge builder also lowercases before comparing. This means `[[Source]]` correctly resolves to `source.md`.

### Modelfile system prompt injected into chat
At startup, `src/index.ts` reads `Modelfile` and extracts the `SYSTEM """..."""` block. This becomes the base system prompt in the context injector (`src/chat/context.ts`), augmented with relevant vault notes searched per user query. If no Modelfile exists, a fallback prompt is used.

### D3 force graph in frontend
The Graph tab (`public/app.js:initGraph`) uses D3 v7 for force-directed layout. Nodes are colored by type, edges by kind (wikilink/tag/related). Drag, zoom/pan, hover highlighting, and click-to-open-modal are supported. Index nodes are excluded from display.

### Tests use `fastify.inject()` (not HTTP)
API route tests use `app.inject()` to avoid network overhead. This works because Fastify's `inject` API simulates requests in-process. The vault, graph, mining, and session tests use temp directories cleaned up in `afterAll` or manually via `fs.rm`.

### Locked files on Windows
Some packages or files may become locked during Windows development. Use `git clean -fdX` after stopping any running dev server. If hanging, ensure no Node process holds handles on vault files.

## Test Commands

```bash
npx vitest run           # Run all tests
npx vitest               # Watch mode
npx vitest run src/__tests__/graph.test.ts  # Single file
npx vitest run -t "getNeighbors"           # Test name filter
npx tsc --noEmit         # Type-check
```

## CI

GitHub Actions workflow in `.github/workflows/ci.yml`:
- Runs on push/PR to `main`
- Node 20, cached `npm ci`
- `npm run lint` (tsc --noEmit)
- `npm test` (vitest run)

## Current Test Suite (66 tests, all passing)

| File | Tests | What it covers |
|---|---|---|
| `vault.test.ts` | 10 | CRUD, cache invalidation, wikilink resolution, writeLock, rebuildIndex, dedup on rebuild |
| `search.test.ts` | 8 | Keyword search, type/tag filtering, limit/offset, case insensitivity |
| `synthesis.test.ts` | 5 | Contradiction detection, extractNouns, isContradictory |
| `dedup.test.ts` | 4 | Duplicate detection, merge suggestions |
| `graph.test.ts` | 7 | Edge building (wikilink, tag, related), orphans, broken links, getNeighbors, cache TTL |
| `mining.test.ts` | 10 | All 5 learning patterns, 3 decision patterns, dedup, short-filter, mineFromSession save/skip, llmExtract fallback |
| `session.test.ts` | 7 | Start, getActiveSession, list active, end (completes + removes from active), end unknown, appendChatExchange, project brief |
| `routes.test.ts` | 15 | Health, memory list/search/save/update/delete/context/synthesis/knowledge, 404, pagination, validation |
