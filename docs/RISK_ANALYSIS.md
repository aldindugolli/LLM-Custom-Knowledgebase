# Risk Analysis — Hermes v2 Migration

## Risk Matrix

| ID | Risk | Likelihood | Impact | Phase | Mitigation |
|---|---|---|---|---|---|
| R1 | Embedding model not available (Ollama down) | Medium | High | 8 | Graceful fallback to keyword-only search |
| R2 | Vector index memory usage exceeds limits | Low | Medium | 8 | Disk-persisted index, configurable dim |
| R3 | pdf-parse v2 breaking changes on upgrade | Low | Medium | 0 | Pin version, integration test |
| R4 | TypeScript strict mode rejects new code | Medium | Low | All | `skipLibCheck: true`, incremental tsc |
| R5 | Performance regression in graph build for large vaults | Low | Medium | 3 | Cache TTL, incremental build |
| R6 | OpenCode plugin compatibility broken | Medium | High | 10 | Versioned plugin, backward-compatible fallback |
| R7 | Existing tests fail due to type changes | Low | Medium | 1 | Types-only phase, no behavioral change |
| R8 | Windows path handling issues with new directories | Medium | Low | 0 | Use `path.join`, test on Windows |
| R9 | LLM hallucination in reflection generation | High | Medium | 7 | Human review flag, confidence threshold |
| R10 | Memory decay deletes useful data | Low | High | 5 | Non-destructive decay (never deletes, only ranks lower) |
| R11 | Entity extraction duplicates existing notes | Medium | Low | 2 | Dedup check before entity creation |
| R12 | Context bundle exceeds Claude's context window | Medium | High | 10 | Token budget enforcement with truncation |

## Risk Details

### R1: Embedding Model Unavailable
**Description:** Ollama may not have `nomic-embed-text` or similar model pulled. The embedding endpoint returns 404.

**Monitoring:** `GET /chat/ping` checks Ollama availability. Startup logs warn if embedding model missing.

**Mitigation:**
```typescript
try {
  await getEmbedding("ping");
  embeddingAvailable = true;
} catch {
  embeddingAvailable = false;
  console.warn("[Hermes] Embedding model unavailable, using keyword-only search");
}

async function hybridSearch(query: string) {
  if (!embeddingAvailable) return keywordSearch(query);
  // ... normal hybrid flow
}
```

**Rollback:** Set `HERMES_SEARCH_MODE=keyword` at any time.

### R6: OpenCode Plugin Breaking

**Description:** Plugin hooks change signature or return type, breaking session start/end for users on older Hermes.

**Mitigation:** Maintain backward-compatible exports for one minor version:
```typescript
// Old export (kept for compatibility)
export function createContextInjector(opts: OldOpts): ContextInjector;

// New export
export function createProjectContextBuilder(opts: NewOpts): ProjectContextBuilder;
```

**Detection:** Integration test that runs the plugin against the running server.

### R9: LLM Hallucination in Reflection

**Description:** The reflection engine asks the LLM to identify themes. LLM may fabricate themes that don't exist.

**Mitigation:**
- Always include confidence scores with each identified theme
- Require minimum 3 session occurrences before reporting a theme
- Human review flag: themes with < 5 occurrences are marked "low confidence"
- Allow manual editing of reflection notes

### R10: Memory Decay Destructive

**Description:** Decay could theoretically push all notes below retrieval threshold, making them invisible. This is prevented by design — decay has a floor of 0.1, never 0. Never deletes.

**Mitigation:**
```typescript
function applyDecay(note: Note): number {
  const daysSinceAccess = (Date.now() - note.lastReferenced) / 86400000;
  const decay = Math.exp(-Math.LN2 * daysSinceAccess / DECAY_HALF_LIFE);
  return Math.max(0.1, decay);  // Never below 0.1
}
```

### R12: Context Window Overflow

**Description:** The full ProjectContextBundle may exceed Claude's context window (varies by model, ~8K-200K tokens).

**Mitigation:**
- Each section has a token budget (configurable)
- Sections are truncated independently
- Most important content (decisions > learnings > tasks) is prioritized
- Token counting is performed at assembly time

```typescript
interface TokenBudget {
  projectSummary: number;   // 2000
  decisions: number;         // 1500
  learnings: number;         // 1500
  tasks: number;             // 1000
  nextActions: number;       // 500
}
```

## Risk by Phase

| Phase | Risk Score (L×I) | Mitigations |
|---|---|---|
| 0: Vault dirs | 2 (low×low) | Simple mkdir, revert by deleting dirs |
| 1: Types | 3 (low×medium) | Types-only, no behavioral change |
| 2: Entity system | 8 (medium×medium) | Dedup checks, fallback to existing notes |
| 3: Graph v2 | 6 (low×medium) | Cache, incremental build |
| 4: Decisions | 4 (low×medium) | Non-breaking, decisions as notes |
| 5: Scoring | 9 (medium×medium) | Configurable weights, decay floor |
| 6: Project awareness | 12 (medium×high) | Token budgets, graceful degradation |
| 7: Reflection | 15 (high×medium) | Confidence thresholds, human review |
| 8: Semantic search | 16 (medium×high) | Embedding fallback, keyword-only mode |
| 9: Maintenance | 8 (medium×medium) | Job isolation, individual toggles |
| 10: Context bundle | 12 (medium×high) | Backward-compatible plugin API |
| 11: Evaluation | 3 (low×medium) | Read-only, no production impact |

## Overall Assessment

**Total risk:** Moderate. The migration touches every module but is designed as additive — no existing functionality is removed or modified in a breaking way until Phase 3 (graph migration), and even that has a backward-compatible path.

**Critical path risks:** R1 (embeddings unavailable), R9 (LLM hallucination), R12 (context overflow). All have mitigations.

**Recommendation:** Proceed with phases 0→1→2 sequentially, then parallelize 3+4, 5+7, 8+9 for faster delivery. Gate on test suite passing at each phase boundary.
