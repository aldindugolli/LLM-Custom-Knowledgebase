import type { FastifyInstance } from "fastify";
import type { LLMRouter } from "../llm/router.js";
import type { ContextInjector } from "../chat/context.js";
import type { SessionManager } from "../core/session.js";
import type { ChatRequest, ChatConfig, ExcelCellEdit, ChatMessage } from "../types.js";
import { parseFile, applyExcelEdits } from "../chat/file-parser.js";

const VISION_MODEL_PREFIXES = ["llava", "bakllava", "minicpm-v", "moondream", "cogvlm", "deepseek-vl", "internvl", "yi-vl", "qwen2-vl", "qwen2.5-vl", "gemma3"];

function isVisionModel(model: string): boolean {
  const name = model.toLowerCase();
  if (name.includes("vision") || name.includes("/vision")) return true;
  return VISION_MODEL_PREFIXES.some((p) => name.startsWith(p));
}

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
    const hasFiles = !!(files && files.length > 0);
    let ocrContent: string | null = null;

    if (files && files.length > 0) {
      const effectiveModel = model || config.ollama.defaultModel;
      const needsOcr = files.some((f) => {
        const ext = f.name.toLowerCase().split(".").pop() || "";
        if (isVisionModel(effectiveModel)) return false;
        return ["jpg", "jpeg", "png", "gif", "webp", "pdf"].includes(ext);
      });
      const parsed = await Promise.all(
        files.map((f) => parseFile(f.name, f.content, f.encoding, needsOcr).catch(() => null))
      );
      const textFiles = parsed.filter((p): p is NonNullable<typeof p> => p !== null && p.type !== "image");
      const imageFiles = parsed.filter((p): p is NonNullable<typeof p> => p !== null && p.type === "image");

      if (textFiles.length > 0) {
        const fileBlocks = textFiles.map((p) =>
          `[Attached file: ${p.name}]\n\`\`\`\n${p.text}\n\`\`\``
        ).join("\n\n");
        const note = textFiles.some((p) => p.type === "excel")
          ? "\n\nNote: Excel files are shown as tables above. To modify the Excel, describe the changes you want and I will apply them."
          : "";
        messages = [
          { role: "system", content: `The user attached the following file(s):\n\n${fileBlocks}${note}` },
          ...messages,
        ];
      }

      if (imageFiles.length > 0) {
        if (isVisionModel(effectiveModel)) {
          const imageData = imageFiles.map((p) => p.base64!).filter(Boolean);
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
              messages[i].images = [...(messages[i].images || []), ...imageData];
              break;
            }
          }
        } else {
          if (textFiles.length === 0) {
            ocrContent = imageFiles.map((p) => {
              const label = `--- ${p.name} ---`;
              if (!p.text || p.text.startsWith("[Image:")) return `${label}\n(OCR unavailable)`;
              return `${label}\n${p.text}`;
            }).join("\n\n");
          } else {
            const imgBlocks = imageFiles.map((p) => {
              const isOcr = p.text && !p.text.startsWith("[Image:");
              if (!isOcr) return `[Attached image: ${p.name}] (OCR unavailable)`;
              return `[Attached image: ${p.name}]\n\`\`\`\n${p.text}\n\`\`\``;
            }).join("\n\n");
            const ocrWarning = `IMPORTANT: Some attached files are images processed by OCR. Text shown in code blocks is the raw OCR output. Report ONLY what you literally see in those blocks. NEVER invent metadata.`;
            messages = [
              { role: "system", content: ocrWarning },
              ...messages,
            ];
            const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
            if (lastUserMsg) {
              lastUserMsg.content = `${imgBlocks}\n\n${lastUserMsg.content}`;
            }
          }
        }
      }
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

    if (ocrContent !== null) {
      if (stream === false) {
        return { ok: true, source: "ocr", content: ocrContent };
      }
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(`data: ${JSON.stringify({ token: ocrContent })}\n\n`);
      reply.raw.write(`data: ${JSON.stringify({ done: true, source: "ocr" })}\n\n`);
      reply.raw.end();
      return;
    }

    if (stream === false) {
      const enriched = await context.inject(messages, sessionId, { skipVault: hasFiles });
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

    const enriched = await context.inject(messages, sessionId, { skipVault: hasFiles });
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
