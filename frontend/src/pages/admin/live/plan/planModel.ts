import type { PlanStage } from '../../../../services/weeklyLivePlanApi';

/** Labels and small pure helpers for the Weekly Live planner. The weights mirror backend/src/services/weeklyLive/scoring.ts. */
export const FACTORS: Readonly<Record<number, string>> = {
  1: 'News', 2: 'Debate', 3: 'Famous people', 4: 'Trend', 5: 'Money', 6: 'Technology', 7: 'Fear', 8: 'Sports and entertainment', 9: 'Seasonal', 10: 'Achievement',
};
export const TEACH: readonly [string, string, number][] = [
  ['demand', 'Proven demand', 20], ['viewer', 'Right viewer', 15], ['promise', 'Five-word promise', 15], ['proof', 'Proof only you have', 15], ['news', 'News hook', 15], ['tension', 'Tension', 10], ['series', 'Series fit', 10],
];
export const VIRAL: readonly [string, number][] = [
  ['Opening hook', 20], ['Retention', 15], ['Emotion', 15], ['Shareability', 10], ['Relevance', 10], ['Novelty', 8], ['Storytelling', 7], ['Practical value', 5], ['Visual and audio', 5], ['Timing', 5],
];
export const CONVERT: readonly [string, number][] = [['Speaks to the buyer', 30], ['Clear next step', 25], ['Our proof, not a tip', 25], ['Trust, no hype', 20]];
export const BANDS: readonly [string, string][] = [['90 and up', 'Prioritize'], ['85 to 89.9', 'Approve'], ['70 to 84.9', 'Improve'], ['Under 70', 'Start over']];
export const GATE = 85;
export const STAGE_LABEL: Readonly<Record<PlanStage, string>> = {
  queued: 'Starting', signals: 'Finding and dating news stories', demand: 'Measuring YouTube demand', topics: 'Writing and scoring topics', done: 'Finished', failed: 'Stopped',
};
export const STAGE_ORDER: readonly PlanStage[] = ['signals', 'demand', 'topics'];

export const tone = (score: number): 'good' | 'fair' | 'low' => (score >= GATE ? 'good' : score >= 70 ? 'fair' : 'low');

/** Today in Central time, as YYYY-MM-DD. */
export function centralToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** The next Monday after today: the weekly live's day. */
export function nextMonday(now: Date = new Date()): string {
  const d = new Date(`${centralToday(now)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}
export function shortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
/** Whole days from one date to another (negative when the second is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
