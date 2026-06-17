# Rollback Strategy — Hermes v2 Migration

## General Principles

1. **Non-destructive changes only** — every phase makes additive changes. No existing data is migrated in-place. Old files remain untouched.
2. **Feature flag every new behaviour** — a `hermes.json` config key gates each v2 capability. Set `false` to restore pre-v2 behaviour instantly.
3. **Phase revert = stop + flip flag** — no code rollback needed for any phase. Only the actual filesystem/state changes need manual cleanup if desired.
4. **Escape hatch** — `hermes.json { "v2": false }` disables ALL v2 features in one switch.

## Config-Based Feature Flags

```jsonc
// hermes.json
{
  "v2": false,              // Master switch — disables ALL v2 features
  "entitySystem": false,    // Phase 2 — entity notes & extraction
  "graphV2": false,         // Phase 3 — typed/weighted edges
  "decisionTracking": false,// Phase 4 — ADR notes
  "importanceScoring": false,// Phase 5 — scoring & decay
  "projectAwareness": false,// Phase 6 — project context state
  "reflectionEngine": false,// Phase 7 — scheduled reflection
  "semanticSearch": false,  // Phase 8 — embeddings & hybrid search
  "maintenanceJobs": false, // Phase 9 — scheduled maintenance
  "contextBundle": false,   // Phase 10 — OpenCode context bundle
  "evaluationSuite": false  // Phase 11 — evaluation framework
}
```

## Per-Phase Rollback

### Phase 0: Vault Directory Expansion (2 files)
| Action | Command | Risk |
|---|---|---|
| Flip feature flag | — | None |
| Remove empty directories | `rm -rf ./vault/entities ./vault/tasks ./vault/reflections ./vault/projects ./vault/templates` | Safe (dirs are empty) |
| Remove template files | `rm -f ./vault/templates/*.md` | Safe |
| Revert `NOTE_DIRS` | Remove new dirs from map | None |
| Revert `ensureDirs()` | Remove mkdir calls | None |
| **Duration** | 2 minutes | **Zero** |

### Phase 1: Type System Expansion (1 file)
| Action | Command | Risk |
|---|---|---|
| Remove new types from `src/types.ts` | Edit file | Types will error at compile — must recompile |
| **Duration** | 5 minutes | **Low** — no runtime impact, just compilation |

### Phase 2: Entity System (4 files)
| Action | Command | Risk |
|---|---|---|
| Flip `entitySystem: false` | Edit `hermes.json` | Instant — entity routes 404, extraction skipped |
| Delete entity notes | `rm -rf ./vault/entities/` | Medium — existing entity notes gone |
| Revert entity routes | Remove from `src/api/chat.ts` | Clean but unnecessary with flag |
| Remove `src/entity/` directory | `rm -rf src/entity/` | Clean |
| **Duration** | 5 min (flag) or 15 min (full revert) | **Low** with flag |

### Phase 3: Graph v2 (4 files)
| Action | Command | Risk |
|---|---|---|
| Flip `graphV2: false` | Edit `hermes.json` | Instant — reverts to v1 graph |
| `graph-v2.json` remains on disk | Ignored | Safe |
| Revert `src/core/graph.ts` | Git checkout | TypeScript compilation passes |
| Remove `src/core/graph-v2.ts` | Git diff | Clean |
| **Duration** | 5 min (flag) or 20 min (full revert) | **Low** with flag |

### Phase 4: Decision Tracking (3 files)
| Action | Command | Risk |
|---|---|---|
| Flip `decisionTracking: false` | Edit `hermes.json` | Instant |
| Delete ADR notes | `rm -rf ./vault/decisions/` | Medium — decisions lost |
| Remove routes | Revert `src/api/chat.ts` | Clean |
| **Duration** | 5 min | **Low** |

### Phase 5: Importance Scoring (2 files)
| Action | Command | Risk |
|---|---|---|
| Flip `importanceScoring: false` | Edit `hermes.json` | Instant — scores hidden, no decay |
| Scores remain in metadata | Ignored | Safe |
| **Duration** | 2 min | **Low** |

### Phase 6: Project Awareness (3 files)
| Action | Command | Risk |
|---|---|---|
| Flip `projectAwareness: false` | Edit `hermes.json` | Instant — state not tracked |
| Project state files remain | Ignored | Safe |
| **Duration** | 2 min | **Low** |

### Phase 7: Reflection Engine (2 files)
| Action | Command | Risk |
|---|---|---|
| Flip `reflectionEngine: false` | Edit `hermes.json` | Instant — no scheduled reflections |
| Reflection notes remain in vault | Ignored | Safe |
| **Duration** | 2 min | **Low** |

### Phase 8: Semantic Search (3 files)
| Action | Command | Risk |
|---|---|---|
| Flip `semanticSearch: false` | Edit `hermes.json` | Instant — falls back to keyword search |
| Embedding cache remains | Ignored | Safe |
| **Duration** | 2 min | **Low** |

### Phase 9: Maintenance Jobs (2 files)
| Action | Command | Risk |
|---|---|---|
| Flip `maintenanceJobs: false` | Edit `hermes.json` | Instant — no scheduled jobs |
| **Duration** | 2 min | **Low** |

### Phase 10: Context Bundle (3 files)
| Action | Command | Risk |
|---|---|---|
| Flip `contextBundle: false` | Edit `hermes.json` | Instant — plugin uses old API |
| New plugin file remains | Ignored | Safe |
| **Duration** | 2 min | **Low** |

### Phase 11: Evaluation Suite (2 files)
| Action | Command | Risk |
|---|---|---|
| Flip `evaluationSuite: false` | Edit `hermes.json` | Instant — eval endpoints 404 |
| Eval scenarios remain | Ignored | Safe |
| **Duration** | 2 min | **Low** |

## Emergency Rollback (All Phases)

If any phase causes a production outage:

```bash
# 1. Disable all v2 features
echo '{"v2":false}' > hermes.json

# 2. Restart server
curl -X POST http://127.0.0.1:3412/admin/restart
# or systemctl restart hermes

# 3. Verify pre-v2 state
curl http://127.0.0.1:3412/api
# Should return {"service":"brainstorm","version":"0.1.0","v2":"disabled"}

# 4. Run regression tests (different terminal)
npx vitest run src/__tests__/routes.test.ts src/__tests__/vault.test.ts

# 5. File issue
```

This emergency rollback takes **< 60 seconds** and requires no code changes, no git operations, and no data loss.

## Data Preservation Guarantees

- **No destructive migrations** — existing vault notes are never modified, moved, or deleted
- **v2 data is additive** — entity notes, graph-v2.json, ADR notes, reflection notes all coexist alongside v1 data
- **Rollback preserves new data** — flipping a flag off does not delete v2 data; it can be re-enabled later
- **Old code paths untouched** — every new feature is in a separate module, not patched into existing functions
- **No schema changes to existing notes** — frontmatter additions (like `importance`) are optional fields that old code ignores
