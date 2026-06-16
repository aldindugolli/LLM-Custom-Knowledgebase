import type { MemoryManager } from "../core/memory.js";
import type { Note } from "../types.js";

const LEARNING_PATTERNS = [
  { regex: /(?:learned|discovered|found|realized)\s+(that|:)\s+(.+)/gi, group: 2 },
  { regex: /(?:key|important)\s+(takeaway|insight|lesson):\s+(.+)/gi, group: 2 },
  { regex: /this\s+(shows|demonstrates|reveals|means)\s+(that\s+)?(.+)/gi, group: 3 },
  { regex: /(?:note|nb|nota\s+bene):\s+(.+)/gi, group: 1 },
  { regex: /(?:gotcha|gotchas?|pitfalls?|wtf|tricky):\s+(.+)/gi, group: 1 },
];

const DECISION_PATTERNS = [
  { regex: /(?:decided|chose|elected|opted)\s+(to|for|on)\s+(.+)/gi, group: 2 },
  { regex: /(?:decision|conclusion):\s+(.+)/gi, group: 1 },
  { regex: /we'?ll\s+(use|go with|implement)\s+(.+)/gi, group: 2 },
];

export function createMiningEngine(memory: MemoryManager) {
  function extractCandidates(text: string): { type: "learning" | "decision"; title: string; body: string }[] {
    const candidates: { type: "learning" | "decision"; title: string; body: string }[] = [];

    for (const pattern of LEARNING_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text)) !== null) {
        const content = match[pattern.group]?.trim();
        if (content && content.length > 20) {
          candidates.push({
            type: "learning",
            title: content.slice(0, 80).replace(/[.!?:].*$/, "").trim(),
            body: content,
          });
        }
      }
    }

    for (const pattern of DECISION_PATTERNS) {
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text)) !== null) {
        const content = match[pattern.group]?.trim();
        if (content && content.length > 15) {
          candidates.push({
            type: "decision",
            title: content.slice(0, 80).replace(/[.!?:].*$/, "").trim(),
            body: content,
          });
        }
      }
    }

    return deduplicate(candidates);
  }

  function deduplicate(candidates: { type: "learning" | "decision"; title: string; body: string }[]): { type: "learning" | "decision"; title: string; body: string }[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
      const key = c.body.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function mineFromSession(sessionNote: Note, project?: string): Promise<{ saved: number; skipped: number }> {
    const candidates = extractCandidates(sessionNote.body);
    let saved = 0;
    let skipped = 0;

    for (const c of candidates) {
      const existing = await memory.search({
        query: c.body.slice(0, 60),
        limit: 3,
      });
      const alreadyExists = existing.some(
        (r) => r.score > 5 || r.note.body.includes(c.body.slice(0, 80))
      );

      if (!alreadyExists) {
        await memory.save(c.type, c.title, c.body, {
          project: project || sessionNote.frontmatter.project || "general",
          tags: ["auto-mined", sessionNote.frontmatter.project || "general"].filter(Boolean),
          related: [sessionNote.id],
        });
        saved++;
      } else {
        skipped++;
      }
    }

    return { saved, skipped };
  }

  return { extractCandidates, mineFromSession };
}

export type MiningEngine = ReturnType<typeof createMiningEngine>;
