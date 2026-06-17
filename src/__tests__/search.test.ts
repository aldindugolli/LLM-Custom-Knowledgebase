import { describe, it, expect } from "vitest";
import { createSearchEngine } from "../core/search.js";
import { createVault } from "../core/vault.js";
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

describe("SearchEngine", () => {
  const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
  const search = createSearchEngine(vault);

  it("keyword search finds matching notes", async () => {
    const notes = [
      makeNote({ id: "1", title: "React hooks", body: "useState and useEffect are hooks" }),
      makeNote({ id: "2", title: "Fastify plugins", body: "Fastify has a plugin system" }),
      makeNote({ id: "3", title: "CSS grid", body: "Grid layout is powerful" }),
    ];
    const results = await search.keywordSearch("hooks", notes);
    expect(results).toHaveLength(1);
    expect(results[0].note.id).toBe("1");
  });

  it("multi-term search finds broader matches", async () => {
    const notes = [
      makeNote({ id: "1", title: "React hooks", body: "useState is a React hook" }),
      makeNote({ id: "2", title: "React components", body: "Components are the building blocks" }),
    ];
    const results = await search.keywordSearch("react hook", notes);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("exact title match has highest score", async () => {
    const notes = [
      makeNote({ id: "1", title: "test query", body: "some content" }),
      makeNote({ id: "2", title: "other", body: "test query appears in body here" }),
    ];
    const results = await search.keywordSearch("test query", notes);
    expect(results[0].note.id).toBe("1");
    expect(results[0].matchType).toBe("exact");
  });

  it("tag match boosts score", async () => {
    const notes = [
      makeNote({ id: "1", title: "Note A", body: "content", tags: ["typescript"] }),
      makeNote({ id: "2", title: "Note B", body: "content" }),
    ];
    const results = await search.keywordSearch("typescript", notes);
    expect(results[0].note.id).toBe("1");
    expect(results[0].matchType).toBe("tag");
  });

  it("empty query returns nothing", async () => {
    const results = await search.keywordSearch("", [makeNote({ id: "1" })]);
    expect(results).toHaveLength(0);
  });

  it("search filters by type", async () => {
    const notes = [
      makeNote({ id: "1", type: "learning", title: "A", body: "content" }),
      makeNote({ id: "2", type: "decision", title: "B", body: "content" }),
    ];
    const results = await search.search({ query: "content", type: "decision" }, notes);
    expect(results).toHaveLength(1);
    expect(results[0].note.id).toBe("2");
  });

  it("search filters by tags", async () => {
    const notes = [
      makeNote({ id: "1", tags: ["foo"], title: "A", body: "content" }),
      makeNote({ id: "2", tags: ["bar"], title: "B", body: "content" }),
    ];
    const results = await search.search({ query: "content", tags: ["foo"] }, notes);
    expect(results).toHaveLength(1);
    expect(results[0].note.id).toBe("1");
  });

  it("search respects limit and offset", async () => {
    const notes = Array.from({ length: 10 }, (_, i) =>
      makeNote({ id: String(i), title: `Note ${i}`, body: "content" })
    );
    const results = await search.search({ query: "content", limit: 3, offset: 2 }, notes);
    expect(results).toHaveLength(3);
    expect(results[0].note.id).toBe("2");
  });
});
