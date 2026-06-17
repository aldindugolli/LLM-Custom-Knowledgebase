import type { FastifyInstance } from "fastify";
import type { EntityStore } from "./store.js";
import type { EntityExtractor } from "./extractor.js";
import type { EntityLinker } from "./linker.js";
import type { EntityType } from "../types.js";

export function registerEntityRoutes(
  app: FastifyInstance,
  store: EntityStore,
  extractor: EntityExtractor,
  linker: EntityLinker,
) {
  app.post<{ Body: { entityType: EntityType; title: string; body: string; tags?: string[]; project?: string } }>(
    "/entity/create",
    {
      schema: {
        body: {
          type: "object",
          required: ["entityType", "title", "body"],
          properties: {
            entityType: { type: "string", enum: ["project", "decision", "task", "goal", "learning", "concept", "reference", "technology", "person", "reflection"] },
            title: { type: "string", minLength: 1 },
            body: { type: "string", minLength: 1 },
            tags: { type: "array", items: { type: "string" } },
            project: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const { entityType, title, body, tags, project } = req.body;
      const path = await store.createEntity({ entityType, title, body, tags, project });
      return { ok: true, path };
    }
  );

  app.get<{ Querystring: { type?: EntityType } }>(
    "/entity/list",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["project", "decision", "task", "goal", "learning", "concept", "reference", "technology", "person", "reflection"] },
          },
        },
      },
    },
    async (req) => {
      const entities = await store.listEntities(req.query.type);
      return { ok: true, entities };
    }
  );

  app.get("/entity/extract", async () => {
    const refs = await extractor.extractAllFromVault();
    const results: { notePath: string; refs: { name: string; entityType: string }[] }[] = [];
    for (const [notePath, entityRefs] of refs) {
      results.push({ notePath, refs: entityRefs.map((r) => ({ name: r.name, entityType: r.entityType })) });
    }
    return { ok: true, results };
  });

  app.get("/entity/links", async () => {
    const index = await linker.buildReverseIndex();
    const results: { notePath: string; links: { entityId: string; entityType: string; entityName: string }[] }[] = [];
    for (const [notePath, links] of index) {
      results.push({ notePath, links: links.map((l) => ({ entityId: l.entityId, entityType: l.entityType, entityName: l.entityName })) });
    }
    return { ok: true, results };
  });
}
