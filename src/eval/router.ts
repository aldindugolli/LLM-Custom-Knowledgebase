import type { FastifyInstance } from "fastify";
import type { createEvaluator } from "./metrics.js";

export function registerEvalRoutes(app: FastifyInstance, evaluator: ReturnType<typeof createEvaluator>) {
  app.post<{ Body: { queries: { query: string; expectedIds: string[] }[] } }>(
    "/eval/search",
    {
      schema: {
        body: {
          type: "object",
          required: ["queries"],
          properties: {
            queries: {
              type: "array",
              items: {
                type: "object",
                required: ["query", "expectedIds"],
                properties: {
                  query: { type: "string" },
                  expectedIds: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const { queries } = req.body;
      const result = await evaluator.evaluate(queries);
      return { ok: true, ...result };
    }
  );
}
