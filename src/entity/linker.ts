import type { Vault } from "../core/vault.js";
import type { Note, EntityType } from "../types.js";
import { extractEntityReferences } from "./extractor.js";

export interface EntityLink {
  notePath: string;
  entityId: string;
  entityType: EntityType;
  entityName: string;
}

export function createEntityLinker(vault: Vault) {
  async function buildReverseIndex(): Promise<Map<string, EntityLink[]>> {
    const allNotes = await vault.readAllNotes();
    const allEntities = await vault.readAllNotes("entity");

    const entityMap = new Map<string, { id: string; title: string; entityType: EntityType }>();
    for (const e of allEntities) {
      const key = e.title.toLowerCase();
      const et = (e.frontmatter.entityType || "concept") as EntityType;
      entityMap.set(key, { id: e.id, title: e.title, entityType: et });
    }

    const index = new Map<string, EntityLink[]>();

    for (const note of allNotes) {
      if (note.type === "index" || note.type === "entity") continue;
      const refs = extractEntityReferences(note.content);

      for (const ref of refs) {
        const key = ref.name.toLowerCase();
        const matched = entityMap.get(key);
        if (matched) {
          if (!index.has(note.path)) index.set(note.path, []);
          index.get(note.path)!.push({
            notePath: note.path,
            entityId: matched.id,
            entityType: matched.entityType,
            entityName: matched.title,
          });
        }
      }
    }

    return index;
  }

  async function getLinkedEntities(notePath: string): Promise<EntityLink[]> {
    const index = await buildReverseIndex();
    return index.get(notePath) || [];
  }

  return { buildReverseIndex, getLinkedEntities };
}

export type EntityLinker = ReturnType<typeof createEntityLinker>;
