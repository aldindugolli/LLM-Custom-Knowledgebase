import type { Vault } from "../core/vault.js";
import type { KnowledgeGraphEngine } from "../core/graph.js";
import type { HealthReport, NoteType } from "../types.js";

export function createHealthChecker(vault: Vault, graph: KnowledgeGraphEngine) {
  async function generateReport(): Promise<HealthReport> {
    const allNotes = await vault.readAllNotes();
    const orphans = await graph.findOrphans(allNotes);
    const brokenLinks = await graph.findBrokenLinks(allNotes);

    const now = Date.now();
    const dayMs = 86400000;
    const stalePages = allNotes
      .filter((n) => {
        const age = now - n.updated.getTime();
        return age > dayMs * 90 && n.type !== "session" && n.type !== "index";
      })
      .map((n) => ({
        path: n.path,
        title: n.title,
        daysSinceUpdate: Math.floor((now - n.updated.getTime()) / dayMs),
      }))
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    const byType: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    const missingMetadata: { path: string; missing: string[] }[] = [];

    for (const note of allNotes) {
      byType[note.type] = (byType[note.type] || 0) + 1;
      for (const tag of note.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      const missing: string[] = [];
      if (!note.frontmatter.title) missing.push("title");
      if (!note.frontmatter.type) missing.push("type");
      if (!note.frontmatter.created) missing.push("created");
      if (!note.id) missing.push("id");
      if (missing.length > 0) missingMetadata.push({ path: note.path, missing });
    }

    const totalBacklinks = allNotes.reduce((sum, n) => sum + n.backlinks.length, 0);
    const totalWords = allNotes.reduce((sum, n) => sum + n.wordCount, 0);

    return {
      timestamp: new Date().toISOString(),
      totalNotes: allNotes.length,
      totalWikilinks: allNotes.reduce((sum, n) => sum + n.wikilinks.length, 0),
      orphans: orphans.map((n) => ({ path: n.path, title: n.title })),
      brokenLinks: brokenLinks.map((b) => ({ source: b.sourcePath, target: b.target })),
      stalePages,
      missingMetadata,
      stats: {
        byType: byType as Record<NoteType, number>,
        byTag,
        totalBacklinks,
        avgWordCount: allNotes.length > 0 ? Math.round(totalWords / allNotes.length) : 0,
      },
    };
  }

  return { generateReport };
}

export type HealthChecker = ReturnType<typeof createHealthChecker>;
