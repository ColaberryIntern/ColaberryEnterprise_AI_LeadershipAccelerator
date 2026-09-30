import { Op } from 'sequelize';
import { GrowthJourneyHandoff, GrowthJourneyOutcome } from '../../../models';
import { OWNER_QUEUES } from '../../../models/GrowthJourneyHandoff';
import { computeHandoffRatesByQueue, type HandoffRates, type RateHandoffRow, type RateOutcomeRow } from './handoffRates';

/**
 * The two reads behind `handoffRates.ts` (Phase 4 T409): one brand's handoffs
 * created in the window and the brand's outcomes from the window's start,
 * handed to the pure computation. Read-only; the columns are the row views
 * the maths declares, nothing more.
 */

export const DEFAULT_RATES_WINDOW_DAYS = 30;
const DAY = 86_400_000;

export interface LoadHandoffRatesArgs {
  brandId: string;
  asOf?: Date;
  windowDays?: number;
}

export interface BrandHandoffRates {
  all: HandoffRates;
  by_queue: Partial<Record<(typeof OWNER_QUEUES)[number], HandoffRates>>;
}

export async function loadHandoffRates(args: LoadHandoffRatesArgs): Promise<BrandHandoffRates> {
  const to = args.asOf ?? new Date();
  const from = new Date(to.getTime() - (args.windowDays ?? DEFAULT_RATES_WINDOW_DAYS) * DAY);
  const [handoffs, outcomes] = await Promise.all([
    GrowthJourneyHandoff.findAll({
      where: { brand_id: args.brandId, created_at: { [Op.gte]: from, [Op.lt]: to } },
      attributes: ['id', 'owner_queue', 'status', 'disposition', 'subject_ref', 'created_at', 'accepted_at', 'disposition_at'],
    }),
    GrowthJourneyOutcome.findAll({
      where: { brand_id: args.brandId, occurred_at: { [Op.gte]: from, [Op.lte]: to } },
      attributes: ['subject_ref', 'handoff_id', 'outcome_type', 'occurred_at', 'metadata'],
    }),
  ]);
  const handoffRows: RateHandoffRow[] = handoffs.map((h) => ({
    id: h.id, owner_queue: h.owner_queue, status: h.status, disposition: h.disposition, subject_ref: h.subject_ref,
    created_at: h.created_at, accepted_at: h.accepted_at, disposition_at: h.disposition_at,
  }));
  const outcomeRows: RateOutcomeRow[] = outcomes.map((o) => ({
    subject_ref: o.subject_ref, handoff_id: o.handoff_id, outcome_type: o.outcome_type, occurred_at: o.occurred_at, metadata: o.metadata,
  }));
  return computeHandoffRatesByQueue({ brandId: args.brandId, window: { from, to }, handoffs: handoffRows, outcomes: outcomeRows }, OWNER_QUEUES);
}
