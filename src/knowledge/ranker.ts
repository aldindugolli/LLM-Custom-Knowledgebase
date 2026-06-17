import type { Note } from "../types.js";
import { calculateImportance } from "./scorer.js";

export interface RankedNote {
  note: Note;
  score: number;
  factors: ReturnType<typeof calculateImportance>["factors"];
}

export function rankNotes(notes: Note[], query?: string): RankedNote[] {
  const scored = notes.map((note) => {
    const { score, factors } = calculateImportance(note, notes);

    let queryBoost = 0;
    if (query) {
      const lc = query.toLowerCase();
      const inTitle = note.title.toLowerCase().includes(lc) ? 0.2 : 0;
      const inBody = note.body.toLowerCase().includes(lc) ? 0.1 : 0;
      const inTags = note.tags.some((t) => t.toLowerCase().includes(lc)) ? 0.1 : 0;
      queryBoost = inTitle + inBody + inTags;
    }

    return { note, score: score + queryBoost, factors };
  });

  return scored.sort((a, b) => b.score - a.score);
}
