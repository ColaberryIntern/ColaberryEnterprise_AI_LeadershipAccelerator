import type { SideTop } from './pageSummary';
import type { LibraryView } from '../../../services/roomsApi';
import type { OpenHouseView } from '../../../services/onboardingApi';
import type { CareerProfile } from '../../../services/careerApi';
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
 * "% read" record, so its board shows what the library really holds (items, pinned, newest); the portfolio has no per-item
 * published / draft count, so the Gallery shows its real counts (artifacts, projects, verified skills, readiness).
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

export function scheduleBoard(stops: PlanStop[] | null, section: string): SideTop {
  const rows = (stops ?? []).slice(0, MAX_ROWS).map((s) => ({ label: s.title, value: s.done ? '✓ done' : s.minutes ? `${s.minutes} min` : 'to do' }));
  return board('📅 Today', rows, 'Nothing else on today', `Open ${section}`);
}

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

export function portfolioBoard(p: CareerProfile | null, section: string): SideTop {
  const rows: SideTop['rows'] = [];
  if (p?.artifacts?.length) rows.push({ label: 'Artifacts', value: String(p.artifacts.length) });
  if (p?.projects?.length) rows.push({ label: 'Projects', value: String(p.projects.length) });
  const r = p?.readiness;
  if (r && r.total_count > 0) rows.push({ label: 'Portfolio readiness', value: `${r.met_count} of ${r.total_count}`, pct: Math.round((r.met_count / r.total_count) * 100) });
  return board('🖼 Portfolio', rows, 'Nothing in your portfolio yet', `Open ${section}`);
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
