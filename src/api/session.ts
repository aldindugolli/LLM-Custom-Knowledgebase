import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../core/session.js";
import type { SessionEndInput } from "../types.js";

export function registerSessionRoutes(app: FastifyInstance, sessions: SessionManager) {
  app.post<{ Body: { project: string; goal?: string } }>(
    "/session/start",
    {
      schema: {
        body: {
          type: "object",
          required: ["project"],
          properties: {
            project: { type: "string", minLength: 1 },
            goal: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { project, goal } = req.body;
      const context = await sessions.start(project, goal);
      return { ok: true, context };
    }
  );

  app.post<{ Body: SessionEndInput }>(
    "/session/end",
    {
      schema: {
        body: {
          type: "object",
          required: ["sessionId", "summary", "learnings", "decisions"],
          properties: {
            sessionId: { type: "string", minLength: 1 },
            summary: { type: "string" },
            learnings: { type: "array", items: { type: "string" } },
            decisions: { type: "array", items: { type: "string" } },
            duration: { type: "number", minimum: 0 },
            toolCalls: { type: "number", minimum: 0 },
          },
        },
      },
    },
    async (req) => {
      const note = await sessions.end(req.body);
      if (!note) return { ok: false, error: "Session not found" };
      return { ok: true, note };
    }
  );

  app.get<{ Querystring: { sessionId: string } }>(
    "/session/status",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["sessionId"],
          properties: { sessionId: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req) => {
      const { sessionId } = req.query;
      const context = sessions.getActiveSession(sessionId);
      if (!context) return { ok: false, error: "Session not found or already ended" };
      return { ok: true, context };
    }
  );

  app.get("/session/active", async () => {
    const active = sessions.listActiveSessions();
    return { ok: true, sessions: active };
  });
}
