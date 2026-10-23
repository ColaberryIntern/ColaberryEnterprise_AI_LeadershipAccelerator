import type { NextLiveSession, OpenHouseView } from '../../../services/onboardingApi';
import type { PlanStop } from '../campusPlan';
import type { WallFacts } from './RoomWalls';

/**
 * What each back wall says (WP-5), built from real data, pure so every line is tested:
 *  - the Schedule board: the next live session ("18:30 Build Day  ON TIME", "LIVE" while live, a date when not today), the next
 *    event ("OCT 29 Open House  RSVP"), then today's plan steps (TO DO / DONE);
 *  - the Classroom screen: "Session 5 · Build Day"; the Events Hall banner: "OPEN HOUSE · OCT 29";
 *  - the sprint wall: your active build's tasks by status, YOU on the one in progress;
 *  - the gallery screens: up to three showcase titles; the arcade: your best this week per game.
 * Days are Central time, as the portal's.
 */
const TZ = 'America/Chicago';
const monDay = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(d).toUpperCase();
const centralDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function weekdayOf(now: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(now).toUpperCase();
}

export function scheduleRows(o: { session?: NextLiveSession | null; event?: OpenHouseView | null; stops?: PlanStop[] | null; now: Date }): NonNullable<WallFacts['schedule']> {
  const rows: NonNullable<WallFacts['schedule']> = [];
  const s = o.session;
  // a session dated before today (stale data) is not "ON TIME": the board leaves it off rather than say something untrue
  if (s && (s.status === 'live' || s.session_date >= centralDate(o.now))) {
    const today = s.session_date === centralDate(o.now);
    const when = today ? (s.start_time || '').slice(0, 5) : monDay(new Date(`${s.session_date}T12:00:00`));
    rows.push({ time: when, title: s.title || 'Live session', status: s.status === 'live' ? 'LIVE' : 'ON TIME' });
  }
  const e = o.event;
  if (e && new Date(e.starts_at).getTime() >= o.now.getTime()) rows.push({ time: monDay(new Date(e.starts_at)), title: e.title, status: e.registration_url ? 'RSVP' : 'OPEN' });
  for (const st of (o.stops ?? []).slice(0, 4 - rows.length)) rows.push({ time: 'PLAN', title: st.title, status: st.done ? 'DONE' : 'TO DO' });
  return rows.slice(0, 4);
}

export function classroomLine(s?: NextLiveSession | null): string | null {
  if (!s || !s.title) return null;
  return s.session_number ? `Session ${s.session_number} · ${s.title}` : s.title;
}

export function eventBanner(e: OpenHouseView | null | undefined, now: Date): string | null {
  if (!e || new Date(e.starts_at).getTime() < now.getTime()) return null;
  return `${e.title} · ${monDay(new Date(e.starts_at))}`;
}

/** The backend's project tree (GET /api/portal/projects/active): only the fields the wall reads. */
export interface ProjectTreeLite { name: string | null; lists: { tasks: { id: string; story_id: string | null; title: string; status: string }[] }[] }
const COL_OF: Record<string, string> = { not_started: 'BACKLOG', in_progress: 'IN PROGRESS', blocked: 'BLOCKED', complete: 'SHIPPED' };

export function sprintOf(tree: ProjectTreeLite | null | undefined, mine: boolean): WallFacts['sprint'] {
  if (!tree || !Array.isArray(tree.lists)) return null;
  const tasks = tree.lists.flatMap((l) => (Array.isArray(l.tasks) ? l.tasks : []));
  if (!tasks.length) return null;
  const current = tasks.find((t) => t.status === 'in_progress');
  const cols = ['BACKLOG', 'IN PROGRESS', 'BLOCKED', 'SHIPPED'].map((title) => ({
    title, tasks: tasks.filter((t) => COL_OF[t.status] === title).map((t) => ({ id: t.story_id || t.id.slice(0, 8), title: t.title, you: mine && t === current })),
  }));
  return { name: tree.name || 'Your build', cols };
}
