/**
 * AF6.3: the second human signature, and which capability levels need one.
 *
 * ## The ruling, and the translation it required
 *
 * The owner ruled on 2026-11-01, in two parts:
 *
 *   1. The approver of record is **Ali or Kes** — either signature counts, so nothing stalls while
 *      one of them is travelling.
 *   2. A second signature is required **only for `act_audited` and `communicate`**, not for
 *      `suggest`.
 *
 * Part 2 could not be applied as written, because it names levels from the wrong ladder. This
 * platform carries TWO unrelated autonomy models: `observe | suggest | act_audited | communicate`
 * is a property of an AGENT, while `autonomy:R0` … `autonomy:R9` is a property of a CAPABILITY and
 * is what `promotionCriteria.ts` actually gates on. Nothing in the codebase maps one onto the
 * other, so a literal reading of the ruling would have been unenforceable at the point of decision.
 *
 * ## Where the line falls, derived rather than chosen
 *
 * The mapping is taken from `AUTONOMY_MEANINGS` in `autonomyLadder.ts` — the owner's own words for
 * each level — by asking the question the ruling is really about: **does this level cause an effect
 * outside the system?**
 *
 *     R0  define the workflow, requirements, risks            no effect
 *     R1  prepare isolated development, fixtures, tests       no effect
 *     R2  answer questions using approved knowledge           no effect
 *     R3  approved, USER-INITIATED SANDBOX tool operations    sandbox, and a human started it
 *     R4  stateful, multi-step SANDBOX tasks                  sandbox
 *     R5  evaluate in SHADOW MODE against reference outcomes  computes a result, takes no action
 *     ---------------------------------------------------------------------------------------
 *     R6  a separately approved, supervised PRODUCTION pilot  FIRST level with a real-world effect
 *     R7  automate authorized action classes within limits    acts without a human per action
 *     R8  coordinate authorized handoffs with OTHER AGENTS    acts on other agents
 *     R9  reliable operation, monitoring, recovery, ownership  owns the running thing
 *
 * R0–R5 is exactly `suggest`: the agent produces something a human then acts on. R6–R9 is exactly
 * `act_audited` and `communicate`: the agent itself does the thing. So:
 *
 *   > **Two signatures from `autonomy:R6` up. One below it.**
 *
 * This is deliberately the SAME boundary `promotionCriteria.ts` already calls the automating line
 * for `automating_level_without_human_approval` (`> autonomy:R5`). A second threshold one level
 * away from an existing one would be two rules nobody could keep straight, and the existing line
 * is already drawn where production begins.
 *
 * ## Why it keys on the LEVEL and not on `human_approval_required`
 *
 * `human_approval_required: false` is an opt-out that this subsystem has already been burned by:
 * a verifier promoted R6 -> R7 with no human approval at all by setting that flag, which is why
 * `automating_level_without_human_approval` exists. Gating the second signature on the same flag
 * would hand the same opt-out to the same attacker. The requirement comes from where the
 * capability is going, and nothing in the attempt can switch it off.
 *
 * ## NOT WIRED TO ANYTHING YET
 *
 * `evaluatePromotion` has zero production callers — `agentRegistrySeed.ts` says so in a comment
 * about this very module, and a search confirms it. This file makes the owner's ruling
 * representable and enforced AT THE POINT OF DECISION; it does not make any running code ask the
 * question. Wiring the gate to a caller is AF3.5's job, and claiming otherwise would be the
 * "gate that guards nothing" the seed comment is complaining about.
 */

import {
  autonomyIndex,
  isAutonomyStage,
  type AutonomyStage,
} from './autonomyLadder';
import { norm, humanityCheck, isNonHumanIdentity } from './promotionIdentity';
import type { Signature, SecondSignatureRefusal } from './promotionContract';

/**
 * The lowest level that needs two signatures. At or above this, one signature is not enough.
 *
 * Stored as a stage rather than an index so it cannot drift if a level is ever inserted, and
 * compared through `autonomyIndex` so the comparison is ordinal rather than lexical.
 */
export const SECOND_SIGNATURE_FLOOR: AutonomyStage = 'autonomy:R6';

/** The agent-model levels the owner's ruling named, kept so the translation stays auditable. */
export const SECOND_SIGNATURE_AGENT_MODES = Object.freeze(['act_audited', 'communicate'] as const);

/** The agent-model level the owner exempted. */
export const SINGLE_SIGNATURE_AGENT_MODES = Object.freeze(['observe', 'suggest'] as const);

/**
 * Does a promotion INTO this level need two signatures?
 *
 * An unrecognised value returns **false**, and that is load-bearing: `not_a_single_step` already
 * refuses an attempt whose `to_autonomy` is not a valid stage, so returning true here would stack
 * a second, more confusing refusal onto a malformed attempt that is already dead. It does not fail
 * open, because there is no path on which an invalid stage is promoted.
 */
export function requiresSecondSignature(to: unknown): boolean {
  if (!isAutonomyStage(to)) return false;
  return autonomyIndex(to) >= autonomyIndex(SECOND_SIGNATURE_FLOOR);
}

export interface SecondSignatureInput {
  /** The level being promoted INTO. The requirement comes from here and nowhere else. */
  readonly to_autonomy: unknown;
  readonly first: Signature | null | undefined;
  readonly second: Signature | null | undefined;
  readonly proposed_by?: string | null;
  readonly recorded_human_approvers?: ReadonlyArray<string>;
}

/** True when a signature is well-formed: somebody, at some recorded time. */
function isSigned(s: Signature | null | undefined): boolean {
  return Boolean(s && String(s.approver ?? '').trim() && String(s.approved_at ?? '').trim());
}

/**
 * Every way the second signature on this attempt fails. Empty means it is sound.
 *
 * Returns a list rather than a first failure, because an attempt signed twice by the same
 * unrecorded machine should say all three things.
 */
export function evaluateSecondSignature(
  input: SecondSignatureInput,
): ReadonlyArray<SecondSignatureRefusal> {
  if (!requiresSecondSignature(input.to_autonomy)) return [];

  const refusals: SecondSignatureRefusal[] = [];
  const second = input.second;

  // ABSENCE IS NOT APPROVAL. The fifth instance of that lesson in this subsystem, after the empty
  // signals array, the empty thresholds list, the omitted proposed_by and the omitted roster.
  if (!isSigned(second)) {
    refusals.push('second_signature_missing');
    return refusals;
  }
  // Non-null by construction: `isSigned` returned true, so `second` is set.
  const sig = second as Signature;

  // THE ONE FAILURE THIS GATE EXISTS FOR. Two signatures from one person is one signature written
  // twice, and it is the only way to satisfy a two-signature rule while defeating it entirely.
  //
  // Compared through `norm`, which strips zero-width characters: a verifier previously defeated
  // `self_evaluated` with a U+200B inside an otherwise-identical name, and this check is the same
  // shape, so it would have fallen to the same trick. `norm` also folds case and collapses runs of
  // whitespace, so `Ali`, `ali` and `A l i`-with-a-double-space are not three different people.
  if (isSigned(input.first) && norm(input.first?.approver) === norm(sig.approver)) {
    refusals.push('second_signature_repeats_the_first_approver');
  }

  // The second signature is held to EXACTLY the standard of the first, by running the same two
  // gates in the same order. A gate whose second slot is weaker than its first is a gate with a
  // documented way through it, and both codes firing together on an obvious machine is the
  // behaviour `evaluatePromotion` already has for the first approver.
  //
  // A timer, a scheduler or the agent itself is not a human, whatever the field is called.
  if (isNonHumanIdentity(sig.approver)) {
    refusals.push('second_approver_is_not_human');
  }
  // And a denylist cannot establish humanity, so the second approver must be ON RECORD. No roster
  // cannot establish that anybody is a person, so it is refused rather than waved through -- the
  // same reason `evaluatePromotion` refuses a threshold acceptance with no roster behind it.
  const humans = humanityCheck(input.recorded_human_approvers);
  if (!humans.hasRoster || humans.isNotHuman(sig.approver)) {
    refusals.push('second_approver_not_a_recorded_human');
  }

  // Self-approval through the second slot. The first slot has been guarded against this since the
  // ADR; leaving the second unguarded would move the hole rather than close it.
  if (input.proposed_by && norm(input.proposed_by) === norm(sig.approver)) {
    refusals.push('second_approver_is_the_proposer');
  }

  return refusals;
}
