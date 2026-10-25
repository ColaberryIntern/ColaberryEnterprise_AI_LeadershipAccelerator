import type { OpenHouseView, FirstClassView, PointsEvent } from '../../../services/onboardingApi';
import { fmtCentralTime, centralParts } from '../today/shellUtils';

/**
 * The Schedule's pure parts, lifted out of SchedulePage when it passed the 500-line ceiling (Campus C27). Cohort class sessions
 * (`/api/portal/sessions`), the program's public events (`/api/portal/events`, CCPP / Eventbrite) and, with the campus on, today's
 * plan, on one timeline. Per the repo date-helper rule, no `new Date()` runs at module top level.
 *
 * C27 (v6 D5): each public event carries its feed row, so the calendar can show one-tap "Sign up" (Eventbrite, the record) or
 * "✓ You're going" (is_registered) on it; today's plan items join the week view in teal.
 */
export type SessionItem = {
  id: string;
  session_number: number;
  title: string;
  session_date: string;   // YYYY-MM-DD
  start_time: string | null;
  status: string;         // scheduled | live | completed | cancelled
  session_type: string;
  room_id?: string | null; // linked Colaberry Commons room, when one exists
};

export type EvKind = 'class' | 'event' | 'plan'; // class = cohort session, event = public event, plan = today's plan item
export type EvState = 'done' | 'live' | 'up';
export type SchedEvent = {
  id: string;
  kind: EvKind;
  title: string;
  time: string;   // display time ('' if none)
  hour: number;   // 0..23 for time-grid slotting, -1 if unknown
  state: EvState;
  href?: string;
  external?: boolean;
  sub: string;    // session_type or 'Open House'
  /** This learner has registered on Eventbrite (public events only). */
  registered?: boolean;
  /** C27: the event's feed row, for its Sign up / You're going button. */
  event?: OpenHouseView;
};
export type SchedMap = Record<string, SchedEvent[]>;
export type Mode = 'month' | 'week' | 'agenda';

/** A plan step as the calendar needs it (campusPlan's PlanStop has more). */
export interface PlanItem { key: string; title: string; route: string; done: boolean; label: string; minutes: number | null }

export const DAY_MS = 7 * 864e5;
export const dkey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export const mondayOf = (d: Date): Date => { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return x; };

/** Parse a DATEONLY 'YYYY-MM-DD' as a LOCAL date (avoids a UTC off-by-one). */
export function parseYmd(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** '13:00[:00]' or a Date -> '1:00 PM'. */
export function fmtTime(t: string | null | undefined, from?: Date): string {
  let h: number, min: number;
  if (from) { h = from.getHours(); min = from.getMinutes(); }
  else if (t && /^\d{1,2}:\d{2}/.test(t)) { const [hh, mm] = t.split(':'); h = Number(hh); min = Number(mm); }
  else return '';
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
}
export function hourOf(t: string | null | undefined, from?: Date): number {
  if (from) return from.getHours();
  if (t && /^\d{1,2}:/.test(t)) return Number(t.split(':')[0]);
  return -1;
}

const KIND_CLASS: Record<EvKind, string> = { class: 'learning', event: 'event', plan: 'plan' };

/**
 * Colour token for one calendar item (pure). A public event the learner has registered for gets its own `registered` treatment
 * (leaf) so their own commitments stand out from the ~46 events everyone can see; everything else falls back to its kind.
 */
export function itemClass(ev: { kind: EvKind; registered?: boolean }): string {
  return ev.registered ? 'registered' : KIND_CLASS[ev.kind];
}

/** A human label for a points-ledger event, from its type/metadata. */
export function labelForPointsEvent(e: PointsEvent): string {
  const OVERRIDES: Record<string, string> = {
    open_house_rsvp: 'Open House RSVP', daily_streak: 'Daily streak', profile_complete: 'Profile completed', background_added: 'Background added',
    first_login: 'First login', card_complete: 'Lesson completed', lesson_complete: 'Lesson completed',
  };
  if (OVERRIDES[e.event_type]) return OVERRIDES[e.event_type];
  const t = (e.event_type || 'Points').replace(/[_:]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function stateForSession(status: string, day: Date, today: Date): EvState {
  if (status === 'completed') return 'done';
  if (status === 'live') return 'live';
  return day.getTime() < today.getTime() ? 'done' : 'up';
}

export function buildSchedule(sessions: SessionItem[], events: OpenHouseView[], firstClass: FirstClassView | null, today: Date, plan: PlanItem[] = []): SchedMap {
  const sched: SchedMap = {};
  const add = (d: Date, ev: SchedEvent): void => { const k = dkey(d); (sched[k] = sched[k] || []).push(ev); };

  for (const s of sessions) {
    if (s.status === 'cancelled') continue;
    const d = parseYmd(s.session_date);
    if (!d) continue;
    add(d, {
      id: s.id, kind: 'class', title: `#${s.session_number} · ${s.title}`,
      time: fmtTime(s.start_time), hour: hourOf(s.start_time),
      state: stateForSession(s.status, d, today),
      // Sessions link into their Colaberry Commons room, not the retired /portal/sessions/:id detail page. A session only has a
      // room once Community Rooms has provisioned one for it (ensureRoomForSession); until then the item is plain text.
      href: s.room_id ? `/portal/rooms/${s.room_id}` : undefined,
      sub: (s.session_type || 'session').replace(/_/g, ' '),
    });
  }
  for (const e of events) {
    // Bucket + label events in Central time (program-canonical), regardless of viewer tz.
    const cp = centralParts(e.starts_at);
    if (!cp) continue;
    add(new Date(cp.y, cp.mo, cp.d), {
      id: e.id, kind: 'event', title: e.title,
      time: fmtCentralTime(e.starts_at), hour: cp.h, state: 'up',
      // Registered events read as "Registered" rather than the generic kind, so a learner can pick their own commitments out of
      // a busy month at a glance.
      sub: e.is_registered ? 'Registered' : (/open house/i.test(e.title) ? 'Open House' : 'Event'),
      registered: e.is_registered,
      event: e,
    });
  }
  // C27: today's plan items, in teal, on today (the campus's plan; nothing when the campus is off).
  plan.forEach((p, i) => add(today, {
    id: `plan-${p.key}`, kind: 'plan', title: p.title, time: p.minutes ? `${p.minutes} min` : '', hour: 9 + i * 0.01,
    state: p.done ? 'done' : 'up', href: p.route, sub: p.label || 'Today’s plan',
  }));
  // Cohort kickoff: the countdown's "next class". Surface it on the calendar even when no per-session rows exist yet, so the
  // class-start day is visible.
  if (firstClass?.start_date) {
    const d = parseYmd(firstClass.start_date);
    if (d) {
      const hasClass = (sched[dkey(d)] || []).some((e) => e.kind === 'class');
      if (!hasClass) {
        add(d, {
          id: 'class-start', kind: 'class', title: `Class starts · ${firstClass.cohort_name || 'Your cohort'}`, time: '', hour: -1,
          state: d.getTime() < today.getTime() ? 'done' : 'up', sub: 'Cohort kickoff',
        });
      }
    }
  }
  Object.keys(sched).forEach((k) => sched[k].sort((a, b) => (a.hour - b.hour) || a.title.localeCompare(b.title)));
  return sched;
}

export const slotForHour = (h: number): number => (h < 10 ? 0 : h < 13 ? 1 : h < 16 ? 2 : 3);
export const TG_SLOTS = ['Morning', 'Midday', 'Afternoon', 'Evening'];
