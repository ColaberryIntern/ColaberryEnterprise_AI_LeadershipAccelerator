import type { OpenHouseView } from '../../../services/onboardingApi';
import type { BuildingId } from '../campusMap';
import { EVENTS_BUILDING, ROOM_BUILDING } from '../campusRoomKind';
import { upcoming } from './eventsModel';
import type { WeeklyOccurrence } from './weekdaySessions';

/**
 * Five minutes before (Basecamp C64, Ali 2026-10-26): "use our alerts system to direct the interns specifically 5 minutes before the
 * monday call and to all members 5 minutes before any event." Pure: which alerts are due now, and what they say. The campus shows
 * each once (the cheer toast with Walk there), while the portal is open in a tab; there is no push or email here (none exists for
 * events; see the C64 ticket's notes).
 *
 *  - every member: each upcoming event (Eventbrite is the record) and each weekly session open to members;
 *  - an intern, also: the Monday interns-only call (the server sends it to interns only, so it is here only for them).
 */
export const LEAD_MS = 5 * 60_000;

export interface AlertItem { key: string; title: string; startIso: string; building: BuildingId; internsOnly: boolean }

export function alertItems(events: OpenHouseView[], weekly: WeeklyOccurrence[], now: Date): AlertItem[] {
  const out: AlertItem[] = upcoming(events, now).map((e) => ({ key: `event-${e.id}-${e.starts_at}`, title: e.title, startIso: e.starts_at, building: EVENTS_BUILDING, internsOnly: false }));
  for (const o of weekly) out.push({ key: o.key, title: o.session.title, startIso: o.startIso, building: ROOM_BUILDING.session, internsOnly: o.session.audience === 'interns_only' });
  return out;
}

/** The alerts to show now: starting within the next five minutes (not already started), and not shown before. */
export function dueAlerts(items: AlertItem[], now: number, shown: ReadonlySet<string>): AlertItem[] {
  return items.filter((i) => {
    const left = new Date(i.startIso).getTime() - now;
    return left > 0 && left <= LEAD_MS && !shown.has(i.key);
  });
}

/** "Intern standup starts in 5 minutes" / "Open House starts in 1 minute"; the detail says where. */
export function alertCopy(i: AlertItem, now: number, place: string): { big: string; title: string; detail: string } {
  const min = Math.max(1, Math.ceil((new Date(i.startIso).getTime() - now) / 60_000));
  return {
    big: i.internsOnly ? '🗓' : '⏰',
    title: `${i.title} starts in ${min} ${min === 1 ? 'minute' : 'minutes'}`,
    detail: i.internsOnly ? `Interns only · ${place}` : place,
  };
}

/** Shown alerts, remembered for a day in this browser (so two tabs, or a reload, do not alert twice). Storage failure: this visit only. */
const SHOWN_KEY = 'cm-alerts-shown';
const KEEP_MS = 86_400_000;
export function readShown(now: number): Set<string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SHOWN_KEY) || '{}') as Record<string, number>;
    return new Set(Object.entries(raw).filter(([, at]) => typeof at === 'number' && now - at < KEEP_MS).map(([k]) => k));
  } catch { return new Set(); }
}
export function markShown(keys: string[], now: number): void {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SHOWN_KEY) || '{}') as Record<string, number>;
    const kept = Object.fromEntries(Object.entries(raw).filter(([, at]) => typeof at === 'number' && now - at < KEEP_MS));
    for (const k of keys) kept[k] = now;
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify(kept));
  } catch { /* private window: the in-memory set still stops a repeat this visit */ }
}
