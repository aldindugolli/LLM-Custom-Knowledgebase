import { describe, it, expect } from "vitest";
import { createDedupEngine } from "../core/dedup.js";
import type { DuplicateGroup } from "../core/dedup.js";
import { createVault } from "../core/vault.js";
import { createSearchEngine } from "../core/search.js";
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

describe("DedupEngine", () => {
  const vault = createVault({ path: "./test-vault", port: 0, host: "127.0.0.1" });
  const search = createSearchEngine(vault);
  const dedup = createDedupEngine(vault, search);

  describe("suggestMerge", () => {
    it("merges content from primary and duplicates", async () => {
      const group: DuplicateGroup = {
        primary: makeNote({ id: "1", title: "Topic", body: "Primary content" }),
        duplicates: [
          makeNote({ id: "2", title: "Topic 2", body: "Duplicate content" }),
        ],
        similarity: 0.8,
      };
      const merged = await dedup.suggestMerge(group);
      expect(merged.mergedContent).toContain("Primary content");
      expect(merged.mergedContent).toContain("Duplicate content");
    });

    it("deduplicates tags across notes", async () => {
      const group: DuplicateGroup = {
        primary: makeNote({ id: "1", tags: ["a", "b"] }),
        duplicates: [
          makeNote({ id: "2", tags: ["b", "c"] }),
        ],
        similarity: 0.8,
      };
      const merged = await dedup.suggestMerge(group);
      expect(merged.mergedTags).toEqual(["a", "b", "c"]);
    });

    it("deduplicates related notes", async () => {
      const group: DuplicateGroup = {
        primary: makeNote({ id: "1", related: ["note-a"] }),
        duplicates: [
          makeNote({ id: "2", related: ["note-b"] }),
        ],
        similarity: 0.8,
      };
      const merged = await dedup.suggestMerge(group);
      expect(merged.mergedRelated).toContain("note-a");
      expect(merged.mergedRelated).toContain("note-b");
    });

    it("includes duplicate IDs in merged related", async () => {
      const group: DuplicateGroup = {
        primary: makeNote({ id: "1" }),
        duplicates: [
          makeNote({ id: "dup-1" }),
        ],
        similarity: 0.8,
      };
      const merged = await dedup.suggestMerge(group);
      expect(merged.mergedRelated).toContain("dup-1");
    });
  });
});
