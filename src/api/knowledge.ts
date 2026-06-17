import type { FastifyInstance } from "fastify";
import type { DedupEngine } from "../core/dedup.js";
import type { LinkSuggester } from "../core/linker.js";
import type { KnowledgeGraphEngine } from "../core/graph.js";
import type { Vault } from "../core/vault.js";
import type { SynthesisEngine } from "../core/synthesis.js";
import { getEmbedding, cosineSimilarity } from "../knowledge/embeddings.js";

export function registerKnowledgeRoutes(app: FastifyInstance, dedup: DedupEngine, linker: LinkSuggester, graph: KnowledgeGraphEngine, vault: Vault, synthesis: SynthesisEngine) {
  app.get("/knowledge/dedup", async () => {
    const groups = await dedup.findDuplicates();
    return { ok: true, groups };
  });

  app.post<{ Body: { primaryId: string; duplicateIds: string[] } }>(
    "/knowledge/dedup/merge-preview",
    {
      schema: {
        body: {
          type: "object",
          required: ["primaryId"],
          properties: {
            primaryId: { type: "string", minLength: 1 },
            duplicateIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req) => {
      const { primaryId, duplicateIds } = req.body;
      if (duplicateIds && duplicateIds.length > 0) {
        const allNotes = await vault.readAllNotes();
        const primary = allNotes.find((n) => n.id === primaryId);
        if (!primary) return { ok: false, error: "Primary note not found" };
        const duplicates = allNotes.filter((n) => duplicateIds.includes(n.id));
        const merged = await dedup.suggestMerge({ primary, duplicates, similarity: 1 });
        return { ok: true, preview: merged };
      }
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

  app.get("/knowledge/graph/v2", async () => {
    const kg = await graph.buildV2();
    const nodes = Array.from(kg.nodes.values()).map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      entityType: n.entityType,
      path: n.path,
    }));
    const edges = kg.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
      weight: e.weight,
      created: e.created,
    }));
    return { ok: true, nodes, edges };
  });

  app.get<{ Querystring: { from: string; to: string } }>(
    "/knowledge/graph/paths",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const paths = await graph.findPaths(req.query.from, req.query.to);
      return { ok: true, paths };
    }
  );

  app.get("/knowledge/graph/entities", async () => {
    const kg = await graph.getEntityGraph();
    const nodes = Array.from(kg.nodes.values()).map((n) => ({
      id: n.id,
      title: n.title,
      entityType: n.entityType,
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
    const allNotes = await vault.readAllNotes();
    const contradictions: { noteA: string; noteB: string; reason: string }[] = [];
    const knowledgeNotes = allNotes.filter((n) => !["session", "index"].includes(n.type));

    const tagGroups = new Map<string, typeof knowledgeNotes>();
    for (const n of knowledgeNotes) {
      for (const tag of n.tags) {
        if (!tagGroups.has(tag)) tagGroups.set(tag, []);
        tagGroups.get(tag)!.push(n);
      }
    }

    const compared = new Set<string>();
    for (const [, group] of tagGroups) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          if (compared.has(key)) continue;
          compared.add(key);
          if (synthesis.isContradictory(a.body, b.body) || synthesis.isContradictory(b.body, a.body)) {
            contradictions.push({
              noteA: a.title,
              noteB: b.title,
              reason: "Potential contradiction detected between these notes",
            });
          }
        }
      }
    }

    return { ok: true, contradictions, totalScanned: knowledgeNotes.length };
  });

  app.post<{ Body: { query: string; limit?: number } }>(
    "/knowledge/search/semantic",
    {
      schema: {
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1 },
            limit: { type: "number" },
          },
        },
      },
    },
    async (req) => {
      const { query, limit = 20 } = req.body;
      const queryEmb = await getEmbedding(query);
      const notes = await vault.readAllNotes();
      const results = await Promise.all(
        notes.map(async (note) => {
          const text = `${note.title} ${note.body.slice(0, 1000)}`;
          const emb = await getEmbedding(text);
          const score = cosineSimilarity(queryEmb, emb);
          return { note: { id: note.id, title: note.title, type: note.type }, score: +score.toFixed(4) };
        })
      );
      results.sort((a, b) => b.score - a.score);
      return { ok: true, results: results.slice(0, limit) };
    }
  );
}
