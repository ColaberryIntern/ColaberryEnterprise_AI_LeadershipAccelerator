import { Op } from 'sequelize';
import { GrowthJourneyHandoff, GrowthJourneyPolicy } from '../../models';
import type { GrowthJourneyOwnerQueue } from '../../models/GrowthJourneyHandoff';
import type { JourneyProgramKind } from '../../models/JourneyProgram';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import type { SalesCapacity } from './governor/types';

/**
 * Queue capacity — the source for `sales_capacity` (§7.3; §11; Phase 4 T403).
 *
 * ─── THE SECOND UNKNOWN GETS A SOURCE ───────────────────────────────────────
 *
 * Since T304 every decision has recorded `sales_capacity: 'unknown'` because
 * there was no capacity table at all. There is one now (`growth_journey_policies`,
 * T401), seeded with `daily_capacity` NULL for every brand × queue (T403), and
 * this reader answers from it:
 *
 *   'available'  the operator set a number and today's assigned + accepted
 *                handoffs in this brand × queue are below it
 *   'full'       the operator set a number and today has reached it
 *   'unknown'    no number has been set (`capacity_not_set_by_operator`), the
 *                row is absent (`capacity_policy_absent`), the operator paused
 *                it (`capacity_policy_paused:<status>`), or the lookup failed
 *                (`lookup_failed:<class>`)
 *
 * `'unknown'` is the honest default until an operator writes a number, and it
 * unlocks nothing (step 4b). `'full'` suppresses `CREATE_HUMAN_TASK` by name
 * (`sales_capacity_full`). Neither touches Ali's own caps, which stay in
 * `evaluateAliOutreachEligibility` — this is per brand × queue for handoffs
 * only, the one capacity mechanism Phase 4 adds.
 *
 * ─── WHAT COUNTS AS USED ────────────────────────────────────────────────────
 *
 * Handoffs `assigned` or `accepted`, created today (UTC), in this brand and
 * queue. `queued` rows do NOT count: they are waiting precisely because nobody
 * has taken them, and counting them would let an unassigned backlog declare a
 * queue full. Dispositioned, expired and cancelled rows are done.
 *
 * ─── WHICH QUEUE A PROGRAMME HANDS TO ───────────────────────────────────────
 *
 * By `program_kind`, never by slug: a learner programme hands to admissions, a
 * business one to sales, a consulting one to the solution architect. The four
 * seeded programmes map through the same three-line table.
 */

export const HANDOFF_QUEUE_BY_KIND: Readonly<Record<JourneyProgramKind, GrowthJourneyOwnerQueue>> = Object.freeze({
  learner: 'admissions',
  business: 'sales',
  consulting: 'solution_architect',
});

const USED_STATUSES = ['assigned', 'accepted'] as const;

export interface QueueCapacity {
  capacity: number | null;
  used: number;
  status: SalesCapacity;
  reason: string;
}

export interface ResolveQueueCapacityArgs {
  brandId: string;
  ownerQueue: GrowthJourneyOwnerQueue;
  asOf: Date;
}

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(
    redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })),
  );
}

/** The UTC day containing `asOf`, as a half-open window. */
export function utcDayOf(asOf: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function resolveQueueCapacity(args: ResolveQueueCapacityArgs): Promise<QueueCapacity> {
  try {
    const policy = await GrowthJourneyPolicy.findOne({
      where: { brand_id: args.brandId, policy_type: 'queue_capacity', owner_queue: args.ownerQueue },
    });
    const day = utcDayOf(args.asOf);
    const used = await GrowthJourneyHandoff.count({
      where: {
        brand_id: args.brandId,
        owner_queue: args.ownerQueue,
        status: { [Op.in]: [...USED_STATUSES] },
        created_at: { [Op.gte]: day.start, [Op.lt]: day.end },
      },
    });

    if (!policy) return { capacity: null, used, status: 'unknown', reason: 'capacity_policy_absent' };
    if (policy.status !== 'active') return { capacity: null, used, status: 'unknown', reason: `capacity_policy_paused:${policy.status}` };
    const capacity = policy.daily_capacity;
    if (typeof capacity !== 'number' || !Number.isFinite(capacity)) {
      return { capacity: null, used, status: 'unknown', reason: 'capacity_not_set_by_operator' };
    }
    if (used >= capacity) return { capacity, used, status: 'full', reason: `capacity_full:${used}/${capacity}` };
    return { capacity, used, status: 'available', reason: `capacity_available:${used}/${capacity}` };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.queue_capacity_lookup_failed', { error_class, brand_id: args.brandId, owner_queue: args.ownerQueue });
    return { capacity: null, used: 0, status: 'unknown', reason: `lookup_failed:${error_class}` };
  }
}

export interface ResolveSalesCapacityArgs {
  brandId: string;
  programKind: JourneyProgramKind;
  asOf: Date;
}

/** `sales_capacity` for a subject: the capacity of the queue its programme hands to. */
export async function resolveSalesCapacityFor(args: ResolveSalesCapacityArgs): Promise<{ value: SalesCapacity; reason: string; queue: GrowthJourneyOwnerQueue }> {
  const queue = HANDOFF_QUEUE_BY_KIND[args.programKind];
  const c = await resolveQueueCapacity({ brandId: args.brandId, ownerQueue: queue, asOf: args.asOf });
  return { value: c.status, reason: `${queue}:${c.reason}`, queue };
}
