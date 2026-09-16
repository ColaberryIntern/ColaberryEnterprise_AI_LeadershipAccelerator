import type { JourneySubjectContext, LearnerFacts } from '../../governor/types';
import { BUSINESS_STATES, DEFERRED_STATES as BUSINESS_DEFERRED } from '../../lifecycle/businessLifecycle';
import { FLOTATION_STATES, DEFERRED_STATES as FLOTATION_DEFERRED } from '../../lifecycle/aiFlotationLifecycle';
import { JOURNEY_PROGRAMS } from '../../../../seeds/growthJourney/journeyProgramDefinitions';
import { BRAND_OFFER_POLICIES, INERT_ON_CREATE, allowedFamiliesFor } from '../../../../seeds/growthJourney/offerPolicyDefinitions';
import { brandBySlug } from './phase2Fixtures';
import { channel, contact } from './learnerFixtures';

/**
 * T313 — the shadow-run fixtures: the world the loader reads, the signals a
 * subject carries, and one Colaberry Business and one AI Flotation subject per
 * reachable lifecycle state. The learner fixtures and the §16 scenarios are
 * `phase3Scenarios.ts`; every fixture is driven end to end through T311's
 * writer by `shadowRuns.phase3.test.ts`.
 *
 * DERIVED FROM THE SEEDS. Brands and tenants come from the ecosystem seed
 * (through Phase 2's fixture helpers), programmes from the programme seed, the
 * offer policy the gate consults from the policy seed — served as rows exactly
 * as `seedBrandOfferPolicies` would write them, `INERT_ON_CREATE` included. A
 * fixture states the SIGNALS a subject carries (lead columns, counted outcomes,
 * a classification, a previous projection, contact evidence, Explorer facts)
 * and never a state: the state is what the real lifecycle says about those
 * signals, and the test pins that it says what the fixture expects.
 *
 * ─── TWO FACTS THE FIXTURES STATE, CARRIED FROM T311 ────────────────────────
 *
 * `isCustomer` means "an enrolment exists", and the subject resolver walks
 * enrollment -> lead and never lead -> enrollment. So for every `lead:`
 * anchored subject it is false, and the customer signal is `pipeline_stage =
 * enrolled` alone. The CUSTOMER and PROJECT_STARTED fixtures below reach their
 * terminal state that way, and a test asserts the resolver's answer for a lead
 * anchor carries no enrolment. Widening the resolver is its own change.
 *
 * `asked.evaluating_90_days` is owned and decided, not wired: nothing records
 * the asking, so that dimension is a named gap on every business decision.
 *
 * ─── WHAT A SHADOW DECISION LOOKS LIKE TODAY ────────────────────────────────
 *
 * Every programme is `draft`; no brand's policy row has an approved landing
 * page or collection, so `approved_content_ready` is false everywhere and the
 * content gate refuses every citation as `content_not_approved`; four of the
 * eight content purposes and all three journey purposes are declared gaps.
 * Most decisions are therefore WAIT with a named reason, which is the phase's
 * exit criterion honestly met — "one governed next action per subject OR A
 * NAMED REFUSAL". The fixtures expect exactly that, and the ones that can win
 * (a DECLINED subject's suppression) show the winner path is real.
 */

export const AS_OF = new Date('2026-09-15T12:00:00Z');
const LEAD_CREATED = new Date('2026-08-01T00:00:00Z');
export const ENTERED_LONG_AGO = new Date('2026-07-01T00:00:00Z');

export type GjBrandSlug = 'cpn' | 'colaberry-training' | 'colaberry-enterprise' | 'ai-flotation';
export const GJ_BRANDS: readonly GjBrandSlug[] = ['cpn', 'colaberry-training', 'colaberry-enterprise', 'ai-flotation'];

/* ── the world the loader reads, derived from the seeds ─────────────────────── */

export interface BrandRow { id: string; slug: string; tenant_id: string }
export interface ProgramRow { id: string; slug: string; kind: string; status: string; brand_id: string }

export function brandRow(slug: GjBrandSlug): BrandRow {
  const b = brandBySlug(slug);
  return { id: b.brand_id, slug: b.brand_slug, tenant_id: b.tenant_id };
}

export function programRow(slug: GjBrandSlug): ProgramRow {
  const def = JOURNEY_PROGRAMS.find((p) => p.brand_slug === slug);
  if (!def) throw new Error(`no programme seeded for ${slug}`);
  return { id: `p-${slug}`, slug: def.slug, kind: def.kind, status: 'draft', brand_id: brandRow(slug).id };
}

export function tenantSlugOf(slug: GjBrandSlug): string {
  return brandBySlug(slug).tenant_slug;
}

/** The families the seed lets a brand offer — the oracle for "no cross-brand path". */
export function allowedFor(slug: GjBrandSlug): string[] {
  return allowedFamiliesFor(tenantSlugOf(slug), slug);
}

/**
 * One `brand_offer_policies` row as the seed writes it, or null. `contentReady`
 * names brands whose policy an operator has since approved content for — the
 * future state one test uses to reach the per-asset gate.
 */
export function policyRowFor(brandId: string, offerFamily: string, contentReady: ReadonlySet<string> = new Set()): Record<string, unknown> | null {
  const slug = GJ_BRANDS.find((s) => brandRow(s).id === brandId);
  if (!slug) return null;
  const defs = BRAND_OFFER_POLICIES.filter((d) => d.tenant_slug === tenantSlugOf(slug) && d.brand_slug === slug);
  const deny = defs.find((d) => d.decision === 'deny' && d.offer_families.includes(offerFamily as never));
  const allow = defs.find((d) => d.decision === 'allow' && d.offer_families.includes(offerFamily as never));
  const def = deny ?? allow;
  if (!def) return null;
  return {
    id: `pol-${slug}-${offerFamily}`,
    brand_id: brandId,
    offer_family: offerFamily,
    decision: def.decision,
    effective_from: null,
    effective_to: null,
    ...INERT_ON_CREATE,
    approved_landing_pages: contentReady.has(slug) ? ['/approved'] : [],
  };
}

/* ── signals ────────────────────────────────────────────────────────────────── */

export interface LeadSignals {
  id: number;
  email: string;
  phone: string | null;
  created_at: Date;
  pipeline_stage?: string | null;
  idea_input?: string | null;
  selected_systems?: string[] | null;
  maturity_score?: number | null;
  estimated_roi?: number | null;
  industry?: string | null;
  lead_temperature?: string | null;
}

export interface ClassificationSignals {
  id: string;
  brand_relationship: string;
  primary_path: string | null;
  secondary_paths: string[];
  intent: string | null;
  requires_human_review: boolean;
  source_step: number;
}

export interface Counts {
  inbound: { replied: number; booked_meeting: number; answered: number; declined: number };
  appointments: { scheduled: number; completed: number; no_show: number; cancelled: number };
  hasDeliveryEngagement: boolean;
}

export const NONE: Counts = {
  inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
  appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
  hasDeliveryEngagement: false,
};
export const counts = (over: Partial<{ inbound: Partial<Counts['inbound']>; appointments: Partial<Counts['appointments']>; hasDeliveryEngagement: boolean }> = {}): Counts => ({
  inbound: { ...NONE.inbound, ...(over.inbound ?? {}) },
  appointments: { ...NONE.appointments, ...(over.appointments ?? {}) },
  hasDeliveryEngagement: over.hasDeliveryEngagement ?? false,
});

/** Contact evidence as T304 resolves it, by recipe name. */
export type ContactRecipe = 'open' | 'reached_out' | 'opted_out' | 'dnd' | 'consent_revoked' | 'email_paused' | 'all_closed';
export function contactFor(recipe: ContactRecipe): JourneySubjectContext['contact'] {
  switch (recipe) {
    case 'open':
      return contact();
    case 'reached_out':
      return { ...contact(), recent_contact_count: 1, hours_since_last_contact: 40 };
    case 'opted_out':
      return contact({ email: channel(false, 'lead_unsubscribed', 'lead_status') });
    case 'dnd':
      return contact({ email: channel(false, 'lead_dnd', 'lead_status'), sms: channel(false, 'lead_dnd', 'lead_status') });
    case 'consent_revoked':
      return contact({ email: channel(false, 'revoked', 'consent') });
    case 'email_paused':
      return contact({ email: channel(false, 'brand_channel_paused', 'brand_preference') });
    case 'all_closed':
      return contact({ email: channel(false, 'brand_channel_paused', 'brand_preference'), in_app: channel(false, 'no_portal_session', 'none') });
  }
}

/* ── the fixture ────────────────────────────────────────────────────────────── */

export interface ShadowFixture {
  key: string;
  /** The §16 letter this fixture demonstrates, when it does. */
  scenario: string | null;
  brand: GjBrandSlug;
  anchor: { leadId: number } | { enrollmentId: string };
  subject: { lead_id: number | null; enrollment_id: string | null; email: string };
  lead: LeadSignals | null;
  classification: ClassificationSignals | null;
  /** The previous `growth_journey_profiles` projection, when one exists. */
  profile: { state: string; state_entered_at: Date; created_at: Date } | null;
  counts: Counts;
  contact: ContactRecipe;
  /** Explorer's facts for a learner with a profile; null for a subject Explorer does not know. */
  learner: LearnerFacts | null;
  expect: {
    /** What the real lifecycle (or Explorer, or the declared absence) says. */
    state: string;
    overlays?: string[];
    action: string;
    reason: RegExp;
  };
}

let nextLead = 1000;
/** Lead ids come from a counter so a run is reproducible; `allFixtures` resets it. */
export function resetLeadIds(): void {
  nextLead = 1000;
}
export const lead = (over: Partial<LeadSignals> = {}): LeadSignals => {
  const id = over.id ?? ++nextLead;
  return { id, email: `subject-${id}@example.com`, phone: null, created_at: LEAD_CREATED, ...over };
};

export const classified = (brand: GjBrandSlug, path: string | null, intent: string | null, over: Partial<ClassificationSignals> = {}): ClassificationSignals => ({
  id: `c-${brand}-${path ?? intent ?? 'none'}`,
  brand_relationship: brand,
  primary_path: path,
  secondary_paths: [],
  intent,
  requires_human_review: false,
  source_step: 3,
  ...over,
});

export function b2b(
  brand: 'colaberry-enterprise' | 'ai-flotation',
  key: string,
  over: Partial<Omit<ShadowFixture, 'expect'>> & { expect: ShadowFixture['expect'] },
): ShadowFixture {
  const l = over.lead === undefined ? lead() : over.lead;
  return {
    key: `${brand}/${key}`,
    scenario: null,
    brand,
    anchor: { leadId: l?.id ?? 0 },
    subject: { lead_id: l?.id ?? null, enrollment_id: null, email: l?.email ?? 'nobody@example.com' },
    lead: l,
    classification: null,
    profile: null,
    counts: NONE,
    contact: 'open',
    learner: null,
    ...over,
  };
}

export const WAIT = 'WAIT';
export const CONTENT_GAP = /^content_gap:/;
export const NO_FAMILY_GAP = /^content_gap:content_no_offer_family:clarification_question/;
export const NOT_APPROVED = /^content_gap:content_not_approved/;

/** Colaberry Business: one fixture per reachable state, signals per T307's evidence rules. */
export function businessFixtures(): ShadowFixture[] {
  const B = 'colaberry-enterprise' as const;
  return [
    b2b(B, 'NEW_BUSINESS_LEAD', { expect: { state: 'NEW_BUSINESS_LEAD', overlays: [], action: WAIT, reason: NO_FAMILY_GAP } }),
    b2b(B, 'PROBLEM_IDENTIFIED', {
      lead: lead({ idea_input: 'our invoicing takes three people a week' }),
      expect: { state: 'PROBLEM_IDENTIFIED', overlays: ['NO_RESPONSE'], action: WAIT, reason: NO_FAMILY_GAP },
    }),
    b2b(B, 'EXPLORING_SOLUTIONS', {
      scenario: 'D',
      lead: lead({ idea_input: 'automate client onboarding end to end', industry: 'logistics' }),
      classification: classified(B, 'workflow_automation', 'automation_request'),
      expect: { state: 'EXPLORING_SOLUTIONS', overlays: ['NO_RESPONSE'], action: WAIT, reason: NOT_APPROVED },
    }),
    b2b(B, 'QUALIFIED_OPPORTUNITY', {
      classification: classified(B, 'business_training', 'training_request'),
      counts: counts({ inbound: { replied: 1 } }),
      expect: { state: 'QUALIFIED_OPPORTUNITY', overlays: [], action: WAIT, reason: /^no_candidate:qualified_state_needs_layer_2:QUALIFIED_OPPORTUNITY$/ },
    }),
    b2b(B, 'DISCOVERY_READY', {
      classification: classified(B, 'ai_consulting', 'consulting_request'),
      counts: counts({ inbound: { replied: 1 }, appointments: { scheduled: 1 } }),
      expect: { state: 'DISCOVERY_READY', overlays: [], action: WAIT, reason: /^no_candidate:commercial_state_needs_layer_4:DISCOVERY_READY$/ },
    }),
    b2b(B, 'PROPOSAL_OR_PAYMENT_READY', {
      lead: lead({ pipeline_stage: 'proposal_sent' }),
      classification: classified(B, 'application_build', 'build_request'),
      counts: counts({ inbound: { replied: 2 } }),
      expect: { state: 'PROPOSAL_OR_PAYMENT_READY', overlays: [], action: WAIT, reason: /^no_candidate:commercial_state_needs_layer_4:PROPOSAL_OR_PAYMENT_READY$/ },
    }),
    // Lead-anchored: the terminal state is reached by the pipeline_stage SIGNAL alone (see the header).
    b2b(B, 'CUSTOMER', {
      lead: lead({ pipeline_stage: 'enrolled' }),
      classification: classified(B, 'business_training', 'training_request'),
      expect: { state: 'CUSTOMER', overlays: [], action: WAIT, reason: /^hard_stop:converted$/ },
    }),
  ];
}

/** AI Flotation: one fixture per reachable state, signals per T308's evidence rules. */
export function flotationFixtures(): ShadowFixture[] {
  const F = 'ai-flotation' as const;
  return [
    b2b(F, 'NEW_PROJECT_LEAD', { expect: { state: 'NEW_PROJECT_LEAD', overlays: [], action: WAIT, reason: NO_FAMILY_GAP } }),
    b2b(F, 'IDEA_OR_PROBLEM_CAPTURED', {
      lead: lead({ idea_input: 'a dispatch app for our drivers' }),
      expect: { state: 'IDEA_OR_PROBLEM_CAPTURED', overlays: ['NO_RESPONSE'], action: WAIT, reason: NO_FAMILY_GAP },
    }),
    b2b(F, 'PROBLEM_CLARIFIED', {
      lead: lead({ idea_input: 'a dispatch app', selected_systems: ['samsara'] }),
      classification: classified(F, 'application_build', 'build_request'),
      expect: { state: 'PROBLEM_CLARIFIED', overlays: ['NO_RESPONSE'], action: WAIT, reason: NOT_APPROVED },
    }),
    b2b(F, 'SOLUTION_VISUALIZED', {
      scenario: 'E',
      lead: lead({ idea_input: 'a dispatch app', selected_systems: ['samsara'], maturity_score: 61, estimated_roi: 120000 }),
      classification: classified(F, 'application_build', 'build_request'),
      expect: { state: 'SOLUTION_VISUALIZED', overlays: ['NO_RESPONSE'], action: WAIT, reason: NOT_APPROVED },
    }),
    b2b(F, 'BUILD_QUALIFIED', {
      classification: classified(F, 'application_build', 'build_request'),
      counts: counts({ inbound: { replied: 1 } }),
      expect: { state: 'BUILD_QUALIFIED', overlays: [], action: WAIT, reason: /^no_candidate:qualified_state_needs_layer_2:BUILD_QUALIFIED$/ },
    }),
    b2b(F, 'DISCOVERY_READY', {
      classification: classified(F, 'ai_project', 'project_request'),
      counts: counts({ inbound: { booked_meeting: 1 }, appointments: { scheduled: 1 } }),
      expect: { state: 'DISCOVERY_READY', overlays: [], action: WAIT, reason: /^no_candidate:commercial_state_needs_layer_4:DISCOVERY_READY$/ },
    }),
    b2b(F, 'PROPOSAL_OR_PAYMENT_READY', {
      lead: lead({ pipeline_stage: 'proposal_sent' }),
      classification: classified(F, 'paid_discovery', 'discovery_request'),
      counts: counts({ inbound: { replied: 1 } }),
      expect: { state: 'PROPOSAL_OR_PAYMENT_READY', overlays: [], action: WAIT, reason: /^no_candidate:commercial_state_needs_layer_4:PROPOSAL_OR_PAYMENT_READY$/ },
    }),
    b2b(F, 'PROJECT_STARTED', {
      classification: classified(F, 'application_build', 'build_request'),
      counts: counts({ inbound: { replied: 1 }, hasDeliveryEngagement: true }),
      expect: { state: 'PROJECT_STARTED', overlays: [], action: WAIT, reason: /^hard_stop:converted$/ },
    }),
  ];
}

/** The states no fixture can reach, with the reason the lifecycle itself declares. */
export function deferredStates(): Array<{ program: GjBrandSlug; state: string; reason: string }> {
  return [
    ...BUSINESS_DEFERRED.map((d) => ({ program: 'colaberry-enterprise' as const, state: d.state, reason: d.reason })),
    ...FLOTATION_DEFERRED.map((d) => ({ program: 'ai-flotation' as const, state: d.state, reason: d.reason })),
  ];
}

export const REACHABLE_BUSINESS_STATES = BUSINESS_STATES.filter((s) => !BUSINESS_DEFERRED.some((d) => d.state === s));
export const REACHABLE_FLOTATION_STATES = FLOTATION_STATES.filter((s) => !FLOTATION_DEFERRED.some((d) => d.state === s));
