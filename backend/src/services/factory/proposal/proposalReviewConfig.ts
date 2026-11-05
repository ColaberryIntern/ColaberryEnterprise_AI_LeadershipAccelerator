/**
 * proposalReviewConfig — the SCORING CONFIG for the Proposal Studio pass rule and gates (P3). These are admin-level
 * settings with the PROMPT's defaults baked in; they are never per-intern. The pass rule reads the weights +
 * thresholds; the gate layer reads which checks each color team opens on.
 *
 * Defaults (PROMPT): weighted >= 95 with per-check floor 85, weights 25/25/15/15/10/10. We assign the two 25-weights
 * to the checks that carry the award — coverage (did we answer every requirement) and evaluator (the Section M
 * simulator) — then proof + clarity at 15, and the deterministic hygiene checks format + fact at 10.
 */
import type { CheckKey, CheckScores, GovProposalGate } from './proposalReviewTypes';

export const CHECK_WEIGHTS: Record<CheckKey, number> = {
  coverage: 25,
  evaluator: 25,
  proof: 15,
  clarity: 15,
  format: 10,
  fact: 10,
};

export const PASS_THRESHOLD = 95; // weighted total must be >= this
export const CHECK_FLOOR = 85;    // no single check may be below this

/** Which checks a gate opens on: a gate becomes reviewable only once the version passes the checks relevant to it.
 *  Pink = real content covered (coverage + fact); Red = evaluator/proof/clarity (scored like evaluators);
 *  Gold = everything (the full pass rule); White Glove = production hygiene (format). */
export const GATE_CHECKS: Record<GovProposalGate, CheckKey[]> = {
  pink: ['coverage', 'fact'],
  red: ['evaluator', 'proof', 'clarity'],
  gold: ['coverage', 'format', 'fact', 'evaluator', 'proof', 'clarity'],
  white_glove: ['format'],
};

/** The weighted total of a score set (0–100). Pure. */
export function weightedTotal(scores: CheckScores): number {
  let total = 0;
  for (const key of Object.keys(CHECK_WEIGHTS) as CheckKey[]) {
    const w = CHECK_WEIGHTS[key];
    const s = Number.isFinite(scores?.[key]) ? scores[key] : 0;
    total += (s * w) / 100;
  }
  return Math.round(total * 100) / 100;
}
