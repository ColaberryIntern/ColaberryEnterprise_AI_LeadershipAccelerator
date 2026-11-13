/**
 * serviceEvidenceScore - how well is one service PROVEN by confirmed case studies? (Services Upgrade 1F / SV2.1)
 *
 * PURE and deterministic: no DB, no clock (the caller passes `currentYear`), no IO. Same input, same output.
 *
 * Formula (accepted by Ali as written in the design package, recorded in directives/our-services-evidence-catalog.md):
 *
 *   score = min(100, 18*inside + 11*outside + freshness + 4*distinctIndustries)
 *   freshness = 20 when the newest confirmed proof is from this year or last year,
 *                8 when it is exactly two years old,
 *                0 otherwise (older, unknown, or no proof)
 *   score = 0 when the service has no confirmed case study at all, whatever the other terms say.
 *
 * Tiers: >= 70 proven, 40-69 emerging, 1-39 thin, 0 none ("No proof").
 *
 * WHY INSIDE OUTWEIGHS OUTSIDE (18 vs 11): an inside case study was built in our own repos, so its claims trace to
 * evidence we hold; an outside case study is a document's claim about itself. Only CONFIRMED links count (a human
 * agreed the record proves the service); suggestions never move the score.
 *
 * Inputs are coerced, never trusted: a negative, fractional or non-numeric count becomes a whole number >= 0, so a
 * malformed row can lower a score to 0 but can never raise one.
 */

export type EvidenceTier = 'proven' | 'emerging' | 'thin' | 'none';

export interface EvidenceScoreInput {
  insideCount: number;
  outsideCount: number;
  /** Year of the newest confirmed proof, or null when unknown / none. */
  newestEvidenceYear: number | null;
  distinctIndustries: number;
  currentYear: number;
}

export interface EvidenceScore {
  score: number;
  tier: EvidenceTier;
  freshness: number;
}

export const EVIDENCE_WEIGHTS = Object.freeze({ inside: 18, outside: 11, industry: 4, freshRecent: 20, freshTwoYears: 8, cap: 100 });

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const year = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null);

/** 20 for this year or last (a future year counts as current), 8 for two years ago, else 0. */
export function freshnessPoints(newestEvidenceYear: number | null, currentYear: number): number {
  const y = year(newestEvidenceYear);
  const now = year(currentYear);
  if (y === null || now === null) return 0;
  const age = now - y;
  if (age <= 1) return EVIDENCE_WEIGHTS.freshRecent;
  if (age === 2) return EVIDENCE_WEIGHTS.freshTwoYears;
  return 0;
}

export function evidenceTier(score: number): EvidenceTier {
  const s = count(score);
  if (s >= 70) return 'proven';
  if (s >= 40) return 'emerging';
  if (s >= 1) return 'thin';
  return 'none';
}

export function scoreServiceEvidence(input: EvidenceScoreInput): EvidenceScore {
  const inside = count(input?.insideCount);
  const outside = count(input?.outsideCount);
  if (inside + outside === 0) return { score: 0, tier: 'none', freshness: 0 };
  const freshness = freshnessPoints(input.newestEvidenceYear, input.currentYear);
  const raw = EVIDENCE_WEIGHTS.inside * inside + EVIDENCE_WEIGHTS.outside * outside + freshness
    + EVIDENCE_WEIGHTS.industry * count(input.distinctIndustries);
  const score = Math.min(EVIDENCE_WEIGHTS.cap, raw);
  return { score, tier: evidenceTier(score), freshness };
}
