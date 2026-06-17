import type { FastifyInstance } from "fastify";
import type { createProjectStore } from "./store.js";

export function registerProjectRoutes(app: FastifyInstance, store: ReturnType<typeof createProjectStore>) {
  app.get("/project/list", async () => {
    const projects = await store.listProjects();
    return { ok: true, projects };
  });

  app.get<{ Params: { name: string } }>("/project/:name", async (req) => {
    const project = await store.getProject(req.params.name);
    if (!project) return { ok: false, error: "Project not found" };
    return { ok: true, project };
  });

  app.get<{ Params: { name: string } }>("/project/:name/tasks", async (req) => {
    const tasks = await store.getProjectTasks(req.params.name);
    return { ok: true, tasks };
  });
}
