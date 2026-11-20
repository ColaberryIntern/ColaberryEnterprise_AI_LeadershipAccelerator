import { z } from 'zod';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage, { type CommsHubMessageKind } from '../../../models/CommsHubMessage';
import CommsHubDraft, { type CommsHubChannel } from '../../../models/CommsHubDraft';
import Cohort from '../../../models/Cohort';
import { callLLMWithAudit } from '../../llmCallWrapper';
import { COMMS_HUB_LLM_NAMESPACE, TYPE_WORDS } from '../eventDescribe';
import { audienceCohortIds } from '../eventWriteThrough';
import { logActivity, type Actor } from '../activityLog';
import { factsFor, fillFacts, type DraftFacts } from './draftFacts';
import { MessageRuleError, reconcileApproval } from './approvals';
import { MESSAGE_DRAFT_SYSTEM, messageDraftUserPrompt, type DraftPromptInput } from './prompts/messageDraftPrompt';

/**
 * AI drafting for Compose (CH6.3): one message, one draft per channel (a community post, an in-app
 * notification), every fact filled by code from the event (draftFacts.ts). Shorter / Warmer / More
 * detail and the organizer's own edits are NEW VERSIONS, never overwrites; an edit to an approved
 * message voids its approval (CH6.2) in the same transaction.
 *
 * This module writes drafts and nothing else: it has NO import path to delivery (connectors, the
 * worker, community posts or notifications). draftingImportPath.test.ts proves it.
 */
export const DRAFT_MODEL = 'gpt-4o-mini';

export class DraftModelError extends Error {}

const Reply = z.object({
  community_post: z.object({ body: z.string().trim().min(1).max(2000) }),
  in_app: z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(300) }),
}).passthrough();
export type DraftReply = z.infer<typeof Reply>;

export interface MessageInput {
  eventId?: string | null;
  subject?: string | null;
  kind: CommsHubMessageKind;
  tone?: string | null;
  notes?: string | null;
}

export interface Recommendation { channel: CommsHubChannel; target_type: 'cohort_feed' | 'in_app_audience'; target_id: string; label: string; reason: string }

async function eventOr404(id: string, t?: Transaction): Promise<CommsHubEvent> {
  const e = await CommsHubEvent.findByPk(id, { transaction: t });
  if (!e) throw new MessageRuleError('That event was not found.', 404, 'not_found');
  return e;
}

async function askModel(input: DraftPromptInput): Promise<DraftReply> {
  const result = await callLLMWithAudit({
    lessonId: COMMS_HUB_LLM_NAMESPACE,
    generationType: 'admin_structure',
    step: 'comms_hub_message_draft',
    systemPrompt: MESSAGE_DRAFT_SYSTEM,
    userPrompt: messageDraftUserPrompt(input),
    model: DRAFT_MODEL,
    temperature: 0.6,
    maxTokens: 600,
    responseFormat: { type: 'json_object' },
    // Every Generate / Shorter / Warmer is asked for a NEW draft; a cached answer would repeat the last one.
    force: true,
  });
  let parsed: unknown;
  try { parsed = JSON.parse(result.content); } catch { throw new DraftModelError('The AI reply was not readable. Try again.'); }
  const r = Reply.safeParse(parsed);
  if (!r.success) throw new DraftModelError('The AI reply was missing a channel. Try again.');
  return r.data;
}

function promptAbout(e: CommsHubEvent | null, subject: string | null): DraftPromptInput['about'] {
  if (e) {
    return { event: { title: e.title, type: TYPE_WORDS[e.event_type], description: e.description, hasJoinLink: !!e.join_url, hasRegistrationLink: !!e.registration_url, hasHosts: (e.hosts ?? []).length > 0 } };
  }
  return { subject: subject ?? '' };
}

async function nextVersion(messageId: string, channel: CommsHubChannel, t: Transaction): Promise<number> {
  const max = await CommsHubDraft.max('version', { where: { message_id: messageId, channel }, transaction: t });
  return (typeof max === 'number' ? max : 0) + 1;
}

async function writeDrafts(messageId: string, reply: DraftReply, facts: DraftFacts | null, author: string, instruction: string | null, t: Transaction): Promise<CommsHubDraft[]> {
  const post = await CommsHubDraft.create({ message_id: messageId, channel: 'community_post', version: await nextVersion(messageId, 'community_post', t), title: null, body: fillFacts(reply.community_post.body, facts), author, instruction }, { transaction: t });
  const inApp = await CommsHubDraft.create({ message_id: messageId, channel: 'in_app', version: await nextVersion(messageId, 'in_app', t), title: fillFacts(reply.in_app.title, facts), body: fillFacts(reply.in_app.body, facts), author, instruction }, { transaction: t });
  return [post, inApp];
}

/** The facts for a message's event and occurrence, or null for a subject-only message. */
export async function messageFacts(m: CommsHubMessage, t?: Transaction, now: Date = new Date()): Promise<DraftFacts | null> {
  if (!m.event_id) return null;
  return factsFor(await eventOr404(m.event_id, t), m.occurrence_starts_at, now);
}

/** Who it should go to, with a one-line reason each: the event's audience (or every open cohort). */
export async function recommendDestinations(e: CommsHubEvent | null): Promise<Recommendation[]> {
  const ids = e ? await audienceCohortIds(e) : (await Cohort.findAll({ where: { status: 'open' }, attributes: ['id'] })).map((c) => c.get('id') as string);
  const cohorts = ids.length ? await Cohort.findAll({ where: { id: ids }, attributes: ['id', 'name'] }) : [];
  const allMembers = !e || e.audience.kind === 'all_members';
  const feeds: Recommendation[] = cohorts.map((c) => ({
    channel: 'community_post', target_type: 'cohort_feed', target_id: c.id, label: `${c.name} feed`,
    reason: allMembers ? 'An open cohort: its members read this feed.' : 'This event is for this cohort.',
  }));
  const inApp: Recommendation[] = allMembers
    ? [{ channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members', label: 'Everyone in the program', reason: 'The event is for all members, so everyone gets the notification.' }]
    : cohorts.map((c) => ({ channel: 'in_app', target_type: 'in_app_audience', target_id: c.id, label: `${c.name} members`, reason: 'Only this cohort is invited, so only its members are notified.' }));
  return [...feeds, ...inApp];
}

/** Start a message from an event or a subject, with AI drafts (version 1) and the recommended recipients. */
export async function createDraftMessage(input: MessageInput, actor: Actor, now: Date = new Date()): Promise<{ message: CommsHubMessage; drafts: CommsHubDraft[]; recommended: Recommendation[] }> {
  const subject = input.subject?.trim() || null;
  if (!input.eventId && !subject) throw new MessageRuleError('Start from an event or write what the message is about.', 400, 'no_subject');
  const event = input.eventId ? await eventOr404(input.eventId) : null;
  const reply = await askModel({ about: promptAbout(event, subject), kind: input.kind, tone: input.tone ?? null, notes: input.notes ?? null });
  const { message, drafts } = await sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.create({ event_id: event?.id ?? null, subject, kind: input.kind, tone: input.tone ?? null, notes: input.notes ?? null, status: 'draft', created_by: actor.id, updated_by: actor.id }, { transaction: t });
    const facts = event ? factsFor(event, null, now) : null;
    const d = await writeDrafts(m.id, reply, facts, 'ai', null, t);
    await logActivity(actor, 'message.drafted', 'message', m.id, { event_id: event?.id ?? null, kind: input.kind }, t);
    return { message: m, drafts: d };
  });
  return { message, drafts, recommended: await recommendDestinations(event) };
}

async function latest(messageId: string, channel: CommsHubChannel, t?: Transaction): Promise<CommsHubDraft | null> {
  return CommsHubDraft.findOne({ where: { message_id: messageId, channel }, order: [['version', 'DESC']], transaction: t });
}

/** Shorter / Warmer / More detail: new AI versions of both channels, from the current ones. */
export async function regenerateDrafts(messageId: string, instruction: 'shorter' | 'warmer' | 'more_detail', actor: Actor, now: Date = new Date()): Promise<CommsHubDraft[]> {
  const m = await CommsHubMessage.findByPk(messageId);
  if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
  if (m.status === 'sending' || m.status === 'sent' || m.status === 'cancelled') throw new MessageRuleError(`A ${m.status} message cannot be redrafted.`, 409, 'locked');
  const event = m.event_id ? await eventOr404(m.event_id) : null;
  const [post, inApp] = await Promise.all([latest(m.id, 'community_post'), latest(m.id, 'in_app')]);
  const reply = await askModel({
    about: promptAbout(event, m.subject), kind: m.kind, tone: m.tone, notes: m.notes,
    revise: { instruction, previous: { community_post: post?.body, in_app_title: inApp?.title ?? undefined, in_app_body: inApp?.body } },
  });
  return sequelize.transaction(async (t) => {
    // Re-checked under the row lock: the model call takes seconds, and the message may have started sending meanwhile.
    const fresh = await CommsHubMessage.findByPk(m.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!fresh || fresh.status === 'sending' || fresh.status === 'sent' || fresh.status === 'cancelled') throw new MessageRuleError(`A ${fresh?.status ?? 'missing'} message cannot be redrafted.`, 409, 'locked');
    const d = await writeDrafts(m.id, reply, event ? factsFor(event, m.occurrence_starts_at, now) : null, 'ai', instruction, t);
    await logActivity(actor, 'message.redrafted', 'message', m.id, { instruction }, t);
    await reconcileApproval(m.id, 'draft_changed', actor, now, t);
    return d;
  });
}

/** The organizer's own edit of one channel: a new version authored by them (facts filled too). */
export async function editDraft(messageId: string, channel: CommsHubChannel, text: { title?: string | null; body: string }, actor: Actor, now: Date = new Date()): Promise<CommsHubDraft> {
  if (!actor.id) throw new MessageRuleError('Edits need a signed-in person.', 403, 'no_actor');
  const author = actor.id;
  return sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.findByPk(messageId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!m) throw new MessageRuleError('That message was not found.', 404, 'not_found');
    if (m.status === 'sending' || m.status === 'sent' || m.status === 'cancelled') throw new MessageRuleError(`A ${m.status} message cannot be edited.`, 409, 'locked');
    const facts = await messageFacts(m, t, now);
    const d = await CommsHubDraft.create({
      message_id: m.id, channel, version: await nextVersion(m.id, channel, t),
      title: channel === 'in_app' ? fillFacts(text.title ?? '', facts) : null, body: fillFacts(text.body, facts), author, instruction: 'edit',
    }, { transaction: t });
    await logActivity(actor, 'message.edited', 'message', m.id, { channel, version: d.version }, t);
    await reconcileApproval(m.id, 'draft_changed', actor, now, t);
    return d;
  });
}
