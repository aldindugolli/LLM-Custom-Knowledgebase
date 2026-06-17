import { describe, it, expect, vi } from "vitest";
import { createMiningEngine, type MiningOptions } from "../mining/extractor.js";
import type { MemoryManager } from "../core/memory.js";
import type { Note } from "../types.js";

function makeNote(overrides: Partial<Note>): Note {
  const now = new Date();
  return {
    id: overrides.id || "test",
    type: overrides.type || "session",
    title: overrides.title || "Session",
    path: overrides.path || "sessions/test.md",
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

const mockMemory: MemoryManager = {
  save: vi.fn().mockResolvedValue(makeNote({ id: "saved" })),
  read: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  listByType: vi.fn(),
};

describe("MiningEngine", () => {
  const miner = createMiningEngine(mockMemory);

  it("extracts learning from 'learned that' pattern", () => {
    const text = "Today I learned that TypeScript interfaces are faster than types in some cases.";
    const results = miner.extractCandidates(text);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("learning");
    expect(results[0].body).toContain("TypeScript");
  });

  it("extracts learning from 'key takeaway' pattern", () => {
    const text = "Key takeaway: Always validate Fastify schema inputs.";
    const results = miner.extractCandidates(text);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("learning");
  });

  it("extracts decision from 'decided to' pattern", () => {
    const text = "We decided to use SQLite for local development.";
    const results = miner.extractCandidates(text);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("decision");
  });

  it("extracts decision from 'decision:' pattern", () => {
    const text = "Decision: We will adopt pnpm over npm.";
    const results = miner.extractCandidates(text);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("decision");
  });

  it("deduplicates identical candidates", () => {
    const text = "Key takeaway: Use strict mode in production.\n\nKey takeaway: Use strict mode in production.";
    const results = miner.extractCandidates(text);
    expect(results.length).toBe(1);
  });

  it("returns empty array for text with no patterns", () => {
    const text = "Just some random text without any mining patterns.";
    const results = miner.extractCandidates(text);
    expect(results).toHaveLength(0);
  });

  it("skips candidates shorter than threshold", () => {
    const text = "I learned that hi.";
    const results = miner.extractCandidates(text);
    expect(results).toHaveLength(0);
  });

  it("mineFromSession saves and returns count", async () => {
    const note = makeNote({
      id: "session-1",
      body: "I learned that TypeScript is great for type safety.",
    });
    const result = await miner.mineFromSession(note, "test-project");
    expect(result.saved).toBeGreaterThanOrEqual(1);
    expect(result.skipped).toBe(0);
  });

  it("mineFromSession skips existing knowledge", async () => {
    const memory: MemoryManager = {
      ...mockMemory,
      search: vi.fn().mockResolvedValue([
        { note: makeNote({ id: "existing" }), score: 10, matchType: "keyword" },
      ]),
    };
    const m = createMiningEngine(memory);
    const note = makeNote({
      id: "session-2",
      body: "I learned that TypeScript is great for strict mode.",
    });
    const result = await m.mineFromSession(note);
    expect(result.saved).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("llmExtract returns empty when no endpoint configured", async () => {
    const minerNoLLM = createMiningEngine(mockMemory);
    const result = await minerNoLLM.llmExtract("Some text");
    expect(result).toEqual([]);
  });
});
