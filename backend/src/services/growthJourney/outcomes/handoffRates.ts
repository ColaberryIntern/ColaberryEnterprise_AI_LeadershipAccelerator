import type { GrowthJourneyHandoffDisposition, GrowthJourneyHandoffStatus, GrowthJourneyOwnerQueue } from '../../../models/GrowthJourneyHandoff';
import type { GrowthJourneyOutcomeType } from '../../../models/GrowthJourneyOutcome';

/**
 * Handoff rates (Phase 4 T409), pure: `growth_journey_handoffs` x
 * `growth_journey_outcomes` for one brand, per queue, over one window.
 *
 * ─── MISSING IS NEVER ZERO ──────────────────────────────────────────────────
 *
 * A rate with nothing in its denominator is `{ value: null, reason:
 * 'no_denominator' }`, never `0`: a brand whose queue took no handoffs this
 * month has no acceptance rate, not a 0% one, and a dashboard that showed 0%
 * would be reporting a fact the data does not contain. A median below
 * `MIN_MEDIAN_SAMPLES` is `null` with `below_min_samples` for the same reason:
 * one accepted handoff is a data point, not a distribution.
 *
 * What each rate counts, in the vocabulary the rows already carry:
 *
 *   acceptance      accepted_at set                              / handoffs created in the window
 *   expiry          status expired                               / handoffs
 *   connection      a reply | meeting_* outcome after creation   / accepted
 *   meeting         a meeting_booked | meeting_completed outcome / accepted
 *   qualification   disposition qualified | converted            / human verdicts
 *   proposal        an opportunity_stage proposal_sent outcome   / qualified | converted
 *   conversion      disposition converted                        / human verdicts
 *   false positive  disposition disqualified | no_contact        / human verdicts
 *
 * A "human verdict" is any row with a disposition, whether it went
 * `dispositioned` or `returned_to_ai`: the question the false-positive rate
 * answers is "of the handoffs a human ruled on, how many should not have
 * been handoffs", and a `nurture` verdict is a ruling too.
 *
 * Outcomes attach to a handoff by `handoff_id` when the writer stamped one
 * (T405 / T406), else by the same `subject_ref` occurring at or after the
 * handoff was created and no later than the window's end - the normaliser's
 * rows (interaction outcomes, appointments, pipeline history) carry no
 * handoff id, and this is how they still count.
 */

export const MIN_MEDIAN_SAMPLES = 3;
export const NO_DENOMINATOR = 'no_denominator';
export const BELOW_MIN_SAMPLES = 'below_min_samples';

export interface Rate {
  value: number | null;
  numerator: number;
  denominator: number;
  reason?: typeof NO_DENOMINATOR;
}

export interface MedianHours {
  value: number | null;
  samples: number;
  reason?: typeof BELOW_MIN_SAMPLES;
}

export interface RateWindow {
  from: Date;
  to: Date;
}

/** The handoff columns the rates read; a row view, never a model instance. */
export interface RateHandoffRow {
  id: string;
  owner_queue: GrowthJourneyOwnerQueue;
  status: GrowthJourneyHandoffStatus;
  disposition: GrowthJourneyHandoffDisposition | null;
  subject_ref: string;
  created_at: Date;
  accepted_at: Date | null;
  disposition_at: Date | null;
}

export interface RateOutcomeRow {
  subject_ref: string;
  handoff_id: string | null;
  outcome_type: GrowthJourneyOutcomeType;
  occurred_at: Date;
  metadata: Record<string, unknown> | null;
}

export interface HandoffRates {
  brand_id: string;
  owner_queue: GrowthJourneyOwnerQueue | 'all';
  window: { from: string; to: string };
  handoffs: number;
  accepted: number;
  verdicts: number;
  acceptance_rate: Rate;
  expiry_rate: Rate;
  connection_rate: Rate;
  meeting_rate: Rate;
  qualification_rate: Rate;
  proposal_rate: Rate;
  conversion_rate: Rate;
  false_positive_handoff_rate: Rate;
  time_to_accept_hours: MedianHours;
  time_to_disposition_hours: MedianHours;
  time_to_first_connection_hours: MedianHours;
}

export const CONNECTION_OUTCOMES: readonly GrowthJourneyOutcomeType[] = ['reply', 'meeting_booked', 'meeting_completed', 'meeting_no_show'];
export const MEETING_OUTCOMES: readonly GrowthJourneyOutcomeType[] = ['meeting_booked', 'meeting_completed'];
export const QUALIFYING_DISPOSITIONS: readonly GrowthJourneyHandoffDisposition[] = ['qualified', 'converted'];
export const FALSE_POSITIVE_DISPOSITIONS: readonly GrowthJourneyHandoffDisposition[] = ['disqualified', 'no_contact'];
export const PROPOSAL_STAGE = 'proposal_sent';

/** A ratio, or the honest answer that there is nothing to divide by. */
export function rate(numerator: number, denominator: number): Rate {
  if (denominator <= 0) return { value: null, numerator, denominator: Math.max(0, denominator), reason: NO_DENOMINATOR };
  return { value: numerator / denominator, numerator, denominator };
}

/** The median of a sample, or null below the minimum. */
export function medianHours(samples: readonly number[]): MedianHours {
  if (samples.length < MIN_MEDIAN_SAMPLES) return { value: null, samples: samples.length, reason: BELOW_MIN_SAMPLES };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { value, samples: samples.length };
}

const HOUR = 3_600_000;
const hoursBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / HOUR;

const inWindow = (h: RateHandoffRow, w: RateWindow): boolean => h.created_at >= w.from && h.created_at < w.to;

function outcomesFor(h: RateHandoffRow, outcomes: readonly RateOutcomeRow[], w: RateWindow): RateOutcomeRow[] {
  return outcomes.filter((o) => (o.handoff_id ? o.handoff_id === h.id : o.subject_ref === h.subject_ref && o.occurred_at >= h.created_at && o.occurred_at <= w.to));
}

const earliest = (rows: readonly RateOutcomeRow[]): Date | null => rows.reduce<Date | null>((min, o) => (min === null || o.occurred_at < min ? o.occurred_at : min), null);

export interface ComputeHandoffRatesArgs {
  brandId: string;
  ownerQueue?: GrowthJourneyOwnerQueue | 'all';
  window: RateWindow;
  handoffs: readonly RateHandoffRow[];
  outcomes: readonly RateOutcomeRow[];
}

export function computeHandoffRates(args: ComputeHandoffRatesArgs): HandoffRates {
  const queue = args.ownerQueue ?? 'all';
  const rows = args.handoffs.filter((h) => inWindow(h, args.window) && (queue === 'all' || h.owner_queue === queue));
  const accepted = rows.filter((h) => h.accepted_at !== null);
  const verdicts = rows.filter((h) => h.disposition !== null);
  const qualified = verdicts.filter((h) => QUALIFYING_DISPOSITIONS.includes(h.disposition as GrowthJourneyHandoffDisposition));

  const attached = new Map<string, RateOutcomeRow[]>(rows.map((h) => [h.id, outcomesFor(h, args.outcomes, args.window)]));
  const has = (h: RateHandoffRow, pred: (o: RateOutcomeRow) => boolean): boolean => (attached.get(h.id) ?? []).some(pred);
  const isConnection = (o: RateOutcomeRow): boolean => CONNECTION_OUTCOMES.includes(o.outcome_type);
  const isMeeting = (o: RateOutcomeRow): boolean => MEETING_OUTCOMES.includes(o.outcome_type);
  const isProposal = (o: RateOutcomeRow): boolean => o.outcome_type === 'opportunity_stage' && o.metadata?.stage === PROPOSAL_STAGE;

  // Over the accepted rows, like the connection rate it pairs with.
  const firstConnection = accepted
    .map((h) => earliest((attached.get(h.id) ?? []).filter(isConnection)))
    .map((at, i) => (at ? hoursBetween(accepted[i].created_at, at) : null))
    .filter((v): v is number => v !== null);

  return {
    brand_id: args.brandId,
    owner_queue: queue,
    window: { from: args.window.from.toISOString(), to: args.window.to.toISOString() },
    handoffs: rows.length,
    accepted: accepted.length,
    verdicts: verdicts.length,
    acceptance_rate: rate(accepted.length, rows.length),
    expiry_rate: rate(rows.filter((h) => h.status === 'expired').length, rows.length),
    connection_rate: rate(accepted.filter((h) => has(h, isConnection)).length, accepted.length),
    meeting_rate: rate(accepted.filter((h) => has(h, isMeeting)).length, accepted.length),
    qualification_rate: rate(qualified.length, verdicts.length),
    proposal_rate: rate(qualified.filter((h) => has(h, isProposal)).length, qualified.length),
    conversion_rate: rate(verdicts.filter((h) => h.disposition === 'converted').length, verdicts.length),
    false_positive_handoff_rate: rate(verdicts.filter((h) => FALSE_POSITIVE_DISPOSITIONS.includes(h.disposition as GrowthJourneyHandoffDisposition)).length, verdicts.length),
    time_to_accept_hours: medianHours(accepted.map((h) => hoursBetween(h.created_at, h.accepted_at as Date))),
    time_to_disposition_hours: medianHours(verdicts.filter((h) => h.accepted_at && h.disposition_at).map((h) => hoursBetween(h.accepted_at as Date, h.disposition_at as Date))),
    time_to_first_connection_hours: medianHours(firstConnection),
  };
}

/** The brand as a whole plus each queue, from one pair of row sets. */
export function computeHandoffRatesByQueue(args: Omit<ComputeHandoffRatesArgs, 'ownerQueue'>, queues: readonly GrowthJourneyOwnerQueue[]): { all: HandoffRates; by_queue: Partial<Record<GrowthJourneyOwnerQueue, HandoffRates>> } {
  const by_queue: Partial<Record<GrowthJourneyOwnerQueue, HandoffRates>> = {};
  for (const q of queues) by_queue[q] = computeHandoffRates({ ...args, ownerQueue: q });
  return { all: computeHandoffRates({ ...args, ownerQueue: 'all' }), by_queue };
}
