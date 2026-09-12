import type { OfferFamilySlug } from '../../../models/OfferFamily';
import type { EligibilityDecision } from '../offerEligibility';

/**
 * Growth Journey classification — the contract (§7.1, Phase 2 T223).
 *
 * The classifier answers three questions for a subject — which brand
 * relationship, which journey programme, which offer path — and says HOW it
 * knew: which of the eight §7.1 steps produced the answer, what evidence it
 * used, and whether a model took part. Everything in `ClassificationResult`
 * is what `growth_journey_classifications` stores and what the Why view shows.
 *
 * The eight steps run in the spec's order, and the order is a value here so a
 * test can compare it to the spec literally rather than to itself.
 */

export const STEP_ORDER = [
  'human_lock',
  'explicit_selection',
  'campaign_entry_contract',
  'source_domain_default',
  'observed_behaviour_and_account',
  'reply_rules',
  'ai_fallback',
  'low_confidence_default',
] as const;

export type StepName = (typeof STEP_ORDER)[number];

/** 1-based §7.1 step number for a step name. */
export function stepNumber(name: StepName): number {
  return STEP_ORDER.indexOf(name) + 1;
}

/** Bumped whenever a rule table changes. Stored on every row. */
export const RULESET_VERSION = 'p2-v1';

/** An input that could not be loaded is marked, never zeroed (Scenario J). */
export const UNAVAILABLE = 'unavailable' as const;
export type Unavailable = typeof UNAVAILABLE;

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface BrandContext {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
  /** The brand's default programme slug, or null when it has none / is not active. */
  default_program_slug: string | null;
}

/** A human-locked classification for this subject and brand (§7.1 step 1). */
export interface LockedClassification {
  classification_id: string;
  brand_relationship: string | null;
  journey_program: string | null;
  primary_path: string | null;
  secondary_paths: string[];
  intent: string | null;
  decided_by: string;
}

export interface FormInput {
  entry_slug: string | null;
  entry_type: string | null;
  form_type: string | null;
  interest_area: string | null;
  /** A form that carries an explicit offer-family field. */
  explicit_offer_family: string | null;
  /** Free text; used by rules, NEVER copied into evidence. */
  message: string | null;
}

export interface CampaignInput {
  campaign_id: string;
  campaign_key: string | null;
  /** The campaign's own brand — wins over the source brand for a reply. */
  brand: BrandContext | null;
  offer_family: string | null;
  interest_group: string | null;
}

export interface AccountInput {
  has_organization: boolean;
  organization_type: string | null;
}

export interface BehaviourInput {
  /** Page category → visits in the window. Categories from `pageCategoryMaps`. */
  page_categories: Record<string, number>;
}

export interface ReplyInput {
  body: string;
  channel: 'email' | 'sms';
}

export interface ClassificationInput {
  subject_ref: string;
  lock: LockedClassification | null;
  form: FormInput | Unavailable | null;
  campaign: CampaignInput | Unavailable | null;
  /** The brand resolved from the source / hostname (§7.1 step 4). */
  source_brand: BrandContext | Unavailable | null;
  account: AccountInput | Unavailable | null;
  behaviour: BehaviourInput | Unavailable | null;
  reply: ReplyInput | null;
}

// ─── Outputs ───────────────────────────────────────────────────────────────

/** What a model proposes (§7.1's JSON), before any boundary check. */
export interface AiProposal {
  brand_relationship: string | null;
  journey_program: string | null;
  primary_path: string | null;
  secondary_paths: string[];
  intent: string | null;
  confidence: number;
  evidence: string[];
  requires_human_review: boolean;
  model_version: string;
}

export interface ClassificationResult {
  brand_relationship: string | null;
  journey_program: string | null;
  primary_path: OfferFamilySlug | null;
  secondary_paths: OfferFamilySlug[];
  intent: string | null;
  confidence: number;
  /** Rule names and outcomes only. Never a message, an email or a name. */
  evidence: string[];
  requires_human_review: boolean;
  source_step: number;
  source_step_name: StepName;
  ruleset_version: string;
  ai_involved: boolean;
  model_version: string | null;
  /** The brand context the boundary was checked against, or null if none resolved. */
  brand: BrandContext | null;
  eligibility: EligibilityDecision | null;
  /** Set when the family is denied here and exactly one other brand allows it. */
  referral_target_brand_id: string | null;
  /** Every step that ran and why it abstained or answered — the Why view's spine. */
  steps_considered: StepTrace[];
}

export interface StepTrace {
  step: number;
  name: StepName;
  outcome: 'answered' | 'abstained' | 'skipped' | 'unavailable';
  note: string;
}

/** What one deterministic step contributes. `null` means "abstain". */
export interface StepAnswer {
  brand: BrandContext | null;
  journey_program: string | null;
  primary_path: string | null;
  secondary_paths: string[];
  intent: string | null;
  confidence: number;
  evidence: string[];
  /** A step may ask for review on its own (e.g. a partner-interest form). */
  requires_human_review?: boolean;
  /** Opt-out and similar: stop the ladder here; do not consult a model. */
  terminal?: boolean;
}

// ─── Dependencies the composition needs (injected; no I/O of its own) ──────

export interface AllowingBrand {
  brand_id: string;
  brand_slug: string;
}

export interface ClassifyOptions {
  /** `resolveOfferEligibility` in production; a table in tests. */
  eligibility: (brandId: string, offerFamily: string) => Promise<EligibilityDecision>;
  /** `allowedOfferFamilies` in production. Step 4 sets a path only when this has ONE entry. */
  allowedFamilies: (brandId: string) => Promise<string[]>;
  /** Brands whose ACTIVE allow policy covers `offerFamily`. Used for a referral target. */
  allowingBrands: (offerFamily: string) => Promise<AllowingBrand[]>;
  /** §7.1 step 7. Absent = the ladder skips the step. Gated by the caller. */
  ai?: (input: ClassificationInput) => Promise<AiProposal | null>;
}
