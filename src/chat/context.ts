import type { Vault } from "../core/vault.js";
import type { SearchEngine } from "../core/search.js";
import type { Note, ChatMessage } from "../types.js";

export interface ContextInjectorOptions {
  vault: Vault;
  search: SearchEngine;
  maxNotes?: number;
  maxTokens?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function createContextInjector(opts: ContextInjectorOptions) {
  async function inject(
    messages: ChatMessage[],
    sessionId?: string
  ): Promise<ChatMessage[]> {
    const userMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const existingSys = messages.find((m) => m.role === "system")?.content || "";

    const maxNotes = opts.maxNotes || 8;
    const maxTokens = opts.maxTokens || 4000;

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

    const memoryBlock = combined
      .map(
        (n, i) =>
          `[${n.type.toUpperCase()}] ${n.title}\n${(n.body || "").slice(0, 500)}`
      )
      .join("\n\n");

    const sessionTag = sessionId ? `\nActive Session: ${sessionId}` : "";
    const contextPrompt = [
      `You are Brainstorm, a coding agent with persistent memory.`,
      `You have access to a knowledge vault with the following relevant notes:`,
      ``,
      memoryBlock || "No relevant notes found in vault.",
      sessionTag,
      ``,
      `Answer the user's question using both your knowledge and the vault context above.`,
      `When you use information from a vault note, cite it as [TYPE: Title].`,
      `Ask clarifying questions if the context is insufficient.`,
    ].join("\n");

    const combinedSys = existingSys
      ? `${existingSys}\n\n${contextPrompt}`
      : contextPrompt;

    let totalTokens = estimateTokens(combinedSys);
    let truncatedMemory = memoryBlock;

    while (totalTokens > maxTokens && truncatedMemory.length > 200) {
      truncatedMemory = truncatedMemory.slice(0, -100);
      const shortened = [
        `You are Brainstorm, a coding agent with persistent memory.`,
        `You have access to a knowledge vault with the following relevant notes:`,
        ``,
        truncatedMemory || "No relevant notes found in vault.",
        sessionTag,
        ``,
        `Answer concisely. Cite sources as [TYPE: Title].`,
      ].join("\n");
      const newSys = existingSys ? `${existingSys}\n\n${shortened}` : shortened;
      totalTokens = estimateTokens(newSys);
    }

    const vaultSection = truncatedMemory
      ? `Relevant vault notes:\n${truncatedMemory}`
      : "";

    const finalSys = existingSys
      ? [existingSys, vaultSection, sessionTag].filter(Boolean).join("\n\n")
      : [
          `You are Brainstorm, a coding agent with persistent memory.`,
          vaultSection,
          sessionTag,
          `Answer the user's question. Cite relevant notes as [TYPE: Title].`,
        ]
          .filter(Boolean)
          .join("\n");

    const filtered = messages.filter((m) => m.role !== "system");
    return [{ role: "system", content: finalSys }, ...filtered];
  }

  return { inject };
}

export type ContextInjector = ReturnType<typeof createContextInjector>;
