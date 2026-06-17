import type { FastifyInstance } from "fastify";
import type { createReflectionEngine } from "./engine.js";

export function registerReflectionRoutes(app: FastifyInstance, engine: ReturnType<typeof createReflectionEngine>) {
  app.post<{ Body: { period?: "weekly" | "monthly" } }>("/reflection/generate", async (req) => {
    const period = req.body.period || "weekly";
    const result = await engine.generateReflection(period);
    return { ok: true, reflection: result };
  });
}
