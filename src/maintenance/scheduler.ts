import type { Vault } from "../core/vault.js";
import type { KnowledgeGraphEngine } from "../core/graph.js";
import type { MaintenanceJob, MaintenanceResult } from "../types.js";

interface MaintenanceOpts {
  vault: Vault;
  graph: KnowledgeGraphEngine;
  intervalMs?: number;
}

export function createMaintenanceScheduler(opts: MaintenanceOpts) {
  const { vault, graph } = opts;
  const baseInterval = opts.intervalMs || 3600000;
  let timer: ReturnType<typeof setInterval> | null = null;

  const jobs: MaintenanceJob[] = [
    {
      name: "graph-rebuild", interval: baseInterval, lastRun: null,
      async run() {
        await graph.build();
        await graph.buildV2();
        return { ok: true, job: "graph-rebuild", duration: 0, itemsProcessed: 0, errors: [] };
      },
    },
    {
      name: "index-rebuild", interval: baseInterval, lastRun: null,
      async run() {
        await vault.rebuildIndex();
        return { ok: true, job: "index-rebuild", duration: 0, itemsProcessed: 0, errors: [] };
      },
    },
    {
      name: "broken-links", interval: baseInterval * 6, lastRun: null,
      async run() {
        const notes = await vault.readAllNotes();
        const broken: string[] = [];
        for (const n of notes) {
          for (const link of n.wikilinks) {
            const target = notes.find((m) => m.title.toLowerCase() === link.toLowerCase());
            if (!target && !broken.includes(link)) broken.push(link);
          }
        }
        return { ok: true, job: "broken-links", duration: 0, itemsProcessed: broken.length, errors: broken };
      },
    },
    {
      name: "health-check", interval: baseInterval * 12, lastRun: null,
      async run() {
        const notes = await vault.readAllNotes();
        const orphans = notes.filter((n) => n.backlinks.length === 0 && n.type !== "index" && n.type !== "session");
        return {
          ok: true, job: "health-check", duration: 0, itemsProcessed: notes.length,
          errors: orphans.map((o) => `Orphan: ${o.title}`),
        };
      },
    },
  ];

  async function runJob(jobName: string): Promise<MaintenanceResult> {
    const job = jobs.find((j) => j.name === jobName);
    if (!job) return { ok: false, job: jobName, duration: 0, itemsProcessed: 0, errors: ["Unknown job"] };
    const start = Date.now();
    const result = await job.run();
    result.duration = Date.now() - start;
    job.lastRun = Date.now();
    return result;
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(async () => {
      for (const job of jobs) {
        if (job.lastRun && Date.now() - job.lastRun < job.interval) continue;
        const result = await runJob(job.name);
        if (!result.ok) console.warn(`[Maintenance] ${job.name} failed: ${result.errors.join(", ")}`);
      }
    }, 60000);
  }

  function stop(): void {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return {
    jobs: jobs.map((j) => ({ name: j.name, interval: j.interval, lastRun: j.lastRun })),
    runJob, start, stop,
  };
}
