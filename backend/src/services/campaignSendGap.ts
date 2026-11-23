/**
 * Per-campaign minimum gap between sends (AL1, Ali 2026-11-23: "at least 5 minutes apart").
 *
 * A campaign with settings.min_send_gap_minutes is booked into slots that far apart, so on a normal
 * day this guard never fires. It exists for the abnormal day: after a scheduler outage every
 * overdue send is due at once and would go out seconds apart. The guard holds each one back until
 * the campaign's last send is old enough, so a backlog drains one at a time.
 *
 * The check allows one minute of slack (gap - 1). The scheduler ticks once a minute and a send's
 * sent_at lands a few seconds after its slot, so a strict check would push every send one tick
 * late and the delay would build all day.
 *
 * Failure mode: if the lookup fails the send is held (fail closed) and retried next tick; the
 * error is logged with its class. Nothing is ever dropped by this guard, only delayed.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/** Minutes of slack under the configured gap; see the header. */
export const GAP_SLACK_MINUTES = 1;

/** The configured gap in minutes, or 0 when the campaign has none. */
export function sendGapMinutes(settings: Record<string, any> | null | undefined): number {
  const n = Number(settings?.min_send_gap_minutes);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** True when this campaign sent something too recently for another send now. */
export async function sentTooRecently(campaignId: string, settings: Record<string, any> | null | undefined): Promise<boolean> {
  const gap = sendGapMinutes(settings);
  if (!gap) return false;
  const window = Math.max(gap - GAP_SLACK_MINUTES, 0.5);
  try {
    const rows = await sequelize.query<{ x: number }>(
      `SELECT 1 AS x FROM scheduled_emails WHERE campaign_id = :c AND status = 'sent'
          AND sent_at > NOW() - make_interval(secs => :secs) LIMIT 1`,
      { replacements: { c: campaignId, secs: Math.round(window * 60) }, type: QueryTypes.SELECT });
    return rows.length > 0;
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'error', service: 'scheduler', event: 'send_gap_check_failed', outcome: 'failure',
      error_class: err?.name || 'DatabaseError', context: { campaign_id: campaignId, message: err?.message } }));
    return true;
  }
}
