import { Op, QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import type CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage from '../../../models/CommsHubMessage';
import { logActivity, type Actor } from '../activityLog';
import { expandOccurrences } from '../eventRecurrence';
import { cancelMessage, voidForEvent } from './approvals';

/**
 * What an event change does to its messages (CH7.3, build prompt: "Cancelling an event cancels its
 * pending deliveries in the same transaction and offers a cancellation draft. Editing an event's
 * date, time or links voids approvals on its pending messages."). Both run inside the event's own
 * transaction, so the event and its messages never disagree.
 */

/** The event fields whose change makes a message about it wrong: when it is, and where to go. */
export const SCHEDULE_FIELDS = ['starts_at', 'ends_at', 'repeat_rule', 'join_url', 'registration_url'] as const;

/** Statuses a message can still be stopped in (not sent, not already cancelled). */
const CANCELLABLE = ['draft', 'needs_approval', 'approved', 'scheduled', 'partially_failed', 'failed'] as const;

/**
 * Pending deliveries of a message that is sending become `cancelled`. A row a worker holds right now
 * (its send is in flight) is skipped, not waited for: that one send finishes; every other row, claimed
 * or not, is stopped (a claimed row is refused at the send lock because its status moved on).
 */
async function cancelPendingDeliveries(messageId: string, reason: string, now: Date, t: Transaction): Promise<number> {
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE comms_hub_deliveries SET status = 'cancelled', next_attempt_at = NULL, error = :reason, updated_at = :now
      WHERE id IN (SELECT id FROM comms_hub_deliveries WHERE message_id = :messageId AND status IN ('pending', 'sending') FOR UPDATE SKIP LOCKED)
      RETURNING id`,
    { replacements: { messageId, reason, now }, type: QueryTypes.SELECT, transaction: t },
  );
  return rows.length;
}

export interface CancelCascade { messages_cancelled: number; deliveries_cancelled: number; sending_voided: number }

/** The event is cancelled: every message about it that has not gone out is cancelled, and nothing more is sent. */
export async function cascadeEventCancel(eventId: string, actor: Actor, now: Date, t: Transaction): Promise<CancelCascade> {
  const out: CancelCascade = { messages_cancelled: 0, deliveries_cancelled: 0, sending_voided: 0 };
  const messages = await CommsHubMessage.findAll({ where: { event_id: eventId, status: { [Op.in]: [...CANCELLABLE, 'sending'] } }, attributes: ['id', 'status'], transaction: t });
  for (const m of messages) {
    if (m.status === 'sending') {
      // eslint-disable-next-line no-await-in-loop
      out.deliveries_cancelled += await cancelPendingDeliveries(m.id, 'event_cancelled', now, t);
      // eslint-disable-next-line no-await-in-loop
      if (await voidForEvent(m.id, 'event_cancelled', actor, now, t)) out.sending_voided += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await cancelMessage(m.id, actor, now, t);
      out.messages_cancelled += 1;
    }
  }
  if (messages.length) await logActivity(actor, 'event.messages_cancelled', 'event', eventId, { ...out }, t);
  return out;
}

export interface EditCascade { voided: number; plan_cancelled: number }

/**
 * The event's date, time or links changed: approvals on its messages are voided (they go back to
 * Jackie, and the approve gate checks the new date and time). A promotion-plan message for an
 * occurrence that no longer exists is cancelled; the worker drafts the new occurrence's message.
 */
export async function cascadeEventEdit(e: CommsHubEvent, changed: string[], actor: Actor, now: Date, t: Transaction): Promise<EditCascade> {
  const out: EditCascade = { voided: 0, plan_cancelled: 0 };
  if (!changed.some((f) => (SCHEDULE_FIELDS as readonly string[]).includes(f))) return out;
  const occurrences = new Set(expandOccurrences(e.starts_at, e.ends_at, e.repeat_rule).map((o) => o.starts_at.getTime()));
  const messages = await CommsHubMessage.findAll({
    where: { event_id: e.id, status: { [Op.in]: [...CANCELLABLE, 'sending'] } },
    attributes: ['id', 'status', 'plan_kind', 'occurrence_starts_at'], transaction: t,
  });
  for (const m of messages) {
    const gone = m.plan_kind && m.occurrence_starts_at && !occurrences.has(m.occurrence_starts_at.getTime());
    if (gone && m.status !== 'sending') {
      // eslint-disable-next-line no-await-in-loop
      await cancelMessage(m.id, actor, now, t);
      out.plan_cancelled += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    if (await voidForEvent(m.id, 'event_changed', actor, now, t)) out.voided += 1;
  }
  if (out.voided || out.plan_cancelled) await logActivity(actor, 'event.messages_voided', 'event', e.id, { changed, ...out }, t);
  return out;
}
