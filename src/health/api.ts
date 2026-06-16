import type { FastifyInstance } from "fastify";
import type { HealthChecker } from "./index.js";

export function registerHealthRoutes(app: FastifyInstance, health: HealthChecker) {
  app.get("/health/report", async () => {
    const report = await health.generateReport();
    return { ok: true, report };
  });

  app.get("/health/summary", async () => {
    const report = await health.generateReport();
    return {
      ok: true,
      summary: {
        totalNotes: report.totalNotes,
        totalWikilinks: report.totalWikilinks,
        orphanCount: report.orphans.length,
        brokenLinkCount: report.brokenLinks.length,
        stalePageCount: report.stalePages.length,
        stats: report.stats,
      },
    };
  });
}
