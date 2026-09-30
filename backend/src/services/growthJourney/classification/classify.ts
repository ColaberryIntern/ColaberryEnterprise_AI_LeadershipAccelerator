import { isOfferFamilySlug, type OfferFamilySlug } from '../../../models/OfferFamily';
import type { EligibilityDecision } from '../offerEligibility';
import { CONFIDENCE } from './classificationRules';
import {
  hasFreeText,
  stepCampaignEntryContract,
  stepExplicitSelection,
  stepObservedBehaviour,
  stepReplyRules,
  stepSourceDomainDefault,
} from './deterministic';
import {
  RULESET_VERSION,
  STEP_ORDER,
  stepNumber,
  UNAVAILABLE,
  type BrandContext,
  type ClassificationInput,
  type ClassificationResult,
  type ClassifyOptions,
  type StepAnswer,
  type StepName,
  type StepTrace,
} from './types';

/**
 * The §7.1 ladder, composed in the spec's order (Phase 2 T223).
 *
 * Deterministic first: steps 2-6 each get one chance to answer, in order; the
 * FIRST step to name a path decides it, later steps only add evidence. A model
 * (step 7) is consulted only when no step named a path AND there is free text
 * to read — never to second-guess a rule, never after an opt-out. Step 8 then
 * either asks for review or falls to the brand's nurture default.
 *
 * Then the boundary check, which nothing is exempt from — not a rule, not the
 * model, not the human lock at step 1: every named family is re-checked
 * against `brand_offer_policies` through the injected `eligibility`, and a
 * denied family is DROPPED, flagged for review, and (when exactly one other
 * brand allows it) turned into a referral target. The model is never the
 * authority on a brand boundary; neither is this file — the policy table is.
 *
 * No I/O of its own: eligibility, allowed families and the model are injected.
 */

interface Ladder {
  brand: BrandContext | null;
  program: string | null;
  path: string | null;
  secondary: string[];
  intent: string | null;
  confidence: number;
  evidence: string[];
  review: boolean;
  decidedBy: StepName | null;
  aiInvolved: boolean;
  modelVersion: string | null;
  traces: StepTrace[];
}

function trace(l: Ladder, name: StepName, outcome: StepTrace['outcome'], note: string): void {
  l.traces.push({ step: stepNumber(name), name, outcome, note });
}

/** Merge one step's answer. The first path wins; everything else fills gaps. */
function absorb(l: Ladder, name: StepName, a: StepAnswer): void {
  l.evidence.push(...a.evidence);
  if (a.brand && !l.brand) l.brand = a.brand;
  if (a.journey_program && !l.program) l.program = a.journey_program;
  if (a.intent && !l.intent) l.intent = a.intent;
  if (a.requires_human_review) l.review = true;
  if (a.primary_path && !l.path) {
    l.path = a.primary_path;
    l.confidence = a.confidence;
    l.decidedBy = name;
  } else if (!l.path && a.confidence > l.confidence) {
    l.confidence = a.confidence;
  }
  if (!l.decidedBy && (a.brand || a.journey_program) && !a.primary_path) {
    // A brand/programme answer with no path still counts as "this step spoke"
    // if nothing more specific ever does; overwritten by the first path.
    l.decidedBy = name;
  }
  trace(l, name, 'answered', a.primary_path ? `path ${a.primary_path}` : a.intent ? `intent ${a.intent}` : 'context only');
}

function unavailable(input: ClassificationInput, name: StepName): boolean {
  switch (name) {
    case 'explicit_selection':
      return input.form === UNAVAILABLE;
    case 'campaign_entry_contract':
      return input.campaign === UNAVAILABLE && input.form === UNAVAILABLE;
    case 'source_domain_default':
      return input.source_brand === UNAVAILABLE && !campaignBrand(input);
    default:
      return false;
  }
}

export async function classifyInput(
  input: ClassificationInput,
  opts: ClassifyOptions,
): Promise<ClassificationResult> {
  const l: Ladder = {
    brand: null, program: null, path: null, secondary: [], intent: null, confidence: 0,
    evidence: [], review: false, decidedBy: null, aiInvolved: false, modelVersion: null, traces: [],
  };

  // ── Step 1: a human lock beats everything (but not the boundary check). ──
  if (input.lock) {
    const lock = input.lock;
    const brand = campaignBrand(input) ?? sourceBrand(input);
    l.brand = brand;
    l.program = lock.journey_program;
    l.path = lock.primary_path;
    l.secondary = lock.secondary_paths;
    l.intent = lock.intent;
    l.confidence = 1;
    l.decidedBy = 'human_lock';
    l.evidence.push(`step1:human_lock:${lock.classification_id}`, `step1:decided_by:${lock.decided_by}`);
    trace(l, 'human_lock', 'answered', 'locked by a human; later steps not consulted');
    for (const name of STEP_ORDER.slice(1)) trace(l, name, 'skipped', 'human lock present');
    return finish(l, input, opts);
  }
  trace(l, 'human_lock', 'abstained', 'no lock for this subject and brand');

  // ── Steps 2-6, in order. ──
  let terminal = false;
  const steps: Array<[StepName, () => Promise<StepAnswer | null> | StepAnswer | null]> = [
    ['explicit_selection', () => stepExplicitSelection(input)],
    ['campaign_entry_contract', () => stepCampaignEntryContract(input)],
    ['source_domain_default', async () => {
      // The brand step 3 fixed (a campaign's) wins over the arrival source.
      const b = l.brand ?? sourceBrand(input);
      if (!b) return null;
      const allowed = await safeAllowed(opts, b.brand_id, l);
      return stepSourceDomainDefault(b, () => (allowed.length === 1 ? allowed[0] : null));
    }],
    ['observed_behaviour_and_account', () => stepObservedBehaviour(input)],
    ['reply_rules', () => stepReplyRules(input)],
  ];
  for (const [name, run] of steps) {
    if (unavailable(input, name)) {
      trace(l, name, 'unavailable', 'input could not be loaded; recorded, not zeroed');
      l.evidence.push(`${name}:unavailable`);
      continue;
    }
    const a = await run();
    if (!a) {
      trace(l, name, 'abstained', 'no rule matched');
      continue;
    }
    absorb(l, name, a);
    if (a.terminal) {
      // A terminal answer (an opt-out) decided the ladder even without a path.
      l.decidedBy = name;
      terminal = true;
      break;
    }
  }

  await stepAiFallback(l, input, opts, terminal);
  stepLowConfidenceDefault(l, input, terminal);
  return finish(l, input, opts);
}

/** Step 7: the model, only for ambiguous free text and only if wired. */
async function stepAiFallback(l: Ladder, input: ClassificationInput, opts: ClassifyOptions, terminal: boolean): Promise<void> {
  if (terminal) return trace(l, 'ai_fallback', 'skipped', 'ladder ended at a terminal answer');
  if (!opts.ai) return trace(l, 'ai_fallback', 'skipped', 'no model wired (capability off)');
  if (l.path) return trace(l, 'ai_fallback', 'skipped', 'a deterministic step already named a path');
  if (!hasFreeText(input)) return trace(l, 'ai_fallback', 'skipped', 'no free text to read');

  const proposal = await opts.ai(input);
  if (!proposal) {
    l.evidence.push('step7:ai:no_proposal');
    return trace(l, 'ai_fallback', 'abstained', 'model returned nothing usable');
  }
  l.aiInvolved = true;
  l.modelVersion = proposal.model_version;
  l.evidence.push(`step7:ai:${proposal.model_version}`, ...proposal.evidence.map((e) => `step7:ai_evidence:${e}`));
  if (proposal.primary_path && isOfferFamilySlug(proposal.primary_path)) {
    l.path = proposal.primary_path;
    l.confidence = proposal.confidence;
    l.decidedBy = 'ai_fallback';
  } else if (proposal.primary_path) {
    // "Never trust an id the model wasn't shown": a family outside the catalogue
    // is not a path, it is a flag.
    l.evidence.push('step7:model_returned_unknown_family');
    l.review = true;
  }
  l.secondary = proposal.secondary_paths.filter(isOfferFamilySlug);
  if (proposal.intent && !l.intent) l.intent = proposal.intent;
  if (proposal.requires_human_review) l.review = true;
  trace(l, 'ai_fallback', 'answered', l.path && l.decidedBy === 'ai_fallback' ? `path ${l.path}` : 'proposal without a usable path');
}

/** Step 8: low confidence → review; otherwise the brand's nurture default. */
function stepLowConfidenceDefault(l: Ladder, input: ClassificationInput, terminal: boolean): void {
  if (terminal) return trace(l, 'low_confidence_default', 'skipped', 'ladder ended at a terminal answer');
  if (l.path) return trace(l, 'low_confidence_default', 'skipped', 'a path was named');
  if (hasFreeText(input) && l.confidence < CONFIDENCE.review_below) {
    l.review = true;
    l.evidence.push('step8:review:free_text_unresolved');
    trace(l, 'low_confidence_default', 'answered', 'free text nobody could read → review');
  } else {
    l.evidence.push('step8:safe_default_nurture');
    trace(l, 'low_confidence_default', 'answered', 'no path; programme nurture applies');
  }
  if (!l.decidedBy) l.decidedBy = 'low_confidence_default';
}

/** The boundary check and the final shape. Applies to every step, step 1 included. */
async function finish(l: Ladder, input: ClassificationInput, opts: ClassifyOptions): Promise<ClassificationResult> {
  let eligibility: EligibilityDecision | null = null;
  let referral: string | null = null;

  if (l.path) {
    if (!l.brand) {
      l.evidence.push('brand_boundary:no_brand');
      l.review = true;
      l.path = null;
    } else {
      eligibility = await safeEligibility(opts, l.brand.brand_id, l.path, l);
      if (!eligibility.allowed) {
        l.evidence.push(`brand_boundary:${eligibility.reason}`);
        l.review = true;
        // A referral is proposed only for a POLICY refusal. A lookup failure,
        // an unknown family or a lapsed window says nothing about which brand
        // should have this person, so no target is guessed.
        if (eligibility.reason === 'explicit_deny' || eligibility.reason === 'no_policy') {
          referral = await referralTarget(opts, l.brand, l.path, l);
        }
        l.path = null;
      } else {
        l.evidence.push('brand_boundary:allowed');
      }
    }
  }

  const secondary: OfferFamilySlug[] = [];
  for (const fam of l.secondary) {
    if (!isOfferFamilySlug(fam) || fam === l.path) continue;
    if (!l.brand) continue;
    const d = await safeEligibility(opts, l.brand.brand_id, fam, l);
    if (d.allowed) secondary.push(fam);
    else l.evidence.push(`secondary_dropped:${fam}:${d.reason}`);
  }

  if (!l.brand) {
    l.review = true;
    if (!l.evidence.includes('brand_boundary:no_brand')) l.evidence.push('classification:no_brand_context');
  }

  const decided = l.decidedBy ?? 'low_confidence_default';
  return {
    brand_relationship: l.brand?.brand_slug ?? null,
    journey_program: l.program ?? l.brand?.default_program_slug ?? null,
    primary_path: l.path && isOfferFamilySlug(l.path) ? l.path : null,
    secondary_paths: secondary,
    intent: l.intent,
    confidence: round3(l.confidence),
    evidence: l.evidence,
    requires_human_review: l.review,
    source_step: stepNumber(decided),
    source_step_name: decided,
    ruleset_version: RULESET_VERSION,
    ai_involved: l.aiInvolved,
    model_version: l.modelVersion,
    brand: l.brand,
    eligibility,
    referral_target_brand_id: referral,
    steps_considered: l.traces,
  };
}

/** Exactly one OTHER brand with an active allow for the family → its id. */
async function referralTarget(opts: ClassifyOptions, from: BrandContext, family: string, l: Ladder): Promise<string | null> {
  let brands: Array<{ brand_id: string; brand_slug: string }>;
  try {
    brands = (await opts.allowingBrands(family)).filter((b) => b.brand_id !== from.brand_id);
  } catch {
    l.evidence.push('referral:lookup_failed');
    return null;
  }
  if (brands.length === 1) {
    l.evidence.push(`referral:target:${brands[0].brand_slug}`);
    return brands[0].brand_id;
  }
  l.evidence.push(brands.length === 0 ? 'referral:no_brand_offers_family' : `referral:ambiguous:${brands.map((b) => b.brand_slug).sort().join(',')}`);
  return null;
}

/** Fail closed: a lookup that throws is a denial, and says so. */
async function safeEligibility(opts: ClassifyOptions, brandId: string, family: string, l: Ladder): Promise<EligibilityDecision> {
  try {
    return await opts.eligibility(brandId, family);
  } catch {
    l.evidence.push('eligibility:lookup_failed');
    return { allowed: false, reason: 'lookup_failed', brand_id: brandId, offer_family: family, policy_id: null, approved_content_ready: false };
  }
}

async function safeAllowed(opts: ClassifyOptions, brandId: string, l: Ladder): Promise<string[]> {
  try {
    return await opts.allowedFamilies(brandId);
  } catch {
    l.evidence.push('step4:allowed_families:lookup_failed');
    return [];
  }
}

function campaignBrand(input: ClassificationInput): BrandContext | null {
  return input.campaign && input.campaign !== UNAVAILABLE ? input.campaign.brand : null;
}

function sourceBrand(input: ClassificationInput): BrandContext | null {
  return input.source_brand && input.source_brand !== UNAVAILABLE ? input.source_brand : null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
