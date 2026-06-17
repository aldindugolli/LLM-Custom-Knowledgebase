import type { Vault } from "../core/vault.js";
import type { Note } from "../types.js";
import { adrTemplate } from "./template.js";

export interface DecisionSummary {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "superseded";
  date: string;
  project: string;
  path: string;
}

export function createDecisionTracker(vault: Vault) {
  async function getNextSeq(): Promise<number> {
    const all = await vault.readAllNotes("decision");
    const adrNotes = all.filter((n) => n.id.startsWith("adr-"));
    let max = 0;
    for (const n of adrNotes) {
      const match = n.id.match(/adr-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max + 1;
  }

  async function create(input: {
    title: string;
    rationale: string;
    alternatives?: string[];
    consequences: string;
    project: string;
    status?: "proposed" | "accepted" | "superseded";
  }): Promise<{ id: string; path: string; seq: number }> {
    const seq = await getNextSeq();
    const content = adrTemplate({
      seq,
      title: input.title,
      rationale: input.rationale,
      alternatives: input.alternatives || [],
      consequences: input.consequences,
      project: input.project,
      status: input.status || "proposed",
    });
    const filename = `ADR-${String(seq).padStart(3, "0")}-${input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    const path = await vault.writeNote("decision", filename, content);
    return { id: `adr-${String(seq).padStart(3, "0")}`, path, seq };
  }

  async function list(project?: string): Promise<DecisionSummary[]> {
    const all = await vault.readAllNotes("decision");
    const adrs = all
      .filter((n) => n.id.startsWith("adr-"))
      .filter((n) => !project || n.frontmatter.project === project)
      .sort((a, b) => b.created.getTime() - a.created.getTime())
      .map((n) => ({
        id: n.id,
        title: n.title,
        status: (n.frontmatter.status || "proposed") as "proposed" | "accepted" | "superseded",
        date: n.frontmatter.date || n.created.toISOString().slice(0, 10),
        project: n.frontmatter.project || "",
        path: n.path,
      }));
    return adrs;
  }

  async function read(id: string): Promise<Note | null> {
    const all = await vault.readAllNotes("decision");
    const note = all.find((n) => n.id === id);
    return note || null;
  }

  async function updateStatus(id: string, status: "proposed" | "accepted" | "superseded"): Promise<boolean> {
    const note = await read(id);
    if (!note) return false;
    const newContent = note.content.replace(
      /^status:.*$/m,
      `status: ${status}`
    );
    await vault.writeNote("decision", note.path, newContent);
    return true;
  }

  return { create, list, read, updateStatus };
}

export type DecisionTracker = ReturnType<typeof createDecisionTracker>;
