import type { HardwareInfo } from "./hwinfo.js";
import type { ModelEntry, UseCase } from "./models.js";

export interface ScoredModel {
  name: string;
  params: string;
  ramGB: number;
  diskGB: number;
  useCase: UseCase;
  quality: number;
  score: number;
  installed: boolean;
  reason: string;
}

export function scoreModels(
  models: ModelEntry[],
  hw: HardwareInfo,
  installed: Set<string>,
  useCase: UseCase
): ScoredModel[] {
  return models
    .map((m) => scoreOne(m, hw, installed.has(m.name), useCase))
    .filter((m) => m !== null)
    .sort((a, b) => b.score - a.score) as ScoredModel[];
}

function scoreOne(
  m: ModelEntry,
  hw: HardwareInfo,
  installed: boolean,
  useCase: UseCase
): ScoredModel | null {
  const ramFit = calcRamFit(m.minRamGB, hw.freeRamGB);
  if (ramFit <= 0) return null;

  const vramBonus = calcVramBonus(m.minVramGB, hw.vramGB);
  const useCaseMatch = m.useCase === useCase ? 1.0 : m.useCase === "chat" ? 0.6 : 0.3;
  const quality = Math.min(1, m.quality / 10);
  const speed = Math.min(1, m.speed / 10);
  const diskFit = hw.diskFreeGB >= m.diskGB ? 1.0 : hw.diskFreeGB >= m.diskGB * 0.5 ? 0.5 : 0;

  const score = 0.30 * ramFit + 0.20 * vramBonus + 0.20 * useCaseMatch + 0.15 * quality + 0.10 * speed + 0.05 * diskFit;

  const reasons: string[] = [];
  if (ramFit >= 0.9) reasons.push("fits comfortably in RAM");
  else if (ramFit >= 0.5) reasons.push("tight on RAM but usable");
  else reasons.push("may be slow — low free RAM");

  if (vramBonus >= 0.9) reasons.push("fits entirely in VRAM");
  else if (vramBonus >= 0.5) reasons.push("partial GPU offload possible");
  else if (hw.gpu) reasons.push("exceeds VRAM, CPU fallback");
  else reasons.push("CPU-only (no GPU detected)");

  if (m.useCase === useCase) reasons.push(`optimal for ${useCase}`);
  if (installed) reasons.push("already downloaded");
  if (diskFit < 1) reasons.push("low disk space for this model");

  return {
    name: m.name,
    params: m.params,
    ramGB: m.minRamGB,
    diskGB: m.diskGB,
    useCase: m.useCase,
    quality: m.quality,
    score: +score.toFixed(3),
    installed,
    reason: reasons.join("; "),
  };
}

function calcRamFit(minRamGB: number, freeRamGB: number): number {
  if (freeRamGB >= minRamGB * 1.5) return 1.0;
  if (freeRamGB >= minRamGB) return 0.6 + 0.4 * ((freeRamGB - minRamGB) / (minRamGB * 0.5));
  if (freeRamGB >= minRamGB * 0.5) return 0.3 * (freeRamGB / minRamGB);
  return 0;
}

function calcVramBonus(minVramGB: number | null, vramGB: number | null): number {
  if (!vramGB) return 0;
  if (!minVramGB) return 0.5;
  if (vramGB >= minVramGB * 1.2) return 1.0;
  if (vramGB >= minVramGB) return 0.8;
  if (vramGB >= minVramGB * 0.5) return 0.4;
  return 0.2;
}
