import type { Vault } from "./vault.js";
import type { Note, KnowledgeEdge, KnowledgeGraph, NoteType } from "../types.js";

const GRAPH_CACHE_TTL = 10000;

export function createKnowledgeGraph(vault: Vault) {
  let cache: { timestamp: number; graph: KnowledgeGraph } | null = null;

  function invalidateCache() {
    cache = null;
  }

  async function build(allNotes?: Note[]): Promise<KnowledgeGraph> {
    if (!allNotes && cache && Date.now() - cache.timestamp < GRAPH_CACHE_TTL) {
      return cache.graph;
    }
    if (!allNotes) allNotes = await vault.readAllNotes();
    if (!allNotes) allNotes = await vault.readAllNotes();

    const nodes = new Map<string, Note>();
    const edges: KnowledgeEdge[] = [];
    const resolvedNotes = await Promise.all(
      allNotes.map(async (n) => vault.resolveWikilinks(n, allNotes!))
    );
    resolvedNotes.forEach((n) => nodes.set(n.id, n));

    for (const note of resolvedNotes) {
      for (const wl of note.wikilinks) {
        const target = allNotes!.find((n) => {
          const base = n.path.replace(/\.md$/, "").split("/").pop();
          return base === wl;
        });
        if (target) {
          edges.push({
            source: note.id,
            target: target.id,
            kind: "wikilink",
          });
        }
      }
      for (const r of note.related) {
        const target = allNotes!.find((n) => n.id === r || n.title === r);
        if (target) {
          edges.push({
            source: note.id,
            target: target.id,
            kind: "related",
          });
        }
      }
      for (const tag of note.tags) {
        const sameTag = allNotes!.filter((n) => n.id !== note.id && n.tags.includes(tag));
        for (const target of sameTag) {
          if (!edges.some((e) => e.source === note.id && e.target === target.id && e.kind === "tag")) {
            edges.push({ source: note.id, target: target.id, kind: "tag" });
          }
        }
      }
    }

    const graph: KnowledgeGraph = { nodes, edges };
    if (!allNotes) cache = { timestamp: Date.now(), graph };
    return graph;
  }

  async function getNeighbors(noteId: string, maxDepth: number = 1): Promise<{ node: Note; depth: number }[]> {
    const graph = await build();
    const visited = new Set<string>();
    const result: { node: Note; depth: number }[] = [];

    function walk(currentId: string, depth: number) {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const node = graph.nodes.get(currentId);
      if (node && depth > 0) result.push({ node, depth });

      const connected = graph.edges.filter(
        (e) => e.source === currentId || e.target === currentId
      );
      for (const edge of connected) {
        const nextId = edge.source === currentId ? edge.target : edge.source;
        walk(nextId, depth + 1);
      }
    }

    walk(noteId, 0);
    return result;
  }

  async function findOrphans(allNotes?: Note[]): Promise<Note[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();
    const resolved = await Promise.all(
      allNotes.map(async (n) => vault.resolveWikilinks(n, allNotes!))
    );
    return resolved.filter((n) => n.backlinks.length === 0 && n.type !== "index" && n.type !== "session");
  }

  async function findBrokenLinks(allNotes?: Note[]): Promise<{ sourcePath: string; target: string }[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();
    const broken: { sourcePath: string; target: string }[] = [];

    for (const note of allNotes) {
      for (const wl of note.wikilinks) {
        const exists = allNotes.some((n) => {
          const base = n.path.replace(/\.md$/, "").split("/").pop();
          return base === wl;
        });
        if (!exists) {
          broken.push({ sourcePath: note.path, target: wl });
        }
      }
    }
    return broken;
  }

  return { build, getNeighbors, findOrphans, findBrokenLinks };
}

export type KnowledgeGraphEngine = ReturnType<typeof createKnowledgeGraph>;
