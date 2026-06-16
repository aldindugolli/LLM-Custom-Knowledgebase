import type { FastifyInstance } from "fastify";
import type { DedupEngine } from "../core/dedup.js";
import type { LinkSuggester } from "../core/linker.js";
import type { KnowledgeGraphEngine } from "../core/graph.js";
import type { Vault } from "../core/vault.js";
import type { SynthesisEngine } from "../core/synthesis.js";

export function registerKnowledgeRoutes(app: FastifyInstance, dedup: DedupEngine, linker: LinkSuggester, graph: KnowledgeGraphEngine, vault: Vault, synthesis: SynthesisEngine) {
  app.get("/knowledge/dedup", async () => {
    const groups = await dedup.findDuplicates();
    return { ok: true, groups };
  });

  app.post<{ Body: { primaryId: string; duplicateIds: string[] } }>(
    "/knowledge/dedup/merge-preview",
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

  app.get("/knowledge/contradictions", async () => {
    const allNotes = await vault.readAllNotes();
    const contradictions: { noteA: string; noteB: string; reason: string }[] = [];
    const knowledgeNotes = allNotes.filter((n) => !["session", "index"].includes(n.type));

    for (let i = 0; i < knowledgeNotes.length; i++) {
      for (let j = i + 1; j < knowledgeNotes.length; j++) {
        const a = knowledgeNotes[i];
        const b = knowledgeNotes[j];
        if (synthesis.isContradictory(a.body, b.body) || synthesis.isContradictory(b.body, a.body)) {
          contradictions.push({
            noteA: a.title,
            noteB: b.title,
            reason: "Potential contradiction detected between these notes",
          });
        }
      }
    }

    return { ok: true, contradictions, totalScanned: knowledgeNotes.length };
  });
}
