import path from "node:path";
import type { Vault } from "./vault.js";
import type { Note, KnowledgeEdge, KnowledgeGraph, NoteType, TypedEdge, KnowledgeGraphV2, EntityType, EntityNote } from "../types.js";

const GRAPH_CACHE_TTL = 10000;

const V1_TO_V2_KIND: Record<string, TypedEdge["kind"]> = {
  wikilink: "references",
  related: "related_to",
  tag: "related_to",
  "same-project": "related_to",
};

const KIND_WEIGHTS: Record<TypedEdge["kind"], number> = {
  uses: 0.9,
  depends_on: 1.0,
  implements: 0.8,
  references: 0.6,
  derived_from: 0.7,
  supersedes: 0.5,
  related_to: 0.4,
  blocks: 0.9,
  enables: 0.8,
};

function safeDate(d: Date): string {
  try { return d.toISOString(); } catch { return new Date().toISOString(); }
}

function noteToEntityNote(n: Note): EntityNote {
  return {
    ...n,
    entityType: (n.frontmatter.entityType || n.type) as EntityType,
    confidence: 1.0,
    retrievalCount: 0,
    referenceCount: n.wikilinks.length,
    lastReferenced: safeDate(n.updated),
    importance: n.frontmatter.importance || 3,
  };
}

function inferEdgeKind(source: Note, target: Note): TypedEdge["kind"] {
  if (source.type === "decision" && (target.type === "project" || target.frontmatter.entityType === "project")) return "implements";
  if (target.type === "decision" && (source.type === "project" || source.frontmatter.entityType === "project")) return "implements";
  if (source.type === "learning" && target.frontmatter.entityType === "technology") return "references";
  if (target.type === "learning" && source.frontmatter.entityType === "technology") return "references";
  if (source.type === "task" || target.type === "task") return "depends_on";
  return "related_to";
}

export function createKnowledgeGraph(vault: Vault) {
  let cache: { timestamp: number; graph: KnowledgeGraph } | null = null;
  let v2Cache: { timestamp: number; graph: KnowledgeGraphV2 } | null = null;

  function invalidateCache() {
    cache = null;
    v2Cache = null;
  }

  async function build(allNotes?: Note[]): Promise<KnowledgeGraph> {
    if (!allNotes && cache && Date.now() - cache.timestamp < GRAPH_CACHE_TTL) {
      return cache.graph;
    }
    if (!allNotes) allNotes = await vault.readAllNotes();

    const nodes = new Map<string, Note>();
    const edges: KnowledgeEdge[] = [];
    const resolvedNotes = await vault.resolveAllWikilinks(allNotes);
    resolvedNotes.forEach((n) => nodes.set(n.id, n));

    for (const note of resolvedNotes) {
      for (const wl of note.wikilinks) {
        const target = allNotes!.find((n) => {
          const base = n.path.replace(/\.md$/, "").split("/").pop();
          return base?.toLowerCase() === wl.toLowerCase();
        });
        if (target) {
          edges.push({ source: note.id, target: target.id, kind: "wikilink" });
        }
      }
      for (const r of note.related) {
        const target = allNotes!.find((n) => n.id === r || n.title === r);
        if (target) {
          edges.push({ source: note.id, target: target.id, kind: "related" });
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

  async function buildV2(allNotes?: Note[]): Promise<KnowledgeGraphV2> {
    if (!allNotes && v2Cache && Date.now() - v2Cache.timestamp < GRAPH_CACHE_TTL) {
      return v2Cache.graph;
    }
    if (!allNotes) allNotes = await vault.readAllNotes();

    const v1 = await build(allNotes);
    const nodes = new Map<string, EntityNote>();
    for (const [id, note] of v1.nodes) {
      nodes.set(id, noteToEntityNote(note));
    }

    const edgeMap = new Map<string, TypedEdge>();
    for (const e of v1.edges) {
      const key = [e.source, e.target].sort().join("::");
      const kind = V1_TO_V2_KIND[e.kind] || "related_to";
      const sourceNote = allNotes.find((n) => n.id === e.source);
      const targetNote = allNotes.find((n) => n.id === e.target);

      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key)!;
        if (existing.weight < 0.8) {
          existing.kind = inferEdgeKind(sourceNote!, targetNote!);
          existing.weight = Math.min(1.0, existing.weight + 0.2);
        }
      } else {
        const inferredKind = sourceNote && targetNote ? inferEdgeKind(sourceNote, targetNote) : kind;
        edgeMap.set(key, {
          source: e.source,
          target: e.target,
          kind: inferredKind,
          weight: KIND_WEIGHTS[inferredKind] || 0.4,
          created: new Date().toISOString(),
        });
      }
    }

    const edges = Array.from(edgeMap.values());
    const graph: KnowledgeGraphV2 = { nodes, edges };
    if (!allNotes) v2Cache = { timestamp: Date.now(), graph };
    return graph;
  }

  async function getNeighbors(noteId: string, maxDepth: number = 1, kind?: TypedEdge["kind"]): Promise<{ node: Note; depth: number }[]> {
    const graph = await build();
    const visited = new Set<string>();
    const result: { node: Note; depth: number }[] = [];

    function walk(currentId: string, depth: number) {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);

      const node = graph.nodes.get(currentId);
      if (node && depth > 0 && node.type !== "index") result.push({ node, depth });

      const connected = graph.edges.filter(
        (e) => (e.source === currentId || e.target === currentId)
      );
      for (const edge of connected) {
        const nextId = edge.source === currentId ? edge.target : edge.source;
        walk(nextId, depth + 1);
      }
    }

    walk(noteId, 0);
    return result;
  }

  async function getNeighborsV2(noteId: string, kind?: TypedEdge["kind"]): Promise<EntityNote[]> {
    const graph = await buildV2();
    const neighbors: EntityNote[] = [];
    const seen = new Set<string>();

    for (const edge of graph.edges) {
      if (kind && edge.kind !== kind) continue;
      let neighborId: string | null = null;
      if (edge.source === noteId) neighborId = edge.target;
      if (edge.target === noteId) neighborId = edge.source;
      if (neighborId && !seen.has(neighborId)) {
        seen.add(neighborId);
        const node = graph.nodes.get(neighborId);
        if (node) neighbors.push(node);
      }
    }

    return neighbors;
  }

  async function findPaths(fromId: string, toId: string): Promise<TypedEdge[][]> {
    const graph = await buildV2();
    const paths: TypedEdge[][] = [];
    const visited = new Set<string>();

    function bfs(): TypedEdge[][] {
      const queue: { node: string; path: TypedEdge[] }[] = [{ node: fromId, path: [] }];
      visited.add(fromId);
      const found: TypedEdge[][] = [];

      while (queue.length > 0 && found.length < 3) {
        const { node, path } = queue.shift()!;

        if (node === toId && path.length > 0) {
          found.push(path);
          continue;
        }

        if (path.length >= 5) continue;

        const outgoing = graph.edges.filter((e) => e.source === node || e.target === node);
        for (const edge of outgoing) {
          const next = edge.source === node ? edge.target : edge.source;
          if (!visited.has(next) || next === toId) {
            visited.add(next);
            queue.push({ node: next, path: [...path, edge] });
          }
        }
      }

      return found;
    }

    return bfs();
  }

  async function getSubgraph(ids: string[]): Promise<KnowledgeGraphV2> {
    const graph = await buildV2();
    const idSet = new Set(ids);
    const nodes = new Map<string, EntityNote>();
    const edges: TypedEdge[] = [];

    for (const id of ids) {
      const node = graph.nodes.get(id);
      if (node) nodes.set(id, node);
    }

    for (const edge of graph.edges) {
      if (idSet.has(edge.source) && idSet.has(edge.target)) {
        edges.push(edge);
      }
    }

    return { nodes, edges };
  }

  async function getEntityGraph(): Promise<KnowledgeGraphV2> {
    const graph = await buildV2();
    const nodes = new Map<string, EntityNote>();
    const entityIds = new Set<string>();

    for (const [id, node] of graph.nodes) {
      if (node.frontmatter.entityType || node.type === "entity") {
        nodes.set(id, node);
        entityIds.add(id);
      }
    }

    const edges = graph.edges.filter(
      (e) => entityIds.has(e.source) && entityIds.has(e.target)
    );

    return { nodes, edges };
  }

  async function findOrphans(allNotes?: Note[]): Promise<Note[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();
    const resolved = await vault.resolveAllWikilinks(allNotes);
    return resolved.filter((n) => n.backlinks.length === 0 && n.type !== "index" && n.type !== "session");
  }

  async function findBrokenLinks(allNotes?: Note[]): Promise<{ sourcePath: string; target: string }[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();
    const broken: { sourcePath: string; target: string }[] = [];
    const linkMap = new Map(allNotes.map((n) => [path.basename(n.path, ".md"), n]));

    for (const note of allNotes) {
      for (const wl of note.wikilinks) {
        const exists = linkMap.has(wl);
        if (!exists) {
          broken.push({ sourcePath: note.path, target: wl });
        }
      }
    }
    return broken;
  }

  return {
    build,
    buildV2,
    getNeighbors,
    getNeighborsV2,
    findPaths,
    getSubgraph,
    getEntityGraph,
    findOrphans,
    findBrokenLinks,
  };
}

export type KnowledgeGraphEngine = ReturnType<typeof createKnowledgeGraph>;
