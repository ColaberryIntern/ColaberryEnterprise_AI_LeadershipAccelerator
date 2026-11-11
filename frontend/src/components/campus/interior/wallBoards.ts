import type { SideTop } from './pageSummary';
import type { LibraryView } from '../../../services/roomsApi';
import type { OpenHouseView } from '../../../services/onboardingApi';
import type { WorkItem } from '../../../services/myWorkApi';
import type { InternDashboard } from '../../../services/internshipApi';
import type { PlanStop } from '../campusPlan';
import type { ClassroomFeed } from './pageSummary';
import { eventWhen, upcoming } from '../events/eventsModel';

/**
 * The left-wall board for the rooms that had a blank wall (Basecamp C43, room fix F3; the design's PAGES[id].A), each built from
 * the data its page already reads. Pure, so each is tested. The rule: no source for a row, no row; no data at all, the board still
 * stands with its empty line and "Open <section>" (never a blank wall, never an invented row).
 *
 * Two boards differ from the design because the data does not exist (logged in the session log): the Library has no "saved" or
 * "% read" record, so its board shows what the library really holds (items, pinned, newest). The Gallery's wall is My work
 * since C128: the learner's newest pieces and the total.
 */
const MAX_ROWS = 4;
const board = (title: string, rows: SideTop['rows'], empty: string, open: string): SideTop =>
  (rows.length ? { title, rows } : { title, rows: [], empty, open });

export function libraryBoard(v: LibraryView | null, section: string): SideTop {
  const items = v?.resources ?? [];
  const pinned = items.filter((r) => r.is_pinned);
  const newest = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const rows = items.length ? [
    { label: 'Items in the library', value: String(items.length) },
    ...(pinned.length ? [{ label: 'Pinned', value: String(pinned.length) }] : []),
    ...(newest?.title ? [{ label: 'Newest', value: newest.title }] : []),
  ] : [];
  return board('📚 In the library', rows, 'Nothing here yet', `Open ${section}`);
}

/**
 * C75 (Ali 2026-10-27: "make sure they know that this side represents the free learning and they should be able to click on it and
 * go straight to the assignment or go to the Today page"): the Schedule's left board is Today, the learning everyone gets. Each row
 * opens its own assignment (the plan's route); the board's button opens the Today page. The copy never says "free" (TWC 807.172(d)):
 * it says included, no card needed. `_section` keeps the signature the other boards share.
 */
export const TODAY_ROUTE = '/portal/today';
export function scheduleBoard(stops: PlanStop[] | null, _section: string): SideTop {
  const rows = (stops ?? []).slice(0, MAX_ROWS).map((s) => ({ label: s.title, value: s.done ? '✓ done' : s.minutes ? `${s.minutes} min` : 'to do', route: s.route }));
  return { title: '📅 Today · start learning here', note: 'Included for everyone, no card needed. Pick one to start it.',
    rows, ...(rows.length ? {} : { empty: 'Nothing else on today' }), open: 'Open Today', route: TODAY_ROUTE };
}

/** C76: what the Schedule's planning desk opens: the first unfinished Today item; all done (or no plan): the Today page. */
export const towerCard = (stops: PlanStop[] | null): string => (stops ?? []).find((s) => !s.done)?.route ?? TODAY_ROUTE;

export function eventsBoard(events: OpenHouseView[] | null, now: Date, section: string): SideTop {
  const rows = upcoming(events ?? [], now, 3).map((e) => { const w = eventWhen(e.starts_at); return { label: e.title, value: `${w.day} · ${w.time}${e.is_registered ? ' ✓' : ''}` }; });
  return board('🎟 Coming up', rows, 'No events scheduled', `Open ${section}`);
}

/** The XP the Classroom feed carries; no feed or no progression (not entitled, or not loaded): the empty state, never zeros. */
export function progressBoard(feed: ClassroomFeed | null, section: string): SideTop {
  const xp = feed?.progression?.xp;
  if (!xp) return board('⭐ Your points', [], 'No points yet', `Open ${section}`);
  return { title: '⭐ Your points', rows: [
    { label: 'Builder XP', value: xp.builder.toLocaleString('en-US') },
    { label: 'Learning XP', value: xp.learning.toLocaleString('en-US') },
    { label: 'Community XP', value: xp.community.toLocaleString('en-US') },
  ], open: `Open ${section}` };
}

/**
 * C128 (approved C127 design, "Left wall: becomes My work"): the Gallery's left wall is the learner's three newest pieces, each
 * opening its own work page, and the total, with "See all N" opening My work. Their real pieces only; none: the empty line.
 */
const MY_WORK = '/portal/portfolio/work';
export function myWorkBoard(items: WorkItem[] | null): SideTop {
  if (!items?.length) return { title: '🗂 My work', rows: [], empty: 'Nothing here yet', open: 'Open My work', route: MY_WORK };
  const newest = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  return {
    title: '🗂 My work',
    rows: [
      ...newest.map((it) => ({ label: it.title || 'Untitled piece', value: day(it.createdAt), route: `${MY_WORK}/${encodeURIComponent(it.id)}` })),
      { label: 'All pieces', value: String(items.length) },
    ],
    open: `See all ${items.length}`,
    route: MY_WORK,
  };
}

/** Interns: the real standup (the cohort's interns-only standup in required_meetings) and Team "Not assigned yet" (there is no
 *  per-person team source). Anyone else, or no internship: the empty state. */
export function careerBoard(d: InternDashboard | null, section: string): SideTop {
  const standup = d?.required_meetings?.find((m) => m.kind === 'standup' && (m.audience ?? 'interns_only') === 'interns_only');
  if (!d || !standup) return board('👥 Your team', [], 'Not assigned yet', `Open ${section}`);
  const when = [standup.day, standup.time, standup.timezone].filter(Boolean).join(' ');
  return { title: '👥 Your team', rows: [{ label: 'Team', value: 'Not assigned yet' }, { label: standup.title || 'Intern standup', value: when }],
    open: standup.room_id ? 'Open the standup room' : `Open ${section}`, route: standup.room_id ? `/portal/rooms/${encodeURIComponent(standup.room_id)}` : undefined };
}
