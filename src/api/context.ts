import type { FastifyInstance } from "fastify";
import type { ContextAssembler } from "../core/context-bundle.js";

export function registerContextRoutes(app: FastifyInstance, ctx: ContextAssembler) {
  app.post<{ Body: { project: string; goal: string } }>(
    "/context/bundle",
    {
      schema: {
        body: {
          type: "object",
          required: ["project", "goal"],
          properties: {
            project: { type: "string", minLength: 1 },
            goal: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { project, goal } = req.body;
      const bundle = await ctx.assemble(project, goal);
      return { ok: true, bundle };
    }
  );

  app.post<{ Body: { project: string; goal: string } }>(
    "/context/compiled",
    {
      schema: {
        body: {
          type: "object",
          required: ["project", "goal"],
          properties: {
            project: { type: "string", minLength: 1 },
            goal: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { project, goal } = req.body;
      const bundle = await ctx.assemble(project, goal);
      return { ok: true, context: bundle.compiled };
    }
  );
}
