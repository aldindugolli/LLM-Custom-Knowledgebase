import type { FastifyInstance } from "fastify";
import type { createMaintenanceScheduler } from "./scheduler.js";

export function registerMaintenanceRoutes(app: FastifyInstance, scheduler: ReturnType<typeof createMaintenanceScheduler>) {
  app.get("/maintenance/jobs", async () => {
    return { ok: true, jobs: scheduler.jobs };
  });

  app.post<{ Body: { job: string } }>("/maintenance/run", async (req) => {
    const { job } = req.body;
    if (!job) return { ok: false, error: "Job name required" };
    const result = await scheduler.runJob(job);
    return { ok: true, result };
  });

  app.post("/maintenance/start", async () => {
    scheduler.start();
    return { ok: true };
  });

  app.post("/maintenance/stop", async () => {
    scheduler.stop();
    return { ok: true };
  });
}
