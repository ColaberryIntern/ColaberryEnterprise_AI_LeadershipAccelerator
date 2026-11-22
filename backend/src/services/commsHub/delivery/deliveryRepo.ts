import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import { env } from '../../../config/env';
import Cohort from '../../../models/Cohort';
import CommsHubDelivery from '../../../models/CommsHubDelivery';
import CommsHubDestination from '../../../models/CommsHubDestination';
import CommsHubDraft from '../../../models/CommsHubDraft';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage from '../../../models/CommsHubMessage';
import CommsHubSettings from '../../../models/CommsHubSettings';
import CommsHubWhatsAppGroup from '../../../models/CommsHubWhatsAppGroup';
import { cantSendReason } from '../whatsapp/groupRules';
import { ALL_MEMBERS } from '../connectors/inAppConnector';
import { approvalStillMatches, finishMessage, startMessage } from './messageLifecycle';
import { MAX_ATTEMPTS, SENDING_LEASE_MS } from './retryPolicy';
import type { ClaimedDelivery, DeliveryRepo, SendContext, SendOutcome, WorkerSettings } from './types';

/**
 * Postgres implementation of the worker's storage (CH7.2).
 *
 * Claiming: one UPDATE over a `FOR UPDATE SKIP LOCKED` selection, so two workers never claim the same
 * row; the claim stamps claimed_at only the FIRST time (the connectors look for earlier work from
 * there), counts the attempt, and the attempt number is the claim's token. A row left `sending` past
 * the lease (the process died mid-send) is claimable again.
 *
 * Sending: inside one transaction holding an advisory lock (one community post per feed at a time;
 * one message's in-app sends at a time), the row is re-locked and must still be this claim's; the
 * context is re-read; the send happens; and its outcome is written before the lock is released, so
 * the next sender to that feed sees the recorded post (CH7.1's retry rule depends on that).
 */
// CH9.6: a channel allows a SET of target types; in-app reaches an audience or an event's registrants.
const TARGET_TYPES_FOR: Record<string, readonly string[]> = { community_post: ['cohort_feed'], in_app: ['in_app_audience', 'event_registrants'], whatsapp: ['whatsapp_group'] };

/** Pure: is this a legal destination shape for its channel, before the target itself is looked up. */
export function destinationShapeAllowed(channel: string, targetType: string): boolean {
  return (TARGET_TYPES_FOR[channel] ?? []).includes(targetType);
}

export function sendLockKey(d: Pick<ClaimedDelivery, 'channel' | 'target_type' | 'target_id' | 'message_id'>): string {
  // CH10.4: ONE WhatsApp send at a time across the whole hub (W6), whatever the group or message.
  if (d.channel === 'whatsapp') return 'comms_hub:whatsapp';
  return d.channel === 'community_post' ? `comms_hub:post:${d.target_type}:${d.target_id}` : `comms_hub:in_app:${d.message_id}`;
}

/** The banner as an absolute URL the feed (and the connector's media rule) accepts. */
export function bannerUrl(eventId: string, thumbnailId: string): string {
  return `${env.frontendUrl.replace(/\/+$/, '')}/api/comms-hub/thumbnails/${eventId}/3x1.png?v=${thumbnailId}`;
}

async function readSettings(t?: Transaction): Promise<WorkerSettings> {
  const s = await CommsHubSettings.findByPk(1, { transaction: t });
  return { paused: !!s?.sending_paused, quietHours: s?.quiet_hours ?? null };
}

async function readContext(d: ClaimedDelivery, t: Transaction, now: Date): Promise<SendContext> {
  const m = await CommsHubMessage.findByPk(d.message_id, { transaction: t });
  const dest = await CommsHubDestination.findByPk(d.destination_id, { transaction: t });
  let destinationAllowed = !!dest && dest.message_id === d.message_id && dest.channel === d.channel && destinationShapeAllowed(d.channel, dest.target_type);
  if (destinationAllowed && dest!.target_type === 'event_registrants') {
    // CH9.6: the message's own event, still an Eventbrite event managed in the hub (never a cohort lookup).
    const ev = await CommsHubEvent.findByPk(dest!.target_id, { attributes: ['id', 'ccpp_event_id'], transaction: t });
    destinationAllowed = !!ev && !!ev.ccpp_event_id && m?.event_id === ev.id;
  } else if (destinationAllowed && dest!.target_type === 'whatsapp_group') {
    // CH10.3: a group in the hub, switched on, and one the number can still post in (never a cohort lookup).
    const g = await CommsHubWhatsAppGroup.findByPk(dest!.target_id, { transaction: t });
    destinationAllowed = !!g && g.enabled && cantSendReason(g) === null;
  } else {
    if (destinationAllowed && dest!.target_id !== ALL_MEMBERS) destinationAllowed = !!(await Cohort.findByPk(dest!.target_id, { attributes: ['id'], transaction: t }));
    if (destinationAllowed && dest!.target_id === ALL_MEMBERS) destinationAllowed = d.channel === 'in_app';
  }
  const draft = await CommsHubDraft.findOne({ where: { message_id: d.message_id, channel: d.channel }, order: [['version', 'DESC']], transaction: t });
  let media_urls: string[] = [];
  if (m && (d.channel === 'community_post' || d.channel === 'whatsapp') && m.include?.thumbnail !== false && m.event_id) {
    const e = await CommsHubEvent.findByPk(m.event_id, { attributes: ['id', 'thumbnail_id'], transaction: t });
    if (e?.thumbnail_id) media_urls = [bannerUrl(e.id, e.thumbnail_id)];
  }
  return {
    settings: await readSettings(t),
    messageStatus: m?.status ?? 'cancelled',
    approvalMatches: m ? await approvalStillMatches(m.id, t) : false,
    destinationAllowed,
    draft: draft ? { title: draft.title ?? null, body: draft.body } : null,
    media_urls,
    // CH10.4: a held WhatsApp reminder must never go out after its event has started.
    eventStarted: d.channel === 'whatsapp' && !!m?.plan_kind && !!m.occurrence_starts_at && m.occurrence_starts_at.getTime() <= now.getTime(),
  };
}

export const ALREADY_DONE_NOTE = 'already_done: an earlier attempt had already sent it, so it was not sent again';

async function record(row: CommsHubDelivery, out: SendOutcome, now: Date, t: Transaction): Promise<void> {
  switch (out.kind) {
    case 'sent':
      // An earlier attempt had already sent it: recorded as sent, with a note saying it was not sent again.
      await row.update({ status: 'sent', provider_message_id: out.provider_message_id, sent_at: now, error: out.already_done ? ALREADY_DONE_NOTE : null, next_attempt_at: null }, { transaction: t });
      return;
    case 'retry':
      await row.update({ status: 'pending', next_attempt_at: out.at, error: out.error }, { transaction: t });
      return;
    case 'failed':
      await row.update({ status: 'failed', next_attempt_at: null, error: out.error }, { transaction: t });
      return;
    case 'hold':
      // Not an attempt: give the try back.
      await row.update({ status: 'pending', next_attempt_at: out.until, attempt_count: Math.max(0, row.attempt_count - 1), error: `held: ${out.reason}` }, { transaction: t });
      return;
    case 'skip':
      await row.update({ status: out.status, next_attempt_at: null, error: out.reason }, { transaction: t });
      return;
    default: {
      const never: never = out;
      throw new Error(`Unknown outcome ${String(never)}`);
    }
  }
}

export const deliveryRepo: DeliveryRepo = {
  settings: () => readSettings(),

  async dueMessageIds(now, limit) {
    const rows = await CommsHubMessage.findAll({
      where: { status: 'scheduled', [Op.or]: [{ send_at: { [Op.is]: null } }, { send_at: { [Op.lte]: now } }] },
      attributes: ['id'], order: [['send_at', 'ASC NULLS FIRST'], ['created_at', 'ASC']], limit,
    });
    return rows.map((r) => r.id);
  },

  startMessage,

  async claimDue(now, limit) {
    const stale = new Date(now.getTime() - SENDING_LEASE_MS);
    // A row left sending past the lease that has used every try is failed, never reclaimed again (a send
    // that kills the process every time must not loop forever). The settle sweep then gives its message a result.
    await sequelize.query(
      `UPDATE comms_hub_deliveries
          SET status = 'failed', next_attempt_at = NULL, updated_at = :now,
              error = 'lease_expired: the send did not finish after ' || attempt_count || ' tries'
        WHERE status = 'sending' AND updated_at < :stale AND attempt_count >= :max`,
      { replacements: { now, stale, max: MAX_ATTEMPTS } },
    );
    // CH10.4 (W6): at most ONE WhatsApp delivery per claim, none while the pacing gap or the breaker is
    // in force (read from the settings row in the same statement), and none while another WhatsApp send
    // is still in flight. The pick is an UNLOCKED subquery; the outer select keeps FOR UPDATE SKIP LOCKED,
    // so two workers never take the same row. A WhatsApp row not picked stays pending: no try is spent.
    const [rows] = await sequelize.query(
      `WITH wa AS (
         SELECT d.id FROM comms_hub_deliveries d
           JOIN comms_hub_messages m ON m.id = d.message_id
          WHERE d.channel = 'whatsapp' AND m.status = 'sending'
            AND ((d.status = 'pending' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= :now))
              OR (d.status = 'sending' AND d.updated_at < :stale AND d.attempt_count < :max))
            AND NOT EXISTS (SELECT 1 FROM comms_hub_settings s WHERE s.id = 1
                             AND ((s.whatsapp_next_send_at IS NOT NULL AND s.whatsapp_next_send_at > :now)
                               OR (s.whatsapp_breaker_until IS NOT NULL AND s.whatsapp_breaker_until > :now)))
            AND NOT EXISTS (SELECT 1 FROM comms_hub_deliveries x
                             WHERE x.channel = 'whatsapp' AND x.status = 'sending' AND x.updated_at >= :stale AND x.id <> d.id)
          ORDER BY d.next_attempt_at NULLS FIRST, d.created_at, d.id
          LIMIT 1
       ), due AS (
         SELECT d.id FROM comms_hub_deliveries d
           JOIN comms_hub_messages m ON m.id = d.message_id
          WHERE m.status = 'sending'
            AND ((d.status = 'pending' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= :now))
              OR (d.status = 'sending' AND d.updated_at < :stale AND d.attempt_count < :max))
            AND (d.channel <> 'whatsapp' OR d.id IN (SELECT id FROM wa))
          ORDER BY d.created_at
          LIMIT :limit
          FOR UPDATE OF d SKIP LOCKED
       )
       UPDATE comms_hub_deliveries d
          SET status = 'sending', claimed_at = COALESCE(d.claimed_at, :now), attempt_count = d.attempt_count + 1, updated_at = :now
         FROM due, comms_hub_destinations dest
        WHERE d.id = due.id AND dest.id = d.destination_id
       RETURNING d.id, d.message_id, d.destination_id, d.channel, d.idempotency_key, d.attempt_count AS attempt, d.error AS previous_error,
                 d.claimed_at AS first_claimed_at, dest.target_type, dest.target_id`,
      { replacements: { now, stale, limit, max: MAX_ATTEMPTS } },
    );
    return (rows as Array<ClaimedDelivery & { first_claimed_at: Date | string }>).map((r) => ({ ...r, attempt: Number(r.attempt), first_claimed_at: new Date(r.first_claimed_at) }));
  },

  async withSendLock(d, now, decide) {
    return sequelize.transaction(async (t) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: sendLockKey(d) }, transaction: t });
      const row = await CommsHubDelivery.findByPk(d.id, { lock: t.LOCK.UPDATE, transaction: t });
      // No longer this claim's: sent meanwhile, or reclaimed after the lease (the attempt number moved on).
      if (!row || row.status !== 'sending' || row.attempt_count !== d.attempt) return null;
      const out = await decide(await readContext(d, t, now));
      await record(row, out, now, t);
      return out;
    });
  },

  async settledSendingIds(limit) {
    const [rows] = await sequelize.query(
      `SELECT m.id FROM comms_hub_messages m
        WHERE m.status = 'sending'
          AND NOT EXISTS (SELECT 1 FROM comms_hub_deliveries d WHERE d.message_id = m.id AND d.status IN ('pending', 'sending'))
        ORDER BY m.updated_at
        LIMIT :limit`,
      { replacements: { limit } },
    );
    return (rows as Array<{ id: string }>).map((r) => r.id);
  },

  finishMessage,
};
