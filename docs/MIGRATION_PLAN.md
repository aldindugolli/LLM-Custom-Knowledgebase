# Migration Plan: Hermes v1 → v2

## Summary

10 implementation phases, ordered by dependency and risk. Each phase builds on the previous. Existing functionality is preserved throughout — no breaking changes until Phase 6 (types.ts changes). Rollback is possible at every phase boundary.

## Phase 0: Vault Structure Expansion

**Goals:**
Prepare the vault directory structure for new entity types without changing any code.

**Rationale:**
All new entity types need disk locations. Creating empty directories is zero-risk and unblocks all subsequent phases.

**Affected:**
- `src/core/vault.ts` — `NOTE_DIRS` map
- Filesystem — new directories

**Changes:**
```
vault/
  ├── decisions/     (exists — add ADR sub-structure)
  ├── tasks/
  │   ├── active/    (NEW)
  │   └── completed/ (NEW)
  ├── reflections/
  │   ├── weekly/    (NEW)
  │   └── monthly/   (NEW)
  ├── entities/      (NEW)
  └── projects/      (exists)
```

**Migration:**
```diff
 const NOTE_DIRS: Record<NoteType, string> = {
   session: "sessions",
   learning: "learnings",
   decision: "decisions",
   concept: "concepts",
   project: "projects",
   reference: "references",
+  task: "tasks/active",
+  reflection: "reflections/weekly",
+  entity: "entities",
   index: ".",
 };
```

**Testing:** Verify `ensureDirs()` creates the new directories. Verify no existing tests break.

**Acceptance:** `ls vault/tasks/active/ vault/reflections/weekly/ vault/entities/` all exist.

**Rollback:** Delete new empty directories. Revert the one-line change to `NOTE_DIRS`.

---

## Phase 1: Entity Types & Core Types

**Goals:**
Add all new TypeScript types for entities, relationships, memory layers, and metadata. No behavioral changes — type definitions only.

**Rationale:**
All downstream modules depend on these types. Defining them first prevents cascading changes.

**Affected:**
- `src/types.ts`

**Additions to `src/types.ts`:**

```typescript
// New enum for entity types
export type EntityType =
  | "project" | "decision" | "task" | "goal"
  | "learning" | "concept" | "reference"
  | "technology" | "person" | "reflection";

// Entity-typed note with metadata
export interface EntityNote extends Note {
  entityType: EntityType;
  confidence: number;          // 0.0 - 1.0
  retrievalCount: number;
  referenceCount: number;
  lastReferenced: string;      // ISO timestamp
  importance: number;          // 1-5 (extends existing frontmatter)
}

// Memory tier
export type MemoryTier = "knowledge" | "working" | "project";

// Typed relationship
export interface TypedEdge {
  source: string;
  target: string;
  kind:
    | "uses" | "depends_on" | "implements"
    | "references" | "derived_from"
    | "supersedes" | "related_to"
    | "blocks" | "enables";
  weight: number;   // 0.0 - 1.0
  created: string;  // ISO timestamp
}

export interface KnowledgeGraphV2 {
  nodes: Map<string, EntityNote>;
  edges: TypedEdge[];
}

// ADR structure
export interface DecisionRecord {
  title: string;
  rationale: string;
  alternativesConsidered: string[];
  consequences: string;
  date: string;
  project: string;
  status: "proposed" | "accepted" | "superseded";
}

// Project state
export interface ProjectState {
  name: string;
  summary: string;
  currentGoal: string;
  currentPhase: string;
  currentTasks: TaskSummary[];
  openProblems: string[];
  recentDecisions: DecisionRecord[];
  recentLearnings: string[];
  relatedKnowledge: string[];
  suggestedNextActions: string[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  dependsOn?: string[];
}

// Memory importance scoring
export interface ImportanceFactors {
  retrievalFrequency: number;
  projectRelevance: number;
  recency: number;
  decisionStatus: number;    // decisions boosted
  crossLinkDensity: number;
  userEmphasis: number;      // explicit !!
}

// Evaluation
export interface RetrievalEvalResult {
  query: string;
  expected: string[];
  results: string[];
  recall5: number;
  recall10: number;
  mrr: number;
  precision: number;
}

// Maintenance
export interface MaintenanceJob {
  name: string;
  interval: number;
  lastRun: number | null;
  run(): Promise<MaintenanceResult>;
}

export interface MaintenanceResult {
  ok: boolean;
  job: string;
  duration: number;
  itemsProcessed: number;
  errors: string[];
}
```

**Testing:** TypeScript compilation test only — verify `tsc --noEmit` passes.

**Acceptance:** All new types compile. Existing code still uses old types without changes.

**Rollback:** Revert additions to `types.ts`.

---

## Phase 2: Entity System

**Goals:**
Implement entity extraction, storage, and linking. Entities are stored as markdown notes in `vault/entities/` with structured frontmatter. Existing notes are retroactively tagged with entity types.

**Affected modules (NEW):**
- `src/entity/types.ts` — Entity type definitions
- `src/entity/extractor.ts` — Extract entities from note content
- `src/entity/linker.ts` — Link entities to notes and each other
- `src/entity/store.ts` — CRUD for entity notes
- `src/entity/router.ts` — Entity API routes

**Key implementation details:**

```typescript
// src/entity/extractor.ts
// Regex + LLM fallback to extract entity references from note body.
// Pattern matching for:
//   - [[Project: Name]]
//   - [[Technology: Name]]
//   - [[Person: Name]]
// Then LLM fallback for freeform extraction.

// src/entity/store.ts
// Wraps vault.ts createNote/readNote for entity notes.
// Maintains a reverse index: entityId → noteIds that mention it.
```

**Testing:**
- Create entity, read entity, search entity by type
- Extract entities from note content
- Link entity to note
- Verify existing notes are unaffected

**Acceptance:**
```bash
curl -X POST /entity/create \
  -H "Content-Type: application/json" \
  -d '{"type":"technology","title":"Flask","body":"Web framework used by project"}'
# → {"ok":true,"id":"technology-flask"}
```

**Rollback:** Remove entity module imports from `src/index.ts`. Delete entity route registration.

---

## Phase 3: Knowledge Graph v2

**Goals:**
Upgrade from flat `KnowledgeEdge (wikilink|related|tag|same-project)` to `TypedEdge` with kind, weight, and timestamps. Existing edges are auto-migrated.

**Affected:**
- `src/core/graph.ts` — `build()`, `getNeighbors()`, new edge types
- `src/types.ts` — `TypedEdge`, `KnowledgeGraphV2` (already done in Phase 1)

**Key implementation details:**

```typescript
// Migration: v1 → v2 edge mapping
const V1_TO_V2: Record<string, string> = {
  wikilink: "references",
  related: "related_to",
  tag: "related_to",
  "same-project": "related_to",
};

// New edge creation during build():
// For each note pair sharing a project: "same-project" → tag → "related_to"
// For wikilinks between entities: detect relationship type from entity types
//   - Note(type=decision) ──wikilink──► Note(type=project) → "implements"
//   - Note(type=learning) ──wikilink──► Note(type=technology) → "references"
```

**Graph service additions:**
```typescript
// New methods on KnowledgeGraph
interface KnowledgeGraphV2Service {
  build(): Promise<KnowledgeGraphV2>;
  getNeighbors(id: string, kind?: string): Promise<EntityNote[]>;
  findPaths(from: string, to: string): Promise<TypedEdge[][]>;
  getSubgraph(ids: string[]): Promise<KnowledgeGraphV2>;
  getEntityGraph(): Promise<KnowledgeGraphV2>; // entity nodes only
}
```

**Testing:**
- Typed edge creation
- V1 → V2 migration preserves all existing edges
- `findPaths` returns correct path
- `getEntityGraph` filters to entities only

**Acceptance:**
```bash
curl -s /knowledge/graph | jq '.edges[0].kind'
# → "references" (not "wikilink")
```

**Rollback:** Revert `graph.ts` to v1 implementation. Keep `TypedEdge` type but don't use it.

---

## Phase 4: Decision Tracking (ADRs)

**Goals:**
Implement structured Architecture Decision Records. Decisions become first-class entities with `rationale`, `alternativesConsidered`, and `consequences`. Decisions are stored in `vault/decisions/ADR-###-title.md` format.

**Affected modules (NEW):**
- `src/decision/tracker.ts` — Create, read, list decisions
- `src/decision/template.ts` — ADR markdown template
- `src/decision/router.ts` — Decision API routes

**Existing affected:**
- `src/core/templates.ts` — Add ADR template
- `src/core/synthesis.ts` — Decision extraction from sessions (upgrade)

**ADR template:**
```markdown
---
id: "adr-001"
type: "decision"
title: "Use Flask instead of FastAPI"
status: "accepted"
date: "2026-06-17"
project: "hermes"
---

# Decision: Use Flask instead of FastAPI

## Rationale
Lower complexity footprint. Team familiarity. Faster iteration.

## Alternatives Considered
1. FastAPI — more features but steeper learning curve
2. Django — too heavy for this use case

## Consequences
Simplified deployment. Fewer dependencies. Manual OpenAPI docs.
```

**Testing:**
- Create ADR with all required fields
- List ADRs for project, sorted by date
- Retrieve single ADR
- Status transitions (proposed → accepted → superseded)
- Automatic ID assignment (ADR-001, ADR-002)

**Acceptance:**
```bash
curl -s /decision/list?project=hermes | jq '.decisions[0].title'
# → "Use Flask instead of FastAPI"
```

**Rollback:** Unregister decision routes. Decision notes remain in vault as plain notes.

---

## Phase 5: Memory Importance Scoring

**Goals:**
Add ranking metadata and a scoring engine. All notes get scored on retrieval, with importance influencing context assembly priority.

**Affected modules (NEW):**
- `src/knowledge/scorer.ts` — `calculateImportance(note, context)`
- `src/knowledge/ranker.ts` — `rankNotes(notes, query)` → sorted notes
- `src/knowledge/decay.ts` — `applyDecay(note)` → adjusted score

**Scoring formula:**
```
score = 0.15 * retrievalFrequency
      + 0.20 * projectRelevance
      + 0.15 * recency
      + 0.15 * decisionStatus      # decisions get +0.3 boost
      + 0.15 * crossLinkDensity    # more links = more important
      + 0.20 * userEmphasis        # manual importance field
```

Weights are configurable via `HERMES_SCORE_WEIGHTS` env var (JSON).

**Decay formula:**
```
decay = e^(-ln(2) * daysSinceLastAccess / halfLife)
# halfLife = HERMES_DECAY_DAYS (default 90)
# Never decays below 0.1 (non-destructive)
```

**Testing:**
- Score calculation with various inputs
- Decay over simulated time
- Rank sorting correctness
- Edge cases: zero-frequency notes, new notes, decisions vs learnings

**Acceptance:**
```bash
curl -s /memory/importance?id=my-note
# → {"ok":true,"score":0.72,"factors":{...}}
```

**Rollback:** Remove scorer/ranker imports. Search falls back to existing keyword scoring.

---

## Phase 6: Project Awareness System

**Goals:**
Implement the project intelligence layer. `ProjectContextBuilder`, `ProjectStateManager`, and `ProjectSummaryGenerator` together maintain a living picture of each project.

**Affected modules (NEW):**
- `src/project/context-builder.ts` — Assembles context bundle from all sources
- `src/project/state-manager.ts` — Reads/writes project state notes
- `src/project/summary-generator.ts` — Generates human-readable project summary
- `src/project/tracker.ts` — Task CRUD and progress tracking
- `src/project/router.ts` — Project API routes

**Project state note (`vault/projects/hermes.md`):**
```markdown
---
id: "project-hermes"
type: "project"
title: "Hermes Memory Service"
status: "active"
currentGoal: "Implement project awareness"
currentPhase: "Phase 6 Implementation"
---

# Project: Hermes Memory Service

## Summary
Persistent memory service for AI agents. Obsidian-backed, REST API.

## Current Tasks
- [IN PROGRESS] Entity system implementation
- [PENDING] Semantic search integration
- [PENDING] Reflection engine

## Open Problems
1. Ollama cold-start latency on first request
2. Windows path handling for locked files

## Metrics
- 30 source modules
- 28 API endpoints
- 66 tests (100% passing)
```

**Testing:**
- Build context bundle for project
- Update project state (add task, complete task)
- Generate summary text
- Retrieve context without explicit project (infer from session)
- Verify all related knowledge is included

**Acceptance:**
```bash
curl -s "/context/project?name=hermes" | jq '.summary.currentPhase'
# → "Phase 6 Implementation"
```

**Rollback:** Unregister project routes. Remove project module imports.

---

## Phase 7: Reflection Engine

**Goals:**
Convert session history into structured reflections. Every N sessions (default 10), analyze the session corpus for themes, patterns, and project evolution.

**Affected modules (NEW):**
- `src/reflection/generator.ts` — `generateReflection(sessions)` → reflection note
- `src/reflection/synthesizer.ts` — Theme extraction, trend analysis
- `src/reflection/scheduler.ts` — Count sessions, trigger at interval
- `src/reflection/router.ts` — Reflection API routes

**Reflection generation:**
```
Input: Last N sessions (notes from vault/sessions/)
Process:
  1. Collect all tags across sessions
  2. Cluster tags by co-occurrence → themes
  3. For each theme:
     - Count occurrences
     - List representative sessions
     - Extract common patterns
  4. Detect evolution:
     - How tags changed over time
     - New technologies introduced
     - Decisions that recur
  5. Generate summary:
     - "This week focused on X, Y, Z"
     - "Repeated issue: W"
     - "Architecture trend: moving toward V"
```

**Reflection note format:**
```markdown
---
id: "reflection-wk-2026-06-17"
type: "reflection"
title: "Weekly Reflection: June 17, 2026"
period: "weekly"
sessionCount: 12
---

## Key Themes
- File upload implementation (3 sessions)
- PDF parsing research (2 sessions)
- MCP server tuning (4 sessions)

## Repeated Patterns
- TypeScript strict mode issues with pdf-parse
- Windows path separator handling

## Project Evolution
- Focus shifted from vault CRUD → file processing
- Decision: Use pdf-parse v2 over pdfjs-dist

## Suggested Focus
- Complete entity system
- Start semantic search integration
```

**Testing:**
- Generate reflection from synthetic sessions
- Detect themes correctly
- Scheduled trigger at N sessions
- Reflection note storage and retrieval

**Acceptance:**
```bash
curl -s /reflection/list | jq '.reflections[0].title'
# → "Weekly Reflection: June 17, 2026"
```

**Rollback:** Remove reflection imports and route registration.

---

## Phase 8: Semantic Search

**Goals:**
Add embedding-based search alongside keyword search. Use Ollama's `nomic-embed-text` model. Implement hybrid retrieval that fuses keyword + vector + graph scores.

**Affected modules (NEW):**
- `src/knowledge/embeddings.ts` — Generate embeddings via Ollama
- `src/knowledge/vector-index.ts` — In-memory FAISS-like index (cosine sim)
- `src/knowledge/hybrid-search.ts` — Fuse multiple retrieval signals
- `src/knowledge/router.ts` — Search API routes (v2)

**Existing affected:**
- `src/core/search.ts` — Keep existing keyword search, add hybrid gateway

**Implementation approach:**
```typescript
// src/knowledge/embeddings.ts
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  const data = await res.json();
  return data.embedding;
}

// src/knowledge/vector-index.ts
// Simple in-memory index: Map<noteId, number[]>
// Cosine similarity search
class VectorIndex {
  private dim: number;
  private vectors: Map<string, number[]>;

  insert(id: string, vec: number[]): void;
  search(vec: number[], topK: number): Array<{id: string, score: number}>;
  remove(id: string): void;
  persist(path: string): void;      // Save to disk
  load(path: string): void;          // Load from disk
}

// src/knowledge/hybrid-search.ts
async function hybridSearch(query: string, opts: SearchOpts) {
  const kwResults = await keywordSearch(query, opts);
  const vec = await getEmbedding(query);
  const vecResults = vectorIndex.search(vec, opts.limit);
  const graphResults = await graphSearch(query, opts);

  return fuseResults(kwResults, vecResults, graphResults, {
    keywordWeight: 0.3,
    vectorWeight: 0.4,
    graphWeight: 0.3,
  });
}
```

**Testing:**
- Generate embedding for text
- Vector index insert/search/remove
- Hybrid search returns correct fusion
- Performance: search under 500ms for 1000 notes
- Graceful fallback when embedding model unavailable

**Acceptance:**
```bash
curl -X POST /memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"What libraries do we use for PDF?","mode":"hybrid"}'
# → Returns pdf-parse, with semantic match for "libraries" → "dependencies"
```

**Rollback:** Set `HERMES_SEARCH_MODE=keyword` to bypass embedding. Remove embedding imports.

---

## Phase 9: Autonomous Maintenance System

**Goals:**
Create a background maintenance subsystem that runs scheduled jobs: duplicate detection, stale memory ranking, link generation, graph rebuild, reflection checks.

**Affected modules (NEW):**
- `src/maintenance/manager.ts` — Job registry and execution
- `src/maintenance/scheduler.ts` — Interval-based scheduling
- `src/maintenance/jobs/link-generator.ts` — Suggest new wikilinks
- `src/maintenance/jobs/rank-updater.ts` — Recalculate importance scores
- `src/maintenance/jobs/graph-rebuilder.ts` — Rebuild graph if stale
- `src/maintenance/jobs/decay-applier.ts` — Apply decay to old notes
- `src/maintenance/router.ts` — Maintenance API
- `src/knowledge/optimizer.ts` — Dedup + stale detection + optimization

**Job schedule (defaults):**
| Job | Interval | Description |
|---|---|---|
| duplicate-detection | 1h | Find similar notes, suggest merges |
| link-generation | 1h | Suggest new wikilinks |
| rank-update | 6h | Recalculate importance scores |
| graph-rebuild | 1h | Rebuild if vault changed |
| decay-apply | 24h | Apply memory decay |
| reflection-check | on session N | Trigger if interval reached |

**Testing:**
- Register and unregister jobs
- Run single job, verify it completes
- Check scheduler fires at correct intervals
- Error handling: one failing job doesn't stop others
- Manual trigger via API

**Acceptance:**
```bash
curl -X POST /maintenance/run -d '{"job":"link-generation"}'
# → {"ok":true,"duration":120,"itemsProcessed":5,"errors":[]}
```

**Rollback:** Disable scheduler with `HERMES_MAINTENANCE_INTERVAL=0`. Individual jobs can be toggled.

---

## Phase 10: Context Retrieval & OpenCode Workflow Update

**Goals:**
Wire everything together into the `ProjectContextBundle` — the primary context injected into Claude. Update the OpenCode plugin to use the new bundle.

**Affected modules:**
- `src/chat/context.ts` — Upgrade to use ProjectContextBundle
- `src/chat/context-bundle.ts` — Compile full bundle from all subsystems
- `.opencode/plugins/hermes-brain.ts` — Use new context bundle

**Context bundle composition:**
```
ProjectContextBundle:
  1. Project Summary          ← from ProjectStateManager
  2. Current Goals & Tasks    ← from ProjectStateManager
  3. Recent Decisions (top-5) ← from DecisionTracker (importance-scored)
  4. Recent Learnings (top-5) ← from Vault + ImportanceScorer
  5. Active Session Context   ← from SessionManager
  6. Related Concepts         ← from EntitySystem + GraphV2
  7. Open Problems            ← from ProjectStateManager
  8. Suggested Next Actions   ← from ReflectionEngine + ProjectState
```

**Token budget (configurable):**
```
Total: 8000 tokens
  ├─ Project Summary:  2000
  ├─ Decisions:        1500
  ├─ Learnings:        1500
  ├─ Session Context:  1000
  ├─ Tasks/Problems:   1000
  └─ Next Actions:     1000
```

**Testing:**
- Full bundle assembly for a project
- Token counting and truncation
- OpenCode plugin loads bundle on session start
- Bundle is injectable into Claude system prompt

**Acceptance:**
```bash
curl -s "/context/project?name=hermes&tokens=4000" | jq '.bundleLength'
# → Approx 4000 tokens
```
Session with OpenCode shows project-aware context in system prompt.

**Rollback:** Keep old `ContextInjection` path. Plugin falls back to basic vault search.

---

## Phase 11: Evaluation Framework

**Goals:**
Create `evals/` directory with retrieval quality metrics. Every change to search/ranking must be measurable.

**Affected modules (NEW):**
- `src/eval/framework.ts` — Run eval scenarios, compute metrics
- `src/eval/scenarios/` — Test queries with expected results
- `src/eval/reporter.ts` — Generate evaluation report

**Metrics:**
- Recall@5: fraction of expected results in top 5
- Recall@10: fraction of expected results in top 10
- MRR: Mean Reciprocal Rank of first relevant result
- Context Precision: fraction of returned results that are relevant
- Context Coverage: fraction of expected topic areas covered

**Test scenarios:**
```typescript
// evals/scenarios/project-awareness.json
[
  {
    "query": "What phase are we in?",
    "expected": ["Project Hermes", "Phase 6 Implementation"],
    "topics": ["project-status", "current-phase"]
  },
  {
    "query": "Why did we choose Flask?",
    "expected": ["ADR-001: Use Flask instead of FastAPI"],
    "topics": ["decision", "architecture"]
  }
]
```

**Testing:**
- Run eval suite against current search
- Run eval suite against hybrid search
- Compare metric deltas
- Generate HTML report

**Acceptance:**
```bash
curl -s /eval/retrieval?query="what phase" | jq '.recall5'
# → 1.0 (or whatever the current score is)
npm run eval
# → Generates evals/report.html with all metrics
```

**Rollback:** Remove eval script from package.json. Scenarios remain as documentation.

---

## Total Migration Sequence

```
Phase 0: Vault directories         (1 file, 10 min)
     │
Phase 1: Types                     (1 file, 30 min)
     │
Phase 2: Entity System             (4 files, 4 hours)
     │
Phase 3: Graph v2                  (1 file, 3 hours)
     │
Phase 4: Decision Tracking         (3 files, 3 hours)
     │
Phase 5: Importance Scoring        (3 files, 2 hours)
     │
Phase 6: Project Awareness         (5 files, 6 hours)
     │
Phase 7: Reflection Engine         (4 files, 4 hours)
     │
Phase 8: Semantic Search           (4 files, 6 hours)
     │
Phase 9: Maintenance              (7 files, 4 hours)
     │
Phase 10: Context Bundle          (3 files, 3 hours)
     │
Phase 11: Evaluation              (3 files, 2 hours)
```

**Total: ~38 files, ~37.5 hours of implementation**

Each phase has its own rollback strategy. No phase requires a breaking schema migration — new data coexists with old data. At any point, the system can be rolled back to the previous stable state by reverting the files changed in that phase.
