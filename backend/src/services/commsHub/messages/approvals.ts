import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubMessage, { type CommsHubMessageStatus } from '../../../models/CommsHubMessage';
import CommsHubDraft from '../../../models/CommsHubDraft';
import CommsHubDestination from '../../../models/CommsHubDestination';
import CommsHubApproval from '../../../models/CommsHubApproval';
import CommsHubEvent from '../../../models/CommsHubEvent';
import { logActivity, type Actor } from '../activityLog';
import { factsFor, problemsFor } from './draftFacts';
import { replayLink } from './links';
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
  constructor(message: string, public readonly status: number, public readonly reason: string, public readonly problems: string[] = []) { super(message); }
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

/**
 * The CH6.3 validator, enforced at BOTH gates a draft passes on its way out: submit and approve. An
 * edit made while a message waits for approval (which voids nothing, because nothing is approved yet)
 * is therefore checked before it can be approved.
 */
async function assertDraftsValid(m: CommsHubMessage, content: ApprovalContent, t: Transaction, now: Date, doing: string): Promise<void> {
  const event = m.event_id ? await CommsHubEvent.findByPk(m.event_id, { transaction: t }) : null;
  const facts = event ? factsFor(event, m.occurrence_starts_at, now, replayLink()) : null;
  const postEvent = m.kind === 'recording_thanks';
  const problems = content.drafts.flatMap((d) => problemsFor({ channel: d.channel as 'community_post' | 'in_app', title: d.title, body: d.body }, facts, { postEvent }));
  if (problems.length) throw new MessageRuleError(`Fix the drafts before ${doing}.`, 409, 'draft_invalid', problems);
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

/**
 * Submit for approval: draft -> needs_approval, only when every channel's latest draft passes the
 * CH6.3 validator (the event's correct Central date and time, nothing else dated, no unfilled
 * placeholder, no banned word). The refusal carries each problem as a sentence.
 */
export async function submitForApproval(messageId: string, actor: Actor, now: Date = new Date(), outer?: Transaction): Promise<CommsHubMessage> {
  return inTx(outer, async (t) => {
    const m = await locked(messageId, t);
    move(m, 'needs_approval');
    const content = await loadContent(m.id, t);
    if (content.drafts.length === 0) throw new MessageRuleError('There is no text to submit yet.', 409, 'no_draft');
    await assertDraftsValid(m, content, t, now, 'submitting');
    await m.update({ status: 'needs_approval', updated_by: actor.id }, { transaction: t });
    await logActivity(actor, 'message.submitted', 'message', m.id, {}, t);
    return m;
  });
}

/**
 * Approve: needs_approval -> approved, recording who and the hash of exactly what was approved.
 * Refused when there is nothing to send (no draft, or no destination).
 */
export async function approveMessage(messageId: string, actor: Actor, now: Date = new Date(), outer?: Transaction): Promise<{ message: CommsHubMessage; approval: CommsHubApproval }> {
  const approver = actor.id;
  if (!approver) throw new MessageRuleError('Approvals need a signed-in person.', 403, 'no_actor');
  return inTx(outer, async (t) => {
    const m = await locked(messageId, t);
    move(m, 'approved');
    const content = await loadContent(m.id, t);
    if (content.drafts.length === 0) throw new MessageRuleError('There is no text to approve yet.', 409, 'no_draft');
    if (content.destinations.length === 0) throw new MessageRuleError('Choose who it goes to before approving.', 409, 'no_destination');
    await assertDraftsValid(m, content, t, now, 'approving');
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

/**
 * The event this message is about changed or was cancelled (CH7.3): its approval no longer stands.
 * An approved, scheduled or failed message goes back to needs_approval. A message that is SENDING
 * cannot change status, so only its approval is voided: the worker re-checks the approval under its
 * send lock before every send, so nothing more goes out, and when the attempt ends the message's
 * reconcile puts it back to needs_approval. Returns whether an approval (or status) changed.
 */
export async function voidForEvent(messageId: string, reason: 'event_changed' | 'event_cancelled', actor: Actor, now: Date, t: Transaction): Promise<boolean> {
  const m = await locked(messageId, t);
  if (APPROVED_STATUSES.includes(m.status)) return voidInForce(m, reason, actor, t, now);
  if (m.status !== 'sending') return false;
  const a = await inForce(m.id, t);
  if (!a) return false;
  await a.update({ voided_at: now, voided_reason: reason }, { transaction: t });
  await logActivity(actor, 'message.approval_voided', 'message', m.id, { approval_id: a.id, reason, while: 'sending' }, t);
  return true;
}

/** Undo approval: approved | scheduled -> needs_approval, the approval voided as 'undone'. */
export async function undoApproval(messageId: string, actor: Actor, now: Date = new Date(), outer?: Transaction): Promise<CommsHubMessage> {
  return inTx(outer, async (t) => {
    const m = await locked(messageId, t);
    move(m, 'needs_approval');
    if (!APPROVED_STATUSES.includes(m.status)) throw new MessageRuleError('This message is not approved.', 409, 'not_approved');
    await voidInForce(m, 'undone', actor, t, now);
    return m;
  });
}

/** Optional outer transaction: the caller's edit and the void then commit (or roll back) together. */
function inTx<T>(t: Transaction | undefined, fn: (t: Transaction) => Promise<T>): Promise<T> {
  return t ? fn(t) : sequelize.transaction(fn);
}

/**
 * Schedule: approved -> scheduled. Never touches send_at (null stays "send now"), so the content the
 * approval covers is unchanged and the approval stays valid.
 */
export async function scheduleMessage(messageId: string, actor: Actor, t?: Transaction): Promise<CommsHubMessage> {
  return inTx(t, async (tx) => {
    const m = await locked(messageId, tx);
    move(m, 'scheduled');
    await m.update({ status: 'scheduled', updated_by: actor.id }, { transaction: tx });
    await logActivity(actor, 'message.scheduled', 'message', m.id, { send_at: m.send_at ? m.send_at.toISOString() : 'now' }, tx);
    return m;
  });
}

/** Cancel: any status that may be cancelled -> cancelled; an approval in force is voided as 'cancelled'. */
export async function cancelMessage(messageId: string, actor: Actor, now: Date = new Date(), t?: Transaction): Promise<CommsHubMessage> {
  return inTx(t, async (tx) => {
    const m = await locked(messageId, tx);
    move(m, 'cancelled');
    const a = await inForce(m.id, tx);
    if (a) await a.update({ voided_at: now, voided_reason: 'cancelled' }, { transaction: tx });
    await m.update({ status: 'cancelled', updated_by: actor.id }, { transaction: tx });
    await logActivity(actor, 'message.cancelled', 'message', m.id, { approval_id: a?.id ?? null }, tx);
    return m;
  });
}

/**
 * After a draft, a destination or the send time changed: if the message was approved and its content
 * no longer matches the approved hash, void the approval and return the message to needs_approval.
 * Returns whether it voided. Content that still matches (an edit that was reverted) keeps the approval.
 */
export async function reconcileApproval(messageId: string, reason: Exclude<VoidReason, 'undone' | 'cancelled'>, actor: Actor, now: Date = new Date(), outer?: Transaction): Promise<boolean> {
  return inTx(outer, async (t) => {
    const m = await locked(messageId, t);
    if (!APPROVED_STATUSES.includes(m.status)) return false;
    const a = await inForce(m.id, t);
    if (a && a.content_hash === approvalHash(await loadContent(m.id, t))) return false;
    return voidInForce(m, reason, actor, t, now);
  });
}
