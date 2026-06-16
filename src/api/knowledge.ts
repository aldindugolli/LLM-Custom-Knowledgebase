import type { FastifyInstance } from "fastify";
import type { DedupEngine } from "../core/dedup.js";
import type { LinkSuggester } from "../core/linker.js";
import type { KnowledgeGraphEngine } from "../core/graph.js";

export function registerKnowledgeRoutes(app: FastifyInstance, dedup: DedupEngine, linker: LinkSuggester, graph: KnowledgeGraphEngine) {
  app.get("/knowledge/dedup", async () => {
    const groups = await dedup.findDuplicates();
    return { ok: true, groups };
  });

  app.post<{ Body: { primaryId: string; duplicateIds: string[] } }>(
    "/knowledge/dedup/merge-preview",
    async (req) => {
      const { primaryId } = req.body;
      const groups = await dedup.findDuplicates();
      const group = groups.find((g) => g.primary.id === primaryId);
      if (!group) return { ok: false, error: "Group not found" };
      const merged = await dedup.suggestMerge(group);
      return { ok: true, preview: merged };
    }
  );

  app.get("/knowledge/suggest-links", async () => {
    const suggestions = await linker.suggestLinks();
    return { ok: true, suggestions: suggestions.slice(0, 50) };
  });

  app.get("/knowledge/graph", async () => {
    const kg = await graph.build();
    const nodes = Array.from(kg.nodes.values()).map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      path: n.path,
    }));
    const edges = kg.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
    }));
    return { ok: true, nodes, edges };
  });

  app.get("/knowledge/contradictions", async () => {
    return { ok: true, note: "Contradiction scanning requires a session context. Use /session/synthesize after a session." };
  });
}
