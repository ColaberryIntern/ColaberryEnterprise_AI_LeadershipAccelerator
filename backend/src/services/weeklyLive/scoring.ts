/**
 * Weekly Live topic scoring (Basecamp WL2.2, Ali 2026-11-24). Pure, deterministic arithmetic: the
 * same input always gives the same output, and no AI call ever produces a total. An AI may propose
 * the line scores; this module is the only thing that adds them up and applies the caps.
 *
 *   Teach   = the Idea rubric, ported from .claude/skills/plan-live-session/scripts/score_idea.js
 *             (seven lines scored 0 to 5, weighted to 100, with three caps).
 *   Viral   = the 100-point viral scorecard (ten lines, each scored in points up to its weight).
 *   Convert = buyer fit 30, clear next step 25, our proof 25, trust 20 (points up to each weight).
 *   Topic   = 0.4 Teach + 0.4 Viral + 0.2 Convert, one decimal.
 *
 * Not ported on purpose: score_topics.js (the skill's 0-100 ranking of the twelve weeks by closeness,
 * coverage, demand, buildability and news fit). In the Studio the unit being chosen is a topic, not a
 * week: WL3.3 generates topics across all 12 weeks, the curriculum map (curriculumMap.ts) supplies
 * coverage and the "covered in the last four" skip, demand feeds the Teach demand line, and this topic
 * score ranks the result. A separate week ranking would be a second, competing order.
 *
 * Gate 85. A topic that uses fewer than 3 of the 10 viral factors is flagged and cannot be chosen
 * without an explicit override. Bands: 90+ prioritize, 85 to 89.9 approve, 70 to 84.9 improve,
 * under 70 start over.
 */

export const IDEA_WEIGHTS = { demand: 20, viewer: 15, promise: 15, tension: 10, proof: 15, series: 10, news: 15 } as const;
export const VIRAL_WEIGHTS = {
  hook: 20, retention: 15, emotion: 15, shareability: 10, relevance: 10,
  novelty: 8, storytelling: 7, value: 5, visualAudio: 5, timing: 5,
} as const;
export const CONVERT_WEIGHTS = { buyerFit: 30, nextStep: 25, proof: 25, trust: 20 } as const;

/** The 10 external viral factors a topic can ride (Ali's list, 2026-11-24). Numbered 1 to 10. */
export const VIRAL_FACTORS: Readonly<Record<number, string>> = {
  1: 'AI news about jobs or pay',
  2: 'A public debate',
  3: 'Famous people on AI and work',
  4: 'Trends and memes',
  5: 'Money',
  6: 'Tech releases',
  7: 'Fears',
  8: 'Sports and entertainment',
  9: 'Seasonal events',
  10: 'Achievements and milestones',
};

export const TOPIC_GATE = 85;
export const MIN_VIRAL_FACTORS = 3;

export type IdeaLines = Record<keyof typeof IDEA_WEIGHTS, number>;
export type ViralLines = Record<keyof typeof VIRAL_WEIGHTS, number>;
export type ConvertLines = Record<keyof typeof CONVERT_WEIGHTS, number>;
export type Band = 'prioritize' | 'approve' | 'improve' | 'start_over';

export interface PartScore<L> { lines: L; caps: string[]; total: number; }

export interface TopicScoreInput {
  teach: Partial<IdeaLines>;
  viral: Partial<ViralLines>;
  convert: Partial<ConvertLines>;
  factors: number[];
  /** True when Ali filled the "proof" input on the picker (the Idea rubric's proof cap). */
  proofGiven: boolean;
}

export interface TopicScore {
  teach: PartScore<IdeaLines>;
  viral: PartScore<ViralLines>;
  convert: PartScore<ConvertLines>;
  factors: number[];
  topicScore: number;
  band: Band;
  passesGate: boolean;
  /** Fewer than MIN_VIRAL_FACTORS distinct factors: choosing it needs an override. */
  needsOverride: boolean;
  flags: string[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (v: unknown, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

/** The Idea rubric, exactly as score_idea.js: lines 0..5 (rounded), weighted, then three caps. */
export function scoreTeach(linesIn: Partial<IdeaLines>, proofGiven: boolean): PartScore<IdeaLines> {
  const lines = {} as IdeaLines;
  for (const k of Object.keys(IDEA_WEIGHTS) as (keyof IdeaLines)[]) lines[k] = Math.round(clamp(linesIn[k], 5));
  const caps: string[] = [];
  if (!proofGiven && lines.proof > 2) { lines.proof = 2; caps.push('no proof given: proof line clamped to 2'); }
  let total = (Object.keys(IDEA_WEIGHTS) as (keyof IdeaLines)[]).reduce((t, k) => t + (lines[k] / 5) * IDEA_WEIGHTS[k], 0);
  if (lines.tension <= 1 && lines.demand <= 1 && total > 50) { total = 50; caps.push('tension <= 1 and demand <= 1: capped at 50'); }
  if (lines.proof === 0 && total > 60) { total = 60; caps.push('proof = 0: capped at 60'); }
  return { lines, caps, total: round1(total) };
}

function scorePoints<W extends Record<string, number>>(weights: W, linesIn: Partial<Record<keyof W, number>>): PartScore<Record<keyof W, number>> {
  const lines = {} as Record<keyof W, number>;
  const caps: string[] = [];
  for (const k of Object.keys(weights) as (keyof W)[]) {
    const raw = Number(linesIn[k]);
    lines[k] = clamp(raw, weights[k]);
    if (Number.isFinite(raw) && raw > weights[k]) caps.push(`${String(k)} above its ${weights[k]} points: clamped`);
  }
  const total = (Object.keys(weights) as (keyof W)[]).reduce((t, k) => t + lines[k], 0);
  return { lines, caps, total: round1(total) };
}

export const scoreViral = (l: Partial<ViralLines>): PartScore<ViralLines> => scorePoints(VIRAL_WEIGHTS, l);
export const scoreConvert = (l: Partial<ConvertLines>): PartScore<ConvertLines> => scorePoints(CONVERT_WEIGHTS, l);

/** 0.4 Teach + 0.4 Viral + 0.2 Convert, one decimal. Integer tenths avoid float drift (36.400000000000006). */
export function combine(teach: number, viral: number, convert: number): number {
  return Math.round(teach * 4 + viral * 4 + convert * 2) / 10;
}

export function bandOf(score: number): Band {
  if (score >= 90) return 'prioritize';
  if (score >= 85) return 'approve';
  if (score >= 70) return 'improve';
  return 'start_over';
}

/** Distinct factor numbers 1..10, sorted. Anything else is dropped. */
export function normalizeFactors(factors: number[]): number[] {
  return [...new Set(factors.filter((f) => Number.isInteger(f) && f >= 1 && f <= 10))].sort((a, b) => a - b);
}

export function scoreTopic(input: TopicScoreInput): TopicScore {
  const teach = scoreTeach(input.teach, input.proofGiven);
  const viral = scoreViral(input.viral);
  const convert = scoreConvert(input.convert);
  const factors = normalizeFactors(input.factors);
  const topicScore = combine(teach.total, viral.total, convert.total);
  const needsOverride = factors.length < MIN_VIRAL_FACTORS;
  const flags: string[] = [];
  if (needsOverride) flags.push(`uses ${factors.length} viral factor${factors.length === 1 ? '' : 's'}, needs at least ${MIN_VIRAL_FACTORS}`);
  if (topicScore < TOPIC_GATE) flags.push(`below the ${TOPIC_GATE} gate`);
  return { teach, viral, convert, factors, topicScore, band: bandOf(topicScore), passesGate: topicScore >= TOPIC_GATE && !needsOverride, needsOverride, flags };
}

/**
 * The recommended pick: the highest-scoring topic that clears the gate and has proof. Ties go to the
 * earlier entry (the generator's order), so the pick is stable. Null when nothing qualifies.
 */
export function recommendPick<T extends { score: TopicScore; hasProof: boolean }>(topics: T[]): T | null {
  let best: T | null = null;
  for (const t of topics) {
    if (!t.score.passesGate || !t.hasProof) continue;
    if (!best || t.score.topicScore > best.score.topicScore) best = t;
  }
  return best;
}
