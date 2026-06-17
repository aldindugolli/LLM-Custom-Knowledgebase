import type { Vault } from "../core/vault.js";
import type { Note, EntityType } from "../types.js";

const ENTITY_PATTERNS: { pattern: RegExp; entityType: EntityType }[] = [
  { pattern: /\[\[Project:\s*([^\]]+)\]\]/g, entityType: "project" },
  { pattern: /\[\[Technology:\s*([^\]]+)\]\]/g, entityType: "technology" },
  { pattern: /\[\[Person:\s*([^\]]+)\]\]/g, entityType: "person" },
  { pattern: /\[\[Tool:\s*([^\]]+)\]\]/g, entityType: "technology" },
  { pattern: /\[\[Concept:\s*([^\]]+)\]\]/g, entityType: "concept" },
  { pattern: /\[\[Decision:\s*([^\]]+)\]\]/g, entityType: "decision" },
];

export interface EntityRef {
  name: string;
  entityType: EntityType;
  confidence: number;
}

export function extractEntityReferences(content: string): EntityRef[] {
  const refs: EntityRef[] = [];
  const seen = new Set<string>();

  for (const { pattern, entityType } of ENTITY_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const m of matches) {
      const name = m[1].trim();
      const key = `${entityType}:${name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ name, entityType, confidence: 1.0 });
      }
    }
  }

  return refs;
}

export function createEntityExtractor(vault: Vault) {
  async function extractAllFromVault(): Promise<Map<string, EntityRef[]>> {
    const allNotes = await vault.readAllNotes();
    const results = new Map<string, EntityRef[]>();

    for (const note of allNotes) {
      if (note.type === "index") continue;
      const refs = extractEntityReferences(note.content);
      if (refs.length > 0) {
        results.set(note.path, refs);
      }
    }

    return results;
  }

  return { extractAllFromVault, extractEntityReferences };
}

export type EntityExtractor = ReturnType<typeof createEntityExtractor>;
