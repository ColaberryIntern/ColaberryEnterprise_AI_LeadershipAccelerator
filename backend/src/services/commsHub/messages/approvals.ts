import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubMessage, { type CommsHubMessageStatus } from '../../../models/CommsHubMessage';
import CommsHubDraft from '../../../models/CommsHubDraft';
import CommsHubDestination from '../../../models/CommsHubDestination';
import CommsHubApproval from '../../../models/CommsHubApproval';
import { logActivity, type Actor } from '../activityLog';
import { APPROVED_STATUSES, approvalHash, transition, type ApprovalContent, type VoidReason } from './messageStatus';

/**
 * Approvals (CH6.2), on top of the pure status machine and hash in messageStatus.ts. Every change
 * runs in one transaction with the message row locked, so two organizers cannot approve, undo or edit
 * the same message at once. created_by stays on the message and approved_by goes on the approval:
 * both are recorded separately, and the same person may do both.
 *
 * VOIDING: an approval covers the exact drafts, destinations and send time (its hash). Whatever
 * changes one of them (CH6.5's editor, a regenerate, a recipients edit, a new send time) calls
 * reconcileApproval with what it changed; if the content no longer matches the hash, the approval is
 * voided (never deleted) and the message goes back to needs_approval.
 */
export class MessageRuleError extends Error {
  constructor(message: string, public readonly status: number, public readonly reason: string) { super(message); }
}

/** The latest version of each channel's draft, the destinations, and the send time. */
export async function loadContent(messageId: string, t?: Transaction): Promise<ApprovalContent> {
  const message = await CommsHubMessage.findByPk(messageId, { transaction: t });
  if (!message) throw new MessageRuleError('That message was not found.', 404, 'not_found');
  const drafts = await CommsHubDraft.findAll({ where: { message_id: messageId }, order: [['channel', 'ASC'], ['version', 'DESC']], transaction: t });
  const latest = new Map<string, CommsHubDraft>();
  for (const d of drafts) if (!latest.has(d.channel)) latest.set(d.channel, d);
  const destinations = await CommsHubDestination.findAll({ where: { message_id: messageId }, transaction: t });
  return {
    drafts: [...latest.values()].map((d) => ({ channel: d.channel, title: d.title, body: d.body })),
    destinations: destinations.map((d) => ({ channel: d.channel, target_type: d.target_type, target_id: d.target_id })),
    send_at: message.send_at,
  };
}

async function locked(messageId: string, t: Transaction): Promise<CommsHubMessage> {
  const m = await CommsHubMessage.findByPk(messageId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
  return m;
}

function move(m: CommsHubMessage, to: CommsHubMessageStatus): void {
  const r = transition(m.status, to);
  if (!r.ok) throw new MessageRuleError(`This message cannot do that now: ${r.reason}.`, 409, 'invalid_transition');
}

async function inForce(messageId: string, t: Transaction): Promise<CommsHubApproval | null> {
  return CommsHubApproval.findOne({ where: { message_id: messageId, voided_at: { [Op.is]: null } }, transaction: t });
}

/** Submit for approval: draft -> needs_approval. */
export async function submitForApproval(messageId: string, actor: Actor): Promise<CommsHubMessage> {
  return sequelize.transaction(async (t) => {
    const m = await locked(messageId, t);
    move(m, 'needs_approval');
    await m.update({ status: 'needs_approval', updated_by: actor.id }, { transaction: t });
    await logActivity(actor, 'message.submitted', 'message', m.id, {}, t);
    return m;
  });
}

/**
 * Approve: needs_approval -> approved, recording who and the hash of exactly what was approved.
 * Refused when there is nothing to send (no draft, or no destination).
 */
export async function approveMessage(messageId: string, actor: Actor, now: Date = new Date()): Promise<{ message: CommsHubMessage; approval: CommsHubApproval }> {
  const approver = actor.id;
  if (!approver) throw new MessageRuleError('Approvals need a signed-in person.', 403, 'no_actor');
  return sequelize.transaction(async (t) => {
    const m = await locked(messageId, t);
    move(m, 'approved');
    const content = await loadContent(m.id, t);
    if (content.drafts.length === 0) throw new MessageRuleError('There is no text to approve yet.', 409, 'no_draft');
    if (content.destinations.length === 0) throw new MessageRuleError('Choose who it goes to before approving.', 409, 'no_destination');
    const previous = await inForce(m.id, t);
    if (previous) await previous.update({ voided_at: now, voided_reason: 'superseded' }, { transaction: t });
    const approval = await CommsHubApproval.create({ message_id: m.id, approved_by: approver, approved_at: now, content_hash: approvalHash(content) }, { transaction: t });
    await m.update({ status: 'approved', updated_by: actor.id }, { transaction: t });
    await logActivity(actor, 'message.approved', 'message', m.id, { approval_id: approval.id, created_by: m.created_by, same_person: m.created_by === actor.id }, t);
    return { message: m, approval };
  });
}

/** Reject: needs_approval -> draft, with the reason the organizer gave. */
export async function rejectMessage(messageId: string, actor: Actor, note: string | null): Promise<CommsHubMessage> {
  return sequelize.transaction(async (t) => {
    const m = await locked(messageId, t);
    move(m, 'draft');
    await m.update({ status: 'draft', updated_by: actor.id }, { transaction: t });
    await logActivity(actor, 'message.rejected', 'message', m.id, { note }, t);
    return m;
  });
}

async function voidInForce(m: CommsHubMessage, reason: VoidReason, actor: Actor, t: Transaction, now: Date): Promise<boolean> {
  const a = await inForce(m.id, t);
  if (a) await a.update({ voided_at: now, voided_reason: reason }, { transaction: t });
  await m.update({ status: 'needs_approval', updated_by: actor.id }, { transaction: t });
  await logActivity(actor, 'message.approval_voided', 'message', m.id, { approval_id: a?.id ?? null, reason }, t);
  return true;
}

/** Undo approval: approved | scheduled -> needs_approval, the approval voided as 'undone'. */
export async function undoApproval(messageId: string, actor: Actor, now: Date = new Date()): Promise<CommsHubMessage> {
  return sequelize.transaction(async (t) => {
    const m = await locked(messageId, t);
    move(m, 'needs_approval');
    if (!APPROVED_STATUSES.includes(m.status)) throw new MessageRuleError('This message is not approved.', 409, 'not_approved');
    await voidInForce(m, 'undone', actor, t, now);
    return m;
  });
}

/**
 * After a draft, a destination or the send time changed: if the message was approved and its content
 * no longer matches the approved hash, void the approval and return the message to needs_approval.
 * Returns whether it voided. Content that still matches (an edit that was reverted) keeps the approval.
 */
export async function reconcileApproval(messageId: string, reason: Exclude<VoidReason, 'undone' | 'cancelled'>, actor: Actor, now: Date = new Date()): Promise<boolean> {
  return sequelize.transaction(async (t) => {
    const m = await locked(messageId, t);
    if (!APPROVED_STATUSES.includes(m.status)) return false;
    const a = await inForce(m.id, t);
    if (a && a.content_hash === approvalHash(await loadContent(m.id, t))) return false;
    return voidInForce(m, reason, actor, t, now);
  });
}
