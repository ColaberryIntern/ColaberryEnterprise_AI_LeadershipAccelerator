import { sequelize } from '../../../config/database';
import CommsHubActivity from '../../../models/CommsHubActivity';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage from '../../../models/CommsHubMessage';
import CommsHubSettings from '../../../models/CommsHubSettings';
import { messageTitle } from '../board/messageBoard';
import { ALERT_LEASE_MS, DASHBOARD, MAX_ALERT_ATTEMPTS, type AlertRepo, type ClaimedAlert } from './types';

/**
 * CH7.5 Postgres store for failure alerts. The state change is the activity row the worker writes
 * when a message ends failed or partially_failed (messageLifecycle.finishMessage), so its id is the
 * business event: INSERT ... ON CONFLICT (state_event_id, recipient) DO NOTHING queues each alert
 * once however often the tick runs. Claims are FOR UPDATE SKIP LOCKED with the try number as the
 * claim token, as the delivery worker does.
 */
export const alertRepo: AlertRepo = {
  async recipients() {
    const s = await CommsHubSettings.findByPk(1, { attributes: ['alert_recipients'] });
    return (s?.alert_recipients ?? []).filter((x): x is string => typeof x === 'string' && x.includes('@'));
  },

  async queue(recipients, since, now) {
    const all = [DASHBOARD, ...recipients];
    const [rows] = await sequelize.query(
      `INSERT INTO comms_hub_alerts (state_event_id, message_id, failure_state, recipient, created_at, updated_at)
       SELECT a.id, a.entity_id, substring(a.action FROM 9), r.recipient, :now, :now
         FROM comms_hub_activity a
        CROSS JOIN unnest(ARRAY[:recipients]::text[]) AS r(recipient)
        WHERE a.entity_type = 'message' AND a.action IN ('message.failed', 'message.partially_failed')
          AND a.entity_id IS NOT NULL AND a.created_at >= :since
          -- A message that has since ended cancelled (its event was cancelled) is not alerted.
          AND EXISTS (SELECT 1 FROM comms_hub_messages m WHERE m.id = a.entity_id AND m.status <> 'cancelled')
       ON CONFLICT (state_event_id, recipient) DO NOTHING
       RETURNING id`,
      { replacements: { recipients: all, since, now } },
    );
    return (rows as unknown[]).length;
  },

  async claim(now, limit) {
    const stale = new Date(now.getTime() - ALERT_LEASE_MS);
    await sequelize.query(
      `UPDATE comms_hub_alerts SET status = 'failed', updated_at = :now,
              error = 'abandoned: no result after ' || attempt_count || ' tries'
        WHERE status = 'sending' AND claimed_at < :stale AND attempt_count >= :max`,
      { replacements: { now, stale, max: MAX_ALERT_ATTEMPTS } },
    );
    const [rows] = await sequelize.query(
      `WITH due AS (
         SELECT id FROM comms_hub_alerts
          WHERE attempt_count < :max
            AND ((status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= :now))
              OR (status = 'sending' AND claimed_at < :stale))
          ORDER BY created_at, id
          LIMIT :limit
          FOR UPDATE SKIP LOCKED)
       UPDATE comms_hub_alerts a
          SET status = 'sending', attempt_count = a.attempt_count + 1, claimed_at = :now, updated_at = :now
         FROM due WHERE a.id = due.id
       RETURNING a.id, a.state_event_id, a.message_id, a.failure_state, a.recipient, a.attempt_count AS attempt`,
      { replacements: { now, stale, max: MAX_ALERT_ATTEMPTS, limit } },
    );
    return (rows as Array<ClaimedAlert & { attempt: number | string }>).map((r) => ({ ...r, attempt: Number(r.attempt) }));
  },

  async context(a) {
    const m = await CommsHubMessage.findByPk(a.message_id);
    if (!m) return null;
    const [ev, state] = await Promise.all([
      m.event_id ? CommsHubEvent.findByPk(m.event_id, { attributes: ['id', 'title'] }) : Promise.resolve(null),
      CommsHubActivity.findByPk(a.state_event_id),
    ]);
    const d = (state?.detail ?? {}) as { sent?: unknown; not_sent?: unknown };
    return { title: messageTitle(m, ev), sent: Number(d.sent) || 0, not_sent: Number(d.not_sent) || 0 };
  },

  async settle(a, out, now) {
    const fields = out.kind === 'sent'
      ? { status: 'sent', error: null, next: null, sent: now }
      : out.kind === 'retry'
        ? { status: 'pending', error: out.error, next: out.at, sent: null }
        : { status: 'failed', error: out.error, next: null, sent: null };
    await sequelize.query(
      `UPDATE comms_hub_alerts SET status = :status, error = :error, next_attempt_at = :next, sent_at = :sent, updated_at = :now
        WHERE id = :id AND status = 'sending' AND attempt_count = :attempt`,
      { replacements: { ...fields, now, id: a.id, attempt: a.attempt } },
    );
  },
};
