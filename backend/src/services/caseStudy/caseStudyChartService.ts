/**
 * Case Study OS — charts that reference numbers and never carry them.
 *
 * THE WHOLE DESIGN IS ONE SENTENCE: a chart names `case_study_metrics.metric_key`
 * values, and the numbers are resolved at render time by the same code the
 * measurement section uses.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. `verifiedFigures()`
 * (`caseStudyPublishClaimScan.ts`) builds the set of figures a page is allowed
 * to state, drawing only from metrics that are visible, `verified` or
 * `anonymized`, and not `method: 'self'`. The prose scan compares every `%` and
 * currency token on the page against that set. A chart carrying its own
 * `values: number[]` would sit entirely outside that mechanism — nothing would
 * compare it to anything, and typing `47%` into a chart row would bypass
 * `verifiedFigures()` completely. That is not a hypothetical: it is the exact
 * shape of the bypass the metric verification system exists to prevent.
 *
 * SO THE GUARANTEE IS ENFORCED AT FOUR LAYERS THAT FAIL INDEPENDENTLY:
 *   1. `CaseStudyChartSpec` has no values field — a compile error.
 *   2. `chartBodySchema` is `.strict()` — an extra key is a 400, not a shrug.
 *   3. `case_study_charts` has no values column — a write would throw.
 *   4. `caseStudyChartContract.test.ts` greps the DDL, the model and the type
 *      for value-bearing names, with a non-vacuity assertion so the grep cannot
 *      pass by finding nothing.
 * Remove any one and the invariant still stands. That redundancy is deliberate.
 *
 * ONLY WHAT THE PILOT JUSTIFIES: `bar` and `ranking`, both of which render from
 * (label, value) pairs the metrics already carry. No line, no area, no scatter
 * — they interpolate, and these metrics are discrete verified figures with no
 * time series behind them. `CaseStudyArchitecture.tsx` refuses to draw its
 * node/edge list for the same stated reason: a chart drawn from that data would
 * have to invent a layout the data does not contain.
 */

import { randomUUID } from 'crypto';
import { CaseStudyChart as ChartModel, CaseStudyMetric as MetricModel } from '../../models';
import type { CaseStudyChartSpec, CaseStudyChartType } from '../../types/caseStudyStory';
import { CASE_STUDY_CHART_TYPES } from '../../types/caseStudyStory';
import { CaseStudyAdminError } from './caseStudyAdminStore';

/** A chart of more than eight bars is a table pretending to be a picture. */
export const MAX_CHART_METRIC_KEYS = 8;

const toContract = (row: ChartModel): CaseStudyChartSpec => ({
  id: row.id,
  caseStudyId: row.case_study_id,
  chartType: row.chart_type as CaseStudyChartType,
  title: row.title,
  caption: row.caption,
  metricKeys: [...(row.metric_keys ?? [])],
  approved: row.approved,
  createdAt: row.created_at.toISOString(),
});

/**
 * What a chart would actually render, and what it would silently omit.
 *
 * `unresolved` is the honest half. A chart naming four metric keys of which two
 * are unpublishable renders two bars, and an author who is not told that will
 * believe the chart shows four. `STORY_ASSET_MODEL.md` names the pattern to
 * copy — the repository link rule's "honest opaque count rather than silent
 * omission".
 */
export interface ChartResolution {
  readonly chart: CaseStudyChartSpec;
  readonly resolved: readonly {
    readonly metricKey: string;
    readonly label: string;
    readonly valueDisplay: string;
  }[];
  readonly unresolved: readonly { readonly metricKey: string; readonly reason: string }[];
}

/**
 * Resolve a chart's keys against the metric table.
 *
 * The two locks are the same two `projectMetric` applies: `publishable` (which
 * defaults false) and `verification_class` (which defaults `pending`). This
 * function does not re-implement the rule so much as ask the same question of
 * the same columns, so a chart can never show a metric the measurement section
 * would refuse.
 */
export async function resolveChart(chart: CaseStudyChartSpec): Promise<ChartResolution> {
  const metrics = await MetricModel.findAll({
    where: { case_study_id: chart.caseStudyId },
  });
  const byKey = new Map(metrics.map((m) => [m.metric_key, m]));

  const resolved: ChartResolution['resolved'][number][] = [];
  const unresolved: ChartResolution['unresolved'][number][] = [];

  for (const key of chart.metricKeys) {
    const metric = byKey.get(key);
    if (!metric) {
      unresolved.push({ metricKey: key, reason: 'No metric on this record carries that key.' });
      continue;
    }
    if (!metric.publishable) {
      unresolved.push({
        metricKey: key,
        reason: 'That metric is not marked publishable, so no surface may show it.',
      });
      continue;
    }
    if (metric.verification_class === 'pending') {
      unresolved.push({
        metricKey: key,
        reason: 'That metric is still pending verification. A chart cannot verify it.',
      });
      continue;
    }
    // A metric with no display value has nothing for a bar to be. Reported as
    // unresolved rather than coerced to an empty string, because a bar labelled
    // with a blank value reads as a measured zero.
    if (!metric.value_display) {
      unresolved.push({
        metricKey: key,
        reason: 'That metric carries no display value, so there is nothing for a bar to show.',
      });
      continue;
    }
    resolved.push({
      metricKey: key,
      label: metric.label,
      valueDisplay: metric.value_display,
    });
  }

  return { chart, resolved, unresolved };
}

export interface SaveChartInput {
  readonly caseStudyId: string;
  readonly chartId?: string;
  readonly chartType: CaseStudyChartType;
  readonly title: string;
  readonly caption?: string | null;
  readonly metricKeys: readonly string[];
}

/**
 * Create or update a chart specification.
 *
 * There is no `values` parameter, and adding one would fail to compile, fail
 * the Zod schema, and fail the write. Saving is idempotent by id.
 *
 * `approved` is NEVER settable here — see `setChartApproval`. Creating and
 * approving are two decisions and they stay two functions, so nothing can
 * approve as a side effect of an edit.
 */
export async function saveChart(input: SaveChartInput): Promise<CaseStudyChartSpec> {
  if (!CASE_STUDY_CHART_TYPES.includes(input.chartType)) {
    throw new CaseStudyAdminError('ValidationError', 'Unknown chart type.', {
      field: 'chartType', allowed: CASE_STUDY_CHART_TYPES,
    });
  }
  const title = String(input.title ?? '').trim();
  if (title.length === 0) {
    throw new CaseStudyAdminError('ValidationError', 'A chart needs a title.', { field: 'title' });
  }
  const keys = Array.from(new Set(
    input.metricKeys.map((k) => String(k ?? '').trim()).filter((k) => k.length > 0),
  ));
  if (keys.length > MAX_CHART_METRIC_KEYS) {
    throw new CaseStudyAdminError(
      'ValidationError',
      `A chart is capped at ${MAX_CHART_METRIC_KEYS} metrics.`,
      { field: 'metricKeys', count: keys.length },
    );
  }

  const caption = input.caption ? String(input.caption).trim() || null : null;

  if (input.chartId) {
    const row = await ChartModel.findOne({
      where: { id: input.chartId, case_study_id: input.caseStudyId },
    });
    if (!row) {
      throw new CaseStudyAdminError('CaseStudyNotFound', 'That chart does not exist on this record.', {
        chartId: input.chartId,
      });
    }
    row.chart_type = input.chartType;
    row.title = title;
    row.caption = caption;
    row.metric_keys = keys;
    // Editing a chart un-approves it. The approval was of a previous shape, and
    // carrying it forward would let an approved chart change what it shows.
    row.approved = false;
    await row.save();
    return toContract(row);
  }

  const created = await ChartModel.create({
    id: randomUUID(),
    case_study_id: input.caseStudyId,
    chart_type: input.chartType,
    title,
    caption,
    metric_keys: keys,
    approved: false,
  });
  return toContract(created);
}

/** Every chart on a record, unapproved included. */
export async function listCharts(caseStudyId: string): Promise<readonly CaseStudyChartSpec[]> {
  const rows = await ChartModel.findAll({
    where: { case_study_id: caseStudyId },
    order: [['created_at', 'ASC']],
  });
  return rows.map(toContract);
}

/**
 * Approve or un-approve. Refuses to approve a chart that would render nothing,
 * because an approved empty chart is a promise of a figure the page cannot keep.
 */
export async function setChartApproval(input: {
  readonly caseStudyId: string;
  readonly chartId: string;
  readonly approved: boolean;
}): Promise<CaseStudyChartSpec> {
  const row = await ChartModel.findOne({
    where: { id: input.chartId, case_study_id: input.caseStudyId },
  });
  if (!row) {
    throw new CaseStudyAdminError('CaseStudyNotFound', 'That chart does not exist on this record.', {
      chartId: input.chartId,
    });
  }

  if (input.approved) {
    const resolution = await resolveChart(toContract(row));
    if (resolution.resolved.length === 0) {
      throw new CaseStudyAdminError(
        'ValidationError',
        'This chart resolves to no publishable metric, so approving it would promise a figure the '
          + 'page cannot show. Verify a metric it names, or leave it unapproved.',
        { chartId: input.chartId, unresolved: resolution.unresolved.length },
      );
    }
  }

  if (row.approved === input.approved) return toContract(row);
  row.approved = input.approved;
  await row.save();
  return toContract(row);
}
