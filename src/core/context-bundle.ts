import type { Vault } from "./vault.js";
import type { SearchEngine } from "./search.js";
import type { Note } from "../types.js";

export interface ContextBundle {
  project: string;
  goal: string;
  projectBrief: Note | null;
  recentLearnings: Note[];
  openDecisions: Note[];
  relatedNotes: Note[];
  recentSessions: Note[];
  vaultStats: {
    totalNotes: number;
    lastSessionDate: string | null;
  };
  knowledgeGaps: string[];
  compiled: string;
}

export function createContextAssembler(vault: Vault, search: SearchEngine) {
  async function assemble(project: string, goal: string): Promise<ContextBundle> {
    const allNotes = await vault.readAllNotes();

    const projectBrief = allNotes.find(
      (n) => n.type === "project" && n.title.toLowerCase() === project.toLowerCase()
    ) || null;

    const recentLearnings = allNotes
      .filter((n) => n.type === "learning" && (n.frontmatter.project === project || n.tags.includes(project)))
      .sort((a, b) => b.updated.getTime() - a.updated.getTime())
      .slice(0, 10);

    const openDecisions = allNotes
      .filter((n) => n.type === "decision" && n.frontmatter.status === "active")
      .sort((a, b) => b.updated.getTime() - a.updated.getTime())
      .slice(0, 8);

    const searchResults = await search.search({ query: `${project} ${goal}`, limit: 8 }, allNotes);
    const relatedNotes = searchResults.map((r) => r.note);

    const recentSessions = allNotes
      .filter((n) => n.type === "session" && (n.frontmatter.project === project || n.tags.includes(project)))
      .sort((a, b) => b.created.getTime() - a.created.getTime())
      .slice(0, 5);

    const lastSession = recentSessions[0] || null;

    const knowledgeGaps: string[] = [];
    if (recentLearnings.length === 0) knowledgeGaps.push("No past learnings for this project");
    if (projectBrief === null) knowledgeGaps.push(`No project brief exists for "${project}"`);
    if (recentSessions.length === 0) knowledgeGaps.push("No prior sessions recorded for this project");

    const compiled = compileBundle({
      project,
      goal,
      projectBrief,
      recentLearnings,
      openDecisions,
      relatedNotes,
      recentSessions,
      knowledgeGaps,
      vaultStats: {
        totalNotes: allNotes.length,
        lastSessionDate: lastSession ? lastSession.created.toISOString() : null,
      },
    });

    return {
      project,
      goal,
      projectBrief,
      recentLearnings,
      openDecisions,
      relatedNotes,
      recentSessions,
      knowledgeGaps,
      vaultStats: {
        totalNotes: allNotes.length,
        lastSessionDate: lastSession ? lastSession.created.toISOString() : null,
      },
      compiled,
    };
  }

  function compileBundle(ctx: Omit<ContextBundle, "compiled">): string {
    const lines: string[] = [
      `## Hermes Memory Context`,
      ``,
      `**Project:** ${ctx.project}`,
      `**Goal:** ${ctx.goal}`,
      `**Vault:** ${ctx.vaultStats.totalNotes} notes total`,
      ``,
    ];

    if (ctx.projectBrief) {
      lines.push(`### Project Brief`, ``, ctx.projectBrief.body.slice(0, 500), ``);
    }

    if (ctx.recentLearnings.length > 0) {
      lines.push(`### Recent Learnings (${ctx.recentLearnings.length})`);
      for (const l of ctx.recentLearnings) {
        lines.push(`- **${l.title}** — ${l.body.slice(0, 200)}`);
      }
      lines.push(``);
    }

    if (ctx.openDecisions.length > 0) {
      lines.push(`### Open Decisions (${ctx.openDecisions.length})`);
      for (const d of ctx.openDecisions) {
        lines.push(`- **${d.title}** — ${d.body.slice(0, 150)}`);
      }
      lines.push(``);
    }

    if (ctx.relatedNotes.length > 0) {
      lines.push(`### Related Knowledge`);
      for (const n of ctx.relatedNotes) {
        lines.push(`- [[${n.title}]] (${n.type})`);
      }
      lines.push(``);
    }

    if (ctx.recentSessions.length > 0) {
      lines.push(`### Recent Sessions`);
      for (const s of ctx.recentSessions) {
        lines.push(`- ${s.title} — ${s.created.toLocaleDateString()}`);
      }
      lines.push(``);
    }

    if (ctx.knowledgeGaps.length > 0) {
      lines.push(`### Knowledge Gaps`);
      for (const g of ctx.knowledgeGaps) {
        lines.push(`- ⚠ ${g}`);
      }
      lines.push(``);
    }

    lines.push(`---`, `*Context auto-assembled by Hermes Memory Service*`);

    return lines.join("\n");
  }

  return { assemble };
}

export type ContextAssembler = ReturnType<typeof createContextAssembler>;
