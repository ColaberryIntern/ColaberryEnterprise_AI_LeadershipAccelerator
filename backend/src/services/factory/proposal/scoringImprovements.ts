/**
 * scoringImprovements - the "never runs out of improvements" guarantee (M4-T3).
 *
 * The six-check scorer and the revise loop already exist. The one gap: when a document is still below
 * target but the reviser produced no change and no finding carried a concrete fix, the loop stopped
 * with an EMPTY improvement set - "more iterations won't help" - leaving a below-target document with
 * nothing to do. This module closes that: for any below-target review it ALWAYS returns at least one
 * concrete improvement, synthesizing one from the weakest check when the findings yield none.
 *
 * Pure and deterministic. "Below target" uses the real pass rule (weighted >= PASS_THRESHOLD AND no
 * single check below CHECK_FLOOR AND no fatal finding).
 */
import type { CheckRunResult, CheckKey, CheckScores, CheckFinding } from './proposalReviewTypes';
import { CHECK_WEIGHTS, PASS_THRESHOLD, CHECK_FLOOR } from './proposalReviewConfig';

/** A concrete, actionable addition that raises each check. Used only to guarantee a non-empty set. */
const CHECK_IMPROVEMENT: Record<CheckKey, string> = {
  coverage: 'Cover the requirements the proposal does not yet address: add a section answering each uncovered requirement from the solicitation.',
  format: 'Bring the document into the solicitation format: meet the page limit, include every required section, and follow the mandated order and labeling.',
  fact: 'Replace every unverified claim with a cited fact or remove it. No number, date, price, or past-performance claim may stand without a source.',
  evaluator: 'Rewrite the weakest sections to answer the evaluation criteria directly, in the evaluator\'s own language and weighting, so each scored factor is explicitly addressed.',
  proof: 'Add concrete evidence behind each capability claim: a past-performance reference, a metric, or a named result, rather than an assertion.',
  clarity: 'Tighten the lowest-scoring sections for clarity: shorter sentences, a direct claim up front, and no filler, so an evaluator can grade them quickly.',
};

const CHECK_KEYS = Object.keys(CHECK_WEIGHTS) as CheckKey[];

/** Weighted total (0-100) from the per-check scores, using the configured weights. */
export function weightedScore(scores: CheckScores): number {
  let total = 0;
  let w = 0;
  for (const k of CHECK_KEYS) {
    total += (scores[k] ?? 0) * CHECK_WEIGHTS[k];
    w += CHECK_WEIGHTS[k];
  }
  return w ? total / w : 0;
}

/** The real pass rule, inverted: below target = fails weighted threshold, or any check below the floor, or a fatal. */
export function isBelowTarget(run: { scores: CheckScores; fatal?: CheckFinding[] }): boolean {
  const weighted = weightedScore(run.scores);
  const anyBelowFloor = CHECK_KEYS.some((k) => (run.scores[k] ?? 0) < CHECK_FLOOR);
  const hasFatal = (run.fatal?.length ?? 0) > 0;
  return weighted < PASS_THRESHOLD || anyBelowFloor || hasFatal;
}

/** The lowest-scoring check (ties broken by the earlier key in the canonical order). */
export function lowestCheck(scores: CheckScores): CheckKey {
  return CHECK_KEYS.reduce((lo, k) => ((scores[k] ?? 0) < (scores[lo] ?? 0) ? k : lo), CHECK_KEYS[0]);
}

/**
 * The improvements for a document review.
 *
 * GUARANTEE: when the document is below target, the returned list is NEVER empty. If the findings
 * carry concrete fixes, those are returned; otherwise one is synthesized from the weakest check. At
 * or above target the findings pass through unchanged (which may legitimately be empty).
 */
export function nonEmptyImprovements(
  run: { scores: CheckScores; findings?: CheckFinding[]; fatal?: CheckFinding[] },
): string[] {
  const fromFindings = (run.findings ?? [])
    .map((f) => (f.fixHint && f.fixHint.trim()) || (f.message && f.message.trim()) || '')
    .filter((s) => s.length > 0);

  if (!isBelowTarget(run)) return fromFindings; // passing: whatever the findings say, even nothing

  if (fromFindings.length > 0) return fromFindings;

  // The point the revise loop used to stop with nothing to do: synthesize one concrete addition.
  return [CHECK_IMPROVEMENT[lowestCheck(run.scores)]];
}

/** Convenience over a full CheckRunResult. */
export function improvementsForRun(run: CheckRunResult): string[] {
  return nonEmptyImprovements({ scores: run.scores, findings: run.findings, fatal: run.fatal });
}
