import type { Vault } from "./vault.js";
import type { Note } from "../types.js";

export interface LinkSuggestion {
  source: Note;
  target: Note;
  reason: string;
  confidence: "high" | "medium" | "low";
}

const LINK_KEYWORDS: Record<string, string[]> = {
  concept: ["is a", "is like", "similar to", "related to", "built on", "extends", "derives from"],
  decision: ["decided to", "chose", "opted for", "because"],
  reference: ["see also", "as described in", "per"],
};

export function createLinkSuggester(vault: Vault) {
  async function suggestLinks(allNotes?: Note[]): Promise<LinkSuggestion[]> {
    if (!allNotes) allNotes = await vault.readAllNotes();
    const suggestions: LinkSuggestion[] = [];

    for (const note of allNotes) {
      for (const candidate of allNotes) {
        if (note.id === candidate.id) continue;
        if (note.wikilinks.some((wl) => {
          const base = candidate.path.replace(/\.md$/, "").split("/").pop();
          return wl === base;
        })) continue;
        if (note.related.includes(candidate.id)) continue;

        const sharedTags = note.tags.filter((t) => candidate.tags.includes(t));
        if (sharedTags.length >= 2) {
          suggestions.push({
            source: note,
            target: candidate,
            reason: `Share tags: ${sharedTags.slice(0, 3).join(", ")}`,
            confidence: "medium",
          });
        }

        const bodyLower = note.body.toLowerCase();
        const targetTitle = candidate.title.toLowerCase();
        if (bodyLower.includes(targetTitle) && targetTitle.length > 3) {
          suggestions.push({
            source: note,
            target: candidate,
            reason: `Note body mentions "${candidate.title}"`,
            confidence: "high",
          });
        }

        for (const [type, keywords] of Object.entries(LINK_KEYWORDS)) {
          for (const kw of keywords) {
            if (note.type === type && bodyLower.includes(`${kw} ${targetTitle}`)) {
              suggestions.push({
                source: note,
                target: candidate,
                reason: `"${kw} ${candidate.title}" pattern match`,
                confidence: "high",
              });
            }
          }
        }
      }
    }

    const sorted = suggestions.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return rank[b.confidence] - rank[a.confidence];
    });

    const seen = new Set<string>();
    return sorted.filter((s) => {
      const key = `${s.source.id}->${s.target.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return { suggestLinks };
}

export type LinkSuggester = ReturnType<typeof createLinkSuggester>;
