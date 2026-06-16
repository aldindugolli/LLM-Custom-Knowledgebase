# Brainstorm

**Persistent AI knowledge base with Obsidian** — a memory service that gives AI coding agents a permanent, queryable knowledge base backed by an Obsidian Markdown vault.

Codename: **Hermes Memory Service**

## Features

- **Obsidian-backed vault** — All knowledge stored as Markdown files with YAML frontmatter, organized into sessions, learnings, decisions, concepts, and projects
- **REST API** — Fastify server on `:3412` with full CRUD for notes, session management, search, health checks, deduplication, and link suggestions
- **Web UI** — Dark-theme SPA dashboard with Chat, Overview, Vault browser, Knowledge Graph, and Health tabs
- **LLM Chat** — Chat with local models via Ollama or with OpenCode agents; context is auto-injected from the vault
- **OpenCode integration** — Plugin auto-injects context at session start, nudges memory tool usage, and auto-extracts learnings on session end
- **Knowledge quality** — Auto-deduplication, contradiction detection, wikilink suggestions, periodic mining of un-extracted learnings, and vault health monitoring
- **Knowledge graph** — Tracks `[[wikilinks]]`, `related` fields, and shared tags; finds orphans and broken links

## Quick Start

```bash
# Install dependencies
npm install

# Initialize the vault directory structure
npm run init-vault

# Configure LLM backend (edit brainstorm.json or use env vars)
#   OLLAMA_ENDPOINT=http://127.0.0.1:11434
#   OLLAMA_MODEL=llama3.2
#   HERMES_VAULT_PATH=./vault
#   HERMES_PORT=3412

# Start in dev mode (auto-reload)
npm run dev

# Or build and run
npm run build
npm start
```

Open the UI at `http://127.0.0.1:3412/ui`.

## Architecture

```
opencode (brainstorm agent)
  └─ hermes-brain plugin (lifecycle hooks)
       └─ Hermes Memory Service (HTTP :3412)
            └─ Obsidian Vault (./vault/)
```

### Project Layout

```
Brainstorm/
├── src/                    # TypeScript source
│   ├── index.ts            # Entry point — Fastify server setup
│   ├── types.ts            # All TypeScript interfaces
│   ├── api/                # Route handlers (memory, session, chat, context, synthesis, knowledge, health)
│   ├── core/               # Business logic (vault, memory, search, session, graph, context-bundle, synthesis, dedup, linker, templates)
│   ├── chat/               # Context injection for chat
│   ├── llm/                # LLM adapters (Ollama, OpenCode) + router
│   ├── mining/             # Auto-mining engine + scheduler
│   └── health/             # Vault health checker + API
├── public/                 # SPA frontend (index.html, app.js, style.css)
├── scripts/                # Utility scripts (vault init)
├── vault/                  # Obsidian vault
│   ├── sessions/           # Per-session logs
│   ├── learnings/          # Reusable technical knowledge
│   ├── decisions/          # Architecture/design decisions
│   ├── concepts/           # Domain concepts
│   ├── projects/           # Project briefs
│   └── references/         # External references
├── .opencode/              # OpenCode integration
│   ├── agents/             # Agent definition
│   ├── plugins/            # Lifecycle hooks plugin
│   ├── tools/              # Tool definitions (hermes-save, hermes-search, etc.)
│   ├── commands/           # Custom commands
│   └── skills/             # Advanced vault operations
├── brainstorm.json         # Runtime configuration
├── AGENTS.md               # Knowledge protocol for AI agents
└── package.json
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HERMES_VAULT_PATH` | `./vault` | Path to the Obsidian vault |
| `HERMES_PORT` | `3412` | HTTP server port |
| `HERMES_HOST` | `127.0.0.1` | HTTP server host |
| `HERMES_MINING_INTERVAL` | `300000` | Auto-mining interval (ms) |
| `OLLAMA_ENDPOINT` | `http://127.0.0.1:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Default Ollama model |
| `OPENCODE_CMD` | `opencode` | OpenCode CLI command |
| `OPENCODE_AGENT` | `brainstorm` | OpenCode agent name |

### Runtime Config (`brainstorm.json`)

```json
{
  "mode": "ollama",
  "ollama": {
    "endpoint": "http://127.0.0.1:11434",
    "defaultModel": "llama3.2:3b",
    "models": ["tinyllama:latest", "llama3.2:3b"]
  },
  "opencode": {
    "command": "opencode",
    "agent": "brainstorm"
  }
}
```

## API Overview

| Method | Path | Description |
|---|---|---|
| **Memory** | | |
| POST | `/memory/save` | Create a note (learning/decision/concept/reference) |
| GET | `/memory/read` | Read a note by `id` or `title` |
| PUT | `/memory/update` | Update a note's metadata |
| DELETE | `/memory/delete` | Delete a note by `id` |
| POST | `/memory/search` | Search notes by query, type, tags, project |
| GET | `/memory/list` | List notes by type |
| **Sessions** | | |
| POST | `/session/start` | Start a tracked session |
| POST | `/session/end` | End a session with summary/learnings |
| GET | `/session/status` | Get active session context |
| GET | `/session/active` | List all active sessions |
| POST | `/session/synthesize` | Post-session synthesis (extract learnings, detect contradictions) |
| **Chat** | | |
| POST | `/chat/completions` | Stream or non-stream chat with context injection |
| GET | `/chat/models` | List available Ollama models |
| GET | `/chat/ping` | Ping LLM backends |
| **Context** | | |
| POST | `/context/bundle` | Get full context bundle for a project/goal |
| POST | `/context/compiled` | Get compiled context string |
| **Knowledge** | | |
| GET | `/knowledge/dedup` | Find duplicate notes |
| POST | `/knowledge/dedup/merge-preview` | Preview a merge between two notes |
| GET | `/knowledge/suggest-links` | Get wikilink suggestions |
| GET | `/knowledge/contradictions` | Get contradiction info |
| **Health** | | |
| GET | `/health/report` | Full health report (orphans, broken links, stale pages) |
| GET | `/health/summary` | Health summary |
| **System** | | |
| GET | `/` | Service info |
| GET | `/vault/stats` | Vault aggregate statistics |

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run dev` | Dev mode with auto-reload |
| `npm run init-vault` | Initialize vault directory structure |
| `npm run lint` | Type-check without emitting |

## Note Types

| Type | Purpose | Example |
|---|---|---|
| `session` | Per-session chat logs (auto-managed) | "2026-06-15 — Refactoring auth" |
| `learning` | Reusable knowledge, patterns, gotchas | "Fastify hooks run in reverse order" |
| `decision` | Architecture decisions with rationale | "Use SQLite for local dev speed" |
| `concept` | Domain definitions | "What is a bounded context" |
| `project` | Project briefs and goals | "Brainstorm project overview" |
| `reference` | External links and references | "Fastify documentation" |

## OpenCode Integration

The `.opencode/` directory contains a full integration with the OpenCode platform:

- **Agent** — `brainstorm` agent persona with persistent memory
- **Plugin** — `hermes-brain` lifecycle hooks auto-inject context, nudge tool usage, and auto-mine learnings
- **Tools** — `hermes-save`, `hermes-search`, `hermes-read`, `hermes-session-start`, `hermes-session-end`, `hermes-health`
- **Command** — `/brainstorm <project> <goal>` to reload memory context
- **Skill** — Memory management operations for advanced vault operations
