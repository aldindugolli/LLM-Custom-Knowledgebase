import type { Vault } from "./vault.js";
import type { SearchEngine } from "./search.js";
import type { MemoryManager } from "./memory.js";
import type { SessionContext, SessionEndInput, Note } from "../types.js";
import { v4 as uuid } from "uuid";
import { sessionTemplate } from "./templates.js";
import matter from "gray-matter";

export function createSessionManager(vault: Vault, search: SearchEngine, memory: MemoryManager) {
  const activeSessions = new Map<string, SessionContext>();

  async function start(project: string, goal?: string): Promise<SessionContext> {
    const sessionId = uuid();
    const allNotes = await vault.readAllNotes();

    const projectNote = allNotes.find(
      (n) =>
        n.type === "project" &&
        (n.title.toLowerCase() === project.toLowerCase() ||
          n.frontmatter.project?.toLowerCase() === project.toLowerCase())
    );

    const recentSessions = allNotes
      .filter((n) => n.type === "session" && (n.frontmatter.project === project || n.tags.includes(project)))
      .sort((a, b) => b.created.getTime() - a.created.getTime())
      .slice(0, 5);

    const openDecisions = allNotes
      .filter((n) => n.type === "decision" && n.frontmatter.status === "active")
      .sort((a, b) => b.updated.getTime() - a.updated.getTime())
      .slice(0, 10);

    const relevantResults = await search.search({
      query: project,
      limit: 10,
    });

    const context: SessionContext = {
      sessionId,
      project,
      startTime: new Date().toISOString(),
      relevantNotes: relevantResults.map((r) => r.note),
      recentSessions,
      openDecisions,
      projectBrief: projectNote || null,
    };

    activeSessions.set(sessionId, context);

    const title = `${project} — ${new Date().toISOString().split("T")[0]}`;
    const sessionContent = sessionTemplate(title, project, goal ? `## Goal\n\n${goal}` : undefined);
    const parsed = matter(sessionContent);
    parsed.data.id = sessionId;
    await vault.writeNote("session", `${sessionId}.md`, matter.stringify(parsed.content, parsed.data));

    return context;
  }

  async function end(input: SessionEndInput): Promise<Note | null> {
    const allNotes = await vault.readAllNotes();
    const sessionNote = allNotes.find((n) => n.id === input.sessionId);
    if (!sessionNote) return null;

    const parsed = matter(sessionNote.content);
    parsed.data.status = "completed";
    parsed.data.updated = new Date().toISOString();
    if (input.duration) parsed.data.duration = input.duration;
    if (input.toolCalls) parsed.data.toolCalls = input.toolCalls;

    const summaryBody = [
      parsed.content,
      "---",
      "## Summary",
      input.summary,
      input.learnings.length > 0 ? "\n## Learnings\n" + input.learnings.map((l) => `- ${l}`).join("\n") : "",
      input.decisions.length > 0 ? "\n## Decisions\n" + input.decisions.map((d) => `- ${d}`).join("\n") : "",
      "\n---",
      `_Session ended: ${new Date().toISOString()}_`,
    ]
      .filter(Boolean)
      .join("\n");

    const newContent = matter.stringify(summaryBody, parsed.data);
    const filename = sessionNote.path.split("/").pop() || `${input.sessionId}.md`;
    await vault.writeNote("session", filename, newContent);

    activeSessions.delete(input.sessionId);
    return await vault.readNote(sessionNote.path);
  }

  async function appendChatExchange(
    sessionId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    const allNotes = await vault.readAllNotes();
    const note = allNotes.find((n) => n.id === sessionId);
    if (!note) return;

    const parsed = matter(note.content);
    const time = new Date().toLocaleTimeString();

    const exchangeBlock = [
      "",
      `### ${time} — Exchange`,
      "",
      `**You:**`,
      "",
      userMessage,
      "",
      `**Arrodes:**`,
      "",
      assistantMessage,
    ].join("\n");

    const newContent = matter.stringify(parsed.content + "\n" + exchangeBlock, parsed.data);
    const filename = note.path.split("/").pop() || `${sessionId}.md`;
    await vault.writeNote("session", filename, newContent);
  }

  function getActiveSession(sessionId: string): SessionContext | undefined {
    return activeSessions.get(sessionId);
  }

  function listActiveSessions(): SessionContext[] {
    return Array.from(activeSessions.values());
  }

  return { start, end, appendChatExchange, getActiveSession, listActiveSessions };
}

export type SessionManager = ReturnType<typeof createSessionManager>;
