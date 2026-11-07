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

/**
 * v3 (T13) GATE AUTOMATION CONFIG. The AI judge records the AI gates automatically when the version passes their
 * checks (`decided_by:'ai_judge'`); the human gate (Gold) is the single package Go/No-go a person gives, never the
 * AI. This split is the operating model's spine: AI builds + judges, a human gives one Go at Gold.
 */
export const AI_GATES: GovProposalGate[] = ['pink', 'red', 'white_glove'];
export const HUMAN_GATES: GovProposalGate[] = ['gold'];
/** The PROMPT names for the same split (config surface D13). */
export const aiGates = AI_GATES;
export const humanGates = HUMAN_GATES;
export const isAiGate = (gate: GovProposalGate): boolean => AI_GATES.includes(gate);
export const isHumanGate = (gate: GovProposalGate): boolean => HUMAN_GATES.includes(gate);

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
