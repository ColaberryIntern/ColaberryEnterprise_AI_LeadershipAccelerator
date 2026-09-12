import { GrowthJourneyClassification } from '../../models';
import type { GrowthJourneyClassificationAttributes, GrowthJourneyClassificationStatus } from '../../models/GrowthJourneyClassification';
import type { GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { computeIdempotencyKey } from '../inboxCase/textNormalization';
import { isUniqueViolation } from '../../utils/uniqueViolation';
import { classifyError } from '../../utils/errorClassifier';
import { classifyInput } from './classification/classify';
import { makeAiClassifier, type AiClassifierDeps } from './classification/aiClassifier';
import { loadClassificationInput, type ClassificationTrigger, type LoadExtras } from './classification/inputs';
import { RULESET_VERSION, UNAVAILABLE, stepNumber, type ClassificationInput, type ClassificationResult, type ClassifyOptions } from './classification/types';
import { allowedOfferFamilies, assertOfferAllowed, brandsAllowingFamily, resolveOfferEligibility } from './offerEligibility';
import type { SubjectAnchor } from './subjectResolver';

/**
 * Persist, replay, override (Phase 2, T225) — the service surface over the
 * pure ladder in `classification/`.
 *
 * ─── APPEND-ONLY, BY CONSTRUCTION ────────────────────────────────────────
 * This file imports `GrowthJourneyClassification` and therefore never calls
 * update or destroy on anything — a guard test scans the raw text for those
 * two method names, prose included, which is why they are not spelled here. A
 * reclassification is a new row; an override is a new row pointing at the one
 * it supersedes. History cannot be edited into looking cleaner than it was.
 *
 * ─── REPLAY ──────────────────────────────────────────────────────────────
 * `idempotency_key` = sha256 of (subject, brand, trigger, input hash, ruleset,
 * model version). The same subject with the same inputs lands on the same row
 * and the caller is told `replayed: true`; a changed message is a new row.
 *
 * ─── WHO DECIDES ─────────────────────────────────────────────────────────
 * The ladder decides; `brand_offer_policies` has the last word on a family;
 * a human override is re-checked against that same policy and refused with
 * `OfferNotEligibleError` when it names a family the brand may not offer.
 * Policy is changed in the policy table, never in a classification.
 *
 * ─── GATE ────────────────────────────────────────────────────────────────
 * Nothing runs while the master flag is off: `classifySubject` returns
 * `{ status: 'disabled' }` before touching the database. The flags object is
 * the caller's — this file reads no environment variable.
 */

export interface ClassifySubjectArgs {
  anchor: SubjectAnchor;
  trigger: ClassificationTrigger;
  extras?: LoadExtras;
  flags: GrowthJourneyFlags;
  /** Test seams. Production passes nothing. */
  deps?: { ai?: AiClassifierDeps; now?: () => Date };
}

export type ClassifySubjectResult =
  | { status: 'disabled' }
  | { status: 'unresolved'; reason: string }
  | { status: 'unclassifiable'; reason: 'no_brand_context'; result: ClassificationResult }
  | { status: 'classified'; row: GrowthJourneyClassification; result: ClassificationResult; replayed: boolean; unavailable: string[] };

export async function classifySubject(args: ClassifySubjectArgs): Promise<ClassifySubjectResult> {
  if (!args.flags.growthJourneyEnabled) return { status: 'disabled' };

  const loaded = await loadClassificationInput(args.anchor, args.extras ?? {});
  if (loaded.status === 'unresolved') return { status: 'unresolved', reason: loaded.reason };

  const result = await classifyInput(loaded.input, ladderOptions(args.flags, args.deps?.ai));

  if (!loaded.brand) {
    // No brand context → no tenant/brand to store the row under (both are
    // NOT NULL) and no boundary to check against. The result is returned so a
    // caller can still show it; nothing is written.
    logEvent({ event: 'growth_journey.classification.unclassifiable', reason: 'no_brand_context', subject_ref: loaded.input.subject_ref, trigger: args.trigger });
    return { status: 'unclassifiable', reason: 'no_brand_context', result };
  }

  const input_hash = computeIdempotencyKey([stableJson(loaded.input)]);
  const idempotency_key = computeIdempotencyKey([
    loaded.input.subject_ref, loaded.brand.brand_id, args.trigger, input_hash, RULESET_VERSION, result.model_version ?? '',
  ]);
  const status: GrowthJourneyClassificationStatus = result.requires_human_review ? 'needs_review' : 'proposed';

  const written = await createOrReplay({
    tenant_id: loaded.brand.tenant_id,
    brand_id: loaded.brand.brand_id,
    subject_ref: loaded.input.subject_ref,
    lead_id: loaded.subject.lead_id,
    enrollment_id: loaded.subject.enrollment_id,
    trigger: args.trigger,
    input_hash,
    brand_relationship: result.brand_relationship,
    journey_program_slug: result.journey_program,
    primary_path: result.primary_path,
    secondary_paths: result.secondary_paths,
    intent: result.intent,
    confidence: result.confidence,
    // The ladder's per-step trace rides in evidence as `trace:<step>:<outcome>:<note>`
    // so the Why view can show exactly what each step did, not a reconstruction.
    evidence: [
      ...result.evidence,
      // Which campaign was in play (Scenario G): the row has no campaign column, so the Why reads it here.
      ...(loaded.input.campaign && loaded.input.campaign !== UNAVAILABLE
        ? [`campaign:${loaded.input.campaign.campaign_key ?? loaded.input.campaign.campaign_id}`]
        : []),
      ...loaded.unavailable.map((u) => `input_unavailable:${u}`),
      ...result.steps_considered.map((t) => `trace:${t.step}:${t.outcome}:${t.note}`),
    ],
    source_step: result.source_step,
    requires_human_review: result.requires_human_review,
    status,
    locked: false,
    eligibility: result.eligibility ? { ...result.eligibility } : null,
    referral_target_brand_id: result.referral_target_brand_id,
    ai_involved: result.ai_involved,
    model_version: result.model_version,
    ruleset_version: RULESET_VERSION,
    override_of: null,
    decided_by: null,
    idempotency_key,
  });

  logEvent({
    event: 'growth_journey.classification.recorded',
    subject_ref: loaded.input.subject_ref,
    brand_slug: loaded.brand.brand_slug,
    trigger: args.trigger,
    source_step: result.source_step,
    primary_path: result.primary_path,
    requires_human_review: result.requires_human_review,
    ai_involved: result.ai_involved,
    replayed: written.replayed,
    unavailable: loaded.unavailable,
  });
  return { status: 'classified', row: written.row, result, replayed: written.replayed, unavailable: loaded.unavailable };
}

export interface OverrideArgs {
  classificationId: string;
  admin: { id: string };
  patch: { primary_path?: string | null; journey_program?: string | null };
  lock: boolean;
  reason: string;
}

export type OverrideResult =
  | { status: 'not_found' }
  | { status: 'overridden'; row: GrowthJourneyClassification; replayed: boolean };

/**
 * A human override: a NEW row at step 1, pointing at the row it supersedes.
 * Still validated against policy — a human assigning a family the brand may
 * not offer gets `OfferNotEligibleError`, and no row is written.
 */
export async function overrideClassification(args: OverrideArgs): Promise<OverrideResult> {
  const prior = await GrowthJourneyClassification.findByPk(args.classificationId);
  if (!prior) return { status: 'not_found' };

  const primary_path = args.patch.primary_path === undefined ? prior.primary_path : args.patch.primary_path;
  const journey_program = args.patch.journey_program === undefined ? prior.journey_program_slug : args.patch.journey_program;

  // Policy beats the human. Throws OfferNotEligibleError; nothing written.
  const eligibility = primary_path ? await assertOfferAllowed({ brandId: prior.brand_id, offerFamily: primary_path }) : null;

  const decided_by = `human:${args.admin.id}`;
  const idempotency_key = computeIdempotencyKey([
    prior.subject_ref, prior.brand_id, 'human', args.admin.id, stableJson(args.patch), String(args.lock), args.reason,
  ]);
  const written = await createOrReplay({
    tenant_id: prior.tenant_id,
    brand_id: prior.brand_id,
    subject_ref: prior.subject_ref,
    lead_id: prior.lead_id,
    enrollment_id: prior.enrollment_id,
    trigger: 'manual',
    input_hash: prior.input_hash,
    brand_relationship: prior.brand_relationship,
    journey_program_slug: journey_program,
    primary_path,
    secondary_paths: [],
    intent: prior.intent,
    confidence: 1,
    evidence: [`step1:override_of:${prior.id}`, `step1:decided_by:${decided_by}`, `step1:lock:${args.lock}`, `override_reason:${args.reason}`],
    source_step: stepNumber('human_lock'),
    requires_human_review: false,
    status: primary_path === null && args.patch.primary_path === null ? 'rejected' : 'confirmed',
    locked: args.lock,
    eligibility: eligibility ? { ...eligibility } : null,
    referral_target_brand_id: null,
    ai_involved: false,
    model_version: null,
    ruleset_version: RULESET_VERSION,
    override_of: prior.id,
    decided_by,
    idempotency_key,
  });
  logEvent({ event: 'growth_journey.classification.overridden', override_of: prior.id, subject_ref: prior.subject_ref, locked: args.lock, replayed: written.replayed });
  return { status: 'overridden', row: written.row, replayed: written.replayed };
}

export interface ReviewRequestArgs {
  classificationId: string;
  /** `routing_rule:<raw payload id>` | `human:<admin id>` | `classifier` */
  requestedBy: string;
  reason: string;
}

/**
 * A review request (routing action `request_classification_review`): a NEW
 * row copying the prior's answer with `requires_human_review` set, so the
 * queue shows it. Nothing is re-derived and nothing is decided.
 */
export async function requestClassificationReview(args: ReviewRequestArgs): Promise<OverrideResult> {
  const prior = await GrowthJourneyClassification.findByPk(args.classificationId);
  if (!prior) return { status: 'not_found' };
  if (prior.requires_human_review && prior.status === 'needs_review') return { status: 'overridden', row: prior, replayed: true };

  const written = await createOrReplay({
    tenant_id: prior.tenant_id,
    brand_id: prior.brand_id,
    subject_ref: prior.subject_ref,
    lead_id: prior.lead_id,
    enrollment_id: prior.enrollment_id,
    trigger: 'manual',
    input_hash: prior.input_hash,
    brand_relationship: prior.brand_relationship,
    journey_program_slug: prior.journey_program_slug,
    primary_path: prior.primary_path,
    secondary_paths: prior.secondary_paths ?? [],
    intent: prior.intent,
    confidence: prior.confidence,
    // A routing rule is recorded as `requested_by_rule:<raw payload id>` (the plan's key); anyone else verbatim.
    evidence: [
      ...(prior.evidence ?? []),
      args.requestedBy.startsWith('routing_rule:')
        ? `requested_by_rule:${args.requestedBy.slice('routing_rule:'.length)}`
        : `review_requested_by:${args.requestedBy}`,
      `review_reason:${args.reason}`,
    ],
    source_step: prior.source_step,
    requires_human_review: true,
    status: 'needs_review',
    locked: false,
    eligibility: prior.eligibility,
    referral_target_brand_id: prior.referral_target_brand_id,
    ai_involved: prior.ai_involved,
    model_version: prior.model_version,
    ruleset_version: prior.ruleset_version,
    override_of: prior.id,
    decided_by: null,
    idempotency_key: computeIdempotencyKey([prior.id, 'review_request', args.requestedBy]),
  });
  logEvent({ event: 'growth_journey.classification.review_requested', override_of: prior.id, subject_ref: prior.subject_ref, requested_by: args.requestedBy, replayed: written.replayed });
  return { status: 'overridden', row: written.row, replayed: written.replayed };
}

/** The latest row for a subject under a brand, or null. */
export async function latestClassification(subjectRef: string, brandId: string): Promise<GrowthJourneyClassification | null> {
  return GrowthJourneyClassification.findOne({ where: { subject_ref: subjectRef, brand_id: brandId }, order: [['created_at', 'DESC']] });
}

/** The ladder's dependencies in production: the real policy reads, and the model if the flag allows. */
export function ladderOptions(flags: GrowthJourneyFlags, ai?: AiClassifierDeps): ClassifyOptions {
  return {
    eligibility: (brandId, offerFamily) => resolveOfferEligibility({ brandId, offerFamily }),
    allowedFamilies: (brandId) => allowedOfferFamilies(brandId),
    allowingBrands: (offerFamily) => brandsAllowingFamily(offerFamily),
    ai: makeAiClassifier(flags, ai),
  };
}

type NewRow = GrowthJourneyClassificationAttributes;

/** Insert, or on a unique violation return the row that already holds the key. */
async function createOrReplay(row: NewRow): Promise<{ row: GrowthJourneyClassification; replayed: boolean }> {
  try {
    return { row: await GrowthJourneyClassification.create(row), replayed: false };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) {
      logEvent({ event: 'growth_journey.classification.write_failed', error_class: classifyError(err), subject_ref: row.subject_ref });
      throw err;
    }
    const existing = await GrowthJourneyClassification.findOne({ where: { idempotency_key: row.idempotency_key } });
    if (!existing) throw err; // raced with a delete that cannot happen on an append-only table; surfaced, not hidden
    return { row: existing, replayed: true };
  }
}

/** Deterministic JSON: sorted keys at every level, so equal inputs hash equal. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Structured, and never a person's text: subject refs and slugs only. */
function logEvent(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ service: 'growth-journey', ...fields }));
}

export type { ClassificationInput, ClassificationResult };
