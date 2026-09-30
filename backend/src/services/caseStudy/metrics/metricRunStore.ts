import { randomUUID } from 'crypto';
import type { Transaction } from 'sequelize';
import CaseStudyEvidence from '../../../models/CaseStudyEvidence';
import CaseStudyMetric from '../../../models/CaseStudyMetric';
import type { MetricComputation, MetricDefinition } from './metricDefinition';

/**
 * Persisting one computed metric, together with the record of the run that
 * produced it. `METRIC_PROVENANCE_PIPELINE.md` §3.3.
 *
 * THE RUN RECORD IS A `case_study_evidence` ROW. That needs no schema change:
 * the table already carries `metric_id`, `source_ref`, `source_commit_sha` and a
 * `metadata` JSONB, and it has no `updated_at` and no delete path anywhere in
 * the Case Study services — so the run log is append-only by construction rather
 * than by convention. It also satisfies publish gate rule 7, which requires a
 * metric to point at evidence, with an artefact that is a record of what ran.
 *
 * `source_type` is `internal_measurement`. Not `repo` and not `platform`: those
 * are not members of `CaseStudyEvidenceSourceType`, and the scope document
 * originally said otherwise only because it was written from a doc comment that
 * listed four values the union does not contain.
 *
 * WRITE DISCIPLINE FOR RELEASE 1. This writer sets `verification_class: 'pending'`
 * and `publishable: false`, and it never sets `verified_by`, `verified_at` or
 * `is_headline`. Promotion is a human act, and it is the act that stamps who did
 * it. A producer that could promote its own output would make the audit columns
 * decoration.
 */

export interface MetricWriteInput {
  readonly caseStudyId: string;
  readonly definition: MetricDefinition;
  readonly computation: MetricComputation;
  /** The commit the approved snapshot pins, recorded on the run record. */
  readonly pinnedCommitSha: string | null;
  readonly correlationId: string;
  /**
   * Passed in, never read from a clock in here.
   *
   * The writer stays deterministic for the same reason `compute` does: a test
   * asserting that two runs leave the same end state cannot do so against a
   * function that stamps `new Date()` itself.
   */
  readonly computedAt: string;
  readonly transaction?: Transaction;
}

export type MetricWriteOutcome =
  | {
      readonly status: 'written';
      readonly metricId: string;
      readonly evidenceId: string;
      readonly runId: string;
      /** False when an existing pending row was updated in place. */
      readonly created: boolean;
    }
  | {
      readonly status: 'refused';
      readonly reason: 'published_row';
      readonly metricId: string;
      /** What the published row says, and what this run computed. */
      readonly publishedValue: number | null;
      readonly computedValue: number | null;
      readonly diverged: boolean;
      readonly message: string;
    };

/**
 * Write a computed metric and its run record.
 *
 * REFUSES rather than mutating a row that has been promoted. §3.3: "A run never
 * mutates a row where `publishable = true`. If a recomputation diverges from a
 * published figure, it records the divergence and surfaces it to the admin."
 * That is the difference between *the number moved* and *the number moved and
 * nobody knows why* — and it is why the refusal carries both values rather than
 * simply declining.
 *
 * IDEMPOTENT. `UNIQUE (case_study_id, metric_key)` means at most one row per
 * metric per case study, so a re-run against a pending row updates in place and
 * the end state is the same as after the first run. A fresh evidence row is
 * written each time, which is correct: the metric is a current value, the
 * evidence is a log of the runs that produced it.
 */
export async function writeMetricRun(input: MetricWriteInput): Promise<MetricWriteOutcome> {
  const { caseStudyId, definition, computation, transaction } = input;
  const tx = transaction ? { transaction } : {};

  const existing = (await CaseStudyMetric.findOne({
    where: { case_study_id: caseStudyId, metric_key: definition.key },
    ...tx,
  })) as unknown as ExistingMetricRow | null;

  if (existing?.publishable === true) {
    const publishedValue = numeric(existing.numeric_value);
    const computedValue = computation.numericValue;
    return {
      status: 'refused',
      reason: 'published_row',
      metricId: existing.id,
      publishedValue,
      computedValue,
      diverged: publishedValue !== computedValue,
      message:
        publishedValue === computedValue
          ? `${definition.key} is already published at this value; the run changed nothing.`
          : `${definition.key} is published at ${describe(publishedValue)} and this run computed ` +
            `${describe(computedValue)}. The published figure was left untouched.`,
    };
  }

  // Both ids are minted BEFORE either write, which the bare-UUID design on these
  // tables exists to permit: each row can name the other without a chicken-and-egg
  // ordering problem and without a foreign key forcing one to exist first.
  const metricId = existing?.id ?? randomUUID();
  const evidenceId = randomUUID();
  const runId = randomUUID();

  // EVIDENCE FIRST, deliberately. If the second write fails, the surviving row
  // should be an evidence row nothing points at — a record of a run whose metric
  // did not land, which is harmless and true. The other order would leave a
  // metric whose `evidence_id` names a row that does not exist, which is a
  // metric that looks evidenced and is not.
  await CaseStudyEvidence.create(
    {
      id: evidenceId,
      case_study_id: caseStudyId,
      metric_id: metricId,
      source_type: 'internal_measurement',
      source_ref: runId,
      source_commit_sha: input.pinnedCommitSha,
      title: `${definition.label} — computed ${input.computedAt}`,
      description: computation.methodology,
      verification_class: 'pending',
      is_publicly_openable: false,
      metadata: {
        definition_key: definition.key,
        definition_version: definition.version,
        inputs: computation.inputs,
        computed_at: input.computedAt,
        correlation_id: input.correlationId,
      },
    } as never,
    tx as never
  );

  const values = {
    case_study_id: caseStudyId,
    metric_key: definition.key,
    label: definition.label,
    value_display: computation.valueDisplay,
    numeric_value: computation.numericValue,
    unit: computation.unit ?? null,
    metric_type: definition.metricType,
    // 'pending' and false, always. Only a human moves either.
    verification_class: 'pending',
    verification_method: definition.verificationMethod,
    publishable: false,
    evidence_id: evidenceId,
    baseline: computation.baseline,
    sample: computation.sample,
    methodology: computation.methodology,
    limitations: [...computation.limitations],
  };

  if (existing) {
    await existing.update(values as never, tx as never);
    return { status: 'written', metricId, evidenceId, runId, created: false };
  }

  await CaseStudyMetric.create({ id: metricId, ...values } as never, tx as never);
  return { status: 'written', metricId, evidenceId, runId, created: true };
}

interface ExistingMetricRow {
  readonly id: string;
  readonly publishable?: boolean | null;
  readonly numeric_value?: number | string | null;
  update(values: unknown, options?: unknown): Promise<unknown>;
}

/**
 * Postgres `NUMERIC` arrives as a string through some drivers and as a number
 * through others. Comparing a published `11` against a computed `11` must not
 * depend on which, or the divergence report is decided by a driver detail.
 */
function numeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const describe = (value: number | null): string => (value === null ? 'no value' : String(value));
