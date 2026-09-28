import { Op, fn, col } from 'sequelize';
import { AiAgent, GrowthJourneyDecision, GrowthJourneyExecution, GrowthJourneyHandoff } from '../../../models';
import { getMetric } from '../../adminOs/metricRegistry';
import { metricFreshness, freshnessAgentOf, type MetricFreshness } from '../../adminOs/metricFreshness';
import { JOURNEY_EXECUTOR_AGENT, JOURNEY_METRICS, JOURNEY_NIGHTLY_AGENT } from '../../adminOs/metrics/journeyMetrics';
import { medianHours, NO_DENOMINATOR, type Rate } from '../outcomes/handoffRates';
import { loadHandoffRates } from '../outcomes/handoffRatesQuery';

/**
 * The journey's registered metrics, computed for one scope (Phase 6, T605).
 *
 * ─── MISSING IS NEVER ZERO, AND THE RULE IS PHASE 4'S ───────────────────────
 *
 * Every rate is `{ value: null, numerator, denominator: 0, reason:
 * 'no_denominator' }` when there is nothing to divide by - the vocabulary
 * `outcomes/handoffRates.ts` established, reused rather than reinvented. A
 * brand that recorded no decisions has no live-decision share, not a 0% one,
 * and a dashboard that renders 0% is reporting a fact the data does not hold.
 *
 * ─── EVERY VALUE CARRIES ITS OWN FRESHNESS ──────────────────────────────────
 *
 * The journey is dark: both agents ship disabled. So a value of 0 and "nothing
 * has ever run" are the two states a launch-readiness reader must tell apart,
 * and each served metric carries `metricFreshness()`'s verdict - `never` while
 * the agent that owns it has not run, `stale` past the rule's window, `fresh`
 * inside it. The rule is the registry's; this service only supplies the
 * timestamps (the newest row it read, and the declared agent's `last_run_at`).
 *
 * ─── WHAT IT READS, AND WHAT IT REFUSES TO READ ─────────────────────────────
 *
 * Declared columns only, aggregated in the database (`COUNT`, `MAX`), never a
 * JSONB payload: `candidates`, `evidence`, `selected_content` and
 * `metadata` are where a person's words live, and a metric never needs them.
 * Every read is bounded - by the caller's brand scope, by the window, and (for
 * the row-level handoff rates, which the Phase 4 query loads as rows) by that
 * query's own window. `window_days` is clamped to a year.
 *
 * The three metrics this service does NOT compute are stated rather than
 * silently missing: `journey.plan_refusal_rate` needs an executor run row that
 * does not exist yet (its own `statusReason` says so), and
 * `journey.enrolment_conversion_rate` crosses the e-mail-equality join, which
 * is `partial` by registration - both are returned as `unavailable_here` with
 * the reason, so a screen shows the caveat rather than a blank.
 */

export const DEFAULT_WINDOW_DAYS = 30;
export const MAX_WINDOW_DAYS = 365;
/** The trigger `runShadowDecisionsNightly` stamps; the nightly count is the decisions carrying it. */
export const NIGHTLY_TRIGGER = 'nightly';
/** A bound on the accept-time sample, so a 365-day window on a busy brand is still one bounded read. */
export const MAX_ACCEPT_SAMPLES = 5_000;
const DAY = 86_400_000;

export interface JourneyMetricsScope {
  tenantId: string;
  brandIds: readonly string[];
  brandId?: string | null;
  programId?: string | null;
  windowDays?: number;
  asOf?: Date;
}

export interface ServedMetric {
  key: string;
  name: string;
  unit: string;
  status: string;
  statusReason?: string;
  /** A count, a rate in the Phase 4 vocabulary, or null with a reason when this service cannot compute it. */
  value: number | null;
  numerator?: number;
  denominator?: number;
  reason?: string;
  freshness: MetricFreshness;
}

export interface JourneyMetricsResult {
  scope: { tenant_id: string; brand_id: string | null; program_id: string | null; window_days: number; from: string; to: string };
  computed_at: string;
  metrics: ServedMetric[];
}

/** A rate in the Phase 4 vocabulary: null with a reason rather than a zero nobody can defend. */
export function rateOf(numerator: number, denominator: number): Rate {
  if (denominator <= 0) return { value: null, numerator, denominator: 0, reason: NO_DENOMINATOR };
  return { value: Math.round((numerator / denominator) * 10_000) / 100, numerator, denominator };
}

/**
 * The median of the POOLED sample, in the seconds the metric's unit declares, with Phase 4's own
 * sample floor: under `MIN_MEDIAN_SAMPLES` accepted handoffs there is no distribution, and the
 * answer is null with `below_min_samples` rather than a number one data point produced.
 * `denominator` is the SAMPLE count - not, as the first version had it, the brand count.
 */
export function pooledMedian(seconds: readonly number[]): Partial<ServedMetric> {
  // `medianHours` is unit-agnostic - it applies Phase 4's sample floor to whatever numbers it is
  // handed - so the seconds go in directly rather than through a round trip via hours.
  const median = medianHours(seconds);
  if (median.value === null) return { value: null, denominator: median.samples, reason: median.reason };
  return { value: Math.round(median.value * 100) / 100, denominator: median.samples };
}

function clampWindow(days: number | undefined): number {
  if (!days || !Number.isFinite(days)) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.max(1, Math.floor(days)), MAX_WINDOW_DAYS);
}

/** The brands this read may touch: the caller's scope, narrowed by an explicit brand_id. */
export function brandsInScope(scope: JourneyMetricsScope): string[] {
  const allowed = [...scope.brandIds];
  if (!scope.brandId) return allowed;
  return allowed.includes(scope.brandId) ? [scope.brandId] : [];
}

interface DecisionCounts { total: number; live: number; nightly: number; newest: Date | null }

async function decisionCounts(brandIds: string[], programId: string | null, from: Date, to: Date): Promise<DecisionCounts> {
  if (brandIds.length === 0) return { total: 0, live: 0, nightly: 0, newest: null };
  const where: Record<string, unknown> = { brand_id: { [Op.in]: brandIds }, created_at: { [Op.gte]: from, [Op.lt]: to } };
  if (programId) where.program_id = programId;
  // Grouped by mode AND trigger, because `journey.nightly_recorded_decisions` is the count the
  // SCHEDULED pass produced - `trigger = 'nightly'` (`runShadowDecisionsNightly`) - and the whole
  // point of registering it separately is that it must not be the same number as the total.
  const rows = (await GrowthJourneyDecision.findAll({
    where,
    attributes: ['mode', 'trigger', [fn('COUNT', col('id')), 'n'], [fn('MAX', col('created_at')), 'newest']],
    group: ['mode', 'trigger'],
    raw: true,
  })) as unknown as Array<{ mode: string; trigger: string | null; n: string | number; newest: string | Date | null }>;
  let total = 0;
  let live = 0;
  let nightly = 0;
  let newest: Date | null = null;
  for (const row of rows) {
    const n = Number(row.n);
    total += n;
    if (row.mode === 'live') live += n;
    if (row.trigger === NIGHTLY_TRIGGER) nightly += n;
    const at = row.newest ? new Date(row.newest) : null;
    if (at && (!newest || at > newest)) newest = at;
  }
  return { total, live, nightly, newest };
}

interface ReceiptCounts { completed: number; blocked: number; failed: number; newest: Date | null }

async function receiptCounts(brandIds: string[], programId: string | null, from: Date, to: Date): Promise<ReceiptCounts> {
  if (brandIds.length === 0) return { completed: 0, blocked: 0, failed: 0, newest: null };
  const where: Record<string, unknown> = { brand_id: { [Op.in]: brandIds }, updated_at: { [Op.gte]: from, [Op.lt]: to } };
  if (programId) where.program_id = programId;
  const rows = (await GrowthJourneyExecution.findAll({
    where,
    attributes: ['status', [fn('COUNT', col('id')), 'n'], [fn('MAX', col('updated_at')), 'newest']],
    group: ['status'],
    raw: true,
  })) as unknown as Array<{ status: string; n: string | number; newest: string | Date | null }>;
  const counts: ReceiptCounts = { completed: 0, blocked: 0, failed: 0, newest: null };
  for (const row of rows) {
    const n = Number(row.n);
    if (row.status === 'completed') counts.completed += n;
    else if (row.status === 'blocked') counts.blocked += n;
    else if (row.status === 'failed') counts.failed += n;
    const at = row.newest ? new Date(row.newest) : null;
    if (at && (!counts.newest || at > counts.newest)) counts.newest = at;
  }
  return counts;
}

interface AcceptSample { seconds: number[]; newest: Date | null }

/**
 * Every accepted handoff's wait, for the scope, as ONE pooled sample - and the newest handoff
 * timestamp, which is what makes a handoff metric's freshness a measurement rather than a guess.
 *
 * Phase 4's `loadHandoffRates` returns a per-brand MEDIAN, and medians cannot be pooled: a mean of
 * two brands' medians weights three handoffs the same as three hundred, which is the error the
 * rates' own header forbids and which the first version of this service committed. So the samples
 * are read here, bounded (`MAX_ACCEPT_SAMPLES`, newest first) and projected to two timestamp
 * columns - never `subject_ref`, never a payload.
 */
async function acceptSamples(brandIds: string[], from: Date, to: Date): Promise<AcceptSample> {
  if (brandIds.length === 0) return { seconds: [], newest: null };
  const rows = (await GrowthJourneyHandoff.findAll({
    where: { brand_id: { [Op.in]: brandIds }, created_at: { [Op.gte]: from, [Op.lt]: to } },
    attributes: ['created_at', 'accepted_at'],
    order: [['created_at', 'DESC']],
    limit: MAX_ACCEPT_SAMPLES,
    raw: true,
  })) as unknown as Array<{ created_at: string | Date; accepted_at: string | Date | null }>;
  const seconds: number[] = [];
  let newest: Date | null = null;
  for (const row of rows) {
    const created = new Date(row.created_at);
    if (!newest || created > newest) newest = created;
    if (!row.accepted_at) continue;
    const waited = (new Date(row.accepted_at).getTime() - created.getTime()) / 1_000;
    if (waited >= 0) seconds.push(waited);
  }
  return { seconds, newest };
}

/** `last_run_at` for the agents the journey metrics declare; absent row => never run. */
async function agentRuns(): Promise<Record<string, Date | null>> {
  const rows = await AiAgent.findAll({
    where: { agent_name: { [Op.in]: [JOURNEY_NIGHTLY_AGENT, JOURNEY_EXECUTOR_AGENT] } },
    attributes: ['agent_name', 'last_run_at'],
  });
  const out: Record<string, Date | null> = {};
  for (const row of rows) {
    const at = row.get('last_run_at') as Date | null;
    out[String(row.get('agent_name'))] = at ? new Date(at) : null;
  }
  return out;
}

/** The registered definition, plus this service's computed value, plus the freshness of the input it used. */
function serve(key: string, computed: Partial<ServedMetric>, inputs: { sourceMaxAt?: Date | null; agentLastRunAt?: Date | null }, now: Date): ServedMetric {
  const def = getMetric(key) ?? JOURNEY_METRICS[key];
  return {
    key,
    name: def.name,
    unit: def.unit,
    status: def.status,
    ...(def.statusReason ? { statusReason: def.statusReason } : {}),
    value: computed.value ?? null,
    ...(computed.numerator === undefined ? {} : { numerator: computed.numerator }),
    ...(computed.denominator === undefined ? {} : { denominator: computed.denominator }),
    ...(computed.reason ? { reason: computed.reason } : {}),
    freshness: metricFreshness(def.freshness!, inputs, now),
  };
}

export async function computeJourneyMetrics(scope: JourneyMetricsScope): Promise<JourneyMetricsResult> {
  const now = scope.asOf ?? new Date();
  const windowDays = clampWindow(scope.windowDays);
  const from = new Date(now.getTime() - windowDays * DAY);
  const brandIds = brandsInScope(scope);
  const programId = scope.programId ?? null;

  const [decisions, receipts, runs, accepts] = await Promise.all([
    decisionCounts(brandIds, programId, from, now),
    receiptCounts(brandIds, programId, from, now),
    agentRuns(),
    acceptSamples(brandIds, from, now),
  ]);

  // The handoff rates are Phase 4's per-brand computation, asked once per brand in scope and summed
  // on the numerators and denominators - never averaged, because averaging two brands' rates weights
  // a brand with three handoffs the same as one with three hundred.
  let handoffs = 0;
  let accepted = 0;
  let verdicts = 0;
  let falsePositives = 0;
  let qualified = 0;
  for (const brandId of brandIds) {
    const rates = await loadHandoffRates({ brandId, asOf: now, windowDays });
    handoffs += rates.all.handoffs;
    accepted += rates.all.accepted;
    verdicts += rates.all.verdicts;
    falsePositives += rates.all.false_positive_handoff_rate.numerator;
    qualified += rates.all.qualification_rate.numerator;
  }
  const sendReached = receipts.completed + receipts.blocked + receipts.failed;
  const live = { sourceMaxAt: decisions.newest };
  const nightly = { agentLastRunAt: runs[JOURNEY_NIGHTLY_AGENT] ?? null };
  const executor = { agentLastRunAt: runs[JOURNEY_EXECUTOR_AGENT] ?? null };
  // MEASURED, not synthesized: the newest handoff in the scope. The first version of this service
  // passed `now` whenever any handoff existed, so a brand whose last handoff was 300 days ago -
  // inside a 365-day window - still read "newest row is 0h old" and no handoff metric could ever
  // go stale, in the one task whose deliverable is telling fresh from stale.
  const handoffFresh = { sourceMaxAt: accepts.newest };

  const metrics: ServedMetric[] = [
    serve('journey.decisions_recorded', { value: decisions.total }, live, now),
    serve('journey.live_decision_share', rateOf(decisions.live, decisions.total), live, now),
    serve('journey.nightly_recorded_decisions', { value: decisions.nightly }, nightly, now),
    serve('journey.handoff_acceptance_rate', rateOf(accepted, handoffs), handoffFresh, now),
    serve('journey.false_positive_handoff_rate', rateOf(falsePositives, verdicts), handoffFresh, now),
    serve('journey.qualified_opportunity_rate', rateOf(qualified, verdicts), handoffFresh, now),
    serve('journey.time_to_first_human_touch_seconds', pooledMedian(accepts.seconds), handoffFresh, now),
    serve('journey.receipts_completed', { value: receipts.completed }, executor, now),
    serve('journey.send_block_rate', rateOf(receipts.blocked, sendReached), executor, now),
    // The two this service does not compute, returned WITH their reason rather than omitted: a
    // screen that shows nothing for a registered metric reads as a bug in the screen.
    serve('journey.plan_refusal_rate', { value: null, reason: 'needs_executor_run_row' }, executor, now),
    serve('journey.enrolment_conversion_rate', { value: null, reason: 'needs_identity_key' }, executor, now),
  ];

  return {
    scope: {
      tenant_id: scope.tenantId,
      brand_id: scope.brandId ?? null,
      program_id: programId,
      window_days: windowDays,
      from: from.toISOString(),
      to: now.toISOString(),
    },
    computed_at: now.toISOString(),
    metrics,
  };
}
