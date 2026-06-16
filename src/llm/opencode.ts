import { spawn } from "node:child_process";
import type { ChatMessage } from "../types.js";

export interface OpenCodeOptions {
  command: string;
  agent: string;
  cwd?: string;
}

export function createOpenCodeAdapter(opts: OpenCodeOptions) {
  async function chat(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const userMsg = messages.find((m) => m.role === "user")?.content || "";
    const sysMsg = messages.find((m) => m.role === "system")?.content || "";

    const prompt = sysMsg ? `[Context]\n${sysMsg}\n\n[Question]\n${userMsg}` : userMsg;

    try {
      const child = spawn(opts.command, ["--agent", opts.agent, prompt], {
        cwd: opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        signal,
      });

      let buffer = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        buffer += text;
        onToken(text);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        buffer += text;
        onToken(text);
      });

      child.on("error", (err) => {
        if ((err as any).name === "AbortError") return;
        onError(err);
      });

      child.on("close", (code) => {
        if (code !== 0 && !buffer) {
          onError(new Error(`opencode exited with code ${code}`));
        }
        onDone();
      });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      onError(err);
    }
  }

  async function ping(): Promise<boolean> {
    try {
      const child = spawn(opts.command, ["--version"], {
        stdio: "pipe",
        shell: true,
      });
      return new Promise((resolve) => {
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      });
    } catch {
      return false;
    }
  }

  return { chat, ping };
}

export type OpenCodeAdapter = ReturnType<typeof createOpenCodeAdapter>;
