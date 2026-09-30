import { arbitrate } from '../../explorerGrowth/governor/arbiter';
import { hardStopReason } from '../../explorerGrowth/governor/candidates/hardStop';
import { evaluateContact } from '../../explorerGrowth/governor/contactPolicy';
import { evaluateFreshness } from '../../explorerGrowth/governor/freshness';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { OfferNotEligibleError } from '../offerEligibility';
import type {
  DecideDeps,
  DecideOutcome,
  JourneyCandidate,
  JourneyDecision,
  JourneyStrategy,
  JourneySubjectContext,
  JourneySuppression,
} from './types';

/**
 * The one governed decision pipeline, shared by every journey programme
 * (§7.3, §8 layer 0; Phase 3 T303).
 *
 * ─── IT CALLS THE EXISTING ARBITER; IT IS NOT A SECOND GOVERNOR ─────────────
 *
 * `arbitrate`, `hardStopReason`, `evaluateContact` and `evaluateFreshness` are
 * imported above and used as they are. This module contains no comparator over
 * `priority_tier` and no sort of its own — a test scans for exactly that, with
 * a fixture that merely SETS a tier as the negative control, so the scan cannot
 * pass by being too narrow to see anything.
 *
 * ─── IT DECIDES AND RECORDS. IT CANNOT ACT ──────────────────────────────────
 *
 * No mailer, no queue, no campaign engine, no model client, no database write —
 * the caller persists. Gated on the `journeyDecisions` capability, which needs
 * the master flag too; `journeyExecution` is a separate flag and nothing here
 * reads it.
 *
 * ─── ORDER, AND WHY ─────────────────────────────────────────────────────────
 *
 * freshness -> hard stop -> generate -> brand boundary -> unknown-input check ->
 * arbitrate -> contact
 * policy -> content -> answer. Explorer's own order, kept deliberately: a stale
 * profile must not be scored against, and a hard stop must not be reasoned
 * around. A refusal at any step is a recorded answer with a named reason, never
 * an empty result — "one governed action per subject OR a named refusal".
 */

const WAIT = 'WAIT';

/**
 * sec 8's Layer 3 and Layer 4 - the two actions that commit a PERSON - in the
 * existing vocabulary. No `layer` field is invented for this: `ExplorerActionType`
 * already names both, and a parallel numbering would be a second taxonomy to
 * keep in step with the first.
 */
const HUMAN_IN_THE_LOOP: ReadonlySet<string> = new Set(['CREATE_HUMAN_TASK', 'SEND_ALI_OUTREACH']);

/**
 * Why a human action cannot fire right now: which of its two inputs is
 * unknown, and (T403) whether the queue it would hand to is full. Capacity
 * governs the TASK - `CREATE_HUMAN_TASK` is what lands in a queue; Ali's own
 * outreach keeps its own caps in `evaluateAliOutreachEligibility`, so a full
 * sales queue is not a reason to suppress it.
 */
function humanInputBlocks(ctx: JourneySubjectContext, actionType: string): string[] {
  const out: string[] = [];
  if (ctx.contact.human_conversation === 'unknown') out.push('human_conversation_unknown');
  if (ctx.contact.sales_capacity === 'unknown') out.push('sales_capacity_unknown');
  if (ctx.contact.sales_capacity === 'full' && actionType === 'CREATE_HUMAN_TASK') out.push('sales_capacity_full');
  return out;
}

function refusal(
  reason: string,
  strategy: JourneyStrategy,
  extra: Partial<JourneyDecision> = {},
  ctx?: JourneySubjectContext,
): JourneyDecision {
  return {
    selected_action: WAIT,
    selected_path: null,
    selected_channel: null,
    selected_content: null,
    candidates: [],
    suppressed: [],
    // A refusal still records what the strategy would have escalated (T310):
    // "we did nothing, and here is the human step this subject was waiting on"
    // is the row a reviewer needs.
    deferred_actions: ctx ? deferralsOf(strategy, ctx) : [],
    eligibility: null,
    content_gaps: [],
    reason,
    requires_human_review: false,
    ai_involved: false,
    model_version: null,
    ruleset_version: strategy.ruleset_version,
    ...extra,
  };
}

function suppression(c: JourneyCandidate, reason: string): JourneySuppression {
  return { action_type: c.action_type, campaign_key: c.campaign_key, reason };
}

/** What the strategy would escalate to, named and never applied (T310). */
function deferralsOf(strategy: JourneyStrategy, ctx: JourneySubjectContext) {
  return strategy.defer?.(ctx) ?? [];
}

/** The family a candidate would act on, for the brand-boundary check. */
function offerFamilyOf(c: JourneyCandidate, ctx: JourneySubjectContext): string | null {
  const fromAsset = c.required_assets.find((q) => typeof (q as { offer_family?: unknown }).offer_family === 'string');
  if (fromAsset) return (fromAsset as { offer_family?: string }).offer_family ?? null;
  return ctx.classification?.primary_path ?? null;
}

export async function decideForSubject(
  ctx: JourneySubjectContext,
  strategy: JourneyStrategy,
  deps: DecideDeps,
  flags: GrowthJourneyFlags,
): Promise<DecideOutcome> {
  if (!isGrowthJourneyCapabilityEnabled('journeyDecisions', flags)) return { status: 'disabled' };

  // 1. Freshness. Four distinct refusals, not one — `never_scored` is the
  //    honest state for a subject with no score source at all.
  const fresh = evaluateFreshness(ctx.freshness, ctx.asOf);
  if (!fresh.fresh) {
    return { status: 'decided', decision: refusal(`refused: freshness:${fresh.reason}`, strategy, {}, ctx) };
  }

  // 2. Hard stops. The strategy computes them, because Explorer's own wiring
  //    hard-codes three of the six to false and a journey decision must not
  //    inherit that.
  const stop = hardStopReason({ hardStop: strategy.hardStops(ctx) });
  if (stop) {
    return { status: 'decided', decision: refusal(`hard_stop:${stop}`, strategy, {}, ctx) };
  }

  // 3. Generate. A strategy that produced nothing may say why (T309): the
  //    class stays `no_candidate` and the reason is appended, so a subject with
  //    no learner profile reads `no_candidate:no_learner_profile` while every
  //    strategy without the hook reads exactly what it did before.
  const generated = strategy.generate(ctx);
  if (generated.length === 0) {
    const why = strategy.emptyReason?.(ctx) ?? null;
    return { status: 'decided', decision: refusal(why ? `no_candidate:${why}` : 'no_candidate', strategy, {}, ctx) };
  }

  // 4. The brand boundary, on EVERY candidate, before anything is ranked.
  //    A brand may not be offered what its policy denies, whoever proposed it.
  const allowed: JourneyCandidate[] = [];
  const suppressed: JourneySuppression[] = [];
  for (const c of generated) {
    const family = offerFamilyOf(c, ctx);
    if (!family) {
      allowed.push(c);
      continue;
    }
    try {
      await deps.assertOfferAllowed({ brandId: ctx.brand_id, offerFamily: family });
      allowed.push(c);
    } catch (err: unknown) {
      if (!(err instanceof OfferNotEligibleError)) throw err;
      suppressed.push(suppression(c, `offer_not_eligible:${err.decision.reason}`));
    }
  }
  if (allowed.length === 0) {
    return {
      status: 'decided',
      decision: refusal(
        'every_candidate_ineligible',
        strategy,
        { candidates: generated, suppressed, requires_human_review: true },
        ctx,
      ),
    };
  }

  // 4b. An UNKNOWN IS NOT PERMISSION, and this is where that is enforced.
  //     `human_conversation` and `sales_capacity` were `'unknown'` for every
  //     subject until Phase 4 gave each a source (T402 conversation ownership,
  //     T403 queue capacity); a subject the sources cannot answer for is still
  //     unknown, and a candidate that would put a person in the loop is then
  //     suppressed BY NAME rather than emitted and hoped about. A FULL queue
  //     suppresses the task the same way (`sales_capacity_full`). Before
  //     arbitration, deliberately: a blocked human action must not win a tier
  //     and hide a legitimate lower-tier action behind itself.
  //
  //     NOT handled here, and named rather than implied: `human_conversation:
  //     'yes'` stops a duplicate outreach in the GENERATORS (T402's pause) -
  //     a judgement about WHICH action to propose. This step enforces only
  //     that an unknown never unlocks a human action, and a full queue never
  //     takes one.
  const withKnownInputs: JourneyCandidate[] = [];
  for (const c of allowed) {
    const unknowns = HUMAN_IN_THE_LOOP.has(c.action_type) ? humanInputBlocks(ctx, c.action_type) : [];
    if (unknowns.length > 0) suppressed.push(suppression(c, unknowns.join(',')));
    else withKnownInputs.push(c);
  }
  if (withKnownInputs.length === 0) {
    return {
      status: 'decided',
      decision: refusal(
        'every_candidate_needs_an_unknown_input',
        strategy,
        { candidates: generated, suppressed, requires_human_review: true },
        ctx,
      ),
    };
  }

  // 5. THE one arbitration point.
  const { winner, suppressed: outranked } = arbitrate(withKnownInputs);
  for (const s of outranked) suppressed.push({ action_type: s.action_type, campaign_key: s.campaign_key, reason: s.reason });
  if (!winner) {
    return { status: 'decided', decision: refusal('no_winner', strategy, { candidates: generated, suppressed }, ctx) };
  }

  // The boundary AGAIN, on the winner. Defence in depth: the winner comes from
  // the filtered set, so nothing denied can win today - but the exclusion that
  // matters most in this system (no business training under AI Flotation) is
  // specified as two checks, and a decision naming an offer a brand may not
  // make is the one output this phase must never produce.
  const winnerFamily = offerFamilyOf(winner, ctx);
  if (winnerFamily) {
    try {
      await deps.assertOfferAllowed({ brandId: ctx.brand_id, offerFamily: winnerFamily });
    } catch (err: unknown) {
      if (!(err instanceof OfferNotEligibleError)) throw err;
      return {
        status: 'decided',
        decision: refusal(
          `winner_not_eligible:${err.decision.reason}`,
          strategy,
          {
            candidates: generated,
            suppressed: [...suppressed, suppression(winner, `offer_not_eligible:${err.decision.reason}`)],
            requires_human_review: true,
          },
          ctx,
        ),
      };
    }
  }

  const base: JourneyDecision = {
    selected_action: winner.action_type,
    selected_path: offerFamilyOf(winner, ctx),
    selected_channel: winner.channel,
    selected_content: null,
    candidates: generated,
    suppressed,
    deferred_actions: deferralsOf(strategy, ctx),
    eligibility: null,
    content_gaps: [],
    reason: winner.rationale.join('; '),
    requires_human_review: ctx.classification?.requires_human_review ?? false,
    ai_involved: false,
    model_version: null,
    ruleset_version: strategy.ruleset_version,
  };

  // 6. Contact policy. Explorer's precedent: a blocked winner is recorded as
  //    chosen-then-blocked, not silently replaced by the runner-up. The reason
  //    a person was not contacted is itself the answer worth keeping.
  const verdict = evaluateContact(winner, deps.contactPolicyFor(winner, ctx));
  if (!verdict.allowed) {
    return {
      status: 'decided',
      decision: {
        ...base,
        selected_action: WAIT,
        selected_channel: null,
        suppressed: [...suppressed, suppression(winner, `contact_policy:${verdict.reason}`)],
        reason: `chosen_then_blocked:${winner.action_type}:${verdict.reason}`,
      },
    };
  }

  // 7. Content. A gap produces WAIT with the gap named — never a substituted
  //    asset. Until T305 wires the brand-aware resolver, a candidate that asks
  //    for an asset and gets no resolver is a named gap, which is the specified
  //    behaviour rather than a stand-in for it.
  if (winner.required_assets.length > 0) {
    const resolved = deps.resolveContent
      ? await deps.resolveContent(winner, ctx)
      : { assets: [], gaps: ['content_resolver_not_wired'] };
    if (resolved.gaps.length > 0) {
      return {
        status: 'decided',
        decision: {
          ...base,
          selected_action: WAIT,
          selected_channel: null,
          content_gaps: resolved.gaps,
          suppressed: [...suppressed, suppression(winner, `content_gap:${resolved.gaps[0]}`)],
          reason: `content_gap:${resolved.gaps.join(',')}`,
        },
      };
    }
    return {
      status: 'decided',
      decision: { ...base, selected_content: { assets: resolved.assets } },
    };
  }

  return { status: 'decided', decision: base };
}
