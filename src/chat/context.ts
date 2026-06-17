import type { Vault } from "../core/vault.js";
import type { SearchEngine } from "../core/search.js";
import type { Note, ChatMessage } from "../types.js";

export interface ContextInjectorOptions {
  vault: Vault;
  search: SearchEngine;
  maxNotes?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function createContextInjector(opts: ContextInjectorOptions) {
  const basePrompt = opts.systemPrompt || [
    `You are Brainstorm, a coding agent with persistent memory.`,
    `You retain access to session history and a knowledge vault.`,
    `Use the provided context to answer questions and reference past learnings when relevant.`,
    ``,
    `When describing file or note content, report ONLY what is literally present in the text. Never invent, infer, or fabricate metadata about sessions, conversations, tools, or agent names. If the file does not mention sessions, conversations, or Brainstorm, do not claim it does.`,
  ].join("\n");

  async function inject(
    messages: ChatMessage[],
    sessionId?: string,
    opts2?: { skipVault?: boolean }
  ): Promise<ChatMessage[]> {
    const userMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const existingSys = messages.find((m) => m.role === "system")?.content || "";

    const maxNotes = opts.maxNotes || 8;
    const maxTokens = opts.maxTokens || 4000;

    let memoryBlock = "";
    if (!opts2?.skipVault) {
      const results = await opts.search.search(
        { query: userMsg, limit: maxNotes },
      );

      let relatedNotes: Note[] = [];
      if (sessionId) {
        const all = await opts.vault.readAllNotes();
        const sessionNote = all.find((n) => n.id === sessionId);
        if (sessionNote) {
          const related = await opts.search.findRelated(sessionNote.id, all);
          relatedNotes = related.slice(0, 5);
        }
      }

      const seenIds = new Set(results.map((r) => r.note.id));
      const combined = [
        ...results.map((r) => r.note),
        ...relatedNotes.filter((n) => !seenIds.has(n.id)),
      ].slice(0, maxNotes);

      memoryBlock = combined
        .map(
          (n, i) =>
            `[${n.type.toUpperCase()}] ${n.title}\n${(n.body || "").slice(0, 500)}`
        )
        .join("\n\n");

      while (estimateTokens(basePrompt) + estimateTokens(memoryBlock) > maxTokens && memoryBlock.length > 200) {
        memoryBlock = memoryBlock.slice(0, -100);
      }
    }

    const sessionTag = sessionId ? `\nActive Session: ${sessionId}` : "";
    const vaultSection = memoryBlock
      ? `Relevant vault notes:\n${memoryBlock}`
      : "";

    const finalSys = [
      existingSys || basePrompt,
      vaultSection,
      sessionTag,
    ].filter(Boolean).join("\n\n");

    const filtered = messages.filter((m) => m.role !== "system");
    return [{ role: "system", content: finalSys }, ...filtered];
  }

  return { inject };
}

export type ContextInjector = ReturnType<typeof createContextInjector>;
