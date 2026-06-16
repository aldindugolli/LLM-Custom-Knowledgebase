# Brainstorm API Reference

Base URL: `http://127.0.0.1:3412`

All responses have the shape `{ ok: boolean, ... }`. Errors return `{ ok: false, error: string }`.

---

## Memory

### POST `/memory/save`

Create a new note in the vault.

**Body:**

```json
{
  "type": "learning | decision | concept | reference",
  "title": "string",
  "body": "string (markdown)",
  "project": "string (optional)",
  "tags": ["string"] (optional),
  "related": ["string"] (optional),
  "importance": 1|2|3|4|5 (optional),
  "source": "string (optional)"
}
```

**Response:** `{ ok: true, note: Note }`

---

### GET `/memory/read`

Read a single note by ID or title.

**Query:** `?id=<uuid>` or `?title=<string>`

**Response:** `{ ok: true, note: Note }` or `{ ok: false, error: "Note not found" }`

---

### PUT `/memory/update`

Update an existing note's metadata or body.

**Body:**

```json
{
  "id": "uuid",
  "title": "string (optional)",
  "body": "string (optional)",
  "tags": ["string"] (optional),
  "related": ["string"] (optional),
  "importance": 1|2|3|4|5 (optional)
}
```

**Response:** `{ ok: true, note: Note }` or `{ ok: false, error: "Note not found" }`

---

### DELETE `/memory/delete`

Delete a note by ID.

**Query:** `?id=<uuid>`

**Response:** `{ ok: true }` or `{ ok: false, error: "Note not found" }`

---

### POST `/memory/search`

Search the vault by keyword with optional filters.

**Body:**

```json
{
  "query": "string",
  "type": "session|learning|decision|concept|project|reference (optional)",
  "tags": ["string"] (optional),
  "project": "string (optional)",
  "limit": 20 (optional, default 20),
  "offset": 0 (optional)
}
```

**Response:**

```json
{
  "ok": true,
  "results": [
    {
      "note": Note,
      "score": 0.85,
      "matchType": "keyword|tag|exact"
    }
  ]
}
```

---

### GET `/memory/list`

List notes by type, optionally filtered by project.

**Query:** `?type=learning&project=my-project`

**Response:** `{ ok: true, notes: Note[] }`

---

## Sessions

### POST `/session/start`

Start a tracked session. Creates a session note and assembles context (project brief, recent sessions, open decisions, relevant notes).

**Body:**

```json
{
  "project": "string",
  "goal": "string (optional)"
}
```

**Response:** `{ ok: true, context: SessionContext }`

---

### POST `/session/end`

End a session with summary and extracted learnings/decisions.

**Body:**

```json
{
  "sessionId": "uuid",
  "summary": "string",
  "learnings": ["string"],
  "decisions": ["string"],
  "duration": 1234 (optional, seconds),
  "toolCalls": 5 (optional)
}
```

**Response:** `{ ok: true, note: Note }` or `{ ok: false, error: "Session not found" }`

---

### GET `/session/status`

Get the active session context.

**Query:** `?sessionId=<uuid>`

**Response:** `{ ok: true, context: SessionContext }` or `{ ok: false, error: "Session not found or already ended" }`

---

### GET `/session/active`

List all active sessions.

**Response:** `{ ok: true, sessions: SessionContext[] }`

---

### POST `/session/synthesize`

Run post-session synthesis (extract learnings, detect contradictions, auto-create notes).

**Body:**

```json
{
  "sessionId": "uuid",
  "summary": "string",
  "learnings": ["string"],
  "decisions": ["string"]
}
```

**Response:**

```json
{
  "ok": true,
  "report": {
    "learningsCreated": ["uuid"],
    "decisionsCreated": ["uuid"],
    "contradictions": [...],
    "wikilinksCreated": [...]
  }
}
```

---

## Chat

### POST `/chat/completions`

Send a chat message with automatic context injection from the vault. Supports both streaming (SSE) and non-streaming responses.

**Body:**

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "mode": "ollama | opencode (optional, defaults to config mode)",
  "model": "string (optional, for ollama mode)",
  "sessionId": "uuid (optional, for auto-logging)",
  "stream": true (optional, defaults to true),
  "temperature": 0.7 (optional)
}
```

**Non-streaming response:** `{ ok: true, content: "string" }`

**Streaming (SSE):**

```
data: {"token": "Hello"}
data: {"token": " world"}
data: {"done": true}
```

---

### GET `/chat/models`

List available models from the configured LLM backend.

**Response:** `{ ok: true, models: ["llama3.2", ...], source: "ollama" }`

---

### GET `/chat/ping`

Check connectivity to LLM backends.

**Response:** `{ ok: true, ollama: true|null, opencode: true|null }`

---

## Context

### POST `/context/bundle`

Assemble a full context bundle for a project and goal.

**Body:** `{ "project": "string", "goal": "string" }`

**Response:**

```json
{
  "ok": true,
  "bundle": {
    "projectBrief": Note|null,
    "recentLearnings": [Note],
    "openDecisions": [Note],
    "relatedNotes": [Note],
    "recentSessions": [Note],
    "knowledgeGaps": ["string"],
    "compiled": "string (formatted markdown)"
  }
}
```

---

### POST `/context/compiled`

Get only the compiled context string (for system prompt injection).

**Body:** `{ "project": "string", "goal": "string" }`

**Response:** `{ ok: true, context: "string (markdown)" }`

---

## Knowledge Quality

### GET `/knowledge/dedup`

Find groups of duplicate/similar notes in the vault.

**Response:**

```json
{
  "ok": true,
  "groups": [
    {
      "primary": Note,
      "duplicates": [{ "note": Note, "score": 0.92 }],
      "reason": "similar title"
    }
  ]
}
```

---

### POST `/knowledge/dedup/merge-preview`

Preview what a merged note would look like.

**Body:** `{ "primaryId": "uuid" }`

**Response:** `{ ok: true, preview: { content: "string", tags: ["string"], related: ["string"] } }`

---

### GET `/knowledge/suggest-links`

Get suggested `[[wikilinks]]` between unlinked notes (top 50 suggestions).

**Response:**

```json
{
  "ok": true,
  "suggestions": [
    {
      "source": { "id": "uuid", "title": "string", "path": "string" },
      "target": { "id": "uuid", "title": "string", "path": "string" },
      "reason": "shared tags | body mention | keyword match",
      "confidence": 0.85
    }
  ]
}
```

---

### GET `/knowledge/contradictions`

Placeholder endpoint. Full contradiction detection runs via `/session/synthesize`.

**Response:** `{ ok: true, note: "Contradiction scanning requires a session context..." }`

---

## Health

### GET `/health/report`

Full vault health report.

**Response:**

```json
{
  "ok": true,
  "report": {
    "timestamp": "ISO string",
    "totalNotes": 42,
    "totalWikilinks": 87,
    "orphans": [{ "path": "string", "title": "string" }],
    "brokenLinks": [{ "source": "string", "target": "string" }],
    "stalePages": [{ "path": "string", "title": "string", "daysSinceUpdate": 120 }],
    "missingMetadata": [{ "path": "string", "missing": ["tags", "project"] }],
    "stats": {
      "byType": { "session": 10, "learning": 8, ... },
      "byTag": { "typescript": 5, "fastify": 3 },
      "totalBacklinks": 42,
      "avgWordCount": 156
    }
  }
}
```

---

### GET `/health/summary`

Lightweight health summary.

**Response:**

```json
{
  "ok": true,
  "summary": {
    "totalNotes": 42,
    "totalWikilinks": 87,
    "orphanCount": 3,
    "brokenLinkCount": 1,
    "stalePageCount": 2,
    "stats": { ... }
  }
}
```

---

## System

### GET `/`

Service info.

**Response:**

```json
{
  "service": "brainstorm",
  "version": "0.3.0",
  "vault": "C:/.../vault",
  "status": "running",
  "chatMode": "ollama",
  "gui": "http://127.0.0.1:3412/ui"
}
```

---

### GET `/vault/stats`

Vault aggregate statistics.

**Response:**

```json
{
  "ok": true,
  "stats": {
    "totalNotes": 42,
    "byType": { "session": 10, "learning": 5, ... },
    "totalWikilinks": 87
  }
}
```

---

## Data Types

### Note

```typescript
{
  id: string;          // UUID
  type: NoteType;      // "session" | "learning" | "decision" | "concept" | "project" | "reference" | "index"
  title: string;
  path: string;        // Relative vault path
  frontmatter: {       // YAML frontmatter fields
    id: string;
    type: NoteType;
    title: string;
    created: string;   // ISO date
    updated: string;   // ISO date
    tags: string[];
    related: string[];
    source?: string;
    project?: string;
    importance?: 1-5;
    status?: "draft" | "active" | "archived";
  };
  content: string;     // Full raw markdown
  body: string;        // Markdown body (frontmatter stripped)
  created: Date;
  updated: Date;
  tags: string[];
  related: string[];
  wikilinks: string[]; // [[wikilink]] targets
  backlinks: string[]; // Notes that link to this note
  wordCount: number;
}
```

### SessionContext

```typescript
{
  sessionId: string;
  project: string;
  startTime: string;       // ISO date
  relevantNotes: Note[];
  recentSessions: Note[];
  openDecisions: Note[];
  projectBrief: Note|null;
}
```

### ContextBundle

```typescript
{
  projectBrief: Note|null;
  recentLearnings: Note[];
  openDecisions: Note[];
  relatedNotes: Note[];
  recentSessions: Note[];
  knowledgeGaps: string[];
  compiled: string;        // Formatted markdown context string
}
```
