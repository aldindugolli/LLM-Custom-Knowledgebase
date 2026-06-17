import type { Vault } from "../core/vault.js";
import type { KnowledgeGraphEngine } from "../core/graph.js";
import type { SearchEngine } from "../core/search.js";
import { createProjectStore } from "../project/store.js";
import { createDecisionTracker } from "../decision/tracker.js";
import { rankNotes } from "../knowledge/ranker.js";

export interface ContextBundleOptions {
  vault: Vault;
  graph: KnowledgeGraphEngine;
  search: SearchEngine;
  maxNotes?: number;
}

export function createContextBundle(opts: ContextBundleOptions) {
  const projectStore = createProjectStore(opts.vault);
  const decisionTracker = createDecisionTracker(opts.vault);
  const maxNotes = opts.maxNotes || 5;

  async function build(query?: string): Promise<string> {
    const sections: string[] = [];

    const projects = await projectStore.listProjects();
    if (projects.length > 0) {
      sections.push("## Active Projects\n" + projects.slice(0, 3).map((p) =>
        `- ${p.name}: ${p.summary.slice(0, 100)}`
      ).join("\n"));
    }

    const decisions = await decisionTracker.list();
    if (decisions.length > 0) {
      sections.push("## Recent Decisions\n" + decisions.slice(0, 5).map((d) =>
        `- [${d.id}] ${d.title} (${d.status})`
      ).join("\n"));
    }

    const all = await opts.vault.readAllNotes();
    const ranked = rankNotes(all, query);
    if (ranked.length > 0) {
      sections.push("## Key Notes\n" + ranked.slice(0, maxNotes).map((r) =>
        `- [${r.score.toFixed(2)}] ${r.note.title} (${r.note.type})`
      ).join("\n"));
    }

    return sections.join("\n\n");
  }

  return { build };
}
