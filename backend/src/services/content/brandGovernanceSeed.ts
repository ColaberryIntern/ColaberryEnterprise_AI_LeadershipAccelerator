// `import type`, deliberately: this module needs the ROW SHAPE, not the model, and a value
// import would pull `config/database` into every importer - including a unit test that has no
// database and should not need one.
import type BrandGovernanceRule from '../../models/BrandGovernanceRule';
import { classifyError } from '../../utils/errorClassifier';
import type { BrandGovernanceRules } from './brandGovernance';
import { getCurrentRules, publishRules } from './brandGovernanceService';

/**
 * brandGovernanceSeed — the rules themselves, and an idempotent publisher for them.
 *
 * THE GAP THIS CLOSES. `brandGovernance` is a working rules-as-data engine and
 * `brandGovernanceService` is a correct write boundary, and between them they held ZERO rules:
 * `brand_governance_rules` had 0 rows against 8 brands in production on 2026-10-06, and
 * `publishRules` had no caller outside its own module. `getCurrentRules` therefore returned
 * `EMPTY_RULES` for every brand, under which no prohibited claim exists and `checkContent`
 * reports `ok` for any rule-driven question asked of it. An engine with no rules is not a
 * control; this file is the rules.
 *
 * WHAT PUBLISHING THESE RULES TURNS ON, stated before anything is published. The one live
 * consumer is `composerService.validateItem`, whose result feeds `composerActionService.gate`,
 * and `gate` THROWS - WorkflowError 409 `ValidationFailed` - on a blocking violation. So
 * `send_for_approval`, `schedule` and `publish_now` all start REFUSING content that matches a
 * rule here. This is not advisory and was never going to be: the gate already existed and was
 * reading an empty rule book.
 *
 * MEASURED BLAST RADIUS, production, 2026-10-06, read-only:
 *   content_items                      7 rows, all `draft`, 6 with a non-empty body
 *   matching \bfree\b                  1 row (Colaberry Training, "...our free AI class...")
 *   containing an em-dash              0 rows
 *   misspelling "Colaberry"            0 rows
 *   lowercase "colaberry"              0 rows
 *   metadata.hasOffer = true           0 rows  (so the approved-CTA warn cannot fire yet)
 *   ai_model set                       0 rows  (so the AI-provenance blocks cannot fire yet)
 *   publishing_jobs pending            0 rows
 *   content_approval_requests pending  0 rows
 * Publishing this set refuses exactly one draft, and only when a human next presses a forward
 * action on it. Nothing queued, scheduled or awaiting approval is interrupted.
 *
 * WHAT IS DELIBERATELY EMPTY, and why. `requiredDisclosures`, `allowedLinkDomains` and
 * `requiredApprovers` are left empty because each one BLOCKS on absence rather than on
 * presence: a single `when: 'always'` disclosure would refuse all six existing bodies at once,
 * and a non-empty `allowedLinkDomains` would refuse every link to a domain nobody has listed
 * yet. Those need their own measurement, and "measure before you gate" does not stop being the
 * rule once the first rule is in. They are not omitted because they do not matter.
 *
 * NOT IN HERE: the double sign-off check. `mandrillPreflight.validateBeforeSend` fails a body
 * that carries BOTH a branded signature block and an informal "Thanks, / Ali" closer - a
 * conjunction of two conditions over an EMAIL body. `prohibitedClaims` is one regex over
 * `content.body`, and `content.body` in this engine is a social post's canonical copy, never an
 * email. A lookahead could force the shape, and it would then sit in the rule set never
 * matching anything, which is worse than its absence because it reads as coverage. The real
 * double-sign-off gap is that `emailService.ts` - 2,820 lines, 37 senders - has zero preflight
 * references while 60+ one-off scripts have them. That is a hole in the sender, not here.
 */

/** A rule set as authored: everything except the version, which only `publishRules` assigns. */
export type RuleSetDraft = Omit<BrandGovernanceRules, 'version'>;

/**
 * 40 TAC 807.172(d). The word is prohibited, not the offer - the offer is real and is stated
 * with the approved phrasings below.
 */
export const FREE_CLAIM_RULE = {
  id: 'tac-807-172-d-free',
  pattern: '\\bfree\\b',
  reason:
    'The word "free" must not be advertised: 40 TAC 807.172(d) (Texas Workforce Commission). '
    + 'Approved phrasings are "$0 to start" and "No card needed".',
} as const;

/** U+2014 EM DASH. */
const EM_DASH = String.fromCharCode(0x2014);

/** House style, the same rule `mandrillPreflight` enforces on every outbound email. */
export const EM_DASH_RULE = {
  id: 'house-style-em-dash',
  // Built with `fromCharCode` rather than typed as a literal so the PATTERN survives any
  // diff, transfer or editor that does not preserve UTF-8 - the one character this rule is
  // about is the one most likely to be silently replaced. The value is the em-dash itself,
  // which `checkContent` compiles as an ordinary regex literal.
  pattern: EM_DASH,
  reason: 'Em-dash found. Use a slash, a comma, a spaced hyphen, or "and"/"but" instead.',
} as const;

/**
 * The approved ways to say the thing "free" was saying. These are warn-level in the engine
 * (`unapproved_cta`), so they guide rather than refuse - and they only apply to content that
 * declares `hasOffer`.
 */
export const APPROVED_OFFER_PHRASINGS = [
  { id: 'offer-zero-to-start', label: 'No cost to begin', cta: '$0 to start' },
  { id: 'offer-no-card', label: 'No payment details required', cta: 'No card needed' },
] as const;

/**
 * The company name has one spelling. `caseSensitive` makes "colaberry" a WARN rather than a
 * block - `checkContent` separates a case slip from a misspelling on purpose, so the two rules
 * cannot disagree about the same word.
 */
export const COLABERRY_TERM = {
  canonical: 'Colaberry',
  rejectedForms: ['Cola Berry', 'ColaBerry', 'Colaberri', 'Collaberry'],
  caseSensitive: true,
} as const;

/**
 * The starting rule set, shared by every brand. Per-brand divergence (a brand with its own
 * approved offers, or its own link domains) is a later version for that brand alone, which is
 * what the per-brand versioning is for.
 *
 * `voice` and `audienceExclusions` are carried because the schema requires them, and both are
 * INERT: `checkContent` never reads either one. They are documentation for whoever writes the
 * copy, not enforcement, and this comment exists so nobody reads their presence as a control.
 */
export const BASE_RULE_SET: RuleSetDraft = {
  voice: {
    tone: 'Calm, specific, authoritative. Enterprise, not consumer SaaS.',
    guidance:
      'State what the thing does and what it costs. Never advertise the word "free" - say '
      + '"$0 to start" or "No card needed". Never invent an outcome, a statistic, a price, a '
      + 'date, an accreditation or a partnership.',
  },
  approvedOffers: [...APPROVED_OFFER_PHRASINGS],
  requiredDisclosures: [],
  prohibitedClaims: [FREE_CLAIM_RULE, EM_DASH_RULE],
  protectedTerms: [{ ...COLABERRY_TERM, rejectedForms: [...COLABERRY_TERM.rejectedForms] }],
  audienceExclusions: [],
  allowedLinkDomains: [],
  requiredApprovers: [],
};

/**
 * A canonical form for comparison ONLY: object keys sorted recursively, arrays sorted by their
 * own canonical form.
 *
 * WHY KEY ORDER MATTERS HERE. The stored column is `jsonb`, which does not preserve key order -
 * Postgres returns the keys in its own order, not the order they were written in. A plain
 * `JSON.stringify` comparison against a freshly authored object would therefore differ on every
 * single run and publish a pointless v2, v3, v4 for a rule set nobody had changed. That is the
 * exact failure "make re-running it not create a pointless v2" names, and it would not have
 * been visible without reaching for the round trip.
 *
 * WHY ARRAYS ARE SORTED TOO. Nothing in `checkContent` is order-sensitive: prohibited claims,
 * disclosures and protected terms are each iterated in full, and link domains, offers and
 * approvers are `some`/`filter` tests. The arrays are therefore sets, and reordering one is not
 * a change in what the rules DO. A test pins that reading, so if a future rule ever does depend
 * on order, the test says so instead of this comment being quietly wrong.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  }
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = canonicalize(src[k]);
    return out;
  }
  return value;
}

/** Do two drafts say the same thing? Version is excluded; it is assigned at publish, not authored. */
export function ruleSetsEqual(a: RuleSetDraft, b: RuleSetDraft): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function withoutVersion(rules: BrandGovernanceRules): RuleSetDraft {
  const { version: _version, ...rest } = rules;
  return rest;
}

export type PublishAction = 'published' | 'unchanged';

export interface PublishOutcome {
  brandId: string;
  action: PublishAction;
  /** The version that is CURRENT after this call, whether this call wrote it or not. */
  version: number;
  /** A stable machine-readable reason, so a caller can log it without parsing prose. */
  reason: 'first-publish' | 'rules-changed' | 'identical-to-current' | 'concurrent-identical';
}

/** A rule set that is already current is left alone, so the error names the real conflict. */
export class RuleSetConflictError extends Error {
  readonly errorClass = 'ContractViolation';

  constructor(public readonly brandId: string, message: string) {
    super(message);
    this.name = 'RuleSetConflictError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { name?: string; original?: { code?: string }; parent?: { code?: string } };
  return e?.name === 'SequelizeUniqueConstraintError'
    || e?.original?.code === '23505'
    || e?.parent?.code === '23505';
}

/**
 * Publish `draft` for `brandId`, but only if it differs from what is already current.
 *
 * IDEMPOTENT AND REPLAYABLE. Run it a hundred times with the same draft and there is one row:
 * the first call publishes v1, every later call reads v1 back, finds it canonically identical,
 * and returns `unchanged`. Nothing about the decision depends on run order or on a flag outside
 * the database, so a replay after a half-finished deploy is safe.
 *
 * THE RACE, AND WHY IT IS NOT RETRIED BLINDLY. `publishRules` reads the current version and
 * inserts previous + 1, so two publishers starting together both aim at the same version and
 * the unique index on (brand_id, version) - `brand_governance_rules_brand_version_unique`,
 * confirmed present in production - fails the loser. The loser then re-reads: if the winner
 * published the SAME rules, the end state is the one this call wanted, so it reports
 * `unchanged` and stops. If the winner published something else, that is a genuine conflict
 * between two different intentions and it is raised, not papered over by incrementing again -
 * a blind retry would stack a version nobody authored on top of someone else's publish.
 *
 * FAILURE PATH. One INSERT, so there is no partial state to compensate for: the call either
 * writes a whole version or writes nothing. Anything that is not a unique violation is
 * re-thrown with its `error_class` from `classifyError` attached to the message, because the
 * caller has to be able to tell a validation refusal (a malformed rule, already rejected by
 * `publishRules`) from the database being unreachable. There is no retry loop here at all:
 * the operation is cheap, human-initiated, and safe to simply run again.
 */
export async function publishRuleSetIfChanged(
  tenantId: string,
  brandId: string,
  draft: RuleSetDraft,
  publishedBy: string | null,
  note: string | null,
): Promise<PublishOutcome> {
  const current = await getCurrentRules(brandId);
  const isFirst = current.version === 0;

  // `!isFirst` is not redundant. `getCurrentRules` returns EMPTY_RULES at version 0 for a brand
  // with no row at all, and EMPTY_RULES is canonically identical to an empty draft - so without
  // this clause a brand that has never been governed is reported as "unchanged, version 0",
  // which reads as "already in the state we wanted" for a brand with no rules whatsoever.
  if (!isFirst && ruleSetsEqual(withoutVersion(current), draft)) {
    return { brandId, action: 'unchanged', version: current.version, reason: 'identical-to-current' };
  }

  try {
    const row: BrandGovernanceRule = await publishRules(tenantId, brandId, draft, publishedBy, note);
    return {
      brandId,
      action: 'published',
      version: row.version,
      reason: isFirst ? 'first-publish' : 'rules-changed',
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const afterRace = await getCurrentRules(brandId);
      if (ruleSetsEqual(withoutVersion(afterRace), draft)) {
        return { brandId, action: 'unchanged', version: afterRace.version, reason: 'concurrent-identical' };
      }
      throw new RuleSetConflictError(
        brandId,
        `Another publisher wrote version ${afterRace.version} for this brand with different rules. `
        + 'Re-read the current rules, reconcile, and publish again.',
      );
    }
    throw new Error(`Publishing governance rules for brand ${brandId} failed [${classifyError(err)}]: ${(err as Error)?.message ?? 'unknown'}`);
  }
}
