import { z } from 'zod';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage, { type CommsHubInclude, type CommsHubMessageKind } from '../../../models/CommsHubMessage';
import CommsHubDraft, { type CommsHubChannel } from '../../../models/CommsHubDraft';
import CommsHubDestination from '../../../models/CommsHubDestination';
import type { CommsHubPlanKind } from '../../../models/CommsHubMessage';
import Cohort from '../../../models/Cohort';
import { callLLMWithAudit } from '../../llmCallWrapper';
import { COMMS_HUB_LLM_NAMESPACE, TYPE_WORDS } from '../eventDescribe';
import { audienceCohortIds } from '../eventWriteThrough';
import { logActivity, type Actor } from '../activityLog';
import { factsFor, fillFacts, type DraftFacts } from './draftFacts';
import { replayLink } from './links';
import { MessageRuleError, reconcileApproval } from './approvals';
import { messageDraftSystem, messageDraftUserPrompt, type DraftPromptInput } from './prompts/messageDraftPrompt';
import { readWhatsAppConfig } from '../channelConfig';

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
  // CH10.3: present only when the WhatsApp channel is switched on (and then required: ReplyWithWhatsApp).
  whatsapp: z.object({ body: z.string().trim().min(1).max(1000) }).optional(),
}).passthrough();
const ReplyWithWhatsApp = Reply.extend({ whatsapp: z.object({ body: z.string().trim().min(1).max(1000) }) });
export type DraftReply = z.infer<typeof Reply>;

/**
 * CH10.3: a WhatsApp draft is written whenever the WhatsApp channel is switched on (configured and
 * allowed). Drafts are written before recipients are chosen, so this cannot depend on the destinations;
 * approval demands a WhatsApp draft only when the message has a WhatsApp group (approvals.ts).
 */
export function whatsappDraftsOn(): boolean { return readWhatsAppConfig().notConfigured === null; }

export interface MessageInput {
  eventId?: string | null;
  subject?: string | null;
  kind: CommsHubMessageKind;
  tone?: string | null;
  notes?: string | null;
  /** What to carry from the event (Compose "Include"); all on when omitted. */
  include?: Partial<CommsHubInclude>;
}

export const DEFAULT_INCLUDE: CommsHubInclude = { thumbnail: true, join_link: true, registration_link: true };

export interface Recommendation { channel: CommsHubChannel; target_type: 'cohort_feed' | 'in_app_audience' | 'event_registrants'; target_id: string; label: string; reason: string }

async function eventOr404(id: string, t?: Transaction): Promise<CommsHubEvent> {
  const e = await CommsHubEvent.findByPk(id, { transaction: t });
  if (!e) throw new MessageRuleError('That event was not found.', 404, 'not_found');
  return e;
}

async function askModel(input: DraftPromptInput): Promise<DraftReply> {
  const withWhatsApp = whatsappDraftsOn();
  const result = await callLLMWithAudit({
    lessonId: COMMS_HUB_LLM_NAMESPACE,
    generationType: 'admin_structure',
    step: 'comms_hub_message_draft',
    systemPrompt: messageDraftSystem(withWhatsApp),
    userPrompt: messageDraftUserPrompt(input),
    model: DRAFT_MODEL,
    temperature: 0.6,
    maxTokens: withWhatsApp ? 900 : 600,
    responseFormat: { type: 'json_object' },
    // Every Generate / Shorter / Warmer is asked for a NEW draft; a cached answer would repeat the last one.
    force: true,
  });
  let parsed: unknown;
  try { parsed = JSON.parse(result.content); } catch { throw new DraftModelError('The AI reply was not readable. Try again.'); }
  const r = (withWhatsApp ? ReplyWithWhatsApp : Reply).safeParse(parsed);
  if (!r.success) throw new DraftModelError('The AI reply was missing a channel. Try again.');
  // With WhatsApp off, a stray whatsapp field from the model is dropped, never written.
  return withWhatsApp ? r.data : { ...r.data, whatsapp: undefined };
}

function promptAbout(e: CommsHubEvent | null, subject: string | null, include: CommsHubInclude = DEFAULT_INCLUDE): DraftPromptInput['about'] {
  if (e) {
    // A link is offered to the model only when the event has it AND the organizer chose to include it.
    return { event: { title: e.title, type: TYPE_WORDS[e.event_type], description: e.description, hasJoinLink: !!e.join_url && include.join_link, hasRegistrationLink: !!e.registration_url && include.registration_link, hasHosts: (e.hosts ?? []).length > 0 } };
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
  if (!reply.whatsapp) return [post, inApp];
  const wa = await CommsHubDraft.create({ message_id: messageId, channel: 'whatsapp', version: await nextVersion(messageId, 'whatsapp', t), title: null, body: fillFacts(reply.whatsapp.body, facts), author, instruction }, { transaction: t });
  return [post, inApp, wa];
}

/** The facts for a message's event and occurrence, or null for a subject-only message. */
export async function messageFacts(m: CommsHubMessage, t?: Transaction, now: Date = new Date()): Promise<DraftFacts | null> {
  if (!m.event_id) return null;
  return factsFor(await eventOr404(m.event_id, t), m.occurrence_starts_at, now, replayLink());
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
  // CH9.6: an Eventbrite event managed in the hub also reaches the people who registered for it. Someone
  // both registered and a member is notified once (the connector skips anyone this message already reached).
  const registrants: Recommendation[] = e?.ccpp_event_id
    ? [{ channel: 'in_app', target_type: 'event_registrants', target_id: e.id, label: `Registrants of ${e.title} (in-app)`, reason: 'These people registered for this event on Eventbrite or our site.' }]
    : [];
  return [...feeds, ...inApp, ...registrants];
}

/** Start a message from an event or a subject, with AI drafts (version 1) and the recommended recipients. */
export async function createDraftMessage(input: MessageInput, actor: Actor, now: Date = new Date()): Promise<{ message: CommsHubMessage; drafts: CommsHubDraft[]; recommended: Recommendation[] }> {
  const subject = input.subject?.trim() || null;
  if (!input.eventId && !subject) throw new MessageRuleError('Start from an event or write what the message is about.', 400, 'no_subject');
  const event = input.eventId ? await eventOr404(input.eventId) : null;
  const include: CommsHubInclude = { ...DEFAULT_INCLUDE, ...(input.include ?? {}) };
  const reply = await askModel({ about: promptAbout(event, subject, include), kind: input.kind, tone: input.tone ?? null, notes: input.notes ?? null });
  const { message, drafts } = await sequelize.transaction(async (t) => {
    const m = await CommsHubMessage.create({ event_id: event?.id ?? null, subject, kind: input.kind, tone: input.tone ?? null, notes: input.notes ?? null, include, status: 'draft', created_by: actor.id, updated_by: actor.id }, { transaction: t });
    const facts = event ? factsFor(event, null, now, replayLink()) : null;
    const d = await writeDrafts(m.id, reply, facts, 'ai', null, t);
    await logActivity(actor, 'message.drafted', 'message', m.id, { event_id: event?.id ?? null, kind: input.kind }, t);
    return { message: m, drafts: d };
  });
  return { message, drafts, recommended: await recommendDestinations(event) };
}

/**
 * One promotion-plan message (CH6.4) for one occurrence: drafted by the model with the facts of THAT
 * occurrence, sent to the recommended recipients, at the plan's send time, and created in
 * needs_approval (never approved automatically; the approve gate still validates it). Idempotent by
 * event + kind + occurrence: an existing one is returned untouched, and a lost race converges on the
 * row that won (the unique index decides).
 */
export async function createPlanMessage(
  event: CommsHubEvent, plan: { kind: CommsHubPlanKind; occurrence: Date; sendAt: Date }, actor: Actor, now: Date = new Date(),
  /** A reply already drafted for this kind (the prose is the same for every date; facts are filled per occurrence). */
  reuse?: DraftReply,
): Promise<{ message: CommsHubMessage; created: boolean; reply?: DraftReply }> {
  // A cancelled message (the row was unticked) is history: it does not count, so ticking again drafts a new one.
  const where = { event_id: event.id, plan_kind: plan.kind, occurrence_starts_at: plan.occurrence, status: { [Op.ne]: 'cancelled' as const } };
  const existing = await CommsHubMessage.findOne({ where });
  if (existing) return { message: existing, created: false };
  const reply = reuse ?? await askModel({ about: promptAbout(event, null), kind: plan.kind, tone: null, notes: null });
  const recommended = await recommendDestinations(event);
  try {
    return await sequelize.transaction(async (t) => {
      const m = await CommsHubMessage.create({
        event_id: event.id, occurrence_starts_at: plan.occurrence, plan_kind: plan.kind, kind: plan.kind, status: 'needs_approval',
        send_at: plan.sendAt, created_by: actor.id, updated_by: actor.id,
      }, { transaction: t });
      await writeDrafts(m.id, reply, factsFor(event, plan.occurrence, now, replayLink()), 'ai', null, t);
      for (const r of recommended) {
        await CommsHubDestination.create({ message_id: m.id, channel: r.channel, target_type: r.target_type, target_id: r.target_id, label: r.label }, { transaction: t });
      }
      await logActivity(actor, 'message.planned', 'message', m.id, { event_id: event.id, plan_kind: plan.kind, occurrence: plan.occurrence.toISOString() }, t);
      return { message: m, created: true, reply };
    });
  } catch (err) {
    if ((err as { name?: string })?.name !== 'SequelizeUniqueConstraintError') throw err;
    const won = await CommsHubMessage.findOne({ where });
    if (!won) throw err;
    return { message: won, created: false };
  }
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
  const [post, inApp, wa] = await Promise.all([latest(m.id, 'community_post'), latest(m.id, 'in_app'), latest(m.id, 'whatsapp')]);
  const reply = await askModel({
    about: promptAbout(event, m.subject, { ...DEFAULT_INCLUDE, ...(m.include ?? {}) }), kind: m.kind, tone: m.tone, notes: m.notes,
    revise: { instruction, previous: { community_post: post?.body, in_app_title: inApp?.title ?? undefined, in_app_body: inApp?.body, ...(wa ? { whatsapp: wa.body } : {}) } },
  });
  return sequelize.transaction(async (t) => {
    // Re-checked under the row lock: the model call takes seconds, and the message may have started sending meanwhile.
    const fresh = await CommsHubMessage.findByPk(m.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!fresh || fresh.status === 'sending' || fresh.status === 'sent' || fresh.status === 'cancelled') throw new MessageRuleError(`A ${fresh?.status ?? 'missing'} message cannot be redrafted.`, 409, 'locked');
    const d = await writeDrafts(m.id, reply, event ? factsFor(event, m.occurrence_starts_at, now, replayLink()) : null, 'ai', instruction, t);
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
