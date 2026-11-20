import { Op } from 'sequelize';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage, { type CommsHubMessageStatus, type CommsHubPlanKind } from '../../../models/CommsHubMessage';
import { CENTRAL_TZ, centralDateKey } from '../../centralDate';
import { centralClock, expandOccurrences } from '../eventRecurrence';
import { OPEN_ENDED_MS } from '../portalHubEvents';
import { logActivity, type Actor } from '../activityLog';
import { cancelMessage, MessageRuleError } from './approvals';
import { createPlanMessage } from './drafting';

/**
 * The promotion plan on an event (CH6.4, design 02). Four rows the organizer ticks; each ticked row
 * becomes, per occurrence, ONE message in needs_approval with AI drafts and the recommended
 * recipients, at a send time computed on the Central calendar (so daylight saving is handled):
 *   announcement      4 days before, 12:00 PM
 *   reminder          the day before, at the event's own start time
 *   starting_soon     1 hour before the start
 *   recording_thanks  the day after it ends, 10:00 AM, created only once the occurrence has ended
 * A series gets its messages per occurrence as each comes within PLAN_WINDOW_DAYS (the hub's worker
 * calls ensurePlansForUpcoming each tick, CH7.2). Nothing is ever approved automatically. Re-ticking
 * cannot duplicate: one message per event + kind + occurrence (unique index, CH6.1).
 */
export const PLAN_KINDS: readonly CommsHubPlanKind[] = ['announcement', 'reminder', 'starting_soon', 'recording_thanks'];
export const PLAN_WINDOW_DAYS = 14;
/** How long after an occurrence a "Recording and thanks" may still be created. */
export const THANKS_WINDOW_DAYS = 3;

export const PLAN_LABEL: Record<CommsHubPlanKind, { label: string; timing: string; channels: string }> = {
  announcement: { label: 'Announcement', timing: '4 days before, 12:00 PM', channels: 'Community feed, in-app notification' },
  reminder: { label: 'Reminder', timing: '1 day before, at the start time', channels: 'Community feed, in-app notification' },
  starting_soon: { label: 'Starting in 1 hour', timing: 'Day of, 1 hour before', channels: 'Community feed, in-app notification' },
  recording_thanks: { label: 'Recording and thanks', timing: 'Day after, 10:00 AM', channels: 'Community feed, in-app notification' },
};

/** A Central calendar date shifted by whole days ("2026-12-01" + -4). Pure date arithmetic, no clock. */
function shiftDate(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
/** Minutes Central is behind UTC at this instant (300 in CDT, 360 in CST). */
function centralOffsetMinutes(at: number): number {
  const p = Object.fromEntries(offsetFmt.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
  return Math.round((at - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)) / 60_000);
}
/**
 * The instant a Central wall clock names. Two passes, so the offset is the one in force AT the target
 * (a single pass uses the offset of a guess that can sit on the other side of a change: an early-morning
 * time the day after a change came out an hour off). A wall time that does not exist (the skipped
 * 2:00-2:59 AM hour in spring) resolves to the hour BEFORE (2:30 AM on the change day becomes 1:30 AM
 * CST); it only affects the reminder for an event at 2:00-2:59 AM on the Monday after the spring change.
 */
export function atCentral(dateKey: string, hhmm: string): Date {
  const naive = Date.parse(`${dateKey}T${hhmm}:00Z`);
  let guess = naive + centralOffsetMinutes(naive) * 60_000;
  guess = naive + centralOffsetMinutes(guess) * 60_000;
  return new Date(guess);
}

/** When a plan row's message for this occurrence goes out. */
export function sendTimeFor(kind: CommsHubPlanKind, startsAt: Date, endsAt: Date | null): Date {
  const day = centralDateKey(startsAt.getTime());
  switch (kind) {
    case 'announcement': return atCentral(shiftDate(day, -4), '12:00');
    case 'reminder': return atCentral(shiftDate(day, -1), centralClock(startsAt));
    case 'starting_soon': return new Date(startsAt.getTime() - 3_600_000);
    case 'recording_thanks': return atCentral(shiftDate(centralDateKey((endsAt ?? new Date(startsAt.getTime() + OPEN_ENDED_MS)).getTime()), 1), '10:00');
    default: throw new Error(`unknown plan kind ${String(kind)}`);
  }
}

export interface EnsureResult { created: number; existing: number; skipped: Array<{ kind: CommsHubPlanKind; occurrence: string; reason: string }> }

/** Create every message the event's ticked rows need now (idempotent). */
export async function ensurePlan(event: CommsHubEvent, actor: Actor, now: Date = new Date()): Promise<EnsureResult> {
  const out: EnsureResult = { created: 0, existing: 0, skipped: [] };
  // An ended event (its stream is over: livePanel.syncEventStatus) still gets its Recording and thanks.
  if (event.status !== 'scheduled' && event.status !== 'live' && event.status !== 'ended') return out;
  const kinds = (event.promotion_plan ?? []).filter((k): k is CommsHubPlanKind => (PLAN_KINDS as string[]).includes(k))
    .filter((k) => event.status !== 'ended' || k === 'recording_thanks');
  const replies = new Map<CommsHubPlanKind, Awaited<ReturnType<typeof createPlanMessage>>['reply']>();
  const windowEnd = now.getTime() + PLAN_WINDOW_DAYS * 86_400_000;
  const occurrences = expandOccurrences(event.starts_at, event.ends_at, event.repeat_rule);
  for (const kind of kinds) {
    for (const o of occurrences) {
      const start = o.starts_at.getTime();
      const end = o.ends_at ? o.ends_at.getTime() : start + OPEN_ENDED_MS;
      const due = kind === 'recording_thanks'
        ? end <= now.getTime() && end >= now.getTime() - THANKS_WINDOW_DAYS * 86_400_000
        : start > now.getTime() && start <= windowEnd;
      if (!due) continue;
      let sendAt = sendTimeFor(kind, o.starts_at, o.ends_at);
      if (sendAt.getTime() <= now.getTime()) {
        // Late: the thanks goes out as soon as it can; an announcement still goes out soon while the event is
        // more than a day away (a short-notice event keeps its announcement); a reminder or a starting-soon
        // whose moment has passed is skipped, not sent late, and the organizer is told.
        const announceLate = kind === 'announcement' && start - now.getTime() > 86_400_000;
        if (kind !== 'recording_thanks' && !announceLate) { out.skipped.push({ kind, occurrence: o.starts_at.toISOString(), reason: 'its send time has already passed' }); continue; }
        sendAt = new Date(now.getTime() + 5 * 60_000);
      }
      // eslint-disable-next-line no-await-in-loop
      const r = await createPlanMessage(event, { kind, occurrence: o.starts_at, sendAt }, actor, now, replies.get(kind));
      if (r.reply && !replies.has(kind)) replies.set(kind, r.reply);
      if (r.created) out.created += 1; else out.existing += 1;
    }
  }
  return out;
}

const OPEN: CommsHubMessageStatus[] = ['draft', 'needs_approval'];

/**
 * Save which rows are ticked, then create what is needed. Unticking a row cancels that row's messages
 * that are not approved yet (an approved or sent one is left for the organizer to undo or cancel).
 */
export async function setPlan(eventId: string, kinds: CommsHubPlanKind[], actor: Actor, now: Date = new Date()): Promise<{ plan: PlanView; result: EnsureResult }> {
  const event = await CommsHubEvent.findByPk(eventId);
  if (!event) throw new MessageRuleError('That event was not found.', 404, 'not_found');
  if (event.status === 'cancelled' || event.status === 'draft') throw new MessageRuleError(`A ${event.status} event has no promotion plan.`, 409, 'event_closed');
  const ticked = PLAN_KINDS.filter((k) => kinds.includes(k));
  const unticked = PLAN_KINDS.filter((k) => !ticked.includes(k));
  await event.update({ promotion_plan: ticked });
  await logActivity(actor, 'event.plan_set', 'event', event.id, { ticked });
  if (unticked.length) {
    const stale = await CommsHubMessage.findAll({ where: { event_id: event.id, plan_kind: { [Op.in]: unticked }, status: { [Op.in]: OPEN } } });
    // eslint-disable-next-line no-await-in-loop
    for (const m of stale) await cancelMessage(m.id, actor, now);
  }
  const result = await ensurePlan(event, actor, now);
  return { plan: await readPlan(event.id, now), result };
}

export interface PlanRow {
  kind: CommsHubPlanKind; label: string; timing: string; channels: string; ticked: boolean;
  /** The row's message for the next occurrence it applies to, if one exists. */
  next: { message_id: string; status: CommsHubMessageStatus; send_at: string | null; occurrence: string } | null;
}
export interface PlanView { event_id: string; rows: PlanRow[] }

export async function readPlan(eventId: string, now: Date = new Date()): Promise<PlanView> {
  const event = await CommsHubEvent.findByPk(eventId);
  if (!event) throw new MessageRuleError('That event was not found.', 404, 'not_found');
  const messages = await CommsHubMessage.findAll({ where: { event_id: event.id, plan_kind: { [Op.ne]: null } }, order: [['occurrence_starts_at', 'ASC']] });
  const rows = PLAN_KINDS.map((kind): PlanRow => {
    const mine = messages.filter((m) => m.plan_kind === kind && m.status !== 'cancelled');
    const upcoming = kind === 'recording_thanks' ? [...mine].reverse() : mine.filter((m) => (m.occurrence_starts_at?.getTime() ?? 0) >= now.getTime() - OPEN_ENDED_MS);
    const m = upcoming[0] ?? null;
    return {
      kind, ...PLAN_LABEL[kind], ticked: (event.promotion_plan ?? []).includes(kind),
      next: m ? { message_id: m.id, status: m.status, send_at: m.send_at ? m.send_at.toISOString() : null, occurrence: m.occurrence_starts_at!.toISOString() } : null,
    };
  });
  return { event_id: event.id, rows };
}

/** The worker's hook (CH7.2): keep every event's plan current as occurrences come into the window or end. */
export async function ensurePlansForUpcoming(actor: Actor, now: Date = new Date()): Promise<number> {
  // Ended events too: their Recording and thanks becomes due after they end.
  const events = await CommsHubEvent.findAll({ where: { status: { [Op.in]: ['scheduled', 'live', 'ended'] } } });
  let created = 0;
  for (const e of events) {
    if (!(e.promotion_plan ?? []).length) continue;
    // eslint-disable-next-line no-await-in-loop
    created += (await ensurePlan(e, actor, now)).created;
  }
  return created;
}
