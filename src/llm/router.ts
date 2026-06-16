import { createOllamaAdapter, type OllamaAdapter } from "./ollama.js";
import { createOpenCodeAdapter, type OpenCodeAdapter } from "./opencode.js";
import type { ChatMessage, ChatMode, ChatConfig } from "../types.js";

export interface LLMRouterOptions {
  config: ChatConfig;
  cwd?: string;
}

export function createLLMRouter(opts: LLMRouterOptions) {
  const ollamaInstances = new Map<string, OllamaAdapter>();
  let opencode: OpenCodeAdapter | null = null;

  function getOllama(model?: string) {
    const modelName = model || opts.config.ollama.defaultModel;
    let inst = ollamaInstances.get(modelName);
    if (!inst) {
      inst = createOllamaAdapter({
        endpoint: opts.config.ollama.endpoint,
        model: modelName,
      });
      ollamaInstances.set(modelName, inst);
    }
    return inst;
  }

  function getOpenCode() {
    if (!opencode) {
      opencode = createOpenCodeAdapter({
        command: opts.config.opencode.command,
        agent: opts.config.opencode.agent,
        cwd: opts.cwd,
      });
    }
    return opencode;
  }

  async function chat(
    mode: ChatMode,
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
    model?: string
  ): Promise<void> {
    if (mode === "ollama") {
      const adapter = getOllama(model);
      return adapter.chat(messages, onToken, onDone, onError, signal);
    } else {
      const adapter = getOpenCode();
      return adapter.chat(messages, onToken, onDone, onError, signal);
    }
  }

  async function ping(mode: ChatMode): Promise<boolean> {
    if (mode === "ollama") {
      return getOllama().ping();
    } else {
      return getOpenCode().ping();
    }
  }

  async function listModels(): Promise<string[]> {
    return getOllama().listModels();
  }

  return { chat, ping, listModels };
}

export type LLMRouter = ReturnType<typeof createLLMRouter>;
