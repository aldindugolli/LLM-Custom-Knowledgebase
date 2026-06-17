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
  ].join("\n");

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
    const vaultSection = memoryBlock
      ? `Relevant vault notes:\n${memoryBlock}`
      : "";

    let totalTokens = estimateTokens(basePrompt) + estimateTokens(vaultSection) + estimateTokens(sessionTag);
    let truncatedMemory = memoryBlock;

    while (totalTokens > maxTokens && truncatedMemory.length > 200) {
      truncatedMemory = truncatedMemory.slice(0, -100);
      const shortSection = truncatedMemory
        ? `Relevant vault notes:\n${truncatedMemory}`
        : "";
      totalTokens = estimateTokens(basePrompt) + estimateTokens(shortSection) + estimateTokens(sessionTag);
    }

    const finalVaultSection = truncatedMemory
      ? `Relevant vault notes:\n${truncatedMemory}`
      : "";

    const finalSys = [
      existingSys || basePrompt,
      finalVaultSection,
      sessionTag,
    ].filter(Boolean).join("\n\n");

    const filtered = messages.filter((m) => m.role !== "system");
    return [{ role: "system", content: finalSys }, ...filtered];
  }

  return { inject };
}

export type ContextInjector = ReturnType<typeof createContextInjector>;
