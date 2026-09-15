import type { PriorityTier } from '../../explorerGrowth/governor/types';
import { tierZeroStopsFromContact } from '../governor/contactEvidence';
import type {
  HardStopFlags,
  JourneyCandidate,
  JourneyContentPurpose,
  JourneyDeferral,
  JourneyProgramKind,
  JourneyStrategy,
  JourneySubjectContext,
} from '../governor/types';

/**
 * §8 Layer-1 candidate generation for the two business programmes (T310).
 *
 * ─── ONE SET OF GENERATORS, TWO CONFIGURATIONS ──────────────────────────────
 *
 * Colaberry Enterprise (§5.3) and AI Flotation (§5.4) propose the same KINDS of
 * next step — a clarification question to a fresh lead, capability or solution
 * education once the problem is known, a case study once they are exploring,
 * a re-engagement when a conversation has stalled — over different state
 * vocabularies, with a different family boundary and a different human owner
 * when the lead outgrows Layer 1. Writing the generators twice would be two
 * places to get the layer rule wrong, so there is one set here, parameterised
 * on a `B2bProgramme` that `businessCandidates.ts` and
 * `aiFlotationCandidates.ts` each supply.
 *
 * ─── LAYER 1 ONLY. LAYERS 2-4 ARE NAMED, NEVER GENERATED ────────────────────
 *
 * A generator here may propose an approved email, an in-app nudge, or a
 * suppression. It may NOT propose an SMS, a call, a reply-aware sequence, an
 * Ali outreach or a human task — those are §8's Layers 2-4, consent-gated or
 * capacity-gated, and Phase 4/5's to build. When a subject has outgrown Layer
 * 1 (a commercially qualified state, a no-show, a review flag) the strategy
 * says what it WOULD do in `defer(ctx)`: a `create_handoff` shape with the
 * owner §8 names, recorded on the decision and never applied. The layer test
 * pins the action set, and the plan's control — emit a Layer 3 candidate —
 * fails it.
 *
 * ─── A CANDIDATE CARRIES ITS CONTENT NEED, AND THE GATE DECIDES ─────────────
 *
 * Every email candidate declares a journey content purpose with the offer
 * family and programme it speaks for. T305's gate resolves it; today every
 * journey purpose is a declared gap (`governor/contentGate.ts`), so these
 * candidates win arbitration and then WAIT with the gap named — which is the
 * specified behaviour, and the record a content author needs.
 *
 * ─── TIERS ARE POSITIONS, NOT MEASUREMENTS ──────────────────────────────────
 *
 * Priority tiers follow Explorer's ladder (lower wins): a suppression on a
 * decline at 1 so nothing else can fire that cycle; a stalled re-engagement at
 * 6, beside Explorer's activation rescue; education and a case study at 7,
 * beside its personalised learning; a first clarification at 8; an in-app
 * nudge at 9. Intra-tier scores are constants, as Explorer's nurture uses —
 * a position in the tier, never a score of the person. The states that select
 * each email candidate are mutually exclusive, so no two of them ever share a
 * tier for one subject. T306's dimensions are cited in the rationale where
 * they carry a value and otherwise named as absent.
 */

/** The §8 layers, by action type. Layer 1 is what a generator here may emit. */
export const ACTION_LAYER: Readonly<Record<string, 1 | 2 | 3 | 4>> = Object.freeze({
  SEND_EMAIL: 1,
  SHOW_IN_APP_NUDGE: 1,
  RECOMMEND_LESSON: 1,
  INVITE_TO_EVENT: 1,
  RECOVER_FRICTION: 1,
  WAIT: 1,
  SUPPRESS_CONTACT: 1,
  SEND_SMS: 2,
  SCHEDULE_VOICE: 2,
  ENTER_SUBCAMPAIGN: 2,
  EXIT_SUBCAMPAIGN: 2,
  SEND_ALI_OUTREACH: 3,
  CREATE_HUMAN_TASK: 4,
});

/** The channels a Layer-1 B2B candidate may name. SMS and voice are Layer 2. */
export const LAYER_ONE_CHANNELS: ReadonlySet<string> = new Set(['email', 'in_app', 'none']);

export interface B2bProgramme {
  program_kind: Exclude<JourneyProgramKind, 'learner'>;
  brand_slug: string;
  ruleset_version: string;
  states: {
    /** Nothing is known yet: ask. */
    fresh: readonly string[];
    /** The problem is known: educate on the capability or solution. */
    problemKnown: readonly string[];
    /** They are weighing options: a case study. */
    exploring: readonly string[];
    /** Layer 2+ territory: deferred to the human §8 names. */
    commercial: readonly string[];
    terminal: string;
  };
  /** §8 Layer 4: who a commercially qualified subject is handed to. */
  handoff: { owner: string };
  /** Why a family may not be proposed under this brand, or null when it may. The generation-side half of the boundary. */
  familyGate: (family: string) => string | null;
}

export interface NotEmitted {
  generator: string;
  reason: string;
}

export interface B2bGeneration {
  candidates: JourneyCandidate[];
  not_emitted: NotEmitted[];
  deferred: JourneyDeferral[];
}

export type B2bStrategy = JourneyStrategy & { generateWithReport: (ctx: JourneySubjectContext) => B2bGeneration };

const TIER = { suppress: 1, stalled: 6, educate: 7, caseStudy: 7, clarify: 8, nudge: 9 } as const satisfies Record<string, PriorityTier>;
const POSITION = { suppress: 90, stalled: 40, educate: 50, caseStudy: 50, clarify: 40, nudge: 30 } as const;

/* ── small readers ─────────────────────────────────────────────────────────── */

const familyOf = (ctx: JourneySubjectContext) => ctx.classification?.primary_path ?? null;
const has = (ctx: JourneySubjectContext, overlay: string) => ctx.overlays.includes(overlay);
const pastLayerOne = (p: B2bProgramme, ctx: JourneySubjectContext) =>
  p.states.commercial.includes(ctx.state) || ctx.state === p.states.terminal;

/** What T306 measured, for the rationale — named where it has a value, and named as absent otherwise. */
function scoreNote(ctx: JourneySubjectContext): string {
  const valued = ctx.scores.dimensions.filter((d) => d.value !== null).map((d) => `${d.key}=${d.value}`);
  return valued.length ? `scores: ${valued.join(', ')}` : `scores: none measured (${ctx.scores.gaps.length} gaps)`;
}

/** The reasons no email may be proposed at all, shared by every email generator. */
function emailBlock(ctx: JourneySubjectContext): string | null {
  // A person who said no gets the suppression and NOTHING ELSE proposed - not
  // merely outranked at arbitration, but never generated, so the record does
  // not show nurture being considered for them.
  if (has(ctx, 'DECLINED')) return 'declined_overlay';
  if (has(ctx, 'HUMAN_REVIEW')) return 'human_review_overlay';
  if (has(ctx, 'NO_RESPONSE')) return 'no_response_overlay';
  if (ctx.contact.channels.email.eligible !== true) return `email_ineligible:${ctx.contact.channels.email.reason}`;
  return null;
}

/** The reasons a family-specific email may not be proposed, on top of `emailBlock`. */
function familyBlock(p: B2bProgramme, ctx: JourneySubjectContext): string | null {
  if (!ctx.classification) return 'no_classification';
  const f = familyOf(ctx);
  if (!f) return 'classification_names_no_path';
  return p.familyGate(f);
}

function emailCandidate(
  ctx: JourneySubjectContext,
  purpose: JourneyContentPurpose,
  tier: PriorityTier,
  position: number,
  family: string | null,
  rationale: string[],
): JourneyCandidate {
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: null,
    priority_tier: tier,
    intra_tier_score: position,
    channel: 'email',
    required_assets: [
      {
        asset_type: purpose,
        ...(family ? { offer_family: family } : {}),
        ...(ctx.program_slug ? { program_slug: ctx.program_slug } : {}),
      },
    ],
    rationale: [...rationale, scoreNote(ctx)],
  };
}

/* ── the generators: a candidate, or the reason there is none ──────────────── */

type Generator = (p: B2bProgramme, ctx: JourneySubjectContext) => JourneyCandidate | string;

const declinedSuppress: Generator = (_p, ctx) => {
  if (!has(ctx, 'DECLINED')) return 'predicate_false';
  return {
    action_type: 'SUPPRESS_CONTACT',
    campaign_key: null,
    priority_tier: TIER.suppress,
    intra_tier_score: POSITION.suppress,
    channel: 'none',
    required_assets: [],
    rationale: ['DECLINED overlay: the person said no, and nothing else may fire this cycle'],
  };
};

const stalledReengage: Generator = (p, ctx) => {
  if (!has(ctx, 'STALLED')) return 'predicate_false';
  if (pastLayerOne(p, ctx)) return `stalled_in_commercial_state:${ctx.state}`;
  const blocked = emailBlock(ctx) ?? familyBlock(p, ctx);
  if (blocked) return blocked;
  return emailCandidate(ctx, 'clarification_question', TIER.stalled, POSITION.stalled, familyOf(ctx), [
    `STALLED overlay in ${ctx.state}: a safe clarification re-opens a conversation that stopped`,
    `path=${familyOf(ctx)}`,
  ]);
};

const capabilityEducation: Generator = (p, ctx) => {
  if (!p.states.problemKnown.includes(ctx.state)) return 'predicate_false';
  if (has(ctx, 'STALLED')) return 'stalled_overlay_takes_precedence';
  const blocked = emailBlock(ctx) ?? familyBlock(p, ctx);
  if (blocked) return blocked;
  const others = ctx.classification?.secondary_paths ?? [];
  return emailCandidate(ctx, 'capability_education', TIER.educate, POSITION.educate, familyOf(ctx), [
    `${ctx.state}: the problem is known, educate on the ${familyOf(ctx)} capability`,
    others.length ? `one message only: ${others.join(', ')} noted, not addressed (MULTI_PATH)` : 'single path',
  ]);
};

const caseStudy: Generator = (p, ctx) => {
  if (!p.states.exploring.includes(ctx.state)) return 'predicate_false';
  if (has(ctx, 'STALLED')) return 'stalled_overlay_takes_precedence';
  const blocked = emailBlock(ctx) ?? familyBlock(p, ctx);
  if (blocked) return blocked;
  return emailCandidate(ctx, 'case_study', TIER.caseStudy, POSITION.caseStudy, familyOf(ctx), [
    `${ctx.state}: they are weighing options, a relevant case study for ${familyOf(ctx)}`,
  ]);
};

const clarificationQuestion: Generator = (p, ctx) => {
  if (!p.states.fresh.includes(ctx.state)) return 'predicate_false';
  if (has(ctx, 'STALLED')) return 'stalled_overlay_takes_precedence';
  const blocked = emailBlock(ctx);
  if (blocked) return blocked;
  // A fresh lead may have no path yet; the question is how one gets found.
  const f = familyOf(ctx);
  const refused = f ? p.familyGate(f) : null;
  if (refused) return refused;
  return emailCandidate(ctx, 'clarification_question', TIER.clarify, POSITION.clarify, f, [
    `${ctx.state}: nothing is known yet, ask a safe clarification question`,
    f ? `path=${f}` : 'no path classified yet',
  ]);
};

const inAppNudge: Generator = (p, ctx) => {
  if (has(ctx, 'DECLINED')) return 'declined_overlay';
  if (!ctx.enrollment_id) return 'no_portal_account';
  if (ctx.contact.channels.in_app.eligible !== true) return `in_app_ineligible:${ctx.contact.channels.in_app.reason}`;
  if (pastLayerOne(p, ctx)) return `commercial_state:${ctx.state}`;
  return {
    action_type: 'SHOW_IN_APP_NUDGE',
    campaign_key: null,
    priority_tier: TIER.nudge,
    intra_tier_score: POSITION.nudge,
    channel: 'in_app',
    required_assets: [],
    rationale: ['a portal account exists: the lowest-cost nudge', scoreNote(ctx)],
  };
};

export const B2B_GENERATORS: ReadonlyArray<{ name: string; run: Generator }> = Object.freeze([
  { name: 'declinedSuppress', run: declinedSuppress },
  { name: 'stalledReengage', run: stalledReengage },
  { name: 'capabilityEducation', run: capabilityEducation },
  { name: 'caseStudy', run: caseStudy },
  { name: 'clarificationQuestion', run: clarificationQuestion },
  { name: 'inAppNudge', run: inAppNudge },
]);

/* ── what the strategy WOULD do beyond Layer 1 ─────────────────────────────── */

function deferrals(p: B2bProgramme, ctx: JourneySubjectContext): JourneyDeferral[] {
  const out: JourneyDeferral[] = [];
  const base = { brand: ctx.brand_slug, state: ctx.state, path: familyOf(ctx) };
  if (p.states.commercial.includes(ctx.state)) {
    out.push({ would: 'create_handoff', reason: `commercial_state:${ctx.state}`, payload: { ...base, layer: 4, owner: p.handoff.owner } });
  }
  if (has(ctx, 'HUMAN_REVIEW')) {
    out.push({ would: 'create_handoff', reason: 'human_review_overlay', payload: { ...base, layer: 4, owner: 'human_review' } });
  }
  if (has(ctx, 'MEETING_NO_SHOW')) {
    out.push({ would: 'scheduling_offer', reason: 'meeting_no_show', payload: { ...base, layer: 2 } });
  }
  if (has(ctx, 'NO_RESPONSE')) {
    out.push({ would: 'reply_aware_sequence', reason: 'no_response_overlay', payload: { ...base, layer: 2 } });
  }
  return out;
}

/* ── generation, and the strategy ──────────────────────────────────────────── */

export function generateB2b(p: B2bProgramme, ctx: JourneySubjectContext): B2bGeneration {
  const refuse = (reason: string): B2bGeneration => ({
    candidates: [],
    not_emitted: B2B_GENERATORS.map((g) => ({ generator: g.name, reason })),
    deferred: [],
  });
  if (ctx.program_kind !== p.program_kind) return refuse(`program_kind_not_${p.program_kind}:${ctx.program_kind}`);
  if (ctx.brand_slug !== p.brand_slug) return refuse(`brand_not_${p.brand_slug}:${ctx.brand_slug}`);

  const candidates: JourneyCandidate[] = [];
  const not_emitted: NotEmitted[] = [];
  for (const g of B2B_GENERATORS) {
    const r = g.run(p, ctx);
    if (typeof r === 'string') not_emitted.push({ generator: g.name, reason: r });
    else candidates.push(r);
  }
  return { candidates, not_emitted, deferred: deferrals(p, ctx) };
}

/** The most specific reason nothing was proposed. Pure over the generation record. */
export function b2bEmptyReason(p: B2bProgramme, ctx: JourneySubjectContext, g: B2bGeneration): string | null {
  if (g.candidates.length > 0) return null;
  if (p.states.commercial.includes(ctx.state)) return `commercial_state_needs_layer_2_plus:${ctx.state}`;
  const specific = g.not_emitted.find((n) => n.reason !== 'predicate_false' && n.reason !== 'no_portal_account');
  return specific?.reason ?? null;
}

/** The six stops: the builder's, OR the shared suppression mapping, OR the programme's own terminal state. */
export function b2bHardStops(p: B2bProgramme, ctx: JourneySubjectContext): HardStopFlags {
  const merged: HardStopFlags = { ...ctx.hardStop };
  const fromContact = tierZeroStopsFromContact(ctx.contact);
  for (const key of Object.keys(fromContact) as (keyof typeof fromContact)[]) {
    merged[key] = merged[key] || fromContact[key];
  }
  merged.converted = merged.converted || ctx.state === p.states.terminal;
  return merged;
}

export function makeB2bStrategy(p: B2bProgramme): B2bStrategy {
  return Object.freeze({
    program_kind: p.program_kind,
    ruleset_version: p.ruleset_version,
    hardStops: (ctx: JourneySubjectContext) => b2bHardStops(p, ctx),
    generate: (ctx: JourneySubjectContext) => generateB2b(p, ctx).candidates,
    emptyReason: (ctx: JourneySubjectContext) => b2bEmptyReason(p, ctx, generateB2b(p, ctx)),
    defer: (ctx: JourneySubjectContext) => generateB2b(p, ctx).deferred,
    generateWithReport: (ctx: JourneySubjectContext) => generateB2b(p, ctx),
  });
}
