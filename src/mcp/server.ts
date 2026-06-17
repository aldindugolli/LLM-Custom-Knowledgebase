import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

const HERMES_URL = process.env.HERMES_URL || "http://127.0.0.1:3412";
const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_ROOT || process.cwd());

function safePath(target: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, target);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Access denied: path "${target}" is outside workspace`);
  }
  return resolved;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(error: string) {
  return { content: [{ type: "text" as const, text: `Error: ${error}` }], isError: true as const };
}

const server = new McpServer({
  name: "hermes-mcp",
  version: "0.1.0",
}, {
  capabilities: { tools: {} },
});

// ── Filesystem Tools ──────────────────────────────────────────

server.registerTool("read_file", {
  title: "Read File",
  description: "Read the contents of a file from the workspace. Returns the full file content as text.",
  inputSchema: {
    path: z.string().describe("Relative or absolute path to the file within the workspace"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ path: filePath }) => {
  try {
    const resolved = safePath(filePath);
    if (!fs.existsSync(resolved)) return errorResult(`File not found: ${filePath}`);
    const content = fs.readFileSync(resolved, "utf-8");
    return textResult(content);
  } catch (e: any) {
    return errorResult(e.message);
  }
});

server.registerTool("write_file", {
  title: "Write File",
  description: "Create or overwrite a file with the given content. Creates parent directories if they don't exist.",
  inputSchema: {
    path: z.string().describe("Relative or absolute path to the file within the workspace"),
    content: z.string().describe("The content to write to the file (will overwrite existing content)"),
  },
  annotations: { destructiveHint: true },
}, async ({ path: filePath, content }) => {
  try {
    const resolved = safePath(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
    return textResult(`Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}`);
  } catch (e: any) {
    return errorResult(e.message);
  }
});

server.registerTool("edit_file", {
  title: "Edit File",
  description: "Apply a find-and-replace edit to a file. Use this to make targeted changes without rewriting the whole file. When replaceAll is false, oldString must exist exactly once. When replaceAll is true, all occurrences are replaced.",
  inputSchema: {
    path: z.string().describe("Relative or absolute path to the file within the workspace"),
    oldString: z.string().describe("The exact text to find and replace"),
    newString: z.string().describe("The replacement text"),
    replaceAll: z.boolean().describe("Replace all occurrences instead of just the first").optional().default(false),
  },
  annotations: { destructiveHint: true, idempotentHint: false },
}, async ({ path: filePath, oldString, newString, replaceAll }) => {
  try {
    const resolved = safePath(filePath);
    if (!fs.existsSync(resolved)) return errorResult(`File not found: ${filePath}`);
    const content = fs.readFileSync(resolved, "utf-8");
    if (!content.includes(oldString)) {
      return errorResult(`Could not find "${oldString}" in ${filePath}`);
    }
    if (!replaceAll) {
      const firstIdx = content.indexOf(oldString);
      const lastIdx = content.lastIndexOf(oldString);
      if (firstIdx !== lastIdx) {
        return errorResult(`Found multiple occurrences of "${oldString}" in ${filePath}. Set replaceAll=true to replace all, or narrow oldString to match exactly once.`);
      }
    }
    const updated = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);
    fs.writeFileSync(resolved, updated, "utf-8");
    return textResult(`Edited ${filePath}: replaced "${oldString}" with "${newString}"${replaceAll ? " (all occurrences)" : ""}`);
  } catch (e: any) {
    return errorResult(e.message);
  }
});

server.registerTool("list_files", {
  title: "List Files",
  description: "List files and directories in a given path. Optionally recursive with configurable depth. Directories end with '/'.",
  inputSchema: {
    path: z.string().describe("Relative or absolute path within the workspace").default("."),
    recursive: z.boolean().describe("Whether to list files recursively").optional().default(false),
    depth: z.number().min(1).describe("Maximum recursion depth when recursive is true (1 = current directory only, 2 = one level deep, etc.). Defaults to unlimited.").optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ path: dirPath, recursive, depth }) => {
  try {
    const resolved = safePath(dirPath);
    if (!fs.existsSync(resolved)) return errorResult(`Directory not found: ${dirPath}`);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return errorResult(`${dirPath} is not a directory`);

    const entries: string[] = [];
    function walk(dir: string, relPrefix: string, currentDepth: number) {
      if (depth !== undefined && currentDepth > depth) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          entries.push(`${rel}/`);
          if (recursive) walk(path.join(dir, entry.name), rel, currentDepth + 1);
        } else {
          entries.push(rel);
        }
      }
    }
    walk(resolved, "", 1);
    return textResult(entries.join("\n") || "(empty directory)");
  } catch (e: any) {
    return errorResult(e.message);
  }
});

server.registerTool("grep_search", {
  title: "Grep Search",
  description: "Search file contents using a regular expression. Returns matching file paths, line numbers, and matched lines. Supports minimatch glob patterns for include filtering (e.g. '*.ts', 'src/**/*.ts').",
  inputSchema: {
    pattern: z.string().describe("Regular expression pattern to search for"),
    include: z.string().describe("Minimatch glob pattern for file filtering (e.g. '*.ts', '*.{ts,js}', 'src/**/*.ts'). Use '*' for all files.").optional().default("*"),
    path: z.string().describe("Directory to search in, relative to workspace").optional().default("."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ pattern, include, path: searchPath }) => {
  try {
    const resolved = safePath(searchPath);
    if (!fs.existsSync(resolved)) return errorResult(`Path not found: ${searchPath}`);

    const regex = new RegExp(pattern, "g");
    const results: string[] = [];
    const { minimatch } = await import("minimatch");

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const relPath = path.relative(WORKSPACE_ROOT, fullPath);
          if (include !== "*" && !minimatch(relPath, include, { dot: true })) continue;
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push(`${relPath}:${i + 1}:${lines[i].trim()}`);
              }
            }
          } catch { /* skip binary/unreadable */ }
        }
      }
    }
    walk(resolved);
    return textResult(results.join("\n") || "No matches found");
  } catch (e: any) {
    return errorResult(e.message);
  }
});

server.registerTool("glob_search", {
  title: "Glob Search",
  description: "Find files matching a glob pattern (e.g. 'src/**/*.ts', '**/*.json'). Respects .gitignore-style patterns with dot:true.",
  inputSchema: {
    pattern: z.string().describe("Glob pattern to match files against (e.g. 'src/**/*.ts')"),
    path: z.string().describe("Directory to search in, relative to workspace").optional().default("."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ pattern: globPattern, path: searchPath }) => {
  try {
    const resolved = safePath(searchPath);
    if (!fs.existsSync(resolved)) return errorResult(`Path not found: ${searchPath}`);
    const { minimatch } = await import("minimatch");

    const results: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const relPath = path.relative(WORKSPACE_ROOT, fullPath);
          if (minimatch(relPath, globPattern, { dot: true })) {
            results.push(relPath);
          }
        }
      }
    }
    walk(resolved);
    return textResult(results.join("\n") || "No files match the pattern");
  } catch (e: any) {
    return errorResult(e.message);
  }
});

// ── Hermes Vault Tools (via HTTP) ─────────────────────────────

async function hermesFetch(url: string, opts?: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (i === retries) return res;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    } catch (_) {
      if (i === retries) throw _;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error("Hermes service unreachable");
}

server.registerTool("save_memory", {
  title: "Save Memory",
  description: "Save a piece of knowledge (learning, decision, concept, or reference) to the Hermes vault. Use this to persist discoveries, architectures decisions, gotchas, or external references.",
  inputSchema: {
    type: z.enum(["learning", "decision", "concept", "reference"]).describe("Type of note to save"),
    title: z.string().describe("Concise, descriptive title for the knowledge"),
    body: z.string().describe("Detailed content of what you learned or decided"),
    tags: z.array(z.string()).describe("Tags for categorization and search").optional(),
    importance: z.number().min(1).max(5).describe("Importance level (1=low, 5=critical)").optional(),
  },
  annotations: { openWorldHint: false },
}, async ({ type, title, body, tags, importance }) => {
  try {
    const res = await hermesFetch(`${HERMES_URL}/memory/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, title, body, tags, importance }),
    });
    const data = await res.json();
    return textResult(JSON.stringify(data, null, 2));
  } catch (e: any) {
    return errorResult(`Hermes unreachable: ${e.message}`);
  }
});

server.registerTool("search_memories", {
  title: "Search Memories",
  description: "Search the Hermes vault by query, type, tags, or project. Returns matching notes with content excerpts.",
  inputSchema: {
    query: z.string().describe("Search query").optional().default(""),
    type: z.enum(["learning", "decision", "concept", "reference", "session"]).describe("Filter by note type").optional(),
    tags: z.array(z.string()).describe("Filter by tags").optional(),
    limit: z.number().min(1).max(100).describe("Maximum results to return").optional().default(20),
    offset: z.number().min(0).describe("Pagination offset").optional().default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ query, type, tags, limit, offset }) => {
  try {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (type) params.set("type", type);
    if (tags) params.set("tags", tags.join(","));
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const res = await hermesFetch(`${HERMES_URL}/memory/search?${params}`);
    const data = await res.json();
    return textResult(JSON.stringify(data, null, 2));
  } catch (e: any) {
    return errorResult(`Hermes unreachable: ${e.message}`);
  }
});

server.registerTool("read_memory", {
  title: "Read Memory",
  description: "Read a specific note from the Hermes vault by its file path (e.g. 'concepts/my-concept.md') or ID.",
  inputSchema: {
    path: z.string().describe("Path or ID of the note to read (e.g. 'concepts/my-concept.md')"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
}, async ({ path: notePath }) => {
  try {
    const res = await hermesFetch(`${HERMES_URL}/memory/read?path=${encodeURIComponent(notePath)}`);
    const data = await res.json();
    return textResult(JSON.stringify(data, null, 2));
  } catch (e: any) {
    return errorResult(`Hermes unreachable: ${e.message}`);
  }
});

server.registerTool("hermes_health", {
  title: "Hermes Health",
  description: "Check the health of the Hermes vault, including broken wikilinks, orphan notes (no backlinks), and vault statistics.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
}, async () => {
  try {
    const res = await hermesFetch(`${HERMES_URL}/health/report`);
    const data = await res.json();
    return textResult(JSON.stringify(data, null, 2));
  } catch (e: any) {
    return errorResult(`Hermes unreachable: ${e.message}`);
  }
});

// ── Start ─────────────────────────────────────────────────────

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[hermes-mcp] Connected via stdio transport`);
    console.error(`[hermes-mcp] Workspace root: ${WORKSPACE_ROOT}`);
    console.error(`[hermes-mcp] Hermes URL: ${HERMES_URL}`);
  } catch (e) {
    console.error(`[hermes-mcp] Failed to start:`, e);
    process.exit(1);
  }
}

main();
