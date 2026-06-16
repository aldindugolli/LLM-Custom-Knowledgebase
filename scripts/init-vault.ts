import fs from "node:fs/promises";
import path from "node:path";

const VAULT_DIRS = ["sessions", "learnings", "decisions", "concepts", "projects", "references", ".obsidian"];

async function main() {
  const vaultPath = path.resolve(process.argv[2] || "./vault");
  console.log(`[Hermes] Initializing vault at: ${vaultPath}`);

  for (const dir of VAULT_DIRS) {
    const dirPath = path.join(vaultPath, dir);
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`  Created: ${dir}/`);
  }

  const indexPath = path.join(vaultPath, "index.md");
  try {
    await fs.access(indexPath);
    console.log(`  Exists:  index.md (skipping)`);
  } catch {
    const indexContent = `---
id: vault-index
type: index
title: Vault Index
tags: [index]
created: 2026-06-15
updated: 2026-06-15
---

# Vault Index

Welcome to the Brainstorm knowledge vault. This index is maintained by the Hermes Memory Service.

## Sessions

_No sessions yet._

## Learnings

_No learnings yet._

## Decisions

_No decisions yet._

## Concepts

_No concepts yet._

## Projects

_No projects yet._

## References

_No references yet._
`;
    await fs.writeFile(indexPath, indexContent, "utf-8");
    console.log(`  Created: index.md`);
  }

  console.log(`[Hermes] Vault initialized. Open ${vaultPath} in Obsidian to browse.`);
}

main().catch(console.error);
