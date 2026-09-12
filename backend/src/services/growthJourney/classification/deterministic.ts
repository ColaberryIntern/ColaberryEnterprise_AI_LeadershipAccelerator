import { isOfferFamilySlug } from '../../../models/OfferFamily';
import { detectOptOut } from '../../explorerGrowth/explorerReplyClassifier';
import {
  BEHAVIOUR_RULES,
  CAMPAIGN_INTEREST_RULES,
  CONFIDENCE,
  ENTRY_POINT_RULES,
  INTEREST_AREA_RULES,
  KEYWORD_INTENT_RULES,
  REVIEW_ENTRY_POINTS,
  SERVICE_ACCOUNT_TYPES,
  type FamilyRule,
} from './classificationRules';
import { UNAVAILABLE, type BrandContext, type ClassificationInput, type StepAnswer } from './types';

/**
 * §7.1 steps 2-6 and 8 as pure functions over `ClassificationInput`.
 *
 * Each returns a `StepAnswer` or `null` (abstain). None does I/O, none reads a
 * flag, none writes. Evidence strings name the rule that fired and nothing
 * else — never the text it fired on, which may be a person's message.
 */

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();

function answerFrom(rule: FamilyRule, evidence: string, brand: StepAnswer['brand'] = null): StepAnswer {
  return {
    brand,
    journey_program: null,
    primary_path: rule.family,
    secondary_paths: [],
    intent: rule.intent,
    confidence: rule.confidence,
    evidence: [evidence],
  };
}

/** First keyword rule that matches a piece of free text, or null. */
export function matchKeywordRule(text: string | null | undefined) {
  const t = (text ?? '').trim();
  if (!t) return null;
  for (const rule of KEYWORD_INTENT_RULES) {
    if (rule.re.test(t)) return rule;
  }
  return null;
}

/**
 * Step 2 — explicit selection. Precedence inside the step: an explicit
 * offer-family field > `interest_area` > a phrase in the message. A deliberate
 * selection outranks free text; free text outranks nothing here (the entry
 * point is step 3, so Scenario C and D — same form, different message — split
 * on the message rather than on the page).
 */
export function stepExplicitSelection(input: ClassificationInput): StepAnswer | null {
  if (input.form === null || input.form === UNAVAILABLE) return null;
  const f = input.form;

  const explicit = norm(f.explicit_offer_family);
  if (explicit && isOfferFamilySlug(explicit)) {
    return answerFrom(
      { family: explicit, intent: 'explicit_offer_selection', confidence: CONFIDENCE.explicit },
      `step2:explicit_offer_family:${explicit}`,
    );
  }

  const interest = INTEREST_AREA_RULES[norm(f.interest_area)];
  if (interest) return answerFrom(interest, `step2:interest_area->${interest.family ?? 'intent_only'}`);

  const kw = matchKeywordRule(f.message);
  if (kw) return answerFrom(kw, `step2:message_rule:${kw.name}`);

  return null;
}

/**
 * Step 3 — the campaign / entry-point contract. A campaign that names a family
 * is the strongest contract; then its interest group; then the entry point the
 * lead arrived through. The campaign's brand is carried so a reply to a
 * registered campaign is classified under THAT brand (Scenario G).
 */
export function stepCampaignEntryContract(input: ClassificationInput): StepAnswer | null {
  if (input.campaign !== null && input.campaign !== UNAVAILABLE) {
    const c = input.campaign;
    const fam = norm(c.offer_family);
    if (fam && isOfferFamilySlug(fam)) {
      return answerFrom(
        { family: fam, intent: 'campaign_offer', confidence: CONFIDENCE.contract },
        `step3:campaign_offer_family:${fam}`,
        c.brand,
      );
    }
    const ig = CAMPAIGN_INTEREST_RULES[norm(c.interest_group)];
    if (ig) return answerFrom(ig, `step3:campaign_interest_group->${ig.family ?? 'intent_only'}`, c.brand);
    if (c.brand) {
      // The campaign says nothing about a family but does fix the brand.
      return { ...answerFrom({ family: null, intent: 'campaign_reply', confidence: CONFIDENCE.source_only }, 'step3:campaign_brand_only', c.brand) };
    }
  }

  if (input.form === null || input.form === UNAVAILABLE) return null;
  const key = norm(input.form.entry_type) || norm(input.form.entry_slug);
  const rule = ENTRY_POINT_RULES[key];
  if (!rule) return null;
  const a = answerFrom(rule, `step3:entry_point:${key}->${rule.family ?? 'intent_only'}`);
  if (REVIEW_ENTRY_POINTS.has(key)) a.requires_human_review = true;
  return a;
}

/**
 * Step 4 — the source-domain default: brand and programme from the website
 * the person arrived through — or, when step 3 already fixed a campaign
 * brand, THAT brand's default (a reply to an Enterprise campaign from a lead
 * who first arrived via CPN is Enterprise's, not CPN's). The path is set only
 * when the brand can offer exactly one family (then there is nothing to
 * choose); otherwise the path stays open and the programme's nurture applies.
 */
export function stepSourceDomainDefault(
  b: BrandContext | null,
  singleFamilyFor: (brandId: string) => string | null,
): StepAnswer | null {
  if (!b) return null;
  const single = singleFamilyFor(b.brand_id);
  return {
    brand: b,
    journey_program: b.default_program_slug,
    primary_path: single,
    secondary_paths: [],
    intent: null,
    confidence: single ? CONFIDENCE.source_single_family : CONFIDENCE.source_only,
    evidence: [
      `step4:source_brand:${b.brand_slug}`,
      ...(b.default_program_slug ? [`step4:default_program:${b.default_program_slug}`] : ['step4:brand_has_no_default']),
      ...(single ? [`step4:single_family:${single}`] : []),
    ],
  };
}

/**
 * Step 5 — observed behaviour and known account context. A service-client
 * account marks the subject as a client (evidence, no family); a visit to an
 * enrolment or pricing page hints at paid learning. Unavailable inputs are
 * recorded as such and change nothing (Scenario J) — never treated as zero.
 */
export function stepObservedBehaviour(input: ClassificationInput): StepAnswer | null {
  const evidence: string[] = [];
  let best: FamilyRule | null = null;

  if (input.account === UNAVAILABLE) evidence.push('step5:account:unavailable');
  else if (input.account?.has_organization) {
    const type = norm(input.account.organization_type);
    evidence.push(SERVICE_ACCOUNT_TYPES.has(type) ? 'step5:account:service_client' : `step5:account:${type || 'untyped'}`);
  }

  if (input.behaviour === UNAVAILABLE) evidence.push('step5:behaviour:unavailable');
  else if (input.behaviour) {
    for (const [category, visits] of Object.entries(input.behaviour.page_categories)) {
      const rule = BEHAVIOUR_RULES[category];
      if (rule && visits > 0) {
        evidence.push(`step5:page_category:${category}`);
        if (!best || rule.confidence > best.confidence) best = rule;
      }
    }
  }

  if (!best && evidence.length === 0) return null;
  return {
    brand: null,
    journey_program: null,
    primary_path: best?.family ?? null,
    secondary_paths: [],
    intent: best?.intent ?? null,
    confidence: best?.confidence ?? 0,
    evidence,
  };
}

/**
 * Step 6 — deterministic reply rules. Opt-out first, through the ONE detector
 * the send path already trusts; an opt-out is terminal (no model is asked to
 * second-guess it) and is recorded only — processing it is the send path's
 * job, not the classifier's. Then the same phrase table as step 2.
 */
export function stepReplyRules(input: ClassificationInput): StepAnswer | null {
  if (!input.reply) return null;
  const optOut = detectOptOut(input.reply.body);
  if (optOut.optOut) {
    return {
      brand: null,
      journey_program: null,
      primary_path: null,
      secondary_paths: [],
      intent: 'opt_out',
      confidence: 1,
      evidence: [`step6:opt_out:${optOut.pattern ?? 'pattern'}`],
      terminal: true,
    };
  }
  const kw = matchKeywordRule(input.reply.body);
  if (!kw) return null;
  return answerFrom(kw, `step6:reply_rule:${kw.name}`);
}

/** Is there free text a model could read? Decides whether step 7 is worth asking. */
export function hasFreeText(input: ClassificationInput): boolean {
  const msg = input.form !== null && input.form !== UNAVAILABLE ? input.form.message : null;
  return Boolean((msg ?? '').trim()) || Boolean((input.reply?.body ?? '').trim());
}
