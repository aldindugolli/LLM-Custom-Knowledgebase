import type { FastifyInstance } from "fastify";
import type { LLMRouter } from "../llm/router.js";
import type { ContextInjector } from "../chat/context.js";
import type { SessionManager } from "../core/session.js";
import type { ChatRequest, ChatConfig, ExcelCellEdit } from "../types.js";
import { parseFile, applyExcelEdits } from "../chat/file-parser.js";

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
          files: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "content"],
              properties: {
                name: { type: "string" },
                content: { type: "string" },
                mimeType: { type: "string" },
                encoding: { type: "string" },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    let { messages, mode, model, sessionId, stream, temperature, files } = req.body;
    const chatMode = mode || config.mode;

    if (files && files.length > 0) {
      const parsed = await Promise.all(
        files.map((f) => parseFile(f.name, f.content, f.encoding).catch(() => null))
      );
      const fileBlocks = parsed.filter(Boolean).map((p) =>
        `[Attached file: ${p!.name}]\n\`\`\`\n${p!.text}\n\`\`\``
      ).join("\n\n");
      const note = parsed.some((p) => p?.type === "excel")
        ? "\n\nNote: Excel files are shown as tables above. To modify the Excel, describe the changes you want and I will apply them."
        : "";
      messages = [
        { role: "system", content: `The user attached the following file(s):\n\n${fileBlocks}${note}` },
        ...messages,
      ];
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

  app.post<{ Body: { file: { name: string; content: string }; edits: ExcelCellEdit[] } }>("/chat/apply-excel-edits", {
    schema: {
      body: {
        type: "object",
        required: ["file", "edits"],
        properties: {
          file: {
            type: "object",
            required: ["name", "content"],
            properties: {
              name: { type: "string" },
              content: { type: "string" },
            },
          },
          edits: {
            type: "array",
            items: {
              type: "object",
              required: ["cell", "value"],
              properties: {
                cell: { type: "string" },
                value: { type: "string" },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const buffer = Buffer.from(req.body.file.content, "base64");
      const edited = applyExcelEdits(buffer, req.body.edits);
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="${req.body.file.name}"`);
      return reply.send(edited);
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  app.post<{ Body: { prompt: string; files: { name: string; content: string; encoding?: string }[] } }>("/chat/fill-excel", {
    schema: {
      body: {
        type: "object",
        required: ["prompt", "files"],
        properties: {
          prompt: { type: "string" },
          files: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["name", "content"],
              properties: {
                name: { type: "string" },
                content: { type: "string" },
                encoding: { type: "string" },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const { prompt, files } = req.body;
      const parsed = await Promise.all(files.map((f) => parseFile(f.name, f.content, f.encoding)));
      const excelFile = parsed.find((p) => p.type === "excel");
      if (!excelFile) return { ok: false, error: "No Excel file found in upload" };
      const otherFiles = parsed.filter((p) => p.type !== "excel");

      const contextParts = otherFiles.map((p) => `[${p.name}]\n${p.text}`);
      contextParts.push(`[${excelFile.name} (template)]\n${excelFile.text}`);
      const contextBlock = contextParts.join("\n\n---\n\n");

      const sysPrompt = `You are a data extraction tool. Given reference files (like a PDF) and an Excel template, extract data from the reference files and fill it into the appropriate cells of the Excel.

Reference files and Excel template:
${contextBlock}

The user's request: ${prompt}

Respond with ONLY a valid JSON array of cell edits. Each edit must have "cell" (Excel cell reference like A1, B2, C3) and "value" (the text to write into that cell). For example:
[{"cell": "B2", "value": "John Doe"}, {"cell": "C2", "value": "j@example.com"}]

Rules:
- Use exact cell references from the Excel template shown above (column A, B, C... and row numbers starting at 1 for the header).
- The header row (row 1) should NOT be modified — only fill data rows.
- Do not include any text, markdown, or explanation outside the JSON array.
- The response must be parseable by JSON.parse().`;

      const llmResponse = await new Promise<string>((resolve, reject) => {
        const tokens: string[] = [];
        const timeout = setTimeout(() => reject(new Error("LLM timed out")), 120000);
        router.chat(
          config.mode,
          [{ role: "system", content: sysPrompt }],
          (t) => tokens.push(t),
          () => { clearTimeout(timeout); resolve(tokens.join("")); },
          (err) => { clearTimeout(timeout); reject(err); },
          undefined,
          undefined
        );
      });

      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { ok: false, error: "LLM did not return valid JSON edits", llmResponse };
      }
      const edits: ExcelCellEdit[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(edits) || edits.length === 0) {
        return { ok: false, error: "No cell edits generated", llmResponse };
      }
      const edited = applyExcelEdits(excelFile.raw, edits);
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="${excelFile.name}"`);
      reply.header("X-Edit-Count", String(edits.length));
      return reply.send(edited);
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });
}
