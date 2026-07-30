// Shared helpers for the portal Design-E shell (topbar countdowns, participant
// identity, daily streak). Extracted so PortalShell and the individual pages
// (Today / Path / Schedule) can all use them without a circular import.
import { OnboardingSchedule } from '../../../services/onboardingApi';
import { getParticipantToken } from '../../../utils/participantToken';

// ── Central Time (CST/CDT) formatting. Program times are canonical Central, so
// every viewer sees the same time regardless of their own timezone. ──
export const CENTRAL_TZ = 'America/Chicago';

function toDate(v: string | Date): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** e.g. "Jul 16, 6:30 PM CDT" */
export function fmtCentralDateTime(v: string | Date): string {
  const d = toDate(v);
  return d ? new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d) : '';
}

/** e.g. "6:30 PM CDT" */
export function fmtCentralTime(v: string | Date): string {
  const d = toDate(v);
  return d ? new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d) : '';
}

/** e.g. "Jul 16" (Central calendar date) */
export function fmtCentralDate(v: string | Date): string {
  const d = toDate(v);
  return d ? new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, month: 'short', day: 'numeric' }).format(d) : '';
}

/** The instant's calendar parts AS SEEN in Central — for bucketing on a Central-day calendar. */
export function centralParts(v: string | Date): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const d = toDate(v);
  if (!d) return null;
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL_TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let h = Number(parts.hour); if (h === 24) h = 0;
  return { y: Number(parts.year), mo: Number(parts.month) - 1, d: Number(parts.day), h, mi: Number(parts.minute) };
}

export function readParticipant(): { email: string; initials: string } {
  try {
    const t = getParticipantToken();
    if (!t) return { email: '', initials: 'YOU' };
    const p = JSON.parse(atob(t.split('.')[1] || ''));
    const email: string = p.email || '';
    const initials = (email.split('@')[0] || 'you').slice(0, 2).toUpperCase();
    return { email, initials };
  } catch { return { email: '', initials: 'YOU' }; }
}

export function firstClassTargetMs(fc: OnboardingSchedule['first_class']): number | null {
  if (!fc || !fc.start_date) return null;
  const t = new Date(`${fc.start_date}T00:00:00`).getTime();
  return isNaN(t) ? null : t;
}

export function countdown(targetMs: number | null, nowMs: number): { d: number; h: number; m: number; s: number } | null {
  if (targetMs == null) return null;
  let diff = targetMs - nowMs;
  if (diff < 0) diff = 0;
  return {
    d: Math.floor(diff / 864e5),
    h: Math.floor((diff % 864e5) / 36e5),
    m: Math.floor((diff % 36e5) / 6e4),
    s: Math.floor((diff % 6e4) / 1e3),
  };
}

// The daily streak is now server-authoritative (see backend streakService +
// `/api/portal/streak`). The old localStorage streak helpers were removed —
// TodayShell reads `fetchStreak()` / `claimDailyStreak()` from onboardingApi.
