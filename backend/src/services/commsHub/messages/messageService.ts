import { Op } from 'sequelize';
import { sequelize } from '../../../config/database';
import Cohort from '../../../models/Cohort';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage from '../../../models/CommsHubMessage';
import CommsHubDraft, { type CommsHubChannel } from '../../../models/CommsHubDraft';
import CommsHubDestination, { type CommsHubDestinationType } from '../../../models/CommsHubDestination';
import CommsHubApproval from '../../../models/CommsHubApproval';
import CommsHubDelivery from '../../../models/CommsHubDelivery';
import { logActivity, type Actor } from '../activityLog';
import { approveMessage, MessageRuleError, reconcileApproval, scheduleMessage, submitForApproval } from './approvals';
import { factsFor, problemsFor } from './draftFacts';
import { recommendDestinations, type Recommendation } from './drafting';
import { replayLink } from './links';

/**
 * The Compose tab's server side (CH6.5): one message as the organizer sees it, its recipients and
 * send time (each change re-checks the approval, CH6.2), and Approve and schedule in one step.
 */
export interface DraftView { id: string; channel: CommsHubChannel; version: number; title: string | null; body: string; author: string; instruction: string | null; created_at: string }
export interface MessageView {
  id: string; status: string; kind: string; tone: string | null; notes: string | null; subject: string | null;
  include: Record<string, boolean>; send_at: string | null; created_by: string | null; plan_kind: string | null; occurrence_starts_at: string | null;
  event: { id: string; title: string; when: string; thumbnail_id: string | null } | null;
  /** The latest version per channel, and every version newest first. */
  drafts: Partial<Record<CommsHubChannel, DraftView>>;
  versions: DraftView[];
  destinations: Array<{ id: string; channel: CommsHubChannel; target_type: string; target_id: string; label: string | null; has_delivery: boolean }>;
  approval: { id: string; approved_by: string; approved_at: string } | null;
  /** The validator's problems with the current drafts (empty = ready); the same check submit and approve run. */
  problems: string[];
  recommended: Recommendation[];
}

const draftView = (d: CommsHubDraft): DraftView => ({ id: (d as unknown as { id: string }).id, channel: d.channel, version: d.version, title: d.title, body: d.body, author: d.author, instruction: d.instruction, created_at: d.created_at.toISOString() });

export async function messageView(id: string, now: Date = new Date()): Promise<MessageView> {
  const m = await CommsHubMessage.findByPk(id);
  if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
  const [drafts, dests, approval, event] = await Promise.all([
    CommsHubDraft.findAll({ where: { message_id: m.id }, order: [['version', 'DESC']] }),
    CommsHubDestination.findAll({ where: { message_id: m.id }, order: [['created_at', 'ASC']] }),
    CommsHubApproval.findOne({ where: { message_id: m.id, voided_at: { [Op.is]: null } } }),
    m.event_id ? CommsHubEvent.findByPk(m.event_id) : Promise.resolve(null),
  ]);
  const delivered = dests.length ? new Set((await CommsHubDelivery.findAll({ where: { destination_id: dests.map((d) => d.id) }, attributes: ['destination_id'] })).map((d) => d.destination_id)) : new Set<string>();
  const latest: Partial<Record<CommsHubChannel, DraftView>> = {};
  for (const d of drafts) if (!latest[d.channel]) latest[d.channel] = draftView(d);
  const facts = event ? factsFor(event, m.occurrence_starts_at, now, replayLink()) : null;
  const problems = Object.values(latest).flatMap((d) => problemsFor({ channel: d!.channel, title: d!.title, body: d!.body }, facts, { postEvent: m.kind === 'recording_thanks' }));
  return {
    id: m.id, status: m.status, kind: m.kind, tone: m.tone, notes: m.notes, subject: m.subject, include: { ...(m.include ?? {}) },
    send_at: m.send_at ? m.send_at.toISOString() : null, created_by: m.created_by, plan_kind: m.plan_kind,
    occurrence_starts_at: m.occurrence_starts_at ? m.occurrence_starts_at.toISOString() : null,
    event: event ? { id: event.id, title: event.title, when: facts ? `${facts.date} \u00B7 ${facts.time}` : '', thumbnail_id: event.thumbnail_id } : null,
    drafts: latest, versions: drafts.map(draftView),
    destinations: dests.map((d) => ({ id: d.id, channel: d.channel, target_type: d.target_type, target_id: d.target_id, label: d.label, has_delivery: delivered.has(d.id) })),
    approval: approval ? { id: approval.id, approved_by: approval.approved_by, approved_at: approval.approved_at.toISOString() } : null,
    problems,
    recommended: await recommendDestinations(event),
  };
}

/** Messages for the Compose and Schedule lists: newest first, optionally by status. */
export async function listMessages(status: string[] | null, limit = 50): Promise<Array<{ id: string; status: string; kind: string; subject: string | null; event_id: string | null; send_at: string | null; updated_at: string }>> {
  const rows = await CommsHubMessage.findAll({ where: status?.length ? { status: { [Op.in]: status } } : {}, order: [['updated_at', 'DESC']], limit });
  return rows.map((m) => ({ id: m.id, status: m.status, kind: m.kind, subject: m.subject, event_id: m.event_id, send_at: m.send_at ? m.send_at.toISOString() : null, updated_at: m.updated_at.toISOString() }));
}

export interface DestinationInput { channel: CommsHubChannel; target_type: CommsHubDestinationType; target_id: string; label: string | null }
const keyOf = (d: { channel: string; target_type: string; target_id: string }): string => `${d.channel}|${d.target_type}|${d.target_id}`;

/**
 * Replace who it goes to. A recipient that already has a delivery row is KEPT (its history stays,
 * CH6.1 RESTRICT): removing it after a send is refused with a sentence. Any real change re-checks the
 * approval in the same transaction (voided, back to needs_approval).
 */
export async function setDestinations(messageId: string, wanted: DestinationInput[], actor: Actor, now: Date = new Date()): Promise<void> {
  await sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.findByPk(messageId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
    if (['sending', 'sent', 'cancelled'].includes(m.status)) throw new MessageRuleError(`A ${m.status} message cannot change its recipients.`, 409, 'locked');
    const current = await CommsHubDestination.findAll({ where: { message_id: m.id }, transaction: t });
    const want = new Map(wanted.map((d) => [keyOf(d), d]));
    const removed = current.filter((d) => !want.has(keyOf(d)));
    if (removed.length) {
      const withDelivery = await CommsHubDelivery.findAll({ where: { destination_id: removed.map((d) => d.id) }, attributes: ['destination_id'], transaction: t });
      if (withDelivery.length) throw new MessageRuleError('A recipient this message was already sent to cannot be removed.', 409, 'has_delivery');
      await CommsHubDestination.destroy({ where: { id: removed.map((d) => d.id) }, transaction: t });
    }
    const have = new Set(current.map(keyOf));
    const added = wanted.filter((d) => !have.has(keyOf(d)));
    for (const d of added) await CommsHubDestination.create({ message_id: m.id, channel: d.channel, target_type: d.target_type, target_id: d.target_id, label: d.label }, { transaction: t });
    if (!removed.length && !added.length) return;
    await logActivity(actor, 'message.recipients_changed', 'message', m.id, { added: added.length, removed: removed.length }, t);
    await reconcileApproval(m.id, 'destinations_changed', actor, now, t);
  });
}

/** Send as soon as approved (null), or at a Central time the organizer chose. A change re-checks the approval. */
export async function setSendTime(messageId: string, sendAt: Date | null, actor: Actor, now: Date = new Date()): Promise<void> {
  if (sendAt && sendAt.getTime() < now.getTime() - 60_000) throw new MessageRuleError('That time has already passed. Choose a later time, or send as soon as approved.', 400, 'past');
  await sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.findByPk(messageId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
    if (['sending', 'sent', 'cancelled'].includes(m.status)) throw new MessageRuleError(`A ${m.status} message cannot change its time.`, 409, 'locked');
    if ((m.send_at?.getTime() ?? null) === (sendAt?.getTime() ?? null)) return;
    await m.update({ send_at: sendAt, updated_by: actor.id }, { transaction: t });
    await logActivity(actor, 'message.time_changed', 'message', m.id, { send_at: sendAt ? sendAt.toISOString() : 'on approval' }, t);
    await reconcileApproval(m.id, 'send_time_changed', actor, now, t);
  });
}

/**
 * "Approve and schedule", in ONE transaction: a draft is submitted first (both gates validate), then
 * approved (hashed) and scheduled, so it is in the sending queue. If any step is refused nothing is
 * left half-done (no approved-but-unscheduled message).
 */
export async function approveAndSchedule(messageId: string, actor: Actor, now: Date = new Date()): Promise<void> {
  await sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.findByPk(messageId, { transaction: t });
    if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
    if (m.status === 'draft') await submitForApproval(messageId, actor, now, t);
    await approveMessage(messageId, actor, now, t);
    await scheduleMessage(messageId, actor, t);
  });
}

/** What the organizer can send to: each open cohort's feed, and in-app to everyone or one cohort. */
export async function destinationOptions(): Promise<DestinationInput[]> {
  const cohorts = await Cohort.findAll({ where: { status: 'open' }, attributes: ['id', 'name'], order: [['start_date', 'DESC']] });
  return [
    ...cohorts.map((c) => ({ channel: 'community_post' as const, target_type: 'cohort_feed' as const, target_id: c.id, label: `${c.name} feed` })),
    { channel: 'in_app' as const, target_type: 'in_app_audience' as const, target_id: 'all_members', label: 'Everyone in the program' },
    ...cohorts.map((c) => ({ channel: 'in_app' as const, target_type: 'in_app_audience' as const, target_id: c.id, label: `${c.name} members` })),
  ];
}
