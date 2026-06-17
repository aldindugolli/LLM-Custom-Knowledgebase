# Hermes v2 Architecture

## System Overview

Hermes v2 evolves from a note-centric memory CRUD into an agent-centric Knowledge Operating System. Four systems work in concert:

```
┌─────────────────────────────────────────────────────────┐
│                    Obsidian (Source of Truth)            │
│  vault/projects/  vault/decisions/  vault/learnings/    │
│  vault/concepts/  vault/reflections/ vault/entities/    │
│  vault/sessions/  vault/tasks/       vault/references/  │
└────────────────────┬────────────────────────────────────┘
                     │ reads/writes
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Hermes (Memory & Knowledge Layer)           │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Project   │  │ Decision │  │Reflection│  │ Entity  │ │
│  │ Awareness │  │ Tracking │  │ Engine   │  │ System  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │Knowledge  │  │ Working  │  │ Graph v2 │  │Memory   │ │
│  │ Memory    │  │ Memory   │  │(typed    │  │ Decay   │ │
│  │           │  │(ephemeral)│  │ edges)  │  │ Engine  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │Semantic  │  │Hybrid    │  │Importance│  │Auto     │ │
│  │ Search   │  │Retrieval │  │ Scoring  │  │Maintain │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP REST + MCP stdio
                     ▼
┌─────────────────────────────────────────────────────────┐
│           OpenCode (Execution Layer)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ hermessess  │  │ hermes-brain│  │ MCP tools        │ │
│  │ lifecycle   │  │ plugin      │  │ (10 filesystem+  │ │
│  │ hooks       │  │             │  │  vault tools)    │ │
│  └─────────────┘  └─────────────┘  └──────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ context bundle + tool calls
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Claude / LLM (Reasoning Layer)                │
│  Receives ProjectContextBundle as system prompt          │
│  Never owns memory — all writes go through Hermes       │
└─────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### Obsidian — Source of Truth
- All long-term memory lives in `.md` files
- Vault structure is the schema
- Human-readable, version-controllable, portable
- Hermes never replaces Obsidian — it indexes and enriches it

### Hermes — Memory & Knowledge Layer
- Indexes the vault into entity-aware knowledge structures
- Provides project awareness, decision tracking, reflection
- Handles all retrieval, ranking, synthesis, and maintenance
- Exposes REST API + MCP tools
- Never decides — surfaces context for the reasoning layer

### OpenCode — Execution Layer
- Maintains session lifecycle
- Loads context bundles before Claude starts
- Extracts learnings/decisions after Claude finishes
- Triggers maintenance jobs between sessions
- Routes Claude's knowledge requests to Hermes

### Claude / LLM — Reasoning Layer
- Receives context bundles (never raw vault access)
- Reasons about the current state
- Outputs decisions, learnings, and task updates
- Never owns or stores memory independently

## Three Memory Layers

### 1. Knowledge Memory
| Property | Value |
|---|---|
| Lifespan | Permanent |
| Mutation | Rare |
| Confidence | High |
| Storage | vault/learnings/, vault/concepts/, vault/references/ |
| Retrieval | Always included in context bundles |

### 2. Working Memory
| Property | Value |
|---|---|
| Lifespan | Session-scoped (expires after N hours of inactivity) |
| Mutation | Frequent |
| Confidence | Low |
| Storage | vault/sessions/ (via session notes) |
| Retrieval | Only when referenced by current task |

### 3. Project Memory
| Property | Value |
|---|---|
| Lifespan | Project duration |
| Mutation | Regular |
| Confidence | High |
| Storage | vault/projects/, vault/decisions/, vault/tasks/ |
| Retrieval | Always included in project context bundles |

## Entity Model

```
Entity (abstract)
  ├── Project    — long-running efforts with goals and milestones
  ├── Decision   — ADR: title, rationale, alternatives, consequences
  ├── Task       — tracked work items (active/completed)
  ├── Goal       — high-level objective linked to project
  ├── Learning   — reusable insight (exists today)
  ├── Concept    — domain definition (exists today)
  ├── Reference  — external link (exists today)
  ├── Technology — tools, frameworks, libraries
  └── Person     — stakeholder or contributor
```

Each entity has:
- `id`, `type`, `title`, `body`
- `created`, `updated`, `importance` (1-5)
- `confidence` (0.0-1.0)
- `referenceCount`, `lastReferenced`, `retrievalCount`
- Entity-specific metadata (project, rationale, status, etc.)

## Knowledge Graph v2

Current: `Note ──wikilink──► Note`

Target: `Entity ──[typed, weighted]──► Entity`

Edge types:
- `uses` — Project uses Technology
- `depends_on` — Module depends on Library
- `implements` — Code implements Decision
- `references` — Note references Entity
- `derived_from` — Learning derived from Session
- `supersedes` — Decision supersedes prior Decision
- `related_to` — General relatedness
- `blocks` — Problem blocks Goal
- `enables` — Technology enables Feature

Edges carry:
- `kind`: one of the above
- `weight`: float 0.0-1.0 (decayed over time)
- `created`: ISO timestamp

## Retrieval Pipeline

```
User Query
    │
    ▼
┌─────────────────────┐
│ 1. Expand query     │  (entity recognition, synonym expansion)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 2. Parallel search  │
│    ├─ Keyword       │  (existing BM25-style scoring)
│    ├─ Semantic      │  (Ollama embedding model → cosine sim)
│    └─ Graph         │  (entity neighborhood traversal)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 3. Fuse & rank      │
│    score = α*kw +   │
│            β*vec +  │
│            γ*graph +│
│            δ*import │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 4. Decay filter     │  (suppress low-importance old results)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ 5. Build context    │
│    bundle           │  (project summary + top-k results)
└─────────┬───────────┘
          ▼
     Return to caller
```

## OpenCode Workflow

```
Session Start
    │
    ├─ Plugin: hermes-session-start
    │   ├─ Load Project Context Bundle
    │   ├─ Load Relevant Knowledge (top-10 scored)
    │   ├─ Load Recent Decisions (top-5)
    │   ├─ Load Active Tasks
    │   └─ Inject as system prompt
    │
    ▼
Claude executes
    │
    ├─ Reads context (never writes directly)
    ├─ Uses Hermes MCP tools for knowledge queries
    └─ At key moments, outputs structured data blocks
         ├─ [LEARNING] {title, body, tags}
         └─ [DECISION] {title, rationale, alternatives, consequences}
    │
    ▼
Session End
    │
    ├─ Plugin: hermes-session-end
    │   ├─ Extract learnings from structured blocks
    │   ├─ Extract decisions from structured blocks
    │   ├─ Run synthesis (dedup, contradictions)
    │   ├─ Update project state (progress, tasks)
    │   ├─ Write session note
    │   └─ Trigger reflection if N sessions completed
    │
    ▼
Between Sessions (async)
    │
    ├─ Maintenance scheduler runs:
    │   ├─ Duplicate detection
    │   ├─ Link generation
    │   ├─ Graph rebuild (if stale)
    │   ├─ Ranking recalculation
    │   └─ Reflection generation (weekly/monthly)
    │
    ▼
Next session starts with updated context
```

## Module Dependency Graph (Target)

```
types.ts ─────────────────────────────────────────────┐
  ├──► vault.ts                                        │
  ├──► search.ts                                       │
  ├──► graph.ts (upgraded to typed edges)              │
  ├──► entity/system.ts (NEW)                          │
  ├──► knowledge/memory-decay.ts (NEW)                 │
  ├──► knowledge/importance-scoring.ts (NEW)           │
  ├──► knowledge/semantic-search.ts (NEW)              │
  ├──► project/context-builder.ts (NEW)                │
  ├──► project/state-manager.ts (NEW)                  │
  ├──► project/summary-generator.ts (NEW)              │
  ├──► decision/tracker.ts (NEW)                       │
  ├──► reflection/generator.ts (NEW)                   │
  ├──► reflection/scheduler.ts (NEW)                   │
  ├──► maintenance/manager.ts (NEW)                    │
  ├──► eval/framework.ts (NEW)                         │
  └────────────────────────────────────────────────────┘
```

## Data Flow Example: "What are we doing?"

```
1. User asks: "What are we doing?"

2. Hermes receives query at GET /context/project?name=hermes

3. ProjectContextBuilder loads:
   ├─ vault/projects/hermes.md (project summary + goals)
   ├─ vault/decisions/ (last 5 decisions)
   ├─ vault/tasks/active/ (current tasks)
   ├─ vault/sessions/ (last 3 sessions)
   └─ vault/learnings/ (top-5 by project relevance)

4. ProjectStateManager computes:
   ├─ Current phase
   ├─ Open problems
   ├─ Recent progress
   └─ Suggested next actions

5. ProjectSummaryGenerator assembles:

   Project: Hermes
   Phase: Agent-Centric Memory OS
   Goals: Evolve from CRUD to knowledge OS
   Tasks:
     - [IN PROGRESS] File upload + PDF/Excel parsing
     - [PENDING] Entity system
     - [PENDING] Semantic search
   Recent Decisions:
     - Use pdf-parse v2 for PDF extraction (2026-06-17)
     - Use SheetJS for Excel read/write (2026-06-17)
   Open Problems:
     - Multi-occurrence edit_file edge cases
     - Ollama cold-start latency
   Next Actions:
     - Implement entity types
     - Deploy embedding model

6. Claude receives this bundle as system context.
   It can now answer "what are we doing" from its own context,
   without needing conversation history.
```

## Configuration Additions

```env
# New Hermes v2 config
HERMES_EMBEDDING_MODEL=nomic-embed-text   # Ollama embedding model
HERMES_EMBEDDING_DIM=768                   # Dimensions for vector index
HERMES_DECAY_DAYS=90                        # Memory decay half-life
HERMES_REFLECTION_INTERVAL=10              # Sessions between reflections
HERMES_MAINTENANCE_INTERVAL=3600000        # Maintenance loop (1hr)
HERMES_MAX_CONTEXT_NOTES=20                # Max notes in context bundle
HERMES_PROJECT_MEMORY_PRIORITY=high        # Always include project memory
```

## API Additions

| Method | Path | Description |
|---|---|---|
| GET | `/context/project?name=` | Project context bundle |
| POST | `/entity/create` | Create entity |
| GET | `/entity/search?type=&query=` | Search entities |
| POST | `/decision/record` | Record ADR |
| GET | `/decision/list?project=` | List decisions for project |
| POST | `/reflection/generate` | Trigger reflection |
| GET | `/reflection/list` | List reflections |
| GET | `/graph/entities` | Entity graph (typed edges) |
| GET | `/graph/paths?from=&to=` | Path finding between entities |
| POST | `/maintenance/run` | Trigger maintenance jobs |
| GET | `/memory/importance?id=` | Get importance score |
| POST | `/memory/rank` | Rank memories for query |
| GET | `/eval/retrieval?query=` | Run retrieval evaluation |
