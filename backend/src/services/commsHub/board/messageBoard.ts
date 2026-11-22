import { Op, type WhereOptions } from 'sequelize';
import CommsHubActivity from '../../../models/CommsHubActivity';
import CommsHubDelivery from '../../../models/CommsHubDelivery';
import CommsHubDestination from '../../../models/CommsHubDestination';
import CommsHubDraft from '../../../models/CommsHubDraft';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage, { type CommsHubMessageStatus } from '../../../models/CommsHubMessage';
import { PLAN_LABEL } from '../messages/promotionPlan';
import { deliveryNotes, failureReason } from './failureReason';
import { KIND_LABEL, personLabel } from './labels';

/**
 * The read side of Today and Schedule & history (CH7.4): messages as rows a person can act on. Three
 * scopes, each a fixed set of statuses:
 * - approval: waiting for someone to approve, soonest first.
 * - schedule: everything that may still go out in the next 7 days, soonest first. A message with no
 *   send time goes out as soon as it is approved, so it is listed first ("On approval").
 * - history: everything that has finished (sent, partly sent, failed, cancelled), newest first.
 * Read-only: nothing here writes, so it is safe to call as often as the page likes.
 */
export type BoardScope = 'approval' | 'schedule' | 'history';
export const SCOPE_STATUSES: Record<BoardScope, CommsHubMessageStatus[]> = {
  approval: ['needs_approval'],
  schedule: ['draft', 'needs_approval', 'approved', 'scheduled', 'sending'],
  history: ['sent', 'partially_failed', 'failed', 'cancelled'],
};
const ON_APPROVAL: CommsHubMessageStatus[] = ['needs_approval', 'approved', 'sending'];
const WEEK_MS = 7 * 24 * 3600 * 1000;

export interface BoardFilter { scope: BoardScope; status?: string[] | null; channel?: 'community_post' | 'in_app' | 'whatsapp' | null; event_id?: string | null; limit?: number }

export interface BoardRow {
  id: string; status: CommsHubMessageStatus; kind: string; title: string;
  event: { id: string; title: string; thumbnail_id: string | null } | null;
  send_at: string | null; updated_at: string;
  destinations: Array<{ channel: 'community_post' | 'in_app' | 'whatsapp'; label: string | null }>;
  preview: string | null;
  include: { thumbnail: boolean; join_link: boolean; registration_link: boolean };
  approved_by: string | null;
  deliveries: { total: number; sent: number; failed: number; pending: number; cancelled: number };
  /** Plain words for a row that did not fully go out, and which recipients missed it. Never a raw provider error. */
  failure: { reason: string; missed: string[]; attempts: number } | null;
  /** CH10.4: plain words about WhatsApp waits, or a send an earlier try had already made. */
  notes: string[];
}

function windowWhere(scope: BoardScope, now: Date): WhereOptions {
  if (scope !== 'schedule') return {};
  const until = new Date(now.getTime() + WEEK_MS);
  return { [Op.or]: [{ send_at: { [Op.lte]: until } }, { send_at: { [Op.is]: null }, status: { [Op.in]: ON_APPROVAL } }] } as WhereOptions;
}

/** "Demo Tuesday: reminder, 1 day before", or the subject of a message with no event. Shared with the CH7.5 alerts. */
export function messageTitle(m: Pick<CommsHubMessage, 'plan_kind' | 'kind' | 'subject'>, ev: Pick<CommsHubEvent, 'title'> | null | undefined): string {
  const what = (m.plan_kind && PLAN_LABEL[m.plan_kind]?.label) || KIND_LABEL[m.kind] || 'Message';
  if (ev) return `${ev.title}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
  return m.subject?.trim() || what;
}

const preview = (body: string | undefined): string | null => {
  if (!body) return null;
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 180 ? `${flat.slice(0, 177).trimEnd()}...` : flat;
};

/** Who approved each message: the label on its latest approval activity (an approval row stores only the id). */
async function approverLabels(ids: string[]): Promise<Map<string, string>> {
  const rows = await CommsHubActivity.findAll({ where: { action: 'message.approved', entity_id: { [Op.in]: ids } }, order: [['created_at', 'ASC']] });
  const out = new Map<string, string>();
  for (const r of rows) if (r.entity_id && personLabel(r.actor_label)) out.set(r.entity_id, personLabel(r.actor_label)!);
  return out;
}

async function messagesFor(f: BoardFilter, now: Date): Promise<CommsHubMessage[]> {
  const allowed = SCOPE_STATUSES[f.scope];
  const status = f.status?.length ? allowed.filter((s) => f.status!.includes(s)) : allowed;
  if (!status.length) return [];
  let ids: string[] | null = null;
  if (f.channel) ids = (await CommsHubDestination.findAll({ where: { channel: f.channel }, attributes: ['message_id'] })).map((d) => d.message_id);
  const where: WhereOptions = { status: { [Op.in]: status }, ...windowWhere(f.scope, now), ...(f.event_id ? { event_id: f.event_id } : {}), ...(ids ? { id: { [Op.in]: ids } } : {}) };
  const order: Array<[string, string]> = f.scope === 'history' ? [['updated_at', 'DESC']] : [['send_at', 'ASC NULLS FIRST'], ['created_at', 'ASC']];
  return CommsHubMessage.findAll({ where, order, limit: Math.min(Math.max(f.limit ?? 50, 1), 200) });
}

export async function listBoard(f: BoardFilter, now: Date = new Date()): Promise<BoardRow[]> {
  const msgs = await messagesFor(f, now);
  if (!msgs.length) return [];
  const ids = msgs.map((m) => m.id);
  const eventIds = Array.from(new Set(msgs.map((m) => m.event_id).filter((x): x is string => !!x)));
  const [events, dests, drafts, deliveries, approvers] = await Promise.all([
    eventIds.length ? CommsHubEvent.findAll({ where: { id: { [Op.in]: eventIds } } }) : Promise.resolve([] as CommsHubEvent[]),
    CommsHubDestination.findAll({ where: { message_id: { [Op.in]: ids } }, order: [['created_at', 'ASC']] }),
    CommsHubDraft.findAll({ where: { message_id: { [Op.in]: ids } }, order: [['version', 'DESC']] }),
    CommsHubDelivery.findAll({ where: { message_id: { [Op.in]: ids } } }),
    approverLabels(ids),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const labelByDest = new Map(dests.map((d) => [d.id, d.label ?? d.target_id]));
  return msgs.map((m) => {
    const ev = m.event_id ? eventById.get(m.event_id) : undefined;
    const mine = deliveries.filter((d) => d.message_id === m.id);
    const latest = drafts.find((d) => d.message_id === m.id && d.channel === 'community_post') ?? drafts.find((d) => d.message_id === m.id);
    const count = (s: string): number => mine.filter((d) => d.status === s).length;
    const missed = mine.filter((d) => d.status === 'failed' || (d.status === 'cancelled' && m.status === 'partially_failed'));
    const showFailure = m.status === 'failed' || m.status === 'partially_failed' || m.status === 'cancelled';
    return {
      id: m.id, status: m.status, kind: m.kind, title: messageTitle(m, ev),
      event: ev ? { id: ev.id, title: ev.title, thumbnail_id: ev.thumbnail_id } : null,
      send_at: m.send_at ? m.send_at.toISOString() : null, updated_at: m.updated_at.toISOString(),
      destinations: dests.filter((d) => d.message_id === m.id).map((d) => ({ channel: d.channel, label: d.label })),
      preview: preview(latest?.body),
      include: { thumbnail: m.include?.thumbnail !== false, join_link: !!m.include?.join_link, registration_link: !!m.include?.registration_link },
      approved_by: approvers.get(m.id) ?? null,
      deliveries: { total: mine.length, sent: count('sent'), failed: count('failed'), pending: count('pending') + count('sending'), cancelled: count('cancelled') },
      failure: showFailure ? {
        reason: failureReason(m.status, mine.map((d) => d.error), ev?.status === 'cancelled'),
        missed: missed.map((d) => labelByDest.get(d.destination_id) ?? 'A recipient'),
        attempts: Math.max(0, ...mine.map((d) => d.attempt_count)),
      } : null,
      notes: deliveryNotes(mine),
    };
  });
}
