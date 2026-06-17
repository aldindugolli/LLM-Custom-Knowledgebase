import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createKnowledgeGraph } from "../core/graph.js";
import { createVault } from "../core/vault.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import type { Note } from "../types.js";

function makeNote(overrides: Partial<Note>): Note {
  const now = new Date();
  return {
    id: overrides.id || "test",
    type: overrides.type || "learning",
    title: overrides.title || "Test",
    path: overrides.path || "test.md",
    frontmatter: overrides.frontmatter || {} as any,
    content: overrides.content || "",
    body: overrides.body || "",
    created: overrides.created || now,
    updated: overrides.updated || now,
    tags: overrides.tags || [],
    related: overrides.related || [],
    wikilinks: overrides.wikilinks || [],
    backlinks: overrides.backlinks || [],
    wordCount: overrides.wordCount || 0,
  };
}

describe("KnowledgeGraph", () => {
  it("builds graph from notes with wikilink edges", async () => {
    const notes = [
      makeNote({ id: "a", title: "A", path: "concepts/a.md", wikilinks: ["B"] }),
      makeNote({ id: "b", title: "B", path: "concepts/b.md", wikilinks: [] }),
    ];
    const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
    const graph = createKnowledgeGraph(vault);
    const kg = await graph.build(notes);
    expect(kg.nodes.size).toBe(2);
    expect(kg.edges.length).toBeGreaterThanOrEqual(1);
    const wikilinkEdge = kg.edges.find((e) => e.kind === "wikilink");
    expect(wikilinkEdge).toBeDefined();
    expect(wikilinkEdge!.source).toBe("a");
    expect(wikilinkEdge!.target).toBe("b");
  });

  it("builds graph with tag edges", async () => {
    const notes = [
      makeNote({ id: "a", title: "A", path: "a.md", tags: ["typescript"] }),
      makeNote({ id: "b", title: "B", path: "b.md", tags: ["typescript"] }),
    ];
    const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
    const graph = createKnowledgeGraph(vault);
    const kg = await graph.build(notes);
    const tagEdge = kg.edges.find((e) => e.kind === "tag");
    expect(tagEdge).toBeDefined();
    expect(tagEdge!.source).toBe("a");
    expect(tagEdge!.target).toBe("b");
  });

  it("builds graph with related edges", async () => {
    const notes = [
      makeNote({ id: "a", title: "A", path: "a.md", related: ["b"] }),
      makeNote({ id: "b", title: "B", path: "b.md", related: [] }),
    ];
    const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
    const graph = createKnowledgeGraph(vault);
    const kg = await graph.build(notes);
    const relatedEdge = kg.edges.find((e) => e.kind === "related");
    expect(relatedEdge).toBeDefined();
    expect(relatedEdge!.source).toBe("a");
    expect(relatedEdge!.target).toBe("b");
  });

  it("finds orphans (notes with no backlinks, excluding index/session)", async () => {
    const notes = [
      makeNote({ id: "a", title: "A", path: "concepts/a.md", wikilinks: ["B"], backlinks: [] }),
      makeNote({ id: "b", title: "B", path: "concepts/b.md", wikilinks: [], backlinks: ["a"] }),
      makeNote({ id: "idx", title: "Index", path: "index.md", type: "index", backlinks: [] }),
    ];
    const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
    const graph = createKnowledgeGraph(vault);
    const orphans = await graph.findOrphans(notes);
    expect(orphans.length).toBe(1);
    expect(orphans[0].id).toBe("a");
  });

  it("finds broken wikilinks", async () => {
    const notes = [
      makeNote({ id: "a", title: "A", path: "concepts/a.md", wikilinks: ["nonexistent"] }),
    ];
    const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
    const graph = createKnowledgeGraph(vault);
    const broken = await graph.findBrokenLinks(notes);
    expect(broken.length).toBe(1);
    expect(broken[0].target).toBe("nonexistent");
    expect(broken[0].sourcePath).toBe("concepts/a.md");
  });

  it("getNeighbors returns connected nodes at depth 1", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "graph-neighbors-"));
    const vault = createVault({ path: tmpDir, port: 0, host: "127.0.0.1" });
    await vault.ensureDirs();
    await vault.writeNote("concept", "a.md", "---\ntitle: A\nid: a\ntype: concept\n---\nSee [[B]]");
    await vault.writeNote("concept", "b.md", "---\ntitle: B\nid: b\ntype: concept\n---\nB content");
    const graph = createKnowledgeGraph(vault);
    const neighbors = await graph.getNeighbors("a", 1);
    expect(neighbors.length).toBe(1);
    expect(neighbors[0].node.id).toBe("b");
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("caches graph within TTL", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "graph-cache-"));
    const vault = createVault({ path: tmpDir, port: 0, host: "127.0.0.1" });
    await vault.ensureDirs();
    await vault.writeNote("concept", "a.md", "---\ntitle: A\ntype: concept\n---\nSee [[B]]");
    await vault.writeNote("concept", "b.md", "---\ntitle: B\ntype: concept\n---\nB content");
    const graph = createKnowledgeGraph(vault);
    const first = await graph.build();
    const second = await graph.build();
    expect(second.nodes.size).toBe(first.nodes.size);
    expect(second.edges.length).toBe(first.edges.length);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
