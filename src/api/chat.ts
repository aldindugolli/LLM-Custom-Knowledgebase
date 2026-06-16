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
  app.post<{ Body: ChatRequest }>("/chat/completions", {
    schema: {
      body: {
        type: "object",
        required: ["messages"],
        properties: {
          messages: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["role", "content"],
              properties: {
                role: { type: "string", enum: ["system", "user", "assistant"] },
                content: { type: "string" },
              },
            },
          },
          mode: { type: "string", enum: ["ollama", "opencode"] },
          model: { type: "string" },
          sessionId: { type: "string" },
          stream: { type: "boolean" },
          temperature: { type: "number", minimum: 0, maximum: 2 },
        },
      },
    },
  }, async (req, reply) => {
    const { messages, mode, model, sessionId, stream, temperature } = req.body;
    const chatMode = mode || config.mode;

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
    let streamEnded = false;

    const endStream = () => {
      if (streamEnded) return;
      streamEnded = true;
      if (lastUserMsg) persist(lastUserMsg.content, fullResponse).catch((e) => console.error("[Chat] Persist failed:", e));
      try { reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`); } catch (e) { console.error("[Chat] SSE write (done) failed:", e); }
      try { reply.raw.end(); } catch (e) { console.error("[Chat] SSE end failed:", e); }
    };

    const onToken = (token: string) => {
      if (streamEnded) return;
      fullResponse += token;
      reply.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
    };

    const onDone = () => {
      endStream();
    };

    const onError = (err: Error) => {
      if (streamEnded) return;
      streamEnded = true;
      try {
        reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        reply.raw.end();
      } catch (e) {
        console.error("[Chat] SSE error write failed:", e);
      }
    };

    req.raw.on("close", () => {
      abortController.abort();
      endStream();
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
