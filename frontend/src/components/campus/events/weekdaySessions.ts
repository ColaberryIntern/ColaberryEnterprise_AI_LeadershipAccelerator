import { useEffect, useState } from 'react';
import { fetchWeekdaySessions } from '../campusApi';
import type { WeekdaySessionsData, WeekdaySessionView } from '../campusApi';
import { previewingIntern, useAudienceSwitchState } from '../campusAudienceSwitch';
import { centralSlotIso } from '../hallway/hallwayModel';
import { EVENTS_TZ } from './eventsModel';

/**
 * The weekly sessions on the campus (Basecamp C63, Ali 2026-10-26: interns "have classes during the week. The sessions are open to
 * all members except the Monday call. That is for interns only."). The server sends only what this account may see (the Monday call
 * to an active intern alone); this file turns each weekly pattern ("Monday 9:00 AM") into its dated occurrences in Central time for
 * the agenda and the 5-minute alerts (C64). Pure apart from the hook at the bottom.
 */
export interface WeeklyOccurrence { session: WeekdaySessionView; startIso: string; key: string }

const DAY_MS = 86_400_000;
const STILL_ON_MS = 60 * 60_000; // a session that started within the hour may still be on
const centralDay = (ms: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: EVENTS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const centralWeekday = (ms: number): string => new Date(ms).toLocaleDateString('en-US', { timeZone: EVENTS_TZ, weekday: 'long' }).toLowerCase();

/** "9:00 AM" / "9 AM" / "10:30am" -> "9:00 AM" (centralSlotIso's form), or null when unreadable (never guessed). */
export function slotOf(time: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(time.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return null;
  return `${Number(m[1])}:${m[2] ?? '00'} ${m[3].toUpperCase()}`;
}

/** Every occurrence in the next `days` days (today included while still on), soonest first. */
export function occurrences(sessions: WeekdaySessionView[], now: number, days = 7): WeeklyOccurrence[] {
  const out: WeeklyOccurrence[] = [];
  for (let i = 0; i < days; i++) {
    const at = now + i * DAY_MS;
    const day = centralDay(at);
    const weekday = centralWeekday(at);
    for (const s of sessions) {
      const slot = slotOf(s.time);
      if (s.day !== weekday || !slot) continue;
      const startIso = centralSlotIso(day, slot);
      if (new Date(startIso).getTime() < now - STILL_ON_MS) continue;
      out.push({ session: s, startIso, key: `weekly-${s.day}-${slot}-${day}` });
    }
  }
  return out.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

const cache = new Map<string, Promise<WeekdaySessionsData>>();
/** Test seam. */
export function __resetWeekdaySessionsForTests(): void { cache.clear(); }

/** The weekly sessions for this account (null while loading; empty on failure, never invented). One request per page load per view. */
export function useWeekdaySessions(enabled: boolean): WeekdaySessionsData | null {
  const { audienceSwitch, viewAs } = useAudienceSwitchState();
  const preview = previewingIntern(audienceSwitch, viewAs);
  const [data, setData] = useState<WeekdaySessionsData | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const key = preview ? 'intern' : 'own';
    // inside the chain, so even a synchronous throw becomes "no sessions" rather than an uncaught error in an effect
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(() => fetchWeekdaySessions(preview)).catch(() => ({ intern: false, sessions: [] })));
    void cache.get(key)!.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [enabled, preview]);
  return enabled ? data : null;
}
