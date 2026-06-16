import type { FastifyInstance } from "fastify";
import type { SynthesisEngine } from "../core/synthesis.js";
import type { Vault } from "../core/vault.js";

export function registerSynthesisRoutes(app: FastifyInstance, synthesis: SynthesisEngine, vault: Vault) {
  app.post<{ Body: { sessionId: string; summary: string; learnings: string[]; decisions: string[] } }>(
    "/session/synthesize",
    async (req) => {
      const { sessionId, summary, learnings, decisions } = req.body;
      const note = await vault.readNote(`sessions/${sessionId}.md`);
      if (!note) return { ok: false, error: "Session not found" };

      const report = await synthesis.synthesize(note, summary, learnings, decisions);
      return { ok: true, report };
    }
  );
}
