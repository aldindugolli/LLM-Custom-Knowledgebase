import type { FastifyInstance } from "fastify";
import type { MemoryManager } from "../core/memory.js";
import type { NoteType, MemoryQuery } from "../types.js";

export function registerMemoryRoutes(app: FastifyInstance, memory: MemoryManager) {
  app.post<{ Body: { type: NoteType; title: string; body: string; project?: string; tags?: string[]; related?: string[]; importance?: 1 | 2 | 3 | 4 | 5; source?: string } }>(
    "/memory/save",
    {
      schema: {
        body: {
          type: "object",
          required: ["type", "title", "body"],
          properties: {
            type: { type: "string", enum: ["learning", "decision", "concept", "reference"] },
            title: { type: "string", minLength: 1 },
            body: { type: "string", minLength: 1 },
            project: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            related: { type: "array", items: { type: "string" } },
            importance: { type: "number", enum: [1, 2, 3, 4, 5] },
            source: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { type, title, body, project, tags, related, importance, source } = req.body;
      const note = await memory.save(type as "learning" | "decision" | "concept" | "reference", title, body, { project, tags, related, importance, source });
      return { ok: true, note };
    }
  );

  app.get<{ Querystring: { id?: string; title?: string } }>(
    "/memory/read",
    {
      schema: {
        querystring: {
          type: "object",
          oneOf: [
            { required: ["id"] },
            { required: ["title"] },
          ],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { id, title } = req.query;
      const identifier = id || title;
      if (!identifier) return { ok: false, error: "Provide id or title" };
      const note = await memory.read(identifier);
      if (!note) return { ok: false, error: "Note not found" };
      return { ok: true, note };
    }
  );

  app.put<{ Body: { id: string; title?: string; body?: string; tags?: string[]; related?: string[]; importance?: number } }>(
    "/memory/update",
    {
      schema: {
        body: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", minLength: 1 },
            title: { type: "string" },
            body: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            related: { type: "array", items: { type: "string" } },
            importance: { type: "number", enum: [1, 2, 3, 4, 5] },
          },
        },
      },
    },
    async (req) => {
      const { id, title, body, tags, related, importance } = req.body;
      const note = await memory.update(id, { title, body, tags, related, importance });
      if (!note) return { ok: false, error: "Note not found" };
      return { ok: true, note };
    }
  );

  app.delete<{ Querystring: { id: string } }>(
    "/memory/delete",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req) => {
      const { id } = req.query;
      const ok = await memory.remove(id);
      return { ok, error: ok ? undefined : "Note not found" };
    }
  );

  app.post<{ Body: MemoryQuery }>(
    "/memory/search",
    {
      schema: {
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1 },
            type: { type: "string", enum: ["session", "learning", "decision", "concept", "project", "reference"] },
            tags: { type: "array", items: { type: "string" } },
            project: { type: "string" },
            limit: { type: "number", minimum: 1, maximum: 100 },
            offset: { type: "number", minimum: 0 },
          },
        },
      },
    },
    async (req) => {
      const results = await memory.search(req.body);
      return { ok: true, results };
    }
  );

  app.get<{ Querystring: { type: NoteType; project?: string } }>(
    "/memory/list",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["session", "learning", "decision", "concept", "project", "reference"] },
            project: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { type, project } = req.query;
      const notes = await memory.listByType(type, project);
      return { ok: true, notes };
    }
  );
}
