const DEFAULT_HALF_LIFE = 90;
const MIN_SCORE = 0.1;

function getHalfLife(): number {
  const env = process.env.HERMES_DECAY_DAYS;
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_HALF_LIFE;
}

export function applyDecay(lastReferenced: Date | string | undefined | null, halfLife?: number): number {
  if (!lastReferenced) return 1.0;
  const hLife = halfLife || getHalfLife();
  const last = typeof lastReferenced === "string" ? new Date(lastReferenced) : lastReferenced;
  if (isNaN(last.getTime())) return 1.0;
  const daysSinceAccess = (Date.now() - last.getTime()) / 86400000;
  if (daysSinceAccess <= 0) return 1.0;
  const decay = Math.exp(-Math.LN2 * daysSinceAccess / hLife);
  return Math.max(MIN_SCORE, decay);
}
