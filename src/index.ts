import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createVault } from "./core/vault.js";
import { createSearchEngine } from "./core/search.js";
import { createMemoryManager } from "./core/memory.js";
import { createSessionManager } from "./core/session.js";
import { createKnowledgeGraph } from "./core/graph.js";
import { createHealthChecker } from "./health/index.js";
import { createMiningEngine } from "./mining/extractor.js";
import { createMiningScheduler } from "./mining/scheduler.js";
import { createContextAssembler } from "./core/context-bundle.js";
import { createSynthesisEngine } from "./core/synthesis.js";
import { createDedupEngine } from "./core/dedup.js";
import { createLinkSuggester } from "./core/linker.js";
import { createLLMRouter } from "./llm/router.js";
import { createContextInjector } from "./chat/context.js";
import { registerMemoryRoutes } from "./api/memory.js";
import { registerSessionRoutes } from "./api/session.js";
import { registerHealthRoutes } from "./health/api.js";
import { registerContextRoutes } from "./api/context.js";
import { registerSynthesisRoutes } from "./api/synthesis.js";
import { registerKnowledgeRoutes } from "./api/knowledge.js";
import { registerChatRoutes } from "./api/chat.js";
import type { VaultConfig, ChatConfig } from "./types.js";

function getVaultConfig(): VaultConfig {
  return {
    path: process.env.HERMES_VAULT_PATH || "./vault",
    port: parseInt(process.env.HERMES_PORT || "3412", 10),
    host: process.env.HERMES_HOST || "127.0.0.1",
  };
}

function getChatConfig(): ChatConfig {
  const cfgPath = path.join(process.cwd(), "brainstorm.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = fs.readFileSync(cfgPath, "utf-8");
      return JSON.parse(raw);
    } catch {}
  }
  return {
    mode: "ollama",
    ollama: {
      endpoint: process.env.OLLAMA_ENDPOINT || "http://127.0.0.1:11434",
      defaultModel: process.env.OLLAMA_MODEL || "llama3.2",
      models: ["llama3.2", "mistral", "codellama", "phi"],
    },
    opencode: {
      command: process.env.OPENCODE_CMD || "opencode",
      agent: process.env.OPENCODE_AGENT || "brainstorm",
    },
  };
}

async function main() {
  const config = getVaultConfig();
  const chatConfig = getChatConfig();

  const vault = createVault(config);
  await vault.ensureDirs();

  const search = createSearchEngine(vault);
  const memory = createMemoryManager(vault, search);
  const sessions = createSessionManager(vault, search, memory);
  const graph = createKnowledgeGraph(vault);
  const health = createHealthChecker(vault, graph);
  const miner = createMiningEngine(memory);
  const scheduler = createMiningScheduler(vault, miner);
  const context = createContextAssembler(vault, search);
  const synthesis = createSynthesisEngine(vault, search);
  const dedup = createDedupEngine(vault, search);
  const linker = createLinkSuggester(vault);
  const llmRouter = createLLMRouter({ config: chatConfig, cwd: process.cwd() });
  const ctxInjector = createContextInjector({ vault, search });

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  registerMemoryRoutes(app, memory);
  registerSessionRoutes(app, sessions);
  registerHealthRoutes(app, health);
  registerContextRoutes(app, context);
  registerSynthesisRoutes(app, synthesis, vault);
  registerKnowledgeRoutes(app, dedup, linker, graph);
  registerChatRoutes(app, llmRouter, ctxInjector, sessions, chatConfig);

  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "..", "public"),
    prefix: "/ui/",
    decorateReply: false,
  });

  app.get("/ui", async (_req, reply) => {
    return reply.redirect("/ui/");
  });

  app.get("/", async () => ({
    service: "brainstorm",
    version: "0.3.0",
    vault: config.path,
    status: "running",
    chatMode: chatConfig.mode,
    gui: "http://127.0.0.1:" + config.port + "/ui",
  }));

  app.get("/vault/stats", async () => {
    const allNotes = await vault.readAllNotes();
    return {
      ok: true,
      stats: {
        totalNotes: allNotes.length,
        byType: allNotes.reduce((acc, n) => {
          acc[n.type] = (acc[n.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        totalWikilinks: allNotes.reduce((sum, n) => sum + n.wikilinks.length, 0),
      },
    };
  });

  scheduler.start(parseInt(process.env.HERMES_MINING_INTERVAL || "300000", 10));
  console.log(`[Hermes] Auto-mining started (interval: ${process.env.HERMES_MINING_INTERVAL || "300000"}ms)`);

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`[Hermes] Memory service running at http://${config.host}:${config.port}`);
    console.log(`[Hermes] Vault path: ${await vault.getVaultPath()}`);
  } catch (err) {
    app.log.error(err);
    scheduler.stop();
    process.exit(1);
  }

  const shutdown = async () => {
    scheduler.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
