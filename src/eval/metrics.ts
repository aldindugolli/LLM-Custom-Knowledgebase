import type { Vault } from "../core/vault.js";
import type { SearchEngine } from "../core/search.js";

interface EvalQuery {
  query: string;
  expectedIds: string[];
}

interface EvalResult {
  query: string;
  retrievedIds: string[];
  expectedIds: string[];
  recall: number;
  mrr: number;
}

export function createEvaluator(vault: Vault, search: SearchEngine) {
  async function evaluate(testSet: EvalQuery[]): Promise<{
    results: EvalResult[];
    avgRecall: number;
    avgMRR: number;
  }> {
    const results: EvalResult[] = [];

    for (const { query, expectedIds } of testSet) {
      const retrieved = await search.search({ query, limit: 10 });
      const retrievedIds = retrieved.map((r) => r.note.id);

      const relevantFound = retrievedIds.filter((id) => expectedIds.includes(id)).length;
      const recall = expectedIds.length > 0 ? relevantFound / expectedIds.length : 0;

      let mrr = 0;
      for (let i = 0; i < retrievedIds.length; i++) {
        if (expectedIds.includes(retrievedIds[i])) {
          mrr = 1 / (i + 1);
          break;
        }
      }

      results.push({ query, retrievedIds, expectedIds, recall: +recall.toFixed(3), mrr: +mrr.toFixed(3) });
    }

    const total = results.length;
    const avgRecall = results.reduce((s, r) => s + r.recall, 0) / total;
    const avgMRR = results.reduce((s, r) => s + r.mrr, 0) / total;

    return { results, avgRecall: +avgRecall.toFixed(3), avgMRR: +avgMRR.toFixed(3) };
  }

  return { evaluate };
}
