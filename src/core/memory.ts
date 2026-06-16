import type { Vault } from "./vault.js";
import type { SearchEngine } from "./search.js";
import type { Note, NoteType, MemoryQuery, MemoryResult } from "../types.js";
import { v4 as uuid } from "uuid";
import { learningTemplate, decisionTemplate, conceptTemplate, referenceTemplate } from "./templates.js";
import matter from "gray-matter";

export function createMemoryManager(vault: Vault, search: SearchEngine) {
  async function save(
    type: "learning" | "decision" | "concept" | "reference",
    title: string,
    body: string,
    options?: {
      project?: string;
      tags?: string[];
      related?: string[];
      importance?: 1 | 2 | 3 | 4 | 5;
      source?: string;
    }
  ): Promise<Note> {
    const id = uuid();
    let content: string;

    switch (type) {
      case "learning":
        content = learningTemplate(title, options?.project || "general", body, options?.tags);
        break;
      case "decision":
        content = decisionTemplate(title, options?.project || "general", body, "", options?.related);
        break;
      case "concept":
        content = conceptTemplate(title, body, options?.related);
        break;
      case "reference":
        content = referenceTemplate(title, options?.source || "", body);
        break;
    }

    const parsed = matter(content);
    parsed.data.id = id;
    if (options?.importance) parsed.data.importance = options.importance;
    if (options?.related) {
      const existing = parsed.data.related || [];
      parsed.data.related = [...new Set([...existing, ...options.related])];
    }
    content = matter.stringify(parsed.content, parsed.data);

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    const filename = `${slug}_${id.slice(0, 8)}.md`;

    const filepath = await vault.writeNote(type, filename, content);
    await vault.readAllNotes();
    return (await vault.readNote(filepath))!;
  }

  async function read(idOrTitle: string): Promise<Note | null> {
    const all = await vault.readAllNotes();
    return all.find((n) => n.id === idOrTitle || n.title.toLowerCase() === idOrTitle.toLowerCase()) || null;
  }

  async function update(
    id: string,
    updates: { title?: string; body?: string; tags?: string[]; related?: string[]; importance?: number }
  ): Promise<Note | null> {
    const all = await vault.readAllNotes();
    const note = all.find((n) => n.id === id);
    if (!note) return null;

    const parsed = matter(note.content);
    if (updates.title) parsed.data.title = updates.title;
    if (updates.tags) parsed.data.tags = updates.tags;
    if (updates.related) parsed.data.related = updates.related;
    if (updates.importance) parsed.data.importance = updates.importance;
    parsed.data.updated = new Date().toISOString();

    const newBody = updates.body || parsed.content;
    const newContent = matter.stringify(newBody, parsed.data);

    const filename = note.path.split("/").pop() || `${id}.md`;
    await vault.writeNote(note.type, filename, newContent);
    return await vault.readNote(note.path);
  }

  async function remove(id: string): Promise<boolean> {
    const all = await vault.readAllNotes();
    const note = all.find((n) => n.id === id);
    if (!note) return false;
    return vault.deleteNote(note.path);
  }

  async function searchMem(query: MemoryQuery): Promise<MemoryResult[]> {
    return search.search(query);
  }

  async function listByType(type: NoteType, project?: string): Promise<Note[]> {
    const all = await vault.readAllNotes();
    let filtered = all.filter((n) => n.type === type);
    if (project) {
      filtered = filtered.filter(
        (n) =>
          n.frontmatter.project?.toLowerCase() === project.toLowerCase() ||
          n.tags.some((t) => t.toLowerCase() === project.toLowerCase())
      );
    }
    return filtered.sort((a, b) => b.updated.getTime() - a.updated.getTime());
  }

  return { save, read, update, remove, search: searchMem, listByType };
}

export type MemoryManager = ReturnType<typeof createMemoryManager>;
