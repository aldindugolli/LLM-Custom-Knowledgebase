import type { Vault } from "./vault.js";
import type { SearchEngine } from "./search.js";
import type { Note } from "../types.js";

export interface DuplicateGroup {
  primary: Note;
  duplicates: Note[];
  similarity: number;
}

export function createDedupEngine(vault: Vault, search: SearchEngine) {
  async function findDuplicates(threshold: number = 0.7): Promise<DuplicateGroup[]> {
    const allNotes = await vault.readAllNotes();
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (const note of allNotes) {
      if (processed.has(note.id)) continue;

      const results = await search.search({ query: note.title, limit: 10 }, allNotes);
      const candidates = results
        .filter((r) => r.note.id !== note.id && !processed.has(r.note.id))
        .filter((r) => r.score >= 4);

      if (candidates.length > 0) {
        const group: DuplicateGroup = {
          primary: note,
          duplicates: candidates.map((c) => c.note),
          similarity: candidates[0].score / 10,
        };
        groups.push(group);
        candidates.forEach((c) => processed.add(c.note.id));
      }

      processed.add(note.id);
    }

    return groups;
  }

  async function suggestMerge(group: DuplicateGroup): Promise<{ mergedContent: string; mergedTags: string[]; mergedRelated: string[] }> {
    const allBodies = [group.primary.body, ...group.duplicates.map((d) => d.body)];
    const mergedContent = allBodies
      .filter((b) => b.trim().length > 0)
      .join("\n\n---\n\n");

    const mergedTags = [
      ...new Set([
        ...group.primary.tags,
        ...group.duplicates.flatMap((d) => d.tags),
      ]),
    ];

    const mergedRelated = [
      ...new Set([
        ...group.primary.related,
        ...group.duplicates.flatMap((d) => d.related),
        ...group.duplicates.map((d) => d.id),
      ]),
    ];

    return { mergedContent, mergedTags, mergedRelated };
  }

  return { findDuplicates, suggestMerge };
}

export type DedupEngine = ReturnType<typeof createDedupEngine>;
