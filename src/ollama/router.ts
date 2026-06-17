import type { FastifyInstance } from "fastify";
import { execSync, exec } from "child_process";
import { getHardwareInfo } from "./hwinfo.js";
import { getAllModels, getModelsByUseCase, getInstalledModels, type UseCase } from "./models.js";
import { scoreModels } from "./scorer.js";

const VALID_USE_CASES: UseCase[] = ["coding", "chat", "reasoning", "embedding", "tool-use"];

export function registerOllamaRoutes(app: FastifyInstance) {
  app.get("/ollama/hwinfo", async () => {
    const hw = getHardwareInfo();
    return { ok: true, hardware: hw };
  });

  app.get("/ollama/models", async () => {
    const installed = new Set(getInstalledModels());
    const models = getAllModels().map((m) => ({
      name: m.name,
      params: m.params,
      minRamGB: m.minRamGB,
      minVramGB: m.minVramGB,
      diskGB: m.diskGB,
      useCase: m.useCase,
      installed: installed.has(m.name),
    }));
    return { ok: true, models };
  });

  app.post<{ Body: { useCase?: string; preferSpeed?: boolean; maxRam?: number } }>(
    "/ollama/recommend",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            useCase: { type: "string", enum: VALID_USE_CASES },
            preferSpeed: { type: "boolean" },
            maxRam: { type: "number" },
          },
        },
      },
    },
    async (req) => {
      const useCase = (req.body.useCase as UseCase) || "coding";
      const hw = getHardwareInfo();
      if (req.body.maxRam && req.body.maxRam < hw.freeRamGB) {
        hw.freeRamGB = req.body.maxRam;
      }
      const installed = new Set(getInstalledModels());
      const all = useCase === "coding" ? getAllModels() : getModelsByUseCase(useCase);
      let scored = scoreModels(all, hw, installed, useCase);

      if (req.body.preferSpeed) {
        scored.sort((a, b) => (b.score * 0.5 + b.quality / 10 * 0.5) - (a.score * 0.5 + a.quality / 10 * 0.5));
      }

      return { ok: true, hardware: hw, recommendations: scored.slice(0, 10) };
    }
  );

  app.post<{ Body: { model: string } }>(
    "/ollama/pull",
    {
      schema: {
        body: {
          type: "object",
          required: ["model"],
          properties: { model: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req, _reply) => {
      const { model } = req.body;
      return new Promise((resolve) => {
        exec(`ollama pull ${model}`, { timeout: 600000 }, (err, stdout) => {
          if (err) {
            resolve({ ok: false, error: `Failed to pull ${model}: ${err.message}` });
          } else {
            const status = stdout.trim().split("\n").pop() || "done";
            resolve({ ok: true, model, message: status });
          }
        });
      });
    }
  );
}
