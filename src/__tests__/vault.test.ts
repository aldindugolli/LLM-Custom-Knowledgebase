import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createVault } from "../core/vault.js";

describe("Vault", () => {
  let tmpDir: string;
  let vault: ReturnType<typeof createVault>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-test-"));
    vault = createVault({ path: tmpDir, port: 0, host: "127.0.0.1" });
    await vault.ensureDirs();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads a note", async () => {
    const rp = await vault.writeNote("learning", "test-note.md", "---\ntitle: Test Note\ntype: learning\n---\nHello world");
    expect(rp).toContain("learnings/test-note.md");
    const note = await vault.readNote(rp);
    expect(note).not.toBeNull();
    expect(note!.title).toBe("Test Note");
    expect(note!.body).toBe("Hello world");
    expect(note!.type).toBe("learning");
  });

  it("lists notes by type", async () => {
    await vault.writeNote("learning", "a.md", "---\ntitle: A\ntype: learning\n---\nContent A");
    await vault.writeNote("decision", "b.md", "---\ntitle: B\ntype: decision\n---\nContent B");
    const learnings = await vault.listNotes("learning");
    expect(learnings).toHaveLength(1);
    expect(learnings[0]).toContain("a.md");
    const decisions = await vault.listNotes("decision");
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toContain("b.md");
  });

  it("reads all notes including index", async () => {
    await vault.writeNote("learning", "a.md", "---\ntitle: A\ntype: learning\n---\nBody A");
    await vault.writeNote("session", "b.md", "---\ntitle: B\ntype: session\n---\nBody B");
    const all = await vault.readAllNotes();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.filter((n: any) => n.id !== "vault-index").length).toBe(2);
  });

  it("caches readAllNotes across repeated calls", async () => {
    await vault.writeNote("learning", "a.md", "---\ntitle: A\ntype: learning\n---\nBody");
    await vault.writeNote("learning", "b.md", "---\ntitle: B\ntype: learning\n---\nBody");
    const first = await vault.readAllNotes();
    const second = await vault.readAllNotes();
    expect(second).toBe(first);
    expect(second.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes a note", async () => {
    const rp = await vault.writeNote("concept", "del.md", "---\ntitle: Del\ntype: concept\n---\nBody");
    expect(await vault.deleteNote(rp)).toBe(true);
    const note = await vault.readNote(rp);
    expect(note).toBeNull();
  });

  it("extracts wikilinks from content", async () => {
    const links = vault.extractWikilinks("See [[Other Note]] and [[Target|alias]] and [[Page#section]]");
    expect(links).toEqual(["Other Note", "Target", "Page"]);
  });

  it("parses a note with frontmatter", async () => {
    const raw = "---\ntitle: My Title\ntype: decision\ntags: [foo, bar]\nproject: test\n---\n\nBody text here";
    const note = vault.parseNote("decisions/my-title.md", raw);
    expect(note.title).toBe("My Title");
    expect(note.type).toBe("decision");
    expect(note.tags).toEqual(["foo", "bar"]);
    expect(note.frontmatter.project).toBe("test");
    expect(note.body).toBe("Body text here");
  });

  it("rebuilds index.md on write", async () => {
    await vault.writeNote("learning", "l1.md", "---\ntitle: L1\ntype: learning\n---\nContent");
    const index = await vault.readNote("index.md");
    expect(index).not.toBeNull();
    expect(index!.content).toContain("[[l1]]");
  });

  it("resolves all wikilinks in O(n)", async () => {
    await vault.writeNote("concept", "source.md", "---\ntitle: Source\ntype: concept\n---\nSee [[Target]]");
    await vault.writeNote("concept", "target.md", "---\ntitle: Target\ntype: concept\n---\nTarget content");
    await vault.writeNote("concept", "other.md", "---\ntitle: Other\ntype: concept\n---\nSee [[Source]]");
    const all = await vault.readAllNotes();
    const resolved = await vault.resolveAllWikilinks(all);
    const source = resolved.find((n: any) => n.title === "Source")!;
    expect(source.backlinks).toContain("concepts/other.md");
    const target = resolved.find((n: any) => n.title === "Target")!;
    expect(target.backlinks).toContain("concepts/source.md");
  });

  it("gets vault path", async () => {
    const vp = await vault.getVaultPath();
    expect(vp).toBe(tmpDir);
  });
});
