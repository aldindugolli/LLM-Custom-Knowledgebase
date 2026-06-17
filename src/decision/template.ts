function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

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

export function adrTemplate(input: {
  seq: number;
  title: string;
  rationale: string;
  alternatives: string[];
  consequences: string;
  project: string;
  status: "proposed" | "accepted" | "superseded";
}): string {
  const now = new Date().toISOString();
  const fm = frontmatterYaml({
    id: `adr-${String(input.seq).padStart(3, "0")}`,
    type: "decision",
    title: input.title,
    status: input.status,
    date: now.slice(0, 10),
    project: input.project,
    tags: ["decision", "adr", input.project],
    related: [],
    importance: 4,
    created: now,
    updated: now,
  });

  const altText = input.alternatives.length
    ? input.alternatives.map((a, i) => `${i + 1}. ${a}`).join("\n")
    : "None documented";

  return `${fm}

# ADR-${String(input.seq).padStart(3, "0")}: ${input.title}

**Status:** ${input.status}
**Project:** ${input.project}
**Date:** ${now.slice(0, 10)}

## Rationale

${input.rationale}

## Alternatives Considered

${altText}

## Consequences

${input.consequences}
`.trim();
}
