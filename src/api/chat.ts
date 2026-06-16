import type { FastifyInstance } from "fastify";
import type { LLMRouter } from "../llm/router.js";
import type { ContextInjector } from "../chat/context.js";
import type { SessionManager } from "../core/session.js";
import type { ChatRequest, ChatConfig } from "../types.js";

export function registerChatRoutes(
  app: FastifyInstance,
  router: LLMRouter,
  context: ContextInjector,
  sessions: SessionManager,
  config: ChatConfig
) {
  app.post<{ Body: ChatRequest }>("/chat/completions", async (req, reply) => {
    const { messages, mode, model, sessionId, stream, temperature } = req.body;
    const chatMode = mode || config.mode;

    if (!messages || messages.length === 0) {
      return { ok: false, error: "No messages provided" };
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

    const persist = async (userMessage: string, assistantMessage: string) => {
      if (sessionId && userMessage && assistantMessage) {
        try {
          await sessions.appendChatExchange(sessionId, userMessage, assistantMessage);
        } catch (e) {
          console.error("[Chat] Failed to persist exchange:", e);
        }
      }
    };

    if (stream === false) {
      const enriched = await context.inject(messages, sessionId);
      const response = await new Promise<string>((resolve, reject) => {
        const tokens: string[] = [];
        router.chat(
          chatMode,
          enriched,
          (t) => tokens.push(t),
          () => resolve(tokens.join("")),
          (err) => reject(err),
          undefined,
          model
        );
      });
      if (lastUserMsg) await persist(lastUserMsg.content, response);
      return { ok: true, content: response };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const enriched = await context.inject(messages, sessionId);
    const abortController = new AbortController();
    let fullResponse = "";

    const onToken = (token: string) => {
      fullResponse += token;
      reply.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
    };

    const onDone = () => {
      if (lastUserMsg) persist(lastUserMsg.content, fullResponse).catch((e) => console.error("[Chat] Persist failed:", e));
      try { reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`); } catch (e) { console.error("[Chat] SSE write (done) failed:", e); }
      try { reply.raw.end(); } catch (e) { console.error("[Chat] SSE end failed:", e); }
    };

    const onError = (err: Error) => {
      try {
        reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        reply.raw.end();
      } catch (e) {
        console.error("[Chat] SSE error write failed:", e);
      }
    };

    req.raw.on("close", () => {
      abortController.abort();
      onDone();
    });

    router.chat(chatMode, enriched, onToken, onDone, onError, abortController.signal, model);
  });

  app.get("/chat/models", async () => {
    if (config.mode === "ollama") {
      const models = await router.listModels();
      return { ok: true, models, source: "ollama" };
    }
    return { ok: true, models: [], source: config.mode };
  });

  app.get("/chat/ping", async () => {
    const ollamaOk = config.mode === "ollama" ? await router.ping("ollama") : null;
    const opencodeOk = config.mode === "opencode" ? await router.ping("opencode") : null;
    return { ok: true, ollama: ollamaOk, opencode: opencodeOk };
  });
}
