import type { ChatMessage } from "../types.js";

export interface OllamaOptions {
  endpoint: string;
  model: string;
  temperature?: number;
}

export function createOllamaAdapter(opts: OllamaOptions) {
  async function chat(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const url = `${opts.endpoint.replace(/\/+$/, "")}/api/chat`;
    const body = {
      model: opts.model,
      messages: messages.map((m) => ({
        role: m.role === "system" ? "system" : m.role,
        content: m.content,
      })),
      stream: true,
      options: { temperature: opts.temperature ?? 0.7 },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        onError(new Error(`Ollama error ${response.status}: ${text}`));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              onToken(parsed.message.content);
            }
            if (parsed.done) {
              onDone();
              return;
            }
          } catch {
            continue;
          }
        }
      }
      onDone();
    } catch (err: any) {
      if (err.name === "AbortError") return;
      onError(err);
    }
  }

  async function ping(): Promise<boolean> {
    try {
      const res = await fetch(`${opts.endpoint.replace(/\/+$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${opts.endpoint.replace(/\/+$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  return { chat, ping, listModels };
}

export type OllamaAdapter = ReturnType<typeof createOllamaAdapter>;
