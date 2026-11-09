import { QueryTypes } from 'sequelize';

/**
 * R3 - "nothing is being sent" made visible on the page we already read (admin/marketing/performance).
 *
 * The re-engagement channel sent nothing between 2026-08-19 and 2026-10-29 and nobody saw it, because the only page that
 * shows this funnel had no send counter at all. This returns, for the SAME window as the funnel:
 *   sent       scheduled messages delivered (status 'sent', sent_at in the window)
 *   failed     attempted and failed (status 'failed', scheduled_for in the window)
 *   cancelled  cancelled (status 'cancelled', scheduled_for in the window), grouped by WHY
 * Zero is returned as 0, never as an absent field, so an empty channel reads as zero rather than as missing data.
 *
 * THE REASON for a cancelled row is metadata.blocked_reason: the shared cancel helper
 * (services/scheduling/cancelScheduledMessage.ts) writes that key on every path, so it is CURRENT, not legacy, and is
 * shown unprefixed. metadata.cancel_reason is also read first in case any writer sets it. Only the keys no current
 * writer uses (cancelled_reason from the old unsubscribe path, expired_reason) are shown as `legacy:<value>`, and a row
 * with none of them is `no_reason_recorded`, so the unexplained count is visible, not hidden.
 * (Fixed 2026-11-09: the first version treated blocked_reason as legacy, so every live reason read as legacy.)
 *
 * Read-only. One parameterized query; `days` is clamped by the caller (1..365) and passed as a bound integer.
 */

export interface SendOutcomes {
  windowDays: number;
  sent: number;
  failed: number;
  cancelled: number;
  cancelledByReason: { reason: string; count: number }[];
}

type Row = { bucket: string; reason: string | null; n: number };

/** The reason expression for one cancelled row. Exported so the key order is pinned by a test. */
export const CANCEL_REASON_SQL = `COALESCE(metadata->>'cancel_reason', metadata->>'blocked_reason',
                  'legacy:' || COALESCE(metadata->>'cancelled_reason',
                                        CASE WHEN metadata->>'expired_reason' IS NOT NULL THEN 'expired_stale' END),
                  'no_reason_recorded')`;

const SQL = `
  SELECT 'sent' AS bucket, NULL AS reason, COUNT(*)::int AS n
    FROM scheduled_emails WHERE status = 'sent' AND sent_at >= NOW() - make_interval(days => :days)
  UNION ALL
  SELECT 'failed', NULL, COUNT(*)::int
    FROM scheduled_emails WHERE status = 'failed' AND scheduled_for >= NOW() - make_interval(days => :days)
  UNION ALL
  SELECT 'cancelled', ${CANCEL_REASON_SQL}, COUNT(*)::int
    FROM scheduled_emails WHERE status = 'cancelled' AND scheduled_for >= NOW() - make_interval(days => :days)
   GROUP BY 2`;

export function shapeSendOutcomes(rows: Row[], windowDays: number): SendOutcomes {
  const total = (bucket: string): number => rows.filter((r) => r.bucket === bucket).reduce((s, r) => s + Number(r.n || 0), 0);
  const cancelledByReason = rows
    .filter((r) => r.bucket === 'cancelled' && Number(r.n) > 0)
    .map((r) => ({ reason: r.reason ?? 'no_reason_recorded', count: Number(r.n) }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { windowDays, sent: total('sent'), failed: total('failed'), cancelled: total('cancelled'), cancelledByReason };
}

export async function sendOutcomes(days: number): Promise<SendOutcomes> {
  const { sequelize } = await import('../../config/database');
  const rows = await sequelize.query<Row>(SQL, { type: QueryTypes.SELECT, replacements: { days } });
  return shapeSendOutcomes(rows, days);
}
