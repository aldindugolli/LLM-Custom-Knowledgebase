import type { Note, ImportanceFactors } from "../types.js";
import { applyDecay } from "./decay.js";

interface ScoreWeights {
  retrievalFrequency: number;
  projectRelevance: number;
  recency: number;
  decisionStatus: number;
  crossLinkDensity: number;
  userEmphasis: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  retrievalFrequency: 0.15,
  projectRelevance: 0.20,
  recency: 0.15,
  decisionStatus: 0.15,
  crossLinkDensity: 0.15,
  userEmphasis: 0.20,
};

function getWeights(): ScoreWeights {
  const env = process.env.HERMES_SCORE_WEIGHTS;
  if (env) {
    try {
      return { ...DEFAULT_WEIGHTS, ...JSON.parse(env) };
    } catch { /* ignore */ }
  }
  return DEFAULT_WEIGHTS;
}

export function calculateImportance(note: Note, allNotes?: Note[]): { score: number; factors: ImportanceFactors } {
  const w = getWeights();

  const retrievalFrequency = Math.min(1.0, (note.wikilinks.length + note.backlinks.length) / 20);

  const projectRelevance = note.frontmatter.project ? 1.0 : 0.0;

  const decay = applyDecay(note.updated);
  const recency = decay;

  const decisionStatus = note.type === "decision" ? 0.3 : 0.0;

  const totalNotes = allNotes?.length || 1;
  const crossLinkDensity = Math.min(1.0, (note.wikilinks.length + note.backlinks.length) / totalNotes * 10);

  const userEmphasis = (note.frontmatter.importance || 3) / 5;

  const factors: ImportanceFactors = {
    retrievalFrequency: +(retrievalFrequency * 100).toFixed(2),
    projectRelevance: +(projectRelevance * 100).toFixed(2),
    recency: +(recency * 100).toFixed(2),
    decisionStatus: +(decisionStatus * 100).toFixed(2),
    crossLinkDensity: +(crossLinkDensity * 100).toFixed(2),
    userEmphasis: +(userEmphasis * 100).toFixed(2),
  };

  const score = +(
    w.retrievalFrequency * retrievalFrequency +
    w.projectRelevance * projectRelevance +
    w.recency * recency +
    w.decisionStatus * decisionStatus +
    w.crossLinkDensity * crossLinkDensity +
    w.userEmphasis * userEmphasis
  ).toFixed(4);

  return { score, factors };
}
