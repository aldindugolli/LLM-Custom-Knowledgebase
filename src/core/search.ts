import { createVault, type Vault } from "./vault.js";
import type { Note, MemoryQuery, MemoryResult } from "../types.js";

export function createSearchEngine(vault: Vault) {
  async function keywordSearch(query: string, notes: Note[]): Promise<MemoryResult[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: MemoryResult[] = [];

    for (const note of notes) {
      let score = 0;
      let matchType: MemoryResult["matchType"] = "keyword";

      const searchText = [note.title, note.body, ...note.tags, ...note.related].join(" ").toLowerCase();

      for (const term of terms) {
        if (searchText.includes(term)) {
          score += 1;
        }
        const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");
        const matches = searchText.match(regex);
        if (matches) score += matches.length * 0.5;
      }

      const titleText = note.title.toLowerCase();
      const exactTitle = titleText === query.toLowerCase();
      if (exactTitle) {
        score += 10;
        matchType = "exact";
      }

      const tagMatch = note.tags.some((t) => terms.includes(t.toLowerCase()));
      if (tagMatch) {
        score += 3;
        matchType = "tag";
      }

      if (score > 0) {
        results.push({ note, score, matchType });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function search(query: MemoryQuery, allNotes?: Note[]): Promise<MemoryResult[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();

    let filtered = allNotes;

    if (query.type) {
      filtered = filtered.filter((n) => n.type === query.type);
    }
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter((n) =>
        query.tags!.some((t) => n.tags.includes(t))
      );
    }
    if (query.project) {
      const proj = query.project.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.frontmatter.project?.toLowerCase() === proj ||
          n.tags.some((t) => t.toLowerCase() === proj)
      );
    }

    let results = await keywordSearch(query.query, filtered);

    const limit = query.limit || 20;
    const offset = query.offset || 0;
    return results.slice(offset, offset + limit);
  }

  async function findRelated(noteId: string, allNotes?: Note[]): Promise<Note[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();
    const note = allNotes.find((n) => n.id === noteId);
    if (!note) return [];

    const relatedIds = new Set<string>();

    for (const wl of note.wikilinks) {
      const found = allNotes.find((n) => {
        const base = n.path.replace(/\.md$/, "").split("/").pop();
        return base === wl;
      });
      if (found) relatedIds.add(found.id);
    }

    for (const r of note.related) {
      const found = allNotes.find((n) => n.id === r || n.title === r);
      if (found) relatedIds.add(found.id);
    }

    for (const n of allNotes) {
      if (n.wikilinks.some((wl) => wl === note.title || wl === note.id)) {
        relatedIds.add(n.id);
      }
      if (n.related.includes(note.id) || n.related.includes(note.title)) {
        relatedIds.add(n.id);
      }
    }

    return allNotes
      .filter((n) => relatedIds.has(n.id))
      .sort((a, b) => b.wordCount - a.wordCount);
  }

  return { keywordSearch, search, findRelated };
}

export type SearchEngine = ReturnType<typeof createSearchEngine>;
