import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "node:fs/promises";
import matter from "gray-matter";
import type { Note, NoteType, NoteFrontmatter, VaultConfig } from "../types.js";
import { indexTemplate } from "./templates.js";

const NOTE_DIRS: Record<NoteType, string> = {
  session: "sessions",
  learning: "learnings",
  decision: "decisions",
  concept: "concepts",
  project: "projects",
  reference: "references",
  task: "tasks/active",
  reflection: "reflections/weekly",
  entity: "entities",
  index: ".",
};

const CACHE_TTL = 5000;

export function createVault(cfg: VaultConfig) {
  const vaultPath = path.resolve(cfg.path);
  let cache: { timestamp: number; notes: Note[] } | null = null;
  let writeLock: Promise<unknown> = Promise.resolve();

  function invalidateCache() {
    cache = null;
  }

  async function ensureDirs(): Promise<void> {
    const dirs = new Set(Object.values(NOTE_DIRS));
    dirs.add(".obsidian");
    dirs.add("templates");
    dirs.add("tasks/completed");
    dirs.add("reflections/monthly");
    await Promise.all(
      Array.from(dirs).map((d) =>
        fs.mkdir(path.join(vaultPath, d), { recursive: true })
      )
    );
  }

  function notePath(type: NoteType, filename: string): string {
    const dir = NOTE_DIRS[type];
    return path.join(vaultPath, dir, filename.endsWith(".md") ? filename : `${filename}.md`);
  }

  function relativePath(absolute: string): string {
    return path.relative(vaultPath, absolute).replace(/\\/g, "/");
  }

  async function writeNote(type: NoteType, filename: string, content: string): Promise<string> {
    const fp = notePath(type, filename);
    const prev = writeLock;
    writeLock = (async () => {
      await prev;
      await fs.mkdir(path.dirname(fp), { recursive: true });
      await fs.writeFile(fp, content, "utf-8");
      invalidateCache();
      if (type !== "index") await rebuildIndex();
    })();
    await writeLock;
    return relativePath(fp);
  }

  async function readNote(filepath: string): Promise<Note | null> {
    const fp = path.resolve(vaultPath, filepath);
    try {
      const raw = await fs.readFile(fp, "utf-8");
      return parseNote(filepath, raw);
    } catch {
      return null;
    }
  }

  function parseNote(filepath: string, raw: string): Note {
    const parsed = matter(raw);
    const fm = (parsed.data || {}) as Partial<NoteFrontmatter>;
    const body = parsed.content.trim();
    const wikilinks = extractWikilinks(raw);
    return {
      id: fm.id || path.basename(filepath, ".md"),
      type: fm.type || "learning",
      title: fm.title || path.basename(filepath, ".md"),
      path: filepath.replace(/\\/g, "/"),
      frontmatter: fm as NoteFrontmatter,
      content: raw,
      body,
      created: fm.created ? new Date(fm.created) : new Date(),
      updated: fm.updated ? new Date(fm.updated) : new Date(),
      tags: fm.tags || [],
      related: fm.related || [],
      wikilinks,
      backlinks: [],
      wordCount: body.split(/\s+/).filter(Boolean).length,
    };
  }

  function extractWikilinks(content: string): string[] {
    const regex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
    const links: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const target = match[1].trim();
      if (target && !links.includes(target)) links.push(target);
    }
    return links;
  }

  async function listNotes(type?: NoteType): Promise<string[]> {
    const pattern = type
      ? path.join(vaultPath, NOTE_DIRS[type], "*.md")
      : path.join(vaultPath, "**/*.md");
    const files: string[] = [];
    for await (const f of glob(pattern)) {
      files.push(relativePath(f));
    }
    return files.sort();
  }

  async function readAllNotes(type?: NoteType): Promise<Note[]> {
    if (!type && cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return cache.notes;
    }
    const files = await listNotes(type);
    const notes: Note[] = [];
    for (const f of files) {
      const note = await readNote(f);
      if (note) notes.push(note);
    }
    if (!type) cache = { timestamp: Date.now(), notes };
    return notes;
  }

  async function deleteNote(filepath: string): Promise<boolean> {
    const fp = path.resolve(vaultPath, filepath);
    const prev = writeLock;
    writeLock = (async () => {
      await prev;
      await fs.unlink(fp);
      invalidateCache();
      await rebuildIndex();
    })();
    try { await writeLock; return true; } catch { return false; }
  }

  async function rebuildIndex(): Promise<void> {
    const all = await readAllNotes();
    const types: NoteType[] = ["session", "learning", "decision", "concept", "project", "reference", "entity", "task", "reflection"];
    const seenTitles = new Set<string>();
    const sections = types
      .map((t) => {
        const items = all
          .filter((n) => n.type === t)
          .sort((a, b) => b.updated.getTime() - a.updated.getTime())
          .filter((n) => {
            const key = `${n.title}|${n.path}`;
            if (seenTitles.has(key)) return false;
            seenTitles.add(key);
            return true;
          })
          .slice(0, 50)
          .map((n) => ({
            title: n.title,
            path: n.path,
            summary: n.body.slice(0, 100).replace(/\n/g, " "),
          }));
        return items.length > 0 ? { heading: `${t.charAt(0).toUpperCase() + t.slice(1)}s`, items } : null;
      })
      .filter(Boolean) as { heading: string; items: { title: string; path: string; summary: string }[] }[];
    const content = indexTemplate(sections);
    const fp = path.join(vaultPath, "index.md");
    await fs.writeFile(fp, content, "utf-8");
  }

  function buildLinkMap(allNotes: Note[]): Map<string, Note> {
    const map = new Map<string, Note>();
    for (const n of allNotes) {
      map.set(path.basename(n.path, ".md").toLowerCase(), n);
    }
    return map;
  }

  function buildWikilinkIndex(allNotes: Note[]): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();
    for (const n of allNotes) {
      const noteKey = path.basename(n.path, ".md").toLowerCase();
      for (const wl of n.wikilinks) {
        const key = wl.toLowerCase();
        if (!index.has(key)) index.set(key, new Set());
        index.get(key)!.add(noteKey);
      }
    }
    return index;
  }

  async function resolveAllWikilinks(allNotes: Note[]): Promise<Note[]> {
    const linkMap = buildLinkMap(allNotes);
    const reverseIndex = buildWikilinkIndex(allNotes);
    for (const n of allNotes) {
      const noteKey = path.basename(n.path, ".md").toLowerCase();
      const backlinkKeys = reverseIndex.get(noteKey);
      n.backlinks = backlinkKeys ? [...backlinkKeys].map((k) => linkMap.get(k)?.path || k) : [];
    }
    return allNotes;
  }

  async function resolveWikilinks(note: Note, allNotes: Note[]): Promise<Note> {
    const reverseIndex = buildWikilinkIndex(allNotes);
    const noteKey = path.basename(note.path, ".md").toLowerCase();
    const backlinkKeys = reverseIndex.get(noteKey);
    note.backlinks = backlinkKeys ? [...backlinkKeys] : [];
    return note;
  }

  async function getVaultPath(): Promise<string> {
    return vaultPath;
  }

  return {
    vaultPath,
    ensureDirs,
    writeNote,
    readNote,
    parseNote,
    extractWikilinks,
    listNotes,
    readAllNotes,
    deleteNote,
    resolveWikilinks,
    resolveAllWikilinks,
    getVaultPath,
    rebuildIndex,
  };
}

export type Vault = ReturnType<typeof createVault>;
