import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createSessionManager } from "../core/session.js";
import { createVault } from "../core/vault.js";
import { createSearchEngine } from "../core/search.js";
import { createMemoryManager } from "../core/memory.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Note } from "../types.js";

describe("SessionManager", () => {
  let tmpDir: string;
  let vault: ReturnType<typeof createVault>;
  let search: ReturnType<typeof createSearchEngine>;
  let memory: ReturnType<typeof createMemoryManager>;
  let sessions: ReturnType<typeof createSessionManager>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-test-"));
    vault = createVault({ path: tmpDir, port: 0, host: "127.0.0.1" });
    await vault.ensureDirs();
    search = createSearchEngine(vault);
    memory = createMemoryManager(vault, search);
    sessions = createSessionManager(vault, search, memory);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("starts a session and creates a note", async () => {
    const ctx = await sessions.start("test-project", "test goal");
    expect(ctx.sessionId).toBeTruthy();
    expect(ctx.project).toBe("test-project");
    expect(ctx.relevantNotes).toBeDefined();

    const allNotes = await vault.readAllNotes();
    const sessionNote = allNotes.find((n) => n.id === ctx.sessionId);
    expect(sessionNote).not.toBeNull();
    expect(sessionNote!.title).toContain("test-project");
  });

  it("tracks active sessions", async () => {
    const ctx = await sessions.start("project-a");
    const active = sessions.listActiveSessions();
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.some((s) => s.sessionId === ctx.sessionId)).toBe(true);
  });

  it("getActiveSession returns session context", async () => {
    const ctx = await sessions.start("project-b");
    const found = sessions.getActiveSession(ctx.sessionId);
    expect(found).toBeDefined();
    expect(found!.project).toBe("project-b");
  });

  it("ends a session and marks it completed", async () => {
    const ctx = await sessions.start("project-c");
    const result = await sessions.end({
      sessionId: ctx.sessionId,
      summary: "Completed work on project-c",
      learnings: ["Learned about sessions"],
      decisions: ["Use session manager"],
    });

    expect(result).not.toBeNull();
    expect(result!.frontmatter.status).toBe("completed");

    const active = sessions.listActiveSessions();
    expect(active.some((s) => s.sessionId === ctx.sessionId)).toBe(false);
  });

  it("end returns null for unknown session", async () => {
    const result = await sessions.end({
      sessionId: "nonexistent",
      summary: "test",
      learnings: [],
      decisions: [],
    });
    expect(result).toBeNull();
  });

  it("appends chat exchanges to session note", async () => {
    const ctx = await sessions.start("project-d");
    await sessions.appendChatExchange(ctx.sessionId, "User message", "Assistant response");

    const allNotes = await vault.readAllNotes();
    const note = allNotes.find((n) => n.id === ctx.sessionId);
    expect(note).not.toBeNull();
    expect(note!.body).toContain("User message");
    expect(note!.body).toContain("Assistant response");
  });

  it("finds project brief when it exists", async () => {
    await vault.writeNote("project", "my-project.md", "---\ntitle: my-project\ntype: project\n---\nProject description");
    const ctx = await sessions.start("my-project");
    expect(ctx.projectBrief).not.toBeNull();
    expect(ctx.projectBrief!.title).toBe("my-project");
  });
});
