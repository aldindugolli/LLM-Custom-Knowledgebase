import type { Vault } from "../core/vault.js";
import type { MiningEngine } from "./extractor.js";
import matter from "gray-matter";

export function createMiningScheduler(vault: Vault, miner: MiningEngine) {
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;

  async function runOnce(): Promise<{ mined: number; totalSaved: number }> {
    if (isRunning) return { mined: 0, totalSaved: 0 };
    isRunning = true;

    try {
      const allNotes = await vault.readAllNotes();
      const completedSessions = allNotes.filter(
        (n) => n.type === "session" && !n.tags.includes("mined")
      );

      let totalSaved = 0;
      for (const session of completedSessions) {
        try {
          const result = await miner.mineFromSession(session, session.frontmatter.project);
          totalSaved += result.saved;

          const raw = await vault.readNote(session.path);
          if (raw) {
            const parsed = matter(raw.content);
            parsed.data.tags = [...new Set([...(parsed.data.tags || []), "mined"])];
            parsed.data.updated = new Date().toISOString();
            const filename = session.path.split("/").pop() || `${session.id}.md`;
            await vault.writeNote("session", filename, matter.stringify(parsed.content, parsed.data));
          }
        } catch (err) {
          console.error(`[Hermes] Mining failed for session ${session.id}:`, err);
        }
      }

      return { mined: completedSessions.length, totalSaved };
    } finally {
      isRunning = false;
    }
  }

  function start(intervalMs: number = 300000): void {
    if (intervalHandle) return;
    intervalHandle = setInterval(runOnce, intervalMs);
  }

  function stop(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  return { runOnce, start, stop };
}

export type MiningScheduler = ReturnType<typeof createMiningScheduler>;
