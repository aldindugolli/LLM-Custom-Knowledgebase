const EMBEDDING_MODEL = process.env.HERMES_EMBEDDING_MODEL || "nomic-embed-text";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

const embedCache = new Map<string, number[]>();

export async function getEmbedding(text: string): Promise<number[]> {
  const key = text.slice(0, 200);
  const cached = embedCache.get(key);
  if (cached) return cached;

  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = await res.json() as { embedding: number[] };
  embedCache.set(key, data.embedding);
  return data.embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
