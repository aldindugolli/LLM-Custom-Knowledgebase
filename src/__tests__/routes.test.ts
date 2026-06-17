import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { createVault } from "../core/vault.js";
import { createSearchEngine } from "../core/search.js";
import { createMemoryManager } from "../core/memory.js";
import { createKnowledgeGraph } from "../core/graph.js";
import { createHealthChecker } from "../health/index.js";
import { createSynthesisEngine } from "../core/synthesis.js";
import { createDedupEngine } from "../core/dedup.js";
import { createLinkSuggester } from "../core/linker.js";
import { registerHealthRoutes } from "../health/api.js";
import { registerMemoryRoutes } from "../api/memory.js";
import { registerKnowledgeRoutes } from "../api/knowledge.js";
import { registerContextRoutes } from "../api/context.js";
import { registerSynthesisRoutes } from "../api/synthesis.js";
import type { VaultConfig, Note } from "../types.js";

function makeNote(overrides: Partial<Note>): Note {
  const now = new Date();
  return {
    id: overrides.id || "test",
    type: overrides.type || "learning",
    title: overrides.title || "Test",
    path: overrides.path || "test.md",
    frontmatter: overrides.frontmatter || {} as any,
    content: overrides.content || "",
    body: overrides.body || "",
    created: overrides.created || now,
    updated: overrides.updated || now,
    tags: overrides.tags || [],
    related: overrides.related || [],
    wikilinks: overrides.wikilinks || [],
    backlinks: overrides.backlinks || [],
    wordCount: overrides.wordCount || 0,
  };
}

describe("API Routes", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(cors, { origin: true });
    app.setErrorHandler((err: any, _req, reply) => {
      reply.status(err.statusCode || 500).send({ ok: false, error: err.message || "Internal error" });
    });
    app.setNotFoundHandler((_req, reply) => {
      reply.status(404).send({ ok: false, error: "Route not found" });
    });

    const cfg: VaultConfig = { path: "./test-vault", port: 0, host: "127.0.0.1" };
    const vault = createVault(cfg);
    const search = createSearchEngine(vault);
    const memory = createMemoryManager(vault, search);
    const graph = createKnowledgeGraph(vault);
    const health = createHealthChecker(vault, graph);
    const synthesis = createSynthesisEngine(vault, search);
    const dedup = createDedupEngine(vault, search);
    const linker = createLinkSuggester(vault);

    registerHealthRoutes(app, health);
    registerMemoryRoutes(app, memory);
    registerContextRoutes(app, { assemble: async () => ({ compiled: "context", project: "", goal: "", projectBrief: null, recentLearnings: [], openDecisions: [], relatedNotes: [], recentSessions: [], knowledgeGaps: [], vaultStats: { totalNotes: 0, lastSessionDate: null } }) } as any);
    registerSynthesisRoutes(app, synthesis, vault);
    registerKnowledgeRoutes(app, dedup, linker, graph, vault, synthesis);

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /unknown returns 404", async () => {
    const res = await app.inject({ method: "GET", url: "/unknown" });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Route not found");
  });

  it("GET /health/report returns health data", async () => {
    const res = await app.inject({ method: "GET", url: "/health/report" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.report).toBeDefined();
    expect(typeof body.report.totalNotes).toBe("number");
  });

  it("GET /health/summary returns summary", async () => {
    const res = await app.inject({ method: "GET", url: "/health/summary" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.summary).toBeDefined();
  });

  it("POST /memory/save with missing body fails validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/save",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /context/bundle with valid body succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/context/bundle",
      payload: { project: "test", goal: "testing routes" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("POST /context/compiled returns context string", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/context/compiled",
      payload: { project: "test", goal: "testing" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("POST /session/synthesize with missing sessionId fails", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/session/synthesize",
      payload: { summary: "test", learnings: [], decisions: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /knowledge/graph returns graph data", async () => {
    const res = await app.inject({ method: "GET", url: "/knowledge/graph" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  it("GET /knowledge/dedup returns dedup groups", async () => {
    const res = await app.inject({ method: "GET", url: "/knowledge/dedup" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("GET /knowledge/suggest-links returns suggestions", async () => {
    const res = await app.inject({ method: "GET", url: "/knowledge/suggest-links" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it("GET /knowledge/contradictions returns contradictions", async () => {
    const res = await app.inject({ method: "GET", url: "/knowledge/contradictions" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.contradictions)).toBe(true);
  });

  it("GET /memory/list with type returns notes", async () => {
    const res = await app.inject({ method: "GET", url: "/memory/list?type=learning" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("GET /memory/list without type fails validation", async () => {
    const res = await app.inject({ method: "GET", url: "/memory/list" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /memory/search returns results", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/search",
      payload: { query: "test" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });

  it("POST /memory/read with id returns note or not-found", async () => {
    const res = await app.inject({ method: "GET", url: "/memory/read?id=nonexistent" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });
});
