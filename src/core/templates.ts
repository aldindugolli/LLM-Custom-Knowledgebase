import type { NoteType, NoteFrontmatter } from "../types.js";

let idCounter = 0;
function generateId(): string {
  idCounter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}-${idCounter}`;
}

function frontmatterYaml(fm: Partial<NoteFrontmatter>): string {
  const lines = ["---"];
  const fields: Record<string, unknown> = {
    id: fm.id || generateId(),
    type: fm.type || "note",
    title: fm.title || "Untitled",
    created: fm.created || new Date().toISOString(),
    updated: fm.updated || new Date().toISOString(),
    tags: fm.tags || [],
    related: fm.related || [],
  };
  if (fm.source) fields.source = fm.source;
  if (fm.project) fields.project = fm.project;
  if (fm.importance) fields.importance = fm.importance;
  if (fm.status) fields.status = fm.status;
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:${v.length === 0 ? " []" : ""}`);
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

export function sessionTemplate(title: string, project: string, context?: string): string {
  const fm = frontmatterYaml({
    type: "session",
    title,
    tags: ["session", project],
    project,
    related: [],
    status: "draft",
  });
  return `${fm}

# ${title}

**Project:** ${project}
**Date:** ${new Date().toLocaleDateString()}
**Status:** In Progress

## Goal

## Key Decisions

## Learnings

## Next Steps

## Files Touched

${context ? `\n## Context\n\n${context}` : ""}
`.trim();
}

export function learningTemplate(title: string, project: string, content: string, tags: string[] = []): string {
  const fm = frontmatterYaml({
    type: "learning",
    title,
    tags: ["learning", ...tags, project].filter(Boolean),
    project,
    related: [],
    importance: 3,
    status: "active",
  });
  return `${fm}

# ${title}

## What

${content}

## Why It Matters

## Related
`.trim();
}

export function decisionTemplate(title: string, project: string, context: string, rationale: string, alternatives: string[] = []): string {
  const fm = frontmatterYaml({
    type: "decision",
    title,
    tags: ["decision", project],
    project,
    related: [],
    importance: 4,
    status: "active",
  });
  const altText = alternatives.length
    ? alternatives.map((a, i) => `${i + 1}. ${a}`).join("\n")
    : "None documented";
  return `${fm}

# ${title}

## Context

${context}

## Decision

## Rationale

${rationale}

## Alternatives Considered

${altText}

## Consequences
`.trim();
}

export function conceptTemplate(title: string, definition: string, related: string[] = []): string {
  const fm = frontmatterYaml({
    type: "concept",
    title,
    tags: ["concept"],
    related,
    status: "active",
  });
  return `${fm}

# ${title}

## Definition

${definition}

## Key Characteristics

## Related Concepts

${related.map((r) => `- [[${r}]]`).join("\n")}

## Notes
`.trim();
}

export function projectTemplate(name: string, description: string): string {
  const fm = frontmatterYaml({
    type: "project",
    title: name,
    tags: ["project"],
    related: [],
    status: "active",
  });
  return `${fm}

# ${name}

**Status:** Active

## Description

${description}

## Tech Stack

## Recent Decisions

- 

## Active Learnings

- 

## Related Sessions

- 
`.trim();
}

export function referenceTemplate(title: string, url: string, notes: string): string {
  const fm = frontmatterYaml({
    type: "reference",
    title,
    tags: ["reference"],
    related: [],
    source: url,
    status: "active",
  });
  return `${fm}

# ${title}

**Source:** ${url}

## Summary

${notes}

## Key Takeaways

## Related
`.trim();
}

export function indexTemplate(sections: { heading: string; items: { title: string; path: string; summary: string }[] }[]): string {
  const fm = frontmatterYaml({
    id: "vault-index",
    type: "index",
    title: "Vault Index",
    tags: ["index"],
    related: [],
    status: "active",
  });
  const body = sections
    .map(
      (s) => `## ${s.heading}\n\n${s.items
        .map((i) => `- [[${i.path.replace(/\.md$/, "").split(/[/\\]/).pop()}]] — ${i.summary}`)
        .join("\n")}`
    )
    .join("\n\n");
  return `${fm}\n\n# Vault Index\n\n${body}\n`;
}
