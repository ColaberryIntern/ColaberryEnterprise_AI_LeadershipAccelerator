/**
 * govTimeline — pure helpers that lay the dossier's detected meetings + key dates on ONE
 * chronological timeline with a "today" marker, so a reviewer sees at a glance which dates have
 * already passed (possibly missed) and which are coming up.
 *
 * Works at DATE granularity, which is exactly what "has it passed / is it soon" needs. The
 * timezone-of-a-stated-time question (a time with no zone) is left to the row renderer, which still
 * flags it; this module never invents a cutoff hour. No IO; deterministic; total — undated lines are
 * preserved, never dropped.
 */
import { toIsoDate } from '../govDeadline';

export interface DossierDateLike {
  date: string | null;
  time?: string | null;
  timezone?: string | null;
  text?: string | null;
  sourceDocument?: string | null;
}

export type TimelineState = 'past' | 'today' | 'upcoming';

export interface TimelineItem extends DossierDateLike {
  kind: 'meeting' | 'key_date';
  /** YYYY-MM-DD in the local calendar, or null when the date string could not be parsed. */
  iso: string | null;
  /** Position relative to todayIso. Undated items are 'upcoming' (not yet passed) but kept separate. */
  state: TimelineState;
  /** Signed whole days from today (negative past, 0 today, positive upcoming); null when undated. */
  daysFromToday: number | null;
}

export interface Timeline {
  /** Parseable dates, ascending. The "Today" marker sits after the first `pastCount` of these. */
  dated: TimelineItem[];
  /** Date missing/unparseable — preserved so nothing is silently lost, listed on their own. */
  undated: TimelineItem[];
  todayIso: string;
  /** How many dated items fall strictly before today (where the Today marker is inserted). */
  pastCount: number;
  /** Index in `dated` of the first item on or after today (the one "coming up"), or null if none. */
  nextUpcomingIndex: number | null;
}

/** Today's date as YYYY-MM-DD in the local calendar (date-only; no time of day). */
export function localTodayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Whole days between two YYYY-MM-DD dates (b - a), computed in UTC so DST never shifts the count. */
function daysBetweenIso(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function toItem(d: DossierDateLike, kind: 'meeting' | 'key_date', todayIso: string): TimelineItem {
  const iso = toIsoDate(d.date);
  if (iso === null) return { ...d, kind, iso: null, state: 'upcoming', daysFromToday: null };
  const delta = daysBetweenIso(todayIso, iso);
  const state: TimelineState = delta < 0 ? 'past' : delta === 0 ? 'today' : 'upcoming';
  return { ...d, kind, iso, state, daysFromToday: delta };
}

/**
 * Merge meetings + key dates into a single ascending timeline relative to `todayIso`
 * (defaults to the local today). Dated lines sort chronologically; undated lines are returned
 * separately so the renderer can list them without pretending to know when they fall.
 */
export function buildTimeline(
  meetings: DossierDateLike[] | null | undefined,
  keyDates: DossierDateLike[] | null | undefined,
  todayIso: string = localTodayIso(),
): Timeline {
  const raw: TimelineItem[] = [
    ...(Array.isArray(meetings) ? meetings : []).map((m) => toItem(m, 'meeting', todayIso)),
    ...(Array.isArray(keyDates) ? keyDates : []).map((k) => toItem(k, 'key_date', todayIso)),
  ];
  const dated = raw
    .filter((i): i is TimelineItem & { iso: string } => i.iso !== null)
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  const undated = raw.filter((i) => i.iso === null);
  const pastCount = dated.filter((i) => i.state === 'past').length;
  const nextIdx = dated.findIndex((i) => i.state !== 'past');
  return { dated, undated, todayIso, pastCount, nextUpcomingIndex: nextIdx === -1 ? null : nextIdx };
}

/** Bootstrap tone for an item's chip + timeline dot. Past is muted; upcoming warms up as it nears. */
export function timelineTone(item: TimelineItem): 'secondary' | 'primary' | 'danger' | 'warning' | 'success' {
  if (item.state === 'past') return 'secondary';
  if (item.state === 'today') return 'primary';
  const d = item.daysFromToday ?? Infinity;
  if (d <= 3) return 'danger';
  if (d <= 7) return 'warning';
  return 'success';
}

/** Human relative phrase: "today", "3 days ago", "in 6 days". */
export function humanDelta(days: number): string {
  if (days === 0) return 'today';
  const n = Math.abs(days);
  const unit = n === 1 ? 'day' : 'days';
  return days < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`;
}
