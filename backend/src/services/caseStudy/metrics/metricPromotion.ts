import CaseStudyMetric from '../../../models/CaseStudyMetric';
import type { CaseStudyVerificationClass, CaseStudyVerificationMethod } from '../../../types/caseStudy';

/**
 * Promoting a measured figure — the human half of the pipeline.
 * `METRIC_PROVENANCE_PIPELINE.md` §9 Stage 2.
 *
 * Stage 1's producer writes every metric `pending` / `publishable: false` and
 * never sets `verified_by`. This is the only code path that moves either, and it
 * requires a named person, because the decision to publish a number is a
 * decision somebody made and the audit columns exist to say who.
 *
 * WHY THE GATE'S RULES ARE ENFORCED HERE TOO, RATHER THAN ONLY AT PUBLISH.
 * `caseStudyPublishRules.ts` already refuses a `verified` metric whose method is
 * `self`, and a `verified` metric with no evidence pointer — "an assertion, not
 * proof". Checking them only at publish would let an operator promote a figure,
 * see it accepted, and discover weeks later that the record cannot ship because
 * of a choice made here. Refusing at the moment of the decision tells the person
 * who can still change it, while they are still looking at it.
 */

export type MetricPromotionErrorClass =
  | 'MetricNotFound'
  | 'ValidationError'
  | 'SelfVerification'
  | 'EvidenceMissing';

export class MetricPromotionError extends Error {
  readonly error_class: MetricPromotionErrorClass;
  readonly http_status: number;
  readonly details: Record<string, unknown>;

  constructor(
    error_class: MetricPromotionErrorClass,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'MetricPromotionError';
    this.error_class = error_class;
    this.http_status = error_class === 'MetricNotFound' ? 404 : 400;
    this.details = details;
  }
}

export interface PromoteMetricInput {
  readonly caseStudyId: string;
  readonly metricKey: string;
  readonly verificationClass: CaseStudyVerificationClass;
  readonly publishable: boolean;
  readonly isHeadline: boolean;
  /** The person taking responsibility. Never defaulted, never invented. */
  readonly actor: string;
  /** ISO-8601, passed in so the write stays reproducible and testable. */
  readonly decidedAt: string;
}

export interface PromotedMetric {
  readonly metricKey: string;
  readonly verificationClass: string;
  readonly verificationMethod: string;
  readonly publishable: boolean;
  readonly isHeadline: boolean;
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

/**
 * Set a metric's verification state.
 *
 * The producer may call none of this. `verified_by` and `verified_at` are
 * stamped from the actor and the caller's clock together, so a promotion can
 * never record a decision without recording who made it.
 */
export async function promoteMetric(input: PromoteMetricInput): Promise<PromotedMetric> {
  const actor = input.actor.trim();
  if (!actor) {
    throw new MetricPromotionError(
      'ValidationError',
      'A promotion is recorded against the person who made it, and no identity was supplied.',
      { field: 'actor' }
    );
  }

  const row = (await CaseStudyMetric.findOne({
    where: { case_study_id: input.caseStudyId, metric_key: input.metricKey },
  })) as unknown as MetricRow | null;

  if (!row) {
    throw new MetricPromotionError(
      'MetricNotFound',
      `No metric named '${input.metricKey}' has been measured on this Case Study. Run it first.`,
      { metricKey: input.metricKey }
    );
  }

  // A self-report is not third-party verification. `caseStudyPublishRules.ts`
  // refuses this combination outright, so accepting it here would only defer the
  // refusal to a moment when the person who chose it is no longer looking.
  if (input.verificationClass === 'verified' && row.verification_method === 'self') {
    throw new MetricPromotionError(
      'SelfVerification',
      `${input.metricKey} cannot be marked verified while its verification method is 'self'. ` +
        'A self-report is not third-party verification.',
      { metricKey: input.metricKey, verificationMethod: row.verification_method }
    );
  }

  // A verified class with no evidence pointer is an assertion, not proof. Every
  // metric this pipeline produces carries one, so reaching this means something
  // wrote the row by another path.
  if (input.verificationClass === 'verified' && !row.evidence_id) {
    throw new MetricPromotionError(
      'EvidenceMissing',
      `${input.metricKey} cannot be marked verified with no evidence linked. ` +
        'A verified class with no evidence pointer is an assertion, not proof.',
      { metricKey: input.metricKey }
    );
  }

  // `publishable` is a separate axis from the class, and the gate reads both.
  // Marking a still-pending figure publishable would put an unverified number on
  // a public surface, which is the single thing this whole model exists to stop.
  if (input.publishable && input.verificationClass === 'pending') {
    throw new MetricPromotionError(
      'ValidationError',
      `${input.metricKey} cannot be publishable while its verification class is still 'pending'. ` +
        'Decide the class first.',
      { metricKey: input.metricKey, field: 'publishable' }
    );
  }

  // A headline figure is the one a reader sees first; making an unpublishable
  // metric the headline would leave the most prominent slot empty on the page.
  if (input.isHeadline && !input.publishable) {
    throw new MetricPromotionError(
      'ValidationError',
      `${input.metricKey} cannot be the headline figure while it is not publishable.`,
      { metricKey: input.metricKey, field: 'isHeadline' }
    );
  }

  // DEMOTION CLEARS THE ATTRIBUTION. Sending a figure back to `pending` means
  // nobody currently vouches for it, so leaving a name on it would credit a
  // person with a decision that has been withdrawn.
  const demoting = input.verificationClass === 'pending';

  await row.update({
    verification_class: input.verificationClass,
    publishable: input.publishable,
    is_headline: input.isHeadline,
    verified_by: demoting ? null : actor,
    verified_at: demoting ? null : new Date(input.decidedAt),
  });

  return {
    metricKey: input.metricKey,
    verificationClass: input.verificationClass,
    verificationMethod: row.verification_method,
    publishable: input.publishable,
    isHeadline: input.isHeadline,
    verifiedBy: demoting ? null : actor,
    verifiedAt: demoting ? null : input.decidedAt,
  };
}

interface MetricRow {
  readonly id: string;
  readonly verification_method: string;
  readonly evidence_id: string | null;
  update(values: Record<string, unknown>): Promise<unknown>;
}

/** Every measured metric on a record, for the panel that has never been able to see them. */
export async function listMeasuredMetrics(caseStudyId: string): Promise<MeasuredMetric[]> {
  const rows = (await CaseStudyMetric.findAll({
    where: { case_study_id: caseStudyId },
    order: [['metric_key', 'ASC']],
  })) as unknown as MeasuredMetricRow[];

  return rows.map((r) => ({
    metricKey: r.metric_key,
    label: r.label,
    valueDisplay: r.value_display,
    numericValue: r.numeric_value === null || r.numeric_value === undefined
      ? null
      : Number(r.numeric_value),
    unit: r.unit,
    metricType: r.metric_type,
    verificationClass: r.verification_class as CaseStudyVerificationClass,
    verificationMethod: r.verification_method as CaseStudyVerificationMethod,
    publishable: r.publishable === true,
    isHeadline: r.is_headline === true,
    verifiedBy: r.verified_by,
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    hasEvidence: Boolean(r.evidence_id),
    sample: r.sample,
    methodology: r.methodology,
    baseline: r.baseline,
    limitations: Array.isArray(r.limitations) ? r.limitations.map(String) : [],
  }));
}

export interface MeasuredMetric {
  readonly metricKey: string;
  readonly label: string | null;
  readonly valueDisplay: string | null;
  readonly numericValue: number | null;
  readonly unit: string | null;
  readonly metricType: string;
  readonly verificationClass: CaseStudyVerificationClass;
  readonly verificationMethod: CaseStudyVerificationMethod;
  readonly publishable: boolean;
  readonly isHeadline: boolean;
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
  readonly hasEvidence: boolean;
  readonly sample: string | null;
  readonly methodology: string | null;
  readonly baseline: string | null;
  readonly limitations: readonly string[];
}

interface MeasuredMetricRow {
  metric_key: string;
  label: string | null;
  value_display: string | null;
  numeric_value: number | string | null;
  unit: string | null;
  metric_type: string;
  verification_class: string;
  verification_method: string;
  publishable: boolean | null;
  is_headline: boolean | null;
  verified_by: string | null;
  verified_at: Date | string | null;
  evidence_id: string | null;
  sample: string | null;
  methodology: string | null;
  baseline: string | null;
  limitations: unknown;
}
