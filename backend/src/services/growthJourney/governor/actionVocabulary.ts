/**
 * The journey's action-type groupings, in ONE place (Phase 6, T608).
 *
 * `HUMAN_IN_THE_LOOP_ACTIONS` moved here VERBATIM out of `decideForSubject.ts`,
 * where it was module-private. T608's holdout eligibility needs the same set -
 * a handoff to a human is help and can never be withheld to measure lift - and
 * a second copy of it in the experiments module is a second thing to keep in
 * step with the first. `decideForSubject` imports it from here now; importing
 * it FROM `decideForSubject` would have made the cycle
 * `decideForSubject -> assignJourneyArm -> decideForSubject`.
 *
 * Its original comment, kept because the reasoning is the point:
 *
 *   §8's Layer 3 and Layer 4 - the two actions that commit a PERSON - in the
 *   existing vocabulary. No `layer` field is invented for this:
 *   `ExplorerActionType` already names both, and a parallel numbering would be
 *   a second taxonomy to keep in step with the first.
 */
export const HUMAN_IN_THE_LOOP_ACTIONS: ReadonlySet<string> = new Set(['CREATE_HUMAN_TASK', 'SEND_ALI_OUTREACH']);

/**
 * The actions that contact nobody, so there is nothing to withhold from anyone.
 *
 * Holding one of these back is not an experiment arm, it is a no-op recorded as
 * one - which would put subjects in a "control" group that was never going to
 * be contacted and inflate the control denominator with them.
 */
export const NON_SEND_ACTIONS: ReadonlySet<string> = new Set(['WAIT', 'SUPPRESS_CONTACT']);
