import { evaluateFreshness } from './freshness';
import { hardStopReason } from './candidates/hardStop';
import { activationRescue } from './candidates/activationRescue';
import { highIntent } from './candidates/highIntent';
import { frictionRecovery } from './candidates/frictionRecovery';
import {
  inConversation,
  personalisedLearning,
  community,
  generalNurture,
  referral,
} from './candidates/nurture';
import { arbitrate } from './arbiter';
import { evaluateContact } from './contactPolicy';
import type {
  Candidate,
  ContactPolicyInput,
  ContentAssetQuery,
  GovernorContext,
  SuppressedCandidate,
} from './types';

/**
 * Explorer Growth OS — one decision for one learner. Plan §9; EPIC 4 T004.
 *
 * freshness gate → hard stop → generate → arbitrate → contact policy → record.
 *
 * SHADOW MODE. This returns a decision to be persisted with `executed: false`.
 * It enqueues nothing and calls no send path — enforced structurally by the
 * whitelist guard, which fails if this module ever imports a mailer.
 *
 * EVERY LEARNER GETS A ROW, INCLUDING `WAIT`. Silence has to be recorded, or
 * "why did nobody hear from us" is unanswerable — and that question is the
 * whole reason the suppression record exists.
 */

/** Bumped when tiers, thresholds or generators change. NOT NULL on the table. */
export const RULESET_VERSION = 'epic4-v1';

export interface Decision {
  enrollment_id: string;
  decision_date: string;
  ruleset_version: string;
  action_type: string;
  campaign_key: string | null;
  channel: string;
  candidate_actions: Candidate[];
  suppressed_actions: SuppressedCandidate[];
  /** Always false in this epic. EPIC 6 owns execution. */
  executed: boolean;
  rationale: string[];
  /** Present when the winning action was permitted without consent evidence. */
  consent_note?: string;
  /**
   * What the WINNING candidate asks content for. EPIC 5.
   *
   * A pointer, not a re-derivation. `candidate_actions` holds every candidate's
   * `required_assets`, so a caller wanting the winner's had to match on
   * `(action_type, campaign_key)` and hope that pair is unique. It is today, but
   * "mostly unique" is the reasoning that produced a 276-vs-143 double count
   * during this epic's own discovery, and resolving the wrong candidate's assets
   * would attach content to a decision that never chose it.
   *
   * Still PURE: this is data the arbiter already had and discarded, not I/O.
   * Resolution happens in the run loop, so this function stays database-free.
   */
  required_assets: ContentAssetQuery[];
}

/** UTC day key. Matches the UNIQUE (enrollment_id, decision_date) index. */
function decisionDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function waitDecision(
  ctx: GovernorContext,
  reason: string,
  candidates: Candidate[] = [],
  suppressed: SuppressedCandidate[] = [],
): Decision {
  return {
    enrollment_id: ctx.enrollment_id,
    decision_date: decisionDate(ctx.asOf),
    ruleset_version: RULESET_VERSION,
    action_type: 'WAIT',
    campaign_key: null,
    channel: 'none',
    candidate_actions: candidates,
    suppressed_actions: suppressed,
    executed: false,
    rationale: [reason],
    // No winner, so nothing to resolve. Empty rather than absent: the run loop
    // iterates this unconditionally and an undefined would be a crash on the
    // 10 learners who WAIT.
    required_assets: [],
  };
}

/** Every generator, in no particular order — the arbiter decides precedence. */
const GENERATORS = [
  frictionRecovery,
  inConversation,
  highIntent,
  activationRescue,
  personalisedLearning,
  community,
  generalNurture,
  referral,
];

export interface DecideOptions {
  /** Resolved fresh by the caller; never read from the stored profile. */
  policyInputFor: (candidate: Candidate) => ContactPolicyInput;
  /** The profile timestamps, for the staleness gate. */
  profileTimestamps: { created_at: Date | string; scores_computed_at: Date | string | null };
}

/**
 * Decide for one learner. Pure given its inputs — the caller does the I/O, so
 * the whole decision path is testable without a database.
 */
export function decideForLearner(ctx: GovernorContext, opts: DecideOptions): Decision {
  // 1. Freshness. §8.3: refuse on a stale profile rather than deciding on data
  //    that may be wrong. Fail-closed by design.
  const freshness = evaluateFreshness(opts.profileTimestamps, ctx.asOf);
  if (!freshness.fresh) {
    return waitDecision(ctx, `refused: profile ${freshness.reason}`);
  }

  // 2. Tier 0. Terminates entirely — a converted learner is never enqueued,
  //    which is how the 7 staff accounts stay out of acquisition messaging.
  const stop = hardStopReason(ctx);
  if (stop) {
    return waitDecision(ctx, `hard stop: ${stop}`);
  }

  // 3. Generate.
  const candidates = GENERATORS.map((g) => g(ctx)).filter((c): c is Candidate => c !== null);
  if (candidates.length === 0) {
    return waitDecision(ctx, 'no candidate applies');
  }

  // 4. Arbitrate.
  const { winner, suppressed } = arbitrate(candidates, ctx);
  if (!winner) {
    return waitDecision(ctx, 'no winner after arbitration', candidates, suppressed);
  }

  // 5. Contact policy on the WINNER.
  //
  //    Checked after arbitration rather than before, deliberately: a candidate
  //    blocked by policy should be recorded as "chosen, then blocked, and here
  //    is why", which is far more useful to a human than never appearing. The
  //    cost is one extra decision cycle if the winner is blocked, and that is
  //    the right trade in shadow mode where nothing is sent anyway.
  const verdict = evaluateContact(winner, opts.policyInputFor(winner));
  if (!verdict.allowed) {
    return waitDecision(
      ctx,
      `winner blocked by contact policy: ${verdict.reason}`,
      candidates,
      [...suppressed, { action_type: winner.action_type, campaign_key: winner.campaign_key, reason: verdict.reason }],
    );
  }

  const decision: Decision = {
    enrollment_id: ctx.enrollment_id,
    decision_date: decisionDate(ctx.asOf),
    ruleset_version: RULESET_VERSION,
    action_type: winner.action_type,
    campaign_key: winner.campaign_key,
    channel: winner.channel,
    candidate_actions: candidates,
    suppressed_actions: suppressed,
    executed: false,
    rationale: winner.rationale,
    required_assets: winner.required_assets,
  };

  // Carry the "we had no consent evidence" flag onto the row, so the shadow
  // review can show exactly which learners were permitted by a default rule
  // rather than by anything they actually agreed to.
  if (verdict.allowed && verdict.basis === 'no_evidence') {
    decision.consent_note = verdict.note;
  }

  return decision;
}
