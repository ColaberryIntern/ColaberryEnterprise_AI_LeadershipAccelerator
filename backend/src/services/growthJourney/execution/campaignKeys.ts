/**
 * The campaigns a journey decision may execute into (Phase 5 T505). PURE, and
 * DELIBERATELY WITHOUT IMPORTS.
 *
 * The send path (`communicationSafetyService.evaluateSend`, T511) asks this
 * module one question on every campaign-bearing send: "is this key a journey
 * campaign?". For every campaign in production today the answer is no, and the
 * send path must reach that answer with an in-memory lookup and no `require` of
 * the journey tree - which is why nothing here imports anything.
 *
 * ─── TWO OWNERSHIPS ─────────────────────────────────────────────────────────
 *
 *   journey  every enrolment into it is the journey's, so a send-time hold that
 *            cannot read its receipt FAILS CLOSED (the Explorer eight, the flows)
 *   shared   the existing Ali-outreach campaign, whose hourly cron enrols people
 *            with no journey receipt at all: a hold that cannot read a receipt
 *            leaves those ordinary sends exactly as today, and holds only a
 *            send whose receipt it FOUND
 *
 * The Explorer eight are pinned equal to `EXPLORER_CAMPAIGNS` by a test, since
 * this file cannot import that list.
 */

export type CampaignKeyOwnership = 'journey' | 'shared';

export interface RegisteredCampaignKey {
  ownership: CampaignKeyOwnership;
  /** The tenant and brand the campaign must be stamped with before it may execute; `shared` keys name the row's home. */
  tenantSlug: string;
  brandSlug: string;
  /** What the campaign is for, for the plan a human reads. */
  purpose: string;
}

export const EXPLORER_CAMPAIGN_KEYS = [
  'explorer_activation_never_started',
  'explorer_activation_restart',
  'explorer_next_lesson',
  'explorer_community_digest',
  'explorer_weekly_digest',
  'explorer_referral_invite',
  'explorer_enrollment_ready',
  'explorer_friction_recovery',
] as const;

export const FLOW_CAMPAIGN_KEYS = {
  colaberryBusinessDiscoveryQuestions: 'gj_colaberry_business_discovery_questions',
  aiFlotationDiscoveryQuestions: 'gj_ai_flotation_discovery_questions',
} as const;

export const ALI_OUTREACH_CAMPAIGN_KEY = 'ali_personal_outreach';

const explorer = Object.fromEntries(
  EXPLORER_CAMPAIGN_KEYS.map((key) => [key, { ownership: 'journey', tenantSlug: 'colaberry', brandSlug: 'colaberry-training', purpose: 'Explorer learner nurture' }]),
) as Record<(typeof EXPLORER_CAMPAIGN_KEYS)[number], RegisteredCampaignKey>;

export const REGISTERED_CAMPAIGN_KEYS: Readonly<Record<string, RegisteredCampaignKey>> = Object.freeze({
  ...explorer,
  [FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions]: {
    ownership: 'journey', tenantSlug: 'colaberry', brandSlug: 'colaberry-enterprise', purpose: 'Layer 2 discovery questions (Colaberry Business)',
  },
  [FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions]: {
    ownership: 'journey', tenantSlug: 'ai-flotation', brandSlug: 'ai-flotation', purpose: 'Layer 2 discovery questions (AI Flotation)',
  },
  [ALI_OUTREACH_CAMPAIGN_KEY]: {
    ownership: 'shared', tenantSlug: 'colaberry', brandSlug: 'colaberry-enterprise', purpose: "Ali's personal outreach (existing campaign, REVIEW only)",
  },
});

export function isRegisteredJourneyCampaignKey(key: unknown): key is string {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(REGISTERED_CAMPAIGN_KEYS, key);
}

export function campaignKeyOwnership(key: unknown): CampaignKeyOwnership | null {
  return isRegisteredJourneyCampaignKey(key) ? REGISTERED_CAMPAIGN_KEYS[key].ownership : null;
}

/** The keys a brand's decisions may name, in registry order. */
export function registeredKeysForBrand(brandSlug: string): string[] {
  return Object.entries(REGISTERED_CAMPAIGN_KEYS).filter(([, v]) => v.brandSlug === brandSlug).map(([k]) => k);
}
