import type { MySession, OpenHouseView } from '../../../services/onboardingApi';
import type { BuildingId } from '../campusMap';
import { ROOM_BUILDING } from '../campusRoomKind';
import { centralSlotIso } from '../hallway/hallwayModel';
import { upcoming, EVENTS_TZ } from './eventsModel';
import type { WeeklyOccurrence } from './weekdaySessions';

/**
 * Everything with a time, in one list (C33, v7 R6): your cohort's classes 🎓 (the sessions API), the program's events 🎪 (C27,
 * Eventbrite is the record) and the meeting rooms you booked or are going to 🚪 (C29's hallway bookings), sorted by start. Each item
 * knows its building by the one room rule (C28): classes the Classroom, events and sessions the Meeting Rooms (C62). Pure.
 *
 * C63: the weekly sessions 🗓 (the internship cohort's Mon interns-only call and Tue / Wed / Fri public sessions, as the server sends
 * them to this account) are in the Meeting Rooms too. For an intern they are classes (required: on their Coming up); for a member
 * they are open sessions (on the Schedule, not pushed onto their Coming up).
 */
export type AgendaKind = 'class' | 'event' | 'session' | 'weekly';
export const KIND_ICON: Record<AgendaKind, string> = { class: '🎓', event: '🎪', session: '🚪', weekly: '🗓' };
export interface AgendaItem {
  kind: AgendaKind; id: string; title: string; startIso: string; building: BuildingId; event?: OpenHouseView; live?: boolean;
  /** C63 weekly: on your calendar (an intern's sessions), and whether it is the interns-only call. */
  required?: boolean; internsOnly?: boolean;
}
export interface AgendaBooking { booking_id: string; room_id: string; title: string; start_at: string }

/** A class's start instant from its Central calendar date and "HH:MM[:SS]" (or "6:30 PM") start time; null when unreadable. */
export function classStartIso(s: Pick<MySession, 'session_date' | 'start_time'>): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec((s.start_time || '').trim());
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(s.session_date)) return null;
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (/pm/i.test(m[3]) ? 12 : 0);
  return centralSlotIso(s.session_date, `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`);
}

export interface AgendaInput { sessions: MySession[]; events: OpenHouseView[]; bookings: AgendaBooking[]; now: Date; weekly?: { intern: boolean; occurrences: WeeklyOccurrence[] } }

/** Every upcoming item (a live class counts), soonest first. */
export function agenda({ sessions, events, bookings, now, weekly }: AgendaInput): AgendaItem[] {
  const since = now.getTime() - 3 * 3600_000; // a class that started within three hours may still be on
  const out: AgendaItem[] = [];
  for (const s of sessions) {
    if (s.status !== 'scheduled' && s.status !== 'live') continue;
    const iso = classStartIso(s);
    if (!iso || (s.status !== 'live' && new Date(iso).getTime() < since)) continue;
    out.push({ kind: 'class', id: `class-${s.id}`, title: `Week ${s.session_number} · ${s.title}`, startIso: iso, building: ROOM_BUILDING.class, live: s.status === 'live' });
  }
  for (const e of upcoming(events, now)) out.push({ kind: 'event', id: `event-${e.id}`, title: e.title, startIso: e.starts_at, building: ROOM_BUILDING.event, event: e });
  for (const b of bookings) {
    if (new Date(b.start_at).getTime() < since) continue;
    out.push({ kind: 'session', id: `session-${b.booking_id}`, title: b.title, startIso: b.start_at, building: ROOM_BUILDING.session });
  }
  for (const o of weekly?.occurrences ?? []) {
    out.push({ kind: 'weekly', id: o.key, title: o.session.title, startIso: o.startIso, building: ROOM_BUILDING.session,
      required: weekly!.intern, internsOnly: o.session.audience === 'interns_only' });
  }
  return out.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

/** COMING UP: what is on YOUR calendar in the next seven days: classes, events you signed up for, sessions you booked, and (C63) an
 *  intern's weekly sessions. */
export function comingUp(input: AgendaInput, limit = 4): AgendaItem[] {
  return comingUpOf(agenda(input), input.now, limit);
}
export function comingUpOf(items: AgendaItem[], now: Date, limit = 4): AgendaItem[] {
  const until = now.getTime() + 7 * 86_400_000;
  const mine = (i: AgendaItem) => (i.kind === 'event' ? !!i.event?.is_registered : i.kind === 'weekly' ? !!i.required : true);
  return items.filter((i) => mine(i) && new Date(i.startIso).getTime() <= until).slice(0, limit);
}

/** "Tue Oct 27 · 6:30 PM" in Central. */
export function agendaWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { timeZone: EVENTS_TZ, weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')} · ${d.toLocaleTimeString('en-US', { timeZone: EVENTS_TZ, hour: 'numeric', minute: '2-digit' })}`;
}
