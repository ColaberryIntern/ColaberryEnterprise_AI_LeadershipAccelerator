import { Op } from 'sequelize';
import { GrowthJourneyHandoff } from '../../../models';
import type { GrowthJourneyHandoffStatus } from '../../../models/GrowthJourneyHandoff';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { isKillSwitchActive } from '../../launchSafety';
import { logEvent } from '../../ledgerService';

/**
 * The SLA sweep (Phase 4 T409): a handoff nobody accepted before its
 * `sla_due_at` becomes `expired`, once, with one ledger row.
 *
 * Only `queued` and `assigned` rows can expire - an `accepted` row is a
 * human's, and the SLA was for picking it up, not for finishing it. The
 * predicate is on the row itself (`status IN (queued, assigned) AND
 * sla_due_at < asOf`), so a row this sweep moved is outside the next sweep's
 * where clause: the second run over the same clock finds nothing, which is
 * what makes "exactly once" a property of the query and not of a flag.
 *
 * It notifies nobody. An expiry is a row a human reads on the board (and the
 * rates in `outcomes/handoffRates.ts` count it); a page, an email, a Basecamp
 * todo about it are Phase 5. The kill switch is honoured before the first
 * write because a batch flipping statuses is exactly what a kill switch is
 * for, even on the run's own table.
 */

export const HANDOFF_EXPIRED_EVENT = 'growth_journey.handoff.expired';
const ACTOR = 'growth_journey';
const ENTITY = 'growth_journey_handoff';

/** The statuses an SLA can expire from: waiting for a human, not held by one. */
export const EXPIRABLE_STATUSES: readonly GrowthJourneyHandoffStatus[] = ['queued', 'assigned'];

export interface ExpireOverdueArgs {
  brandId?: string;
  asOf?: Date;
  /** Rows per sweep; the rest expire on the next tick. */
  limit?: number;
}

export type ExpireOverdueResult =
  | { skipped: true; reason: 'kill_switch_active' }
  | {
      skipped: false;
      scanned: number;
      expired: number;
      failed: Array<{ handoff_id: string; error_class: string }>;
      /** Ids only. */
      expired_ids: string[];
    };

export const DEFAULT_SWEEP_LIMIT = 500;

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })));
}

export async function expireOverdueHandoffs(args: ExpireOverdueArgs = {}): Promise<ExpireOverdueResult> {
  if (await isKillSwitchActive()) return { skipped: true, reason: 'kill_switch_active' };
  const asOf = args.asOf ?? new Date();
  const rows = await GrowthJourneyHandoff.findAll({
    where: {
      ...(args.brandId ? { brand_id: args.brandId } : {}),
      status: [...EXPIRABLE_STATUSES],
      sla_due_at: { [Op.lt]: asOf },
    },
    order: [['sla_due_at', 'ASC']],
    limit: args.limit ?? DEFAULT_SWEEP_LIMIT,
  });

  const result: Extract<ExpireOverdueResult, { skipped: false }> = { skipped: false, scanned: rows.length, expired: 0, failed: [], expired_ids: [] };
  for (const row of rows) {
    const from = row.status;
    try {
      await row.update({ status: 'expired', expired_at: asOf });
      await logEvent(
        HANDOFF_EXPIRED_EVENT,
        ACTOR,
        ENTITY,
        row.id,
        { handoff_id: row.id, subject_ref: row.subject_ref, lead_id: row.lead_id, owner_queue: row.owner_queue, from, sla_due_at: row.sla_due_at, ticket_id: row.ticket_id, assigned_to_type: row.assigned_to_type, assigned_to_id: row.assigned_to_id },
        { tenant_id: row.tenant_id, brand_id: row.brand_id },
      );
      result.expired += 1;
      result.expired_ids.push(row.id);
    } catch (err: unknown) {
      const error_class = classifyError(err);
      result.failed.push({ handoff_id: row.id, error_class });
      log('growth_journey.handoff.expire_failed', { handoff_id: row.id, brand_id: row.brand_id, owner_queue: row.owner_queue, from, error_class });
    }
  }
  return result;
}
