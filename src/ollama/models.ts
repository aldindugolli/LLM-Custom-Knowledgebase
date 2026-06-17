import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export type UseCase = "coding" | "chat" | "reasoning" | "embedding" | "tool-use";

export interface ModelEntry {
  name: string;
  params: string;
  paramsB: number;
  minRamGB: number;
  minVramGB: number | null;
  diskGB: number;
  useCase: UseCase;
  quality: number;
  speed: number;
}

const MODELS: ModelEntry[] = [
  { name: "nomic-embed-text", params: "137M", paramsB: 0.137, minRamGB: 1, minVramGB: null, diskGB: 0.3, useCase: "embedding", quality: 3, speed: 10 },
  { name: "all-minilm", params: "33M", paramsB: 0.033, minRamGB: 0.5, minVramGB: null, diskGB: 0.05, useCase: "embedding", quality: 2, speed: 10 },

  { name: "llama3.2:3b", params: "3B", paramsB: 3, minRamGB: 4, minVramGB: null, diskGB: 2, useCase: "chat", quality: 6, speed: 8 },
  { name: "llama3.2:1b", params: "1B", paramsB: 1, minRamGB: 2, minVramGB: null, diskGB: 0.7, useCase: "chat", quality: 4, speed: 9 },
  { name: "llama3.1:8b", params: "8B", paramsB: 8, minRamGB: 8, minVramGB: 6, diskGB: 4.7, useCase: "chat", quality: 8, speed: 5 },
  { name: "mistral:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 4.1, useCase: "chat", quality: 7, speed: 6 },
  { name: "gemma2:9b", params: "9B", paramsB: 9, minRamGB: 8, minVramGB: 6, diskGB: 5.5, useCase: "chat", quality: 8, speed: 5 },
  { name: "gemma2:2b", params: "2B", paramsB: 2, minRamGB: 2, minVramGB: null, diskGB: 1.6, useCase: "chat", quality: 5, speed: 9 },
  { name: "qwen2.5:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 4.4, useCase: "chat", quality: 7, speed: 6 },
  { name: "qwen2.5:3b", params: "3B", paramsB: 3, minRamGB: 4, minVramGB: null, diskGB: 1.9, useCase: "chat", quality: 5, speed: 8 },

  { name: "codellama:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 3.8, useCase: "coding", quality: 7, speed: 5 },
  { name: "codellama:13b", params: "13B", paramsB: 13, minRamGB: 16, minVramGB: 12, diskGB: 7.5, useCase: "coding", quality: 8, speed: 3 },
  { name: "codellama:34b", params: "34B", paramsB: 34, minRamGB: 32, minVramGB: 24, diskGB: 19, useCase: "coding", quality: 9, speed: 1.5 },
  { name: "deepseek-coder:6.7b", params: "6.7B", paramsB: 6.7, minRamGB: 8, minVramGB: 6, diskGB: 3.9, useCase: "coding", quality: 7, speed: 5 },
  { name: "deepseek-coder:33b", params: "33B", paramsB: 33, minRamGB: 32, minVramGB: 24, diskGB: 18, useCase: "coding", quality: 9, speed: 1.5 },
  { name: "qwen2.5-coder:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 4.5, useCase: "coding", quality: 7, speed: 6 },
  { name: "qwen2.5-coder:1.5b", params: "1.5B", paramsB: 1.5, minRamGB: 2, minVramGB: null, diskGB: 1, useCase: "coding", quality: 5, speed: 9 },
  { name: "qwen2.5-coder:0.5b", params: "0.5B", paramsB: 0.5, minRamGB: 1, minVramGB: null, diskGB: 0.4, useCase: "coding", quality: 3, speed: 10 },
  { name: "stable-code:3b", params: "3B", paramsB: 3, minRamGB: 4, minVramGB: null, diskGB: 1.8, useCase: "coding", quality: 5, speed: 8 },

  { name: "deepseek-r1:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 4.5, useCase: "reasoning", quality: 8, speed: 4 },
  { name: "deepseek-r1:14b", params: "14B", paramsB: 14, minRamGB: 16, minVramGB: 12, diskGB: 9, useCase: "reasoning", quality: 9, speed: 2.5 },
  { name: "deepseek-r1:32b", params: "32B", paramsB: 32, minRamGB: 32, minVramGB: 24, diskGB: 20, useCase: "reasoning", quality: 9, speed: 1 },
  { name: "qwq:32b", params: "32B", paramsB: 32, minRamGB: 32, minVramGB: 24, diskGB: 19, useCase: "reasoning", quality: 9, speed: 1 },

  { name: "llama3.1:8b", params: "8B", paramsB: 8, minRamGB: 8, minVramGB: 6, diskGB: 4.7, useCase: "tool-use", quality: 8, speed: 5 },
  { name: "qwen2.5:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 4.4, useCase: "tool-use", quality: 7, speed: 6 },
  { name: "mistral-nemo:12b", params: "12B", paramsB: 12, minRamGB: 12, minVramGB: 10, diskGB: 7, useCase: "tool-use", quality: 8, speed: 4 },
  { name: "mistral:7b", params: "7B", paramsB: 7, minRamGB: 8, minVramGB: 6, diskGB: 4.1, useCase: "tool-use", quality: 7, speed: 6 },
  { name: "phi4:14b", params: "14B", paramsB: 14, minRamGB: 16, minVramGB: 12, diskGB: 9.1, useCase: "tool-use", quality: 8, speed: 3.5 },
];

function getOllamaHome(): string {
  const home = os.homedir();
  return process.env.OLLAMA_MODELS || path.join(home, ".ollama", "models");
}

function parseParamsFromManifest(name: string): { paramsB: number; diskGB: number } | null {
  try {
    const manifestPath = path.join(getOllamaHome(), "manifests", "registry.ollama.ai", "library", name.replace(":", path.sep));
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    let totalSize = 0;
    for (const layer of manifest.layers || []) {
      totalSize += layer.size || 0;
    }
    return { paramsB: 0, diskGB: Math.round(totalSize / 1073741824 * 10) / 10 };
  } catch {
    return null;
  }
}

export function getInstalledModels(): string[] {
  try {
    const out = execSync("ollama list", { encoding: "utf-8", timeout: 5000 });
    const names: string[] = [];
    for (const line of out.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts[0]) names.push(parts[0]);
    }
    return names;
  } catch {
    return [];
  }
}

export function getAllModels(): ModelEntry[] {
  return MODELS;
}

export function getModelsByUseCase(useCase: UseCase): ModelEntry[] {
  return MODELS.filter((m) => m.useCase === useCase);
}
