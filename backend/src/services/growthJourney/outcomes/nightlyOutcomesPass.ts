import { Op } from 'sequelize';
import { GrowthJourneyHandoff } from '../../../models';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { isKillSwitchActive } from '../../launchSafety';
import { expireOverdueHandoffs } from '../handoffs/slaService';
import type { HandoffRates } from './handoffRates';
import { DEFAULT_RATES_WINDOW_DAYS, loadHandoffRates } from './handoffRatesQuery';
import { normalizeExistingOutcomes } from './outcomeNormalizer';

/**
 * The nightly's outcomes stage for one brand (Phase 4 T409), after the
 * decisions and the assignment pass: normalise the outcomes of every lead the
 * brand handed off recently, expire what nobody picked up in time, and read
 * the rates. Three stages, three failure domains - a table the normaliser
 * cannot read does not stop the sweep, and a sweep that fails does not stop
 * the rates - and one counts-only summary for the nightly line.
 *
 * The normaliser's population is the brand's handoff leads: the rows the rates
 * divide by are the rows whose outcomes must be indexed, and a brand that has
 * handed off nobody has nothing to normalise. Bounded per night; the rest
 * index tomorrow, and a replay costs one unique-index hit per fact.
 *
 * The kill switch is read once here: on, the two writes (index rows, expiries)
 * are skipped by name, and the read-only rates still compute.
 */

export const DEFAULT_NORMALIZE_LEAD_LIMIT = 200;
const DAY = 86_400_000;

export interface OutcomesPassArgs {
  brandId: string;
  asOf?: Date;
  windowDays?: number;
  leadLimit?: number;
}

type Failed = { failed: true; error_class: string };
type Skipped = { skipped: true; reason: 'kill_switch_active' };

export interface OutcomesPassSummary {
  normalized: { leads: number; created: number; replayed: number; unmapped: number; failed: number; no_brand: number } | Skipped | Failed;
  sla: { scanned: number; expired: number; failed: number } | Skipped | Failed;
  rates: RatesSummary | Failed;
}

/** The values a log line carries: numbers and nulls, never a row. */
export interface RatesSummary {
  window_days: number;
  handoffs: number;
  accepted: number;
  verdicts: number;
  acceptance_rate: number | null;
  expiry_rate: number | null;
  connection_rate: number | null;
  meeting_rate: number | null;
  qualification_rate: number | null;
  conversion_rate: number | null;
  false_positive_handoff_rate: number | null;
  time_to_accept_hours: number | null;
  by_queue: Record<string, { handoffs: number; verdicts: number; false_positive_handoff_rate: number | null }>;
}

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })));
}

async function handoffLeadIds(brandId: string, from: Date, limit: number): Promise<number[]> {
  const rows = await GrowthJourneyHandoff.findAll({
    where: { brand_id: brandId, lead_id: { [Op.ne]: null }, updated_at: { [Op.gte]: from } },
    attributes: ['lead_id'],
    order: [['updated_at', 'DESC']],
    limit: limit * 5,
  });
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.lead_id !== null) ids.add(Number(r.lead_id));
    if (ids.size >= limit) break;
  }
  return [...ids];
}

async function normalizeStage(brandId: string, from: Date, limit: number): Promise<OutcomesPassSummary['normalized']> {
  try {
    const leads = await handoffLeadIds(brandId, from, limit);
    const totals = { leads: leads.length, created: 0, replayed: 0, unmapped: 0, failed: 0, no_brand: 0 };
    for (const leadId of leads) {
      const r = await normalizeExistingOutcomes({ leadId, brandId });
      if (r.status === 'no_brand') totals.no_brand += 1;
      totals.created += r.created;
      totals.replayed += r.replayed;
      totals.unmapped += r.unmapped.length;
      totals.failed += r.failed.length;
    }
    return totals;
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.nightly.normalize_failed', { brand_id: brandId, error_class });
    return { failed: true, error_class };
  }
}

async function slaStage(brandId: string, asOf: Date): Promise<OutcomesPassSummary['sla']> {
  try {
    const r = await expireOverdueHandoffs({ brandId, asOf });
    if (r.skipped) return { skipped: true, reason: r.reason };
    return { scanned: r.scanned, expired: r.expired, failed: r.failed.length };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.nightly.sla_sweep_failed', { brand_id: brandId, error_class });
    return { failed: true, error_class };
  }
}

const v = (r: { value: number | null }): number | null => r.value;

export function summarizeRates(all: HandoffRates, byQueue: Partial<Record<string, HandoffRates>>, windowDays: number): RatesSummary {
  const by_queue: RatesSummary['by_queue'] = {};
  for (const [q, r] of Object.entries(byQueue)) {
    if (r) by_queue[q] = { handoffs: r.handoffs, verdicts: r.verdicts, false_positive_handoff_rate: v(r.false_positive_handoff_rate) };
  }
  return {
    window_days: windowDays,
    handoffs: all.handoffs,
    accepted: all.accepted,
    verdicts: all.verdicts,
    acceptance_rate: v(all.acceptance_rate),
    expiry_rate: v(all.expiry_rate),
    connection_rate: v(all.connection_rate),
    meeting_rate: v(all.meeting_rate),
    qualification_rate: v(all.qualification_rate),
    conversion_rate: v(all.conversion_rate),
    false_positive_handoff_rate: v(all.false_positive_handoff_rate),
    time_to_accept_hours: v(all.time_to_accept_hours),
    by_queue,
  };
}

async function ratesStage(brandId: string, asOf: Date, windowDays: number): Promise<OutcomesPassSummary['rates']> {
  try {
    const r = await loadHandoffRates({ brandId, asOf, windowDays });
    return summarizeRates(r.all, r.by_queue, windowDays);
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.nightly.rates_failed', { brand_id: brandId, error_class });
    return { failed: true, error_class };
  }
}

/** Never throws: each stage answers for itself. */
export async function runOutcomesPass(args: OutcomesPassArgs): Promise<OutcomesPassSummary> {
  const asOf = args.asOf ?? new Date();
  const windowDays = args.windowDays ?? DEFAULT_RATES_WINDOW_DAYS;
  const from = new Date(asOf.getTime() - windowDays * DAY);
  const killed = await isKillSwitchActive();
  const skipped: Skipped = { skipped: true, reason: 'kill_switch_active' };
  const normalized = killed ? skipped : await normalizeStage(args.brandId, from, args.leadLimit ?? DEFAULT_NORMALIZE_LEAD_LIMIT);
  const sla = killed ? skipped : await slaStage(args.brandId, asOf);
  const rates = await ratesStage(args.brandId, asOf, windowDays);
  return { normalized, sla, rates };
}
