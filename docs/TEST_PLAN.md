# Test Plan — Hermes v2 Migration

## Principles

1. **Zero regressions** — all 66 existing tests must pass at every phase boundary
2. **Types first** — new types compile before any behavioral code
3. **New modules, new test files** — each new module gets its own `src/__tests__/` file
4. **90%+ coverage** on all new modules (measured by `vitest --coverage`)
5. **Integration tests** for cross-module interactions
6. **Fast** — tests must complete in under 5s

## Test File Inventory

### Existing (must always pass)

| File | Tests | Phase | Notes |
|---|---|---|---|
| `vault.test.ts` | 10 | All | Must not change |
| `search.test.ts` | 8 | All | Must not change (new search is separate) |
| `synthesis.test.ts` | 5 | All | May be augmented with ADR extraction tests |
| `dedup.test.ts` | 4 | All | May be augmented |
| `graph.test.ts` | 7 | 3 | Will be augmented with typed-edge tests |
| `mining.test.ts` | 10 | All | Must not change |
| `session.test.ts` | 7 | All | Must not change |
| `routes.test.ts` | 15 | All | Must not change |

### New (one per module)

| Test File | Phase | Expected Tests | Description |
|---|---|---|---|
| `entity.test.ts` | 2 | 8 | Entity CRUD, extraction, linking |
| `graph-v2.test.ts` | 3 | 10 | Typed edges, migration, paths, subgraph |
| `decision.test.ts` | 4 | 8 | ADR creation, listing, status transitions |
| `scorer.test.ts` | 5 | 6 | Importance scoring, decay, ranking |
| `project.test.ts` | 6 | 10 | Context bundle, state management, summary gen |
| `reflection.test.ts` | 7 | 8 | Theme extraction, scheduling, storage |
| `embeddings.test.ts` | 8 | 4 | Embedding generation, similarity |
| `hybrid-search.test.ts` | 8 | 8 | Keyword+vector+graph fusion |
| `maintenance.test.ts` | 9 | 8 | Job registration, execution, error handling |
| `context-bundle.test.ts` | 10 | 6 | Bundle assembly, token counting, truncation |
| `eval.test.ts` | 11 | 6 | Metric computation, scenario loading |

## Test Patterns

### Unit Tests (majority)

```typescript
// src/__tests__/entity.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createVault } from "../core/vault.js";
import { createEntitySystem } from "../entity/system.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Entity System", () => {
  let vaultDir: string;
  let vault: ReturnType<typeof createVault>;
  let entities: ReturnType<typeof createEntitySystem>;

  beforeAll(async () => {
    vaultDir = await mkdtemp(join(tmpdir(), "entity-test-"));
    vault = createVault({ path: vaultDir, port: 0, host: "127.0.0.1" });
    await vault.ensureDirs();
    entities = createEntitySystem(vault);
  });

  afterAll(async () => {
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("creates an entity note", async () => {
    const id = await entities.create({
      type: "technology",
      title: "Flask",
      body: "Web framework",
    });
    expect(id).toBeTruthy();
    const note = await entities.read(id);
    expect(note?.title).toBe("Flask");
    expect(note?.entityType).toBe("technology");
  });

  it("lists entities by type", async () => {
    const list = await entities.list({ type: "technology" });
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
```

### Integration Tests

```typescript
// Graph v2 + Entity cross-module test
it("creates typed edges between entities", async () => {
  const project = await entities.create({ type: "project", title: "TestP" });
  const tech = await entities.create({ type: "technology", title: "TestT" });
  await graph.addEdge(project, tech, "uses");
  const neighbors = await graph.getNeighbors(project, "uses");
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0].id).toBe(tech);
});
```

### Evaluation Tests

```typescript
// src/__tests__/eval.test.ts
it("computes recall@5 correctly", () => {
  const result = computeRecall(
    ["A", "B", "C", "D", "E"],  // expected
    ["A", "X", "B", "Y", "C"],  // results
    5
  );
  expect(result).toBe(0.6);  // 3 out of 5
});
```

## Running Tests

```bash
# All tests
npx vitest run

# Single phase
npx vitest run src/__tests__/entity.test.ts

# Coverage
npx vitest run --coverage

# Type check only
npx tsc --noEmit

# Evaluation (after Phase 11)
npm run eval
```

## Coverage Targets

| Module | Target Coverage | Critical Paths |
|---|---|---|
| Entity system | 90% | Create, type filter, linking |
| Graph v2 | 85% | Typed edges, v1→v2 migration |
| Decision tracker | 90% | ADR fields, status transitions |
| Importance scorer | 95% | Formula correctness, edge cases |
| Project awareness | 85% | Bundle assembly, state management |
| Reflection | 80% | Theme detection, scheduling |
| Semantic search | 80% | Embedding, hybrid fusion |
| Maintenance | 85% | Job lifecycle, error isolation |
| Context bundle | 90% | Assembly, token budgeting |
| Evaluation | 90% | Metric computation |

## Performance Benchmarks

| Operation | Target | Notes |
|---|---|---|
| Embedding generation | < 500ms | Cold start with model load |
| Vector search (1000 notes) | < 100ms | In-memory, linear scan |
| Hybrid search | < 600ms | Includes embedding generation |
| Graph build (1000 notes) | < 200ms | Cached, incremental |
| Context bundle assembly | < 100ms | Pure data assembly |
| Full test suite | < 10s | Parallel execution |

## CI Integration

```yaml
# .github/workflows/ci.yml addition
jobs:
  test:
    steps:
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run --coverage
      - run: npm run eval  # Phase 11+
      - name: Check coverage
        run: |
          npx vitest run --coverage --reporter=json
          # Fail if any module below 70%
```

## Regression Prevention

Every phase adds a CI check:
1. Run existing test suite (66 tests) — must pass
2. Run new module tests — must pass
3. Run `tsc --noEmit` — zero errors
4. Run integration test against actual HTTP server (if applicable)

These are enforced in the CI pipeline before merge.
