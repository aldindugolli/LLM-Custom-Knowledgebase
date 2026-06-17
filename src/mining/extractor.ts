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

export interface MiningOptions {
  ollamaEndpoint?: string;
}

export function createMiningEngine(memory: MemoryManager, opts?: MiningOptions) {
  function extractCandidates(text: string): { type: "learning" | "decision"; title: string; body: string }[] {
    const candidates: { type: "learning" | "decision"; title: string; body: string }[] = [];

    for (const pattern of LEARNING_PATTERNS) {
      for (const match of text.matchAll(pattern.regex)) {
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
      for (const match of text.matchAll(pattern.regex)) {
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

  async function llmExtract(text: string): Promise<{ type: "learning" | "decision"; title: string; body: string }[]> {
    if (!opts?.ollamaEndpoint) return [];

    const prompt = `Extract key learnings and decisions from this session transcript. Return a JSON array of objects with "type" ("learning" or "decision"), "title" (short title), and "body" (the relevant text). If nothing to extract, return [].

Transcript:
${text.slice(0, 4000)}`;

    try {
      const res = await fetch(`${opts.ollamaEndpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          messages: [
            { role: "system", content: "You extract structured knowledge from chat transcripts. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return [];

      const data: any = await res.json();
      const content = data.message?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((c: any) => c.type && c.title && c.body && c.body.length > 20)
        .map((c: any) => ({
          type: c.type === "decision" ? "decision" as const : "learning" as const,
          title: c.title.slice(0, 80),
          body: c.body.trim(),
        }));
    } catch (e) {
      console.error("[Mining] LLM extraction failed:", e);
      return [];
    }
  }

  async function mineFromSession(sessionNote: Note, project?: string): Promise<{ saved: number; skipped: number }> {
    const body = sessionNote.body;
    let candidates = extractCandidates(body);

    const MIN_REGEX_THRESHOLD = 2;
    if (candidates.length < MIN_REGEX_THRESHOLD && opts?.ollamaEndpoint) {
      const llmCandidates = await llmExtract(body);
      if (llmCandidates.length > 0) {
        console.log(`[Mining] LLM extraction found ${llmCandidates.length} candidates (regex found ${candidates.length})`);
        candidates = deduplicate([...candidates, ...llmCandidates]);
      }
    }

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

  return { extractCandidates, mineFromSession, llmExtract };
}

export type MiningEngine = ReturnType<typeof createMiningEngine>;
