import type { OfferFamilySlug } from '../../../models/OfferFamily';

/**
 * The deterministic rule tables (§7.1 steps 2, 3, 5, 6). Versioned by
 * `RULESET_VERSION` in types.ts — bump it when any table here changes, so a
 * stored classification can always say which rules produced it.
 *
 * Every value here was read from the repo or from production, not guessed:
 * entry-point slugs from `seeds/seedLeadSources.ts`, `interest_area` values
 * from the live `leads` table (2026-09-11), page categories from
 * `services/pageCategoryMaps.ts`. A rule keyed on a value that does not exist
 * anywhere is dead weight the tests would not catch, so each table's test
 * asserts its keys against the source it came from.
 *
 * Confidence numbers are ordinal, not probabilities: a rule that names a
 * family from a deliberate selection scores above one inferred from a page
 * visit, and the ladder's low-confidence threshold sits between them.
 */

export interface FamilyRule {
  family: OfferFamilySlug | null;
  intent: string;
  confidence: number;
}

/** Thresholds shared by the ladder. */
export const CONFIDENCE = {
  /** A rule that names a family from a deliberate selection. */
  explicit: 0.85,
  /** A campaign or entry-point contract. */
  contract: 0.75,
  /** A phrase in free text. */
  keyword: 0.7,
  /** A source default with only one possible family. */
  source_single_family: 0.6,
  /** A behavioural hint. */
  behaviour: 0.55,
  /** Below this, step 8 asks for review rather than defaulting to nurture. */
  review_below: 0.5,
  /** A source default with no family — nurture only. */
  source_only: 0.4,
} as const;

/**
 * Step 2 — `interest_area`, a selected or typed field on the public form.
 * Keys are lower-cased and trimmed by the matcher. Values seen in production
 * that name no family (e.g. `general`) are deliberately absent: an unmapped
 * value abstains and the ladder continues.
 */
export const INTEREST_AREA_RULES: Readonly<Record<string, FamilyRule>> = {
  'ai systems architect': { family: 'learner_paid_training', intent: 'program_interest', confidence: CONFIDENCE.explicit },
  enrollment: { family: 'learner_paid_training', intent: 'enrollment_interest', confidence: CONFIDENCE.explicit },
  ai_roi_pilot: { family: 'paid_discovery', intent: 'pilot_interest', confidence: CONFIDENCE.explicit },
  strategy_call: { family: 'ai_consulting', intent: 'consulting_request', confidence: CONFIDENCE.explicit },
  measure_readiness: { family: 'ai_consulting', intent: 'readiness_assessment', confidence: CONFIDENCE.explicit },
  'build internal ai capability': { family: 'business_training', intent: 'training_request_business', confidence: CONFIDENCE.explicit },
  'enterprise ai': { family: 'business_training', intent: 'training_request_business', confidence: CONFIDENCE.explicit },
};

/**
 * Steps 2 and 6 — phrases in free text (a form message, a reply body).
 * Anchored on word boundaries; ordered most specific first, and the FIRST
 * match wins, so "train our team to automate" reads as business training
 * because the team-training rule precedes the automation rule.
 *
 * These decide a family only. Opt-out is NOT here — that is
 * `explorerReplyClassifier.detectOptOut`, reused, never re-implemented
 * (three opt-out detectors already disagree; this module adds no fourth).
 */
export const KEYWORD_INTENT_RULES: ReadonlyArray<{ name: string; re: RegExp } & FamilyRule> = [
  {
    name: 'team_training',
    re: /\b(train(?:ing)?|upskill(?:ing)?|workshops?|bootcamp|courses?)\b[^.!?\n]{0,60}\b(our |the |my )?(team|employees|staff|managers|leaders|workforce|people|company|organi[sz]ation)\b|\b(corporate|team|employee|staff|workforce|business) training\b/i,
    family: 'business_training', intent: 'training_request_business', confidence: CONFIDENCE.keyword,
  },
  {
    name: 'automation',
    re: /\b(automat(?:e|ed|ing|ion)|workflows?|zapier|make\.com|n8n)\b/i,
    family: 'workflow_automation', intent: 'automation_request', confidence: CONFIDENCE.keyword,
  },
  {
    name: 'app_build',
    re: /\b(build|develop|create|ship)\b[^.!?\n]{0,40}\b(an? )?(app|application|software|platform|tool|portal|website|mvp)\b|\b(app|application|software) (build|development)\b/i,
    family: 'application_build', intent: 'app_build_request', confidence: CONFIDENCE.keyword,
  },
  {
    name: 'ai_project',
    re: /\b(ai project|pilot|proof of concept|poc|prototype)\b/i,
    family: 'ai_project', intent: 'ai_project_request', confidence: CONFIDENCE.keyword,
  },
  {
    name: 'consulting',
    re: /\b(consult(?:ing|ant|ation)?|advis(?:e|ory|or)|strategy|roadmap|assessment|audit)\b/i,
    family: 'ai_consulting', intent: 'consulting_request', confidence: CONFIDENCE.keyword,
  },
  {
    name: 'discovery',
    re: /\b(discovery (call|session|phase)|scoping|estimate|quote)\b/i,
    family: 'paid_discovery', intent: 'discovery_request', confidence: CONFIDENCE.keyword,
  },
  {
    // A person asking to learn, with no team context. Names an INTENT, not a
    // family: which learner family is the brand's call (free vs paid), so this
    // abstains on the path and lets the source default decide the programme.
    name: 'learn',
    re: /\b(enroll|enrol|sign(?: |-)?up|learn|training|course|bootcamp|class|scholarship)\b/i,
    family: null, intent: 'training_request', confidence: CONFIDENCE.keyword,
  },
];

/**
 * Step 3 — the entry-point contract. Keyed on the entry slug (`entry_type`
 * is null on every production row today, so the slug is the contract). Every
 * key exists in `seeds/seedLeadSources.ts`; the test asserts it.
 */
export const ENTRY_POINT_RULES: Readonly<Record<string, FamilyRule>> = {
  workflow_intake: { family: 'workflow_automation', intent: 'automation_request', confidence: CONFIDENCE.contract },
  call_me_now: { family: null, intent: 'callback_requested', confidence: CONFIDENCE.contract },
  request_demo_form: { family: 'business_training', intent: 'demo_request', confidence: CONFIDENCE.contract },
  executive_overview_download: { family: null, intent: 'content_download', confidence: CONFIDENCE.contract },
  advisory_inline_form: { family: 'ai_consulting', intent: 'consulting_request', confidence: CONFIDENCE.contract },
  scholarship_interest: { family: 'learner_free_training', intent: 'scholarship_interest', confidence: CONFIDENCE.contract },
  scholarship_interview_call: { family: 'learner_free_training', intent: 'scholarship_interest', confidence: CONFIDENCE.contract },
  free_training_interest: { family: 'learner_free_training', intent: 'free_training_interest', confidence: CONFIDENCE.contract },
  community_partner_interest: { family: null, intent: 'partner_interest', confidence: CONFIDENCE.contract },
  champion_interest: { family: null, intent: 'supporter_interest', confidence: CONFIDENCE.contract },
  get_book_modal: { family: null, intent: 'content_download', confidence: CONFIDENCE.contract },
  newsletter_footer: { family: null, intent: 'newsletter', confidence: CONFIDENCE.contract },
  classify_lead: { family: null, intent: 'product_demo', confidence: CONFIDENCE.contract },
  developer_contact: { family: null, intent: 'developer_contact', confidence: CONFIDENCE.contract },
  platform_interest: { family: null, intent: 'platform_interest', confidence: CONFIDENCE.contract },
};

/** Entry points that are NOT a person seeking an offer for themselves. */
export const REVIEW_ENTRY_POINTS: ReadonlySet<string> = new Set([
  'community_partner_interest',
  'champion_interest',
]);

/** Step 3 — a campaign's `interest_group` when it carries no explicit family. */
export const CAMPAIGN_INTEREST_RULES: Readonly<Record<string, FamilyRule>> = {
  ai_roi_pilot: { family: 'paid_discovery', intent: 'pilot_interest', confidence: CONFIDENCE.contract },
};

/**
 * Step 5 — page categories (from `pageCategoryMaps.ts`) that hint at a family.
 * Only categories that exist there are keyed; the test asserts it. A hint
 * never overrides an earlier answer — it fills in when nothing else has.
 */
export const BEHAVIOUR_RULES: Readonly<Record<string, FamilyRule>> = {
  enroll: { family: 'learner_paid_training', intent: 'enrollment_interest', confidence: CONFIDENCE.behaviour },
  pricing: { family: 'learner_paid_training', intent: 'pricing_interest', confidence: CONFIDENCE.behaviour },
};

/** Step 5 — an organisation of this type is a service client, not a learner. */
export const SERVICE_ACCOUNT_TYPES: ReadonlySet<string> = new Set(['client']);
