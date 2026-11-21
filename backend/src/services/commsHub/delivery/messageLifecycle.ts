import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubApproval from '../../../models/CommsHubApproval';
import CommsHubDelivery from '../../../models/CommsHubDelivery';
import CommsHubDestination from '../../../models/CommsHubDestination';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage, { type CommsHubMessageStatus } from '../../../models/CommsHubMessage';
import { logActivity, WORKER_ACTOR, type Actor } from '../activityLog';
import { cancelMessage, loadContent, MessageRuleError, reconcileApproval, stoppedByCancelledEvent } from '../messages/approvals';
import { approvalHash, transition } from '../messages/messageStatus';
import { resultOf } from './resultOf';
import type { StartResult } from './types';

/**
 * A message's side of sending (CH7.2): starting it (delivery rows), its result when every delivery
 * is done, and Jackie's "retry the failed ones". Every step locks the message row first, so two
 * workers, or a worker and an organizer, never move the same message at once.
 */

/** The idempotency key of one destination's delivery: stable, so every retry and re-approval reuses it. */
export function deliveryKey(messageId: string, destinationId: string): string {
  return `comms_hub:${messageId}:${destinationId}`;
}

export async function approvalStillMatches(messageId: string, t: Transaction): Promise<boolean> {
  const a = await CommsHubApproval.findOne({ where: { message_id: messageId, voided_at: { [Op.is]: null } }, transaction: t });
  return !!a && a.content_hash === approvalHash(await loadContent(messageId, t));
}

/** One row per destination; a row that was not sent (failed, skipped, cancelled) goes back to pending on its own key. */
async function readyDeliveries(messageId: string, t: Transaction): Promise<number> {
  const destinations = await CommsHubDestination.findAll({ where: { message_id: messageId }, transaction: t });
  for (const dest of destinations) {
    // eslint-disable-next-line no-await-in-loop
    const [row, created] = await CommsHubDelivery.findOrCreate({
      where: { message_id: messageId, destination_id: dest.id },
      defaults: { message_id: messageId, destination_id: dest.id, channel: dest.channel, idempotency_key: deliveryKey(messageId, dest.id), status: 'pending', attempt_count: 0 },
      transaction: t,
    });
    if (!created && ['failed', 'skipped', 'cancelled'].includes(row.status)) {
      // eslint-disable-next-line no-await-in-loop
      await row.update({ status: 'pending', attempt_count: 0, next_attempt_at: null, error: null }, { transaction: t });
    }
  }
  return destinations.length;
}

export async function startMessage(messageId: string, now: Date): Promise<StartResult> {
  return sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.findOne({ where: { id: messageId, status: 'scheduled' }, lock: t.LOCK.UPDATE, skipLocked: true, transaction: t });
    if (!m || (m.send_at && m.send_at.getTime() > now.getTime())) return 'not_due';
    const event = m.event_id ? await CommsHubEvent.findByPk(m.event_id, { attributes: ['id', 'status'], transaction: t }) : null;
    if (stoppedByCancelledEvent(m, event)) {
      await cancelMessage(m.id, WORKER_ACTOR, now, t);
      return 'event_cancelled';
    }
    if (!(await approvalStillMatches(m.id, t))) {
      await reconcileApproval(m.id, 'draft_changed', WORKER_ACTOR, now, t);
      return 'approval_changed';
    }
    const n = await readyDeliveries(m.id, t);
    await m.update({ status: 'sending', updated_by: null }, { transaction: t });
    await logActivity(WORKER_ACTOR, 'message.sending', 'message', m.id, { destinations: n }, t);
    return 'started';
  });
}

export async function finishMessage(messageId: string, now: Date): Promise<CommsHubMessageStatus | null> {
  return sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.findByPk(messageId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!m || m.status !== 'sending') return null;
    const rows = await CommsHubDelivery.findAll({ where: { message_id: messageId }, attributes: ['status', 'error'], transaction: t });
    const result = resultOf(rows.map((r) => r.status));
    if (!result || !transition(m.status, result).ok) return null;
    await m.update({ status: result }, { transaction: t });
    await logActivity(WORKER_ACTOR, `message.${result}`, 'message', m.id, {
      sent: rows.filter((r) => r.status === 'sent').length, not_sent: rows.filter((r) => r.status !== 'sent').length,
      errors: rows.filter((r) => r.error).map((r) => r.error).slice(0, 5),
    }, t);
    if (result === 'sent') return result;
    // CH7.3: its event was cancelled while it was sending: what did not go out never will. It ends
    // cancelled (not back in the approval queue, where approving it would send it after all).
    const event = m.event_id ? await CommsHubEvent.findByPk(m.event_id, { attributes: ['id', 'status'], transaction: t }) : null;
    if (stoppedByCancelledEvent(m, event)) {
      await cancelMessage(m.id, WORKER_ACTOR, now, t);
      return 'cancelled';
    }
    // A message edited while it was sending is not voided then (CH6.2); once the attempt ends, it is.
    await reconcileApproval(m.id, 'draft_changed', WORKER_ACTOR, now, t);
    return result;
  });
}

/** Jackie's retry: only the destinations that did not get it, on their own rows and keys. */
export async function retryFailedDeliveries(messageId: string, actor: Actor, now: Date = new Date()): Promise<CommsHubMessage> {
  // The void of a changed approval must be KEPT even though the retry is refused, so the refusal is
  // thrown after the transaction commits (a throw inside it would roll the void back).
  const out = await sequelize.transaction(async (t): Promise<CommsHubMessage | 'approval_changed'> => {
    const m = await CommsHubMessage.findByPk(messageId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
    if (m.status !== 'partially_failed' && m.status !== 'failed') throw new MessageRuleError('Only a message that did not fully send can be retried.', 409, 'not_retryable');
    if (!(await approvalStillMatches(m.id, t))) {
      await reconcileApproval(m.id, 'draft_changed', actor, now, t);
      return 'approval_changed';
    }
    const [n] = await CommsHubDelivery.update(
      { status: 'pending', attempt_count: 0, next_attempt_at: null, error: null },
      { where: { message_id: m.id, status: { [Op.in]: ['failed', 'skipped'] } }, transaction: t },
    );
    if (n === 0) throw new MessageRuleError('There is nothing left to retry.', 409, 'nothing_to_retry');
    await m.update({ status: 'sending', updated_by: actor.id }, { transaction: t });
    await logActivity(actor, 'message.retry', 'message', m.id, { deliveries: n }, t);
    return m;
  });
  if (out === 'approval_changed') {
    throw new MessageRuleError('This message changed after it was approved, so it needs approval again before it is retried.', 409, 'approval_changed');
  }
  return out;
}
