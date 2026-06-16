import type { Vault } from "./vault.js";
import type { SearchEngine } from "./search.js";
import type { Note } from "../types.js";
import { sessionTemplate, learningTemplate, decisionTemplate } from "./templates.js";
import matter from "gray-matter";
import { v4 as uuid } from "uuid";

export interface SynthesisReport {
  sessionId: string;
  project: string;
  duration: number | null;
  learningsExtracted: { title: string; body: string }[];
  decisionsExtracted: { title: string; body: string }[];
  newWikilinks: { source: string; target: string }[];
  contradictions: { existingNote: string; newStatement: string; reason: string }[];
  noteIdsCreated: string[];
}

export function createSynthesisEngine(vault: Vault, search: SearchEngine) {
  async function synthesize(
    sessionNote: Note,
    summary: string,
    explicitLearnings: string[],
    explicitDecisions: string[]
  ): Promise<SynthesisReport> {
    const allNotes = await vault.readAllNotes();
    const project = sessionNote.frontmatter.project || "general";
    const noteIdsCreated: string[] = [];

    const extractedLearnings = extractFromSummary(explicitLearnings);
    const extractedDecisions = extractFromSummary(explicitDecisions);

    const newWikilinks: { source: string; target: string }[] = [];
    const contradictions: SynthesisReport["contradictions"] = [];

    for (const l of extractedLearnings) {
      const similar = await search.search({ query: l.body.slice(0, 100), limit: 3 }, allNotes);
      const conflict = similar.find(
        (r) => r.score > 3 && isContradictory(l.body, r.note.body)
      );
      if (conflict) {
        contradictions.push({
          existingNote: conflict.note.title,
          newStatement: l.body.slice(0, 120),
          reason: "Similar topic but potentially contradictory content",
        });
        continue;
      }

      const exists = similar.some(
        (r) => r.score > 5 || r.note.body.includes(l.body.slice(0, 60))
      );
      if (!exists) {
        const slug = l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        const id = uuid();
        const content = learningTemplate(l.title, project, l.body, [project, "auto-mined"]);
        const parsed = matter(content);
        parsed.data.id = id;
        parsed.data.related = [sessionNote.id];
        const filename = `${slug}_${id.slice(0, 8)}.md`;
        const fp = await vault.writeNote("learning", filename, matter.stringify(parsed.content, parsed.data));
        noteIdsCreated.push(id);

        const created = await vault.readNote(fp);
        if (created) {
          for (const wl of created.wikilinks) {
            const target = allNotes.find((n) => {
              const base = n.path.replace(/\.md$/, "").split("/").pop();
              return base === wl;
            });
            if (target) {
              newWikilinks.push({ source: id, target: target.id });
            }
          }
        }
      }
    }

    for (const d of extractedDecisions) {
      const similar = await search.search({ query: d.body.slice(0, 100), limit: 3 }, allNotes);
      const exists = similar.some((r) => r.score > 5);

      if (!exists) {
        const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        const id = uuid();
        const content = decisionTemplate(d.title, project, "", d.body);
        const parsed = matter(content);
        parsed.data.id = id;
        parsed.data.related = [sessionNote.id];
        const filename = `${slug}_${id.slice(0, 8)}.md`;
        await vault.writeNote("decision", filename, matter.stringify(parsed.content, parsed.data));
        noteIdsCreated.push(id);
      }
    }

    return {
      sessionId: sessionNote.id,
      project,
      duration: (sessionNote.frontmatter as any).duration || null,
      learningsExtracted: extractedLearnings,
      decisionsExtracted: extractedDecisions,
      newWikilinks,
      contradictions,
      noteIdsCreated,
    };
  }

  function extractFromSummary(items: string[]): { title: string; body: string }[] {
    return items
      .filter((item) => item.trim().length > 15)
      .map((item) => ({
        title: item.slice(0, 80).replace(/[.!?:].*$/, "").trim(),
        body: item.trim(),
      }));
  }

  function isContradictory(newText: string, existingText: string): boolean {
    const newLower = newText.toLowerCase();
    const existingLower = existingText.toLowerCase();
    const negationWords = ["not", "don't", "doesn't", "shouldn't", "won't", "cannot", "never", "avoid"];

    const newHasNegation = negationWords.some((w) => newLower.includes(w));
    const existingHasNegation = negationWords.some((w) => existingLower.includes(w));

    const sharedNouns = extractNouns(newLower).filter((n) => extractNouns(existingLower).includes(n));

    if (sharedNouns.length >= 2 && newHasNegation !== existingHasNegation) {
      return true;
    }

    return false;
  }

  function extractNouns(text: string): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 4);
    const stopWords = new Set([
      "about", "above", "after", "again", "being", "below", "between", "could",
      "every", "first", "going", "great", "having", "might", "more", "most",
      "much", "must", "never", "only", "other", "over", "same", "shall",
      "should", "some", "still", "such", "than", "that", "their", "them",
      "then", "there", "these", "they", "this", "those", "through", "under",
      "until", "using", "very", "were", "what", "when", "where", "which",
      "while", "whom", "with", "would", "your",
    ]);
    return words.filter((w) => !stopWords.has(w) && w.length > 3);
  }

  return { synthesize };
}

export type SynthesisEngine = ReturnType<typeof createSynthesisEngine>;
