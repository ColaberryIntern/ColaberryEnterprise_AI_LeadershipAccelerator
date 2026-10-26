import type { MySession } from '../../../services/onboardingApi';
import { formatCentralSessionTime } from '../../../utils/sessionTime';

/**
 * The Classroom's class sessions (C32, v7 R5), pure: the next class (a live one first, else the soonest scheduled one from today
 * on) and the replays (completed sessions, newest first). Dates are the session's own Central calendar date; "Tonight" is a
 * session today starting at 5 PM or later. Nothing is invented: no sessions, no rows; a replay button only with a recording.
 */
export const TZ = 'America/Chicago';

export function centralToday(now: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const dayNumber = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86_400_000; };
const startHour = (t: string): number => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return 0; const h = Number(m[1]); return /pm/i.test(t) && h < 12 ? h + 12 : /am/i.test(t) && h === 12 ? 0 : h; };

/** The next class: live now, else the soonest scheduled session dated today or later. */
export function nextClass(list: MySession[], now: Date): MySession | null {
  const live = list.find((s) => s.status === 'live');
  if (live) return live;
  const today = centralToday(now);
  const ahead = list.filter((s) => s.status === 'scheduled' && s.session_date >= today);
  ahead.sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time));
  return ahead[0] ?? null;
}

/** Completed sessions, newest first. */
export const replaysOf = (list: MySession[]): MySession[] =>
  list.filter((s) => s.status === 'completed').sort((a, b) => b.session_date.localeCompare(a.session_date) || b.session_number - a.session_number);

/** "Tonight 6:30 PM CDT", "Today 10:00 AM CDT", "Tomorrow 6:30 PM CDT" or "Tue, Oct 27 · 6:30 PM CDT". */
export function classWhen(s: MySession, now: Date): string {
  const time = formatCentralSessionTime(s.start_time, s.session_date);
  const diff = dayNumber(s.session_date) - dayNumber(centralToday(now));
  if (diff === 0) return `${startHour(s.start_time) >= 17 ? 'Tonight' : 'Today'} ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  const [y, m, d] = s.session_date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 18)).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}

export const checkInRoute = (s: MySession): string => `/portal/class-checkin/${encodeURIComponent(s.id)}`;
export const liveRoute = (s: MySession): string => `/portal/live/${encodeURIComponent(s.id)}`;
