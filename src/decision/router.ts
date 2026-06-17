import type { FastifyInstance } from "fastify";
import type { DecisionTracker } from "./tracker.js";

export function registerDecisionRoutes(app: FastifyInstance, tracker: DecisionTracker) {
  app.post<{ Body: { title: string; rationale: string; alternatives?: string[]; consequences: string; project: string; status?: "proposed" | "accepted" | "superseded" } }>(
    "/decision/create",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "rationale", "consequences", "project"],
          properties: {
            title: { type: "string", minLength: 1 },
            rationale: { type: "string", minLength: 1 },
            alternatives: { type: "array", items: { type: "string" } },
            consequences: { type: "string", minLength: 1 },
            project: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["proposed", "accepted", "superseded"] },
          },
        },
      },
    },
    async (req) => {
      const result = await tracker.create(req.body);
      return { ok: true, ...result };
    }
  );

  app.get<{ Querystring: { project?: string } }>(
    "/decision/list",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            project: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const decisions = await tracker.list(req.query.project);
      return { ok: true, decisions };
    }
  );

  app.get<{ Querystring: { id: string } }>(
    "/decision/read",
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
      const note = await tracker.read(req.query.id);
      if (!note) return { ok: false, error: "Decision not found" };
      return { ok: true, decision: note };
    }
  );

  app.post<{ Body: { id: string; status: "proposed" | "accepted" | "superseded" } }>(
    "/decision/status",
    {
      schema: {
        body: {
          type: "object",
          required: ["id", "status"],
          properties: {
            id: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["proposed", "accepted", "superseded"] },
          },
        },
      },
    },
    async (req) => {
      const ok = await tracker.updateStatus(req.body.id, req.body.status);
      return { ok, error: ok ? undefined : "Decision not found" };
    }
  );
}
