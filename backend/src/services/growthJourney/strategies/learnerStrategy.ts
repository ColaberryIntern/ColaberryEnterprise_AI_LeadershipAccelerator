import { activationRescue } from '../../explorerGrowth/governor/candidates/activationRescue';
import { frictionRecovery } from '../../explorerGrowth/governor/candidates/frictionRecovery';
import { highIntent } from '../../explorerGrowth/governor/candidates/highIntent';
import {
  community,
  generalNurture,
  inConversation,
  personalisedLearning,
  referral,
} from '../../explorerGrowth/governor/candidates/nurture';
import type { Candidate, Generator, GovernorContext, HardStopFlags, PriorityTier } from '../../explorerGrowth/governor/types';
import { tierZeroStopsFromContact } from '../governor/contactEvidence';
import { LEARNER_OFFER_FAMILIES } from '../../../models/OfferFamily';
import { JOURNEY_PROGRAMS } from '../../../seeds/growthJourney/journeyProgramDefinitions';
import { EXPLORER_PROGRAM } from '../explorerProgramBridge';
import type { JourneyCandidate, JourneyStrategy, JourneySubjectContext, LearnerFacts } from '../governor/types';

/**
 * The learner strategy — CPN and Colaberry Training over Explorer's own logic
 * (§5.1, §5.2; Phase 3 T309).
 *
 * ─── ONE STRATEGY, BRANCHING ON EVIDENCE RATHER THAN ON THE BRAND NAME ──────
 *
 * Both learner brands run this. What differs between a subject Explorer knows
 * and one it does not is not which brand they came through but whether an
 * `explorer_journey_profiles` row exists for them — and that table is keyed on
 * `enrollments.id`, so it is the ENROLMENT that decides. A CPN free-training
 * signup who enrolled has a profile and runs through Explorer's generators
 * under the CPN brand; a CPN scholarship lead who never enrolled has nothing,
 * and this strategy says so instead of scoring a person it cannot see.
 *
 * ─── EXPLORER'S GENERATORS, IMPORTED AND UNMODIFIED ─────────────────────────
 *
 * The eight generators below are Explorer's own, called on a `GovernorContext`
 * built from what Explorer knows. This file adds no generator over learner
 * data and changes none — a test pins that the list here is the list
 * `decideForLearner.ts` runs, so the two cannot drift apart silently. Explorer's
 * own `runGovernor` path is untouched and keeps writing its own table; this
 * strategy proposes candidates for `decideForSubject`, which records them in
 * `growth_journey_decisions` and nowhere else.
 *
 * ─── WHAT A SUBJECT WITH NO PROFILE GETS ────────────────────────────────────
 *
 * Every one of the eight generators reads `primary_state`, and most read
 * `scores`, `overlays` and `affinities`. None of that exists for a subject with
 * no profile, so none of the eight is run — each is recorded as NOT EMITTED
 * with the reason `no_learner_profile`, which is a different fact from "ran and
 * found nothing". The one candidate such a subject can honestly get is grounded
 * in Phase 2's classification alone: a general-nurture email for the learner
 * offer family the classifier named, carrying no learner state, no affinity and
 * no Explorer campaign, at Explorer's own general-nurture tier. Its intra-tier
 * score is a constant — a position in the tier, exactly as Explorer's
 * `generalNurture` uses one — and never a measurement of the person.
 *
 * ─── A TRAINING CAMPAIGN KEY IS WITHHELD FROM A NON-TRAINING BRAND ──────────
 *
 * Explorer's `campaign_key`s (`explorer_weekly_digest` and the rest) name
 * Colaberry Training's campaigns: Training's sender, Training's content. Under
 * any other learner brand the key is withheld and the rationale says which key
 * and why, so the ACTION survives arbitration while the Training campaign does
 * not attach to a CPN person. No CPN campaign key is substituted, because no
 * CPN campaign registry exists to draw one from.
 *
 * ─── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
 *
 * No I/O: the facts arrive on the context (`ctx.learner`, loaded by
 * `learnerFacts.ts` through the existing facade). No score, state, overlay or
 * asset is invented for a subject who lacks one. No brand boundary is decided
 * here — `decideForSubject` asks `assertOfferAllowed` for every candidate and
 * again for the winner; this file only declines to propose a family outside the
 * learner ones, which is the generation-side half of the same check T308 made
 * for AI Flotation.
 */

/** Bumped when the branch logic or the classification nurture changes. */
export const LEARNER_RULESET_VERSION = 'p3-learner-v1';

/**
 * Explorer's eight, in Explorer's own order. `decideForLearner.ts` keeps its
 * list module-private; a source-text test asserts the two lists name the same
 * functions, so a ninth generator added there is a failing test here.
 */
export const EXPLORER_GENERATORS: ReadonlyArray<{ name: string; run: Generator }> = Object.freeze([
  { name: 'frictionRecovery', run: frictionRecovery },
  { name: 'inConversation', run: inConversation },
  { name: 'highIntent', run: highIntent },
  { name: 'activationRescue', run: activationRescue },
  { name: 'personalisedLearning', run: personalisedLearning },
  { name: 'community', run: community },
  { name: 'generalNurture', run: generalNurture },
  { name: 'referral', run: referral },
]);

/** The brands whose programme is a learner one, from the programme registry rather than a list typed here. */
export const LEARNER_BRAND_SLUGS: readonly string[] = Object.freeze(
  JOURNEY_PROGRAMS.filter((p) => p.kind === 'learner').map((p) => p.brand_slug),
);

export const NO_LEARNER_PROFILE = 'no_learner_profile';

/** Explorer's general-nurture tier and its intra-tier constant, for the classification-only candidate. */
const CLASSIFICATION_NURTURE_TIER: PriorityTier = 9;
const CLASSIFICATION_NURTURE_POSITION = 30;

export interface NotEmitted {
  generator: string;
  reason: string;
}

export interface LearnerGeneration {
  /** Which evidence the candidates rest on. `none` means a refusal is the honest answer. */
  basis: 'explorer_profile' | 'classification_only' | 'none';
  candidates: JourneyCandidate[];
  /** Every generator that did not run, and why — distinct from ran-and-found-nothing. */
  not_emitted: NotEmitted[];
}

/* ── hard stops ─────────────────────────────────────────────────────────────── */

/**
 * The six tier-0 stops for a learner subject.
 *
 * Starts from what the context builder established and ADDS what can be seen
 * from here; it never clears a flag. The three suppression stops come from
 * T304's evidence through the one programme-neutral mapping in
 * `contactEvidence.ts`, OR-ed in generically so this file names none of those
 * fields itself. `converted` is the one stop only a learner strategy can add:
 * Explorer's state machine's verdict, read rather than re-derived. `killSwitch`
 * and `campaignInactive` have no source here and stay the builder's.
 */
export function learnerHardStops(ctx: JourneySubjectContext): HardStopFlags {
  const merged: HardStopFlags = { ...ctx.hardStop };
  const fromContact = tierZeroStopsFromContact(ctx.contact);
  for (const key of Object.keys(fromContact) as (keyof typeof fromContact)[]) {
    merged[key] = merged[key] || fromContact[key];
  }
  merged.converted = merged.converted || ctx.learner?.primary_state === 'CONVERTED';
  return merged;
}

/* ── the Explorer-shaped context ───────────────────────────────────────────── */

/** Explorer's contactability shape from T304's evidence — one contact source, not a second lookup. */
function contactabilityFrom(ctx: JourneySubjectContext): GovernorContext['contactability'] {
  const pick = (c: { eligible: boolean; reason: string }) => ({ eligible: c.eligible, reason: c.reason });
  const { email, sms, voice, in_app } = ctx.contact.channels;
  return { email: pick(email), sms: pick(sms), voice: pick(voice), in_app: pick(in_app) };
}

/**
 * The `GovernorContext` Explorer's generators expect, built the way
 * `runGovernor.runOne` builds it — same fields, same `days_in_current_state`
 * arithmetic — so that the candidate set is the one Explorer itself would
 * produce for this learner.
 */
export function toGovernorContext(ctx: JourneySubjectContext, facts: LearnerFacts): GovernorContext {
  return {
    enrollment_id: facts.enrollment_id,
    primary_state: facts.primary_state,
    overlays: facts.overlays,
    scores: { e: facts.scores.e, i: facts.scores.i, f: facts.scores.f },
    affinities: facts.affinities,
    readout: facts.readout,
    days_in_current_state: facts.state_entered_at
      ? Math.floor((ctx.asOf.getTime() - facts.state_entered_at.getTime()) / 86_400_000)
      : 0,
    contactability: contactabilityFrom(ctx),
    hardStop: learnerHardStops(ctx),
    asOf: ctx.asOf,
  };
}

/* ── generation ────────────────────────────────────────────────────────────── */

/** A Training campaign key does not attach to a person in another learner brand. */
function withholdForeignCampaign(c: Candidate, brandSlug: string): JourneyCandidate {
  if (brandSlug === EXPLORER_PROGRAM.brandSlug || c.campaign_key === null) return c;
  return {
    ...c,
    campaign_key: null,
    rationale: [
      ...c.rationale,
      `campaign_key ${c.campaign_key} withheld: a ${EXPLORER_PROGRAM.brandSlug} campaign, this subject is ${brandSlug}`,
    ],
  };
}

/**
 * The one candidate a subject with no profile can honestly receive.
 *
 * Grounded in the classification and nothing else: the family must be a
 * learner one (the generation-side half of the brand boundary — the decision
 * side asks `assertOfferAllowed` regardless), and email must be eligible, the
 * same condition Explorer's `generalNurture` requires. The asset query carries
 * the family and the programme so T305's gate can scope it to this brand; with
 * no CPN content declared today that resolves to a named gap, which is the
 * specified behaviour rather than a stand-in for it.
 */
export function classificationNurture(ctx: JourneySubjectContext): JourneyCandidate | null {
  const family = ctx.classification?.primary_path ?? null;
  if (!family || !(LEARNER_OFFER_FAMILIES as readonly string[]).includes(family)) return null;
  if (ctx.contact.channels.email.eligible !== true) return null;
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: null,
    priority_tier: CLASSIFICATION_NURTURE_TIER,
    intra_tier_score: CLASSIFICATION_NURTURE_POSITION,
    channel: 'email',
    required_assets: [
      {
        asset_type: 'weekly_digest',
        offer_family: family,
        ...(ctx.program_slug ? { program_slug: ctx.program_slug } : {}),
      },
    ],
    rationale: [
      `classification-grounded: primary_path=${family}` + (ctx.classification?.intent ? `, intent=${ctx.classification.intent}` : ''),
      'no learner profile: no state, no E/I/F, no affinity — general nurture only',
    ],
  };
}

/**
 * T402: the pause. While a human owns the thread, the AI's outreach to the
 * learner is withheld - the email and the lesson recommendation, the two
 * candidates that would put a second voice in the conversation. Recorded as
 * not emitted with this reason, which is a different fact from ran-and-found-
 * nothing. 'no' and 'unknown' change nothing here; 'unknown' is step 4b's.
 */
const HUMAN_IN_CONVERSATION = 'human_in_conversation';
const PAUSED_ACTIONS: ReadonlySet<string> = new Set(['SEND_EMAIL', 'RECOMMEND_LESSON']);
function pausedForHuman(ctx: JourneySubjectContext, c: JourneyCandidate | Candidate): boolean {
  return ctx.contact.human_conversation === 'yes' && PAUSED_ACTIONS.has(c.action_type);
}

/** Why no candidate could be grounded, for the refusal to name. */
function classificationGap(ctx: JourneySubjectContext): string {
  const family = ctx.classification?.primary_path ?? null;
  if (!ctx.classification) return 'no_classification';
  if (!family) return 'classification_names_no_path';
  if (!(LEARNER_OFFER_FAMILIES as readonly string[]).includes(family)) return `path_not_a_learner_family:${family}`;
  if (ctx.contact.channels.email.eligible !== true) return `email_ineligible:${ctx.contact.channels.email.reason}`;
  return 'no_candidate_grounded';
}

/**
 * Generate, and account for every generator that did not run.
 *
 * `generate` on the strategy returns only the candidates, because that is the
 * contract; this returns the whole picture so the decision writer can record
 * WHY eight generators were silent, which for a CPN subject is the actual
 * finding.
 */
export function generateLearnerCandidates(ctx: JourneySubjectContext): LearnerGeneration {
  if (ctx.program_kind !== 'learner') {
    return {
      basis: 'none',
      candidates: [],
      not_emitted: EXPLORER_GENERATORS.map((g) => ({ generator: g.name, reason: `program_kind_not_learner:${ctx.program_kind}` })),
    };
  }
  if (!LEARNER_BRAND_SLUGS.includes(ctx.brand_slug)) {
    // A learner profile under a business brand is a person with two
    // relationships, and this is the one that must not see learner content.
    return {
      basis: 'none',
      candidates: [],
      not_emitted: EXPLORER_GENERATORS.map((g) => ({ generator: g.name, reason: `brand_not_a_learner_brand:${ctx.brand_slug}` })),
    };
  }

  const facts = ctx.learner ?? null;
  if (facts) {
    const governorCtx = toGovernorContext(ctx, facts);
    const candidates: JourneyCandidate[] = [];
    const not_emitted: NotEmitted[] = [];
    for (const g of EXPLORER_GENERATORS) {
      const c = g.run(governorCtx);
      if (!c) not_emitted.push({ generator: g.name, reason: 'predicate_false' });
      else if (pausedForHuman(ctx, c)) not_emitted.push({ generator: g.name, reason: HUMAN_IN_CONVERSATION });
      else candidates.push(withholdForeignCampaign(c, ctx.brand_slug));
    }
    return { basis: 'explorer_profile', candidates, not_emitted };
  }

  const not_emitted = EXPLORER_GENERATORS.map((g) => ({ generator: g.name, reason: NO_LEARNER_PROFILE }));
  const grounded = classificationNurture(ctx);
  if (grounded && pausedForHuman(ctx, grounded)) {
    return { basis: 'none', candidates: [], not_emitted: [...not_emitted, { generator: 'classificationNurture', reason: HUMAN_IN_CONVERSATION }] };
  }
  if (grounded) return { basis: 'classification_only', candidates: [grounded], not_emitted };
  return {
    basis: 'none',
    candidates: [],
    not_emitted: [...not_emitted, { generator: 'classificationNurture', reason: classificationGap(ctx) }],
  };
}

/* ── the strategy ──────────────────────────────────────────────────────────── */

/**
 * The strategy, with the generation record exposed the way the B2B strategies
 * expose theirs. T313's shadow-run fixtures found the gap: T311's writer
 * persists what each generator declined and why through `generateWithReport`,
 * and without the hook every learner decision's `eligibility.not_emitted` was
 * an empty list - the eight "no profile" entries this module already computed
 * never reached the row.
 */
export type LearnerStrategy = JourneyStrategy & { generateWithReport: (ctx: JourneySubjectContext) => LearnerGeneration };

export const learnerStrategy: LearnerStrategy = Object.freeze({
  program_kind: 'learner' as const,
  ruleset_version: LEARNER_RULESET_VERSION,
  hardStops: learnerHardStops,
  generate: (ctx: JourneySubjectContext): JourneyCandidate[] => generateLearnerCandidates(ctx).candidates,
  generateWithReport: (ctx: JourneySubjectContext): LearnerGeneration => generateLearnerCandidates(ctx),
  emptyReason: (ctx: JourneySubjectContext): string | null => learnerEmptyReason(generateLearnerCandidates(ctx)),
});

/**
 * What a refusal should say when nothing was generated. Pure over the
 * generation record so it is testable without re-running the generators.
 *
 *   * Explorer ran and every predicate was false: nothing to add — the bare
 *     `no_candidate` is Explorer's own "no candidate applies". Unless what
 *     silenced it was the T402 pause, which is named: a human owns the thread.
 *   * No profile: `no_learner_profile:<why the classification could not
 *     ground one either>` — the eight identical entries first, then the one
 *     specific gap, which is the reason worth reading.
 *   * Wrong programme kind or brand: that reason, verbatim.
 */
export function learnerEmptyReason(g: LearnerGeneration): string | null {
  if (g.candidates.length > 0) return null;
  if (g.basis === 'explorer_profile') {
    return g.not_emitted.some((n) => n.reason === HUMAN_IN_CONVERSATION) ? HUMAN_IN_CONVERSATION : null;
  }
  const first = g.not_emitted[0];
  const last = g.not_emitted[g.not_emitted.length - 1];
  if (!first || !last) return null;
  return first.reason === NO_LEARNER_PROFILE ? `${NO_LEARNER_PROFILE}:${last.reason}` : last.reason;
}
