import type { Vault } from "../core/vault.js";
import type { EntityType } from "../types.js";
import { v4 as uuid } from "uuid";
import matter from "gray-matter";

function frontmatterYaml(fields: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else if (typeof v === "string" && (v.includes(":") || v.includes("#"))) {
      lines.push(`${k}: "${v}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export function createEntityStore(vault: Vault) {
  async function createEntity(input: {
    entityType: EntityType;
    title: string;
    body: string;
    tags?: string[];
    related?: string[];
    project?: string;
  }): Promise<string> {
    const id = uuid();
    const now = new Date().toISOString();
    const fm = frontmatterYaml({
      id,
      type: "entity",
      entityType: input.entityType,
      title: input.title,
      created: now,
      updated: now,
      tags: input.tags || [],
      related: input.related || [],
      project: input.project || "",
      importance: 3,
      confidence: 1.0,
      retrievalCount: 0,
      referenceCount: 0,
      lastReferenced: now,
      status: "active",
    });
    const content = `${fm}\n\n# ${input.title}\n\n${input.body}\n`;
    const fp = await vault.writeNote("entity", `${input.entityType}-${id.slice(0, 8)}`, content);
    return fp;
  }

  async function listEntities(entityType?: EntityType): Promise<{ id: string; title: string; path: string; entityType: EntityType }[]> {
    const allNotes = await vault.readAllNotes("entity");
    return allNotes
      .filter((n) => !entityType || n.frontmatter.entityType === entityType)
      .map((n) => ({
        id: n.id,
        title: n.title,
        path: n.path,
        entityType: (n.frontmatter.entityType || "concept") as EntityType,
      }));
  }

  return { createEntity, listEntities };
}

export type EntityStore = ReturnType<typeof createEntityStore>;
