import type { PriorityTier } from '../../explorerGrowth/governor/types';
import { registeredKeysForBrand } from '../execution/campaignKeys';
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
 * ─── THE ONE LAYER 2 EXCEPTION: AN APPROVED FLOW (Phase 5 T506) ─────────────
 *
 * A Layer 2 discovery-question email becomes a CANDIDATE - a `SEND_EMAIL` that
 * names the flow campaign's `campaign_key` - only when a human has approved that
 * brand's registered flow campaign (`ctx.approvedFlows`, read by the loader
 * through the same checks the adapter re-runs at enrolment). Otherwise it stays
 * the deferral it always was, with the gap named. The scheduling offer and the
 * reply-aware sequence have no flow campaign yet and stay deferrals, their gap
 * named the same way. The tier order, the suppression vocabulary and the
 * arbitration are untouched.
 *
 * ─── THE OVERLAYS MEAN WHAT T307 SAYS THEY MEAN ─────────────────────────────
 *
 * `NO_RESPONSE` is "has never replied" — and every pre-commercial state that is
 * not the fresh one carries it BY CONSTRUCTION, because a reply is what
 * evidences the qualified state and the ladder never steps down. It is
 * therefore not a reason to withhold Layer-1 nurture: a lead who has never
 * replied is exactly who nurture is for. The first draft read it as "we sent
 * and they went quiet" and refused every email, which made education and the
 * case study unreachable under the real lifecycle — found by T310's verifier
 * driving the real classifiers into these generators. The sanctioned "do not
 * pile on" gate is the contact policy's frequency cap on the winner; the Layer-2
 * reply-aware sequence stays NAMED beside the nurture. A seam test now drives
 * the real lifecycles into these generators and requires every one to fire.
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
    /** A path is known: education first, then a case study once we have reached out. */
    exploring: readonly string[];
    /** They replied: Layer 2 territory — discovery questions and a scheduling offer are named, nurture stops. */
    qualified: readonly string[];
    /** Discovery onward: Layer 4, deferred to the human §8 names. */
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

// T506: `discovery` sits above every Layer-1 nurture tier and below the suppress tier - a reply earned it.
const TIER = { suppress: 1, discovery: 5, stalled: 6, educate: 7, caseStudy: 7, clarify: 8, nudge: 9 } as const satisfies Record<string, PriorityTier>;
const POSITION = { suppress: 90, discovery: 60, stalled: 40, educate: 50, caseStudy: 50, clarify: 40, nudge: 30 } as const;

/** The registered discovery-question flow for this brand, if the registry has one. Never another brand's. */
export function discoveryFlowKeyFor(p: Pick<B2bProgramme, 'brand_slug'>): string | null {
  return registeredKeysForBrand(p.brand_slug).find((k) => k.startsWith('gj_') && k.endsWith('_discovery_questions')) ?? null;
}

const GAP = {
  discovery_questions: 'no_approved_flow:discovery_questions',
  scheduling_offer: 'no_approved_flow:scheduling_offer',
  reply_aware_sequence: 'no_approved_flow:reply_aware_sequence',
} as const;

/* ── small readers ─────────────────────────────────────────────────────────── */

const familyOf = (ctx: JourneySubjectContext) => ctx.classification?.primary_path ?? null;
const has = (ctx: JourneySubjectContext, overlay: string) => ctx.overlays.includes(overlay);
/** The loader's overlay for an open return-to-AI cooldown, and the reason every generator gives while it is on (T405). */
const RETURNED_TO_AI = 'RETURNED_TO_AI';
const RETURNED_TO_AI_COOLDOWN = 'returned_to_ai_cooldown';
const pastLayerOne = (p: B2bProgramme, ctx: JourneySubjectContext) =>
  p.states.qualified.includes(ctx.state) || p.states.commercial.includes(ctx.state) || ctx.state === p.states.terminal;
/** T304's fact: we have already reached out to this person inside the contact window. */
const reachedOutRecently = (ctx: JourneySubjectContext) => ctx.contact.recent_contact_count > 0;

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
  // T405: a human sent this person back with a cooldown (`not_ready` / `nurture`).
  // Time lifts it - the loader stops adding the overlay after `cooldown_until`.
  if (has(ctx, RETURNED_TO_AI)) return RETURNED_TO_AI_COOLDOWN;
  // T402: a human owns the thread. The AI's commercial outreach PAUSES - not
  // outranked, never generated - until the human releases or dispositions.
  // 'no' and 'unknown' change nothing here: 'unknown' is step 4b's business,
  // and it never unlocks anything.
  if (ctx.contact.human_conversation === 'yes') return 'human_in_conversation';
  // NO_RESPONSE is deliberately NOT here: see the header.
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
  const blocked = emailBlock(ctx);
  if (blocked) return blocked;
  // A stalled lead need not have a path — a fresh lead can stall too — but a
  // path that IS known must be one this brand may speak to.
  const f = familyOf(ctx);
  const refused = f ? p.familyGate(f) : null;
  if (refused) return refused;
  return emailCandidate(ctx, 'clarification_question', TIER.stalled, POSITION.stalled, f, [
    `STALLED overlay in ${ctx.state}: a safe clarification re-opens a conversation that stopped`,
    f ? `path=${f}` : 'no path classified yet',
  ]);
};

/**
 * Education fires where a PATH is known: a problem-known state that happens to
 * carry one, or an exploring state we have not yet reached out in. The case
 * study takes over in an exploring state once we HAVE reached out — T304's
 * `recent_contact_count` — so the two are exclusive by evidence, and a second
 * touch in the same state varies the content instead of repeating it.
 */
const capabilityEducation: Generator = (p, ctx) => {
  const problemKnown = p.states.problemKnown.includes(ctx.state);
  const exploring = p.states.exploring.includes(ctx.state);
  if (!problemKnown && !exploring) return 'predicate_false';
  if (has(ctx, 'STALLED')) return 'stalled_overlay_takes_precedence';
  if (exploring && reachedOutRecently(ctx)) return 'already_reached_out:case_study_takes_over';
  const blocked = emailBlock(ctx) ?? familyBlock(p, ctx);
  if (blocked) return blocked;
  const others = ctx.classification?.secondary_paths ?? [];
  return emailCandidate(ctx, 'capability_education', TIER.educate, POSITION.educate, familyOf(ctx), [
    `${ctx.state}: the path is known, educate on the ${familyOf(ctx)} capability`,
    others.length ? `one message only: ${others.join(', ')} noted, not addressed (MULTI_PATH)` : 'single path',
  ]);
};

const caseStudy: Generator = (p, ctx) => {
  if (!p.states.exploring.includes(ctx.state)) return 'predicate_false';
  if (has(ctx, 'STALLED')) return 'stalled_overlay_takes_precedence';
  if (!reachedOutRecently(ctx)) return 'not_yet_reached_out:education_first';
  const blocked = emailBlock(ctx) ?? familyBlock(p, ctx);
  if (blocked) return blocked;
  return emailCandidate(ctx, 'case_study', TIER.caseStudy, POSITION.caseStudy, familyOf(ctx), [
    `${ctx.state}: already reached out (${ctx.contact.recent_contact_count} in the window), a relevant case study for ${familyOf(ctx)}`,
  ]);
};

/**
 * The question that finds a path: for a fresh lead, and for a lead whose
 * PROBLEM is known but whose path is not — which under Enterprise's lifecycle
 * is every `PROBLEM_IDENTIFIED` lead, since a path would have evidenced
 * `EXPLORING_SOLUTIONS`.
 */
const clarificationQuestion: Generator = (p, ctx) => {
  const fresh = p.states.fresh.includes(ctx.state);
  const problemWithoutPath = p.states.problemKnown.includes(ctx.state) && !familyOf(ctx);
  if (!fresh && !problemWithoutPath) return 'predicate_false';
  if (has(ctx, 'STALLED')) return 'stalled_overlay_takes_precedence';
  const blocked = emailBlock(ctx);
  if (blocked) return blocked;
  const f = familyOf(ctx);
  const refused = f ? p.familyGate(f) : null;
  if (refused) return refused;
  return emailCandidate(ctx, 'clarification_question', TIER.clarify, POSITION.clarify, f, [
    fresh ? `${ctx.state}: nothing is known yet, ask a safe clarification question` : `${ctx.state}: the problem is known but no path is, ask which`,
    f ? `path=${f}` : 'no path classified yet',
  ]);
};

const inAppNudge: Generator = (p, ctx) => {
  if (has(ctx, 'DECLINED')) return 'declined_overlay';
  if (has(ctx, RETURNED_TO_AI)) return RETURNED_TO_AI_COOLDOWN;
  if (!ctx.enrollment_id) return 'no_portal_account';
  if (ctx.contact.channels.in_app.eligible !== true) return `in_app_ineligible:${ctx.contact.channels.in_app.reason}`;
  if (pastLayerOne(p, ctx)) return `past_layer_one:${ctx.state}`;
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

/**
 * T506, the one Layer 2 generator. Fires in a qualified state only when the
 * brand's registered discovery flow is APPROVED (`ctx.approvedFlows`), and
 * still under `emailBlock` - a human in the thread, a cooldown, an ineligible
 * address all stop it exactly as they stop Layer 1. `required_assets` is empty
 * because the campaign's own sequence renders the email from its approved
 * instructions; the content gate has nothing to resolve.
 */
const discoveryQuestions: Generator = (p, ctx) => {
  if (!p.states.qualified.includes(ctx.state)) return 'predicate_false';
  const key = discoveryFlowKeyFor(p);
  if (!key) return 'no_registered_flow:discovery_questions';
  if (!(ctx.approvedFlows ?? []).includes(key)) return GAP.discovery_questions;
  const blocked = emailBlock(ctx);
  if (blocked) return blocked;
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: key,
    priority_tier: TIER.discovery,
    intra_tier_score: POSITION.discovery,
    channel: 'email',
    required_assets: [],
    rationale: [`${ctx.state}: one reply earned §8's Layer 2 - discovery questions through the approved flow ${key}`, scoreNote(ctx)],
  };
};

export const B2B_GENERATORS: ReadonlyArray<{ name: string; run: Generator }> = Object.freeze([
  { name: 'declinedSuppress', run: declinedSuppress },
  { name: 'stalledReengage', run: stalledReengage },
  { name: 'capabilityEducation', run: capabilityEducation },
  { name: 'caseStudy', run: caseStudy },
  { name: 'clarificationQuestion', run: clarificationQuestion },
  { name: 'inAppNudge', run: inAppNudge },
  { name: 'discoveryQuestions', run: discoveryQuestions },
]);

/* ── what the strategy WOULD do beyond Layer 1 ─────────────────────────────── */

function deferrals(p: B2bProgramme, ctx: JourneySubjectContext): JourneyDeferral[] {
  const out: JourneyDeferral[] = [];
  const base = { brand: ctx.brand_slug, state: ctx.state, path: familyOf(ctx) };
  // A person a human just sent back is NOT handed back to a human the next
  // night: the commercial-state deferral that Phase 4's writer would turn into
  // a new open handoff waits out the cooldown with everything else.
  const onCooldown = has(ctx, RETURNED_TO_AI);
  if (p.states.qualified.includes(ctx.state)) {
    // ONE reply is §8's Layer-2 trigger — discovery questions, a scheduling
    // offer — not yet a person's time. The first draft named a handoff to
    // Sales here; T310's verifier read §8 more carefully than I had.
    // T506: discovery questions are a CANDIDATE once the brand's flow is approved (`discoveryQuestions`
    // above); until then the deferral stays, with its gap named. The scheduling offer has no flow yet.
    const key = discoveryFlowKeyFor(p);
    if (!key || !(ctx.approvedFlows ?? []).includes(key)) {
      out.push({ would: 'discovery_questions', reason: `qualified_state:${ctx.state}`, payload: { ...base, layer: 2, gap: GAP.discovery_questions } });
    }
    out.push({ would: 'scheduling_offer', reason: `qualified_state:${ctx.state}`, payload: { ...base, layer: 2, gap: GAP.scheduling_offer } });
  }
  if (p.states.commercial.includes(ctx.state) && !onCooldown) {
    out.push({ would: 'create_handoff', reason: `commercial_state:${ctx.state}`, payload: { ...base, layer: 4, owner: p.handoff.owner } });
  }
  if (has(ctx, 'HUMAN_REVIEW') && !onCooldown) {
    out.push({ would: 'create_handoff', reason: 'human_review_overlay', payload: { ...base, layer: 4, owner: 'human_review' } });
  }
  if (has(ctx, 'MEETING_NO_SHOW')) {
    out.push({ would: 'scheduling_offer', reason: 'meeting_no_show', payload: { ...base, layer: 2, gap: GAP.scheduling_offer } });
  }
  if (has(ctx, 'NO_RESPONSE')) {
    out.push({ would: 'reply_aware_sequence', reason: 'no_response_overlay', payload: { ...base, layer: 2, gap: GAP.reply_aware_sequence } });
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
  // The cooldown outranks the state: nothing is proposed AND nothing is deferred while it is on.
  if (has(ctx, RETURNED_TO_AI)) return RETURNED_TO_AI_COOLDOWN;
  if (p.states.qualified.includes(ctx.state)) return `qualified_state_needs_layer_2:${ctx.state}`;
  if (p.states.commercial.includes(ctx.state)) return `commercial_state_needs_layer_4:${ctx.state}`;
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
