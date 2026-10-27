import { buildingForPath, buildingName, CAMPUS_BUILDINGS, type BuildingId } from '../campusMap';
import { spotOf, spotWords } from '../interior/roomSpots';
import type { PlanStop } from '../campusPlan';
import type { ProjectTask } from '../../../pages/portal/projects/projectsStore';

/**
 * The workstation (Campus round 3 §2.3 + v6 D1 "Workstation copy", Basecamp C19): the pure parts. Where a workstation belongs,
 * what its trail says, and the tickets "Pinned above your desk". Real data only: a story's bench is its release's stories, a
 * lesson's is today's plan; nothing is invented to fill the cork.
 */

export type TicketState = 'done' | 'active' | 'queued';
export interface BenchTicket {
  key: string;
  /** "STORY-001" or the plan item's label ("Deep Dive"). */
  tag: string;
  title: string;
  state: TicketState;
  /** The line under the title: how a done one got done, "On your desk", or "Queued". */
  note: string;
  /** Where clicking the ticket goes (another story's or card's workstation), or null when it is this one. */
  route: string | null;
}

/** "STORY-001 · A client books…": the id once, whether or not the plan's title already starts with it. */
export function storyTitle(storyId: string | undefined, title: string): string {
  if (!storyId) return title;
  return title.startsWith(storyId) ? title : `${storyId} · ${title}`;
}
/** The title without a leading "STORY-001 · " (the ticket's tag already says it). */
export const bareTitle = (storyId: string | undefined, title: string): string =>
  (storyId && title.startsWith(storyId) ? title.slice(storyId.length).replace(/^\s*[·:\-–]\s*/, '') : title);

/** How many tickets the bench holds: the prototype's cork shows about five before it scrolls. */
export const BENCH_MAX = 6;

/** The building a workstation stands in: the room it was opened in on the campus (`at`, C79), else the page it was opened from,
 *  else the kind's own building. Only a room with a workstation spot counts. */
export function workstationBuilding(from: string | null | undefined, fallback: BuildingId, at?: BuildingId | null): BuildingId {
  if (at && spotOf(at)?.opens === 'ws') return at;
  const b = from ? buildingForPath(from) : null;
  return b && spotOf(b.id)?.opens === 'ws' ? (b.id as BuildingId) : fallback;
}

export interface WorkstationPlace {
  buildingId: BuildingId;
  /** "Your desk", "Your seat" ... (the spot's words; v6: the trail reads "‹spot› · ‹card›"). */
  spot: string;
  /** The building's display name, honoring Workplace names ("All of ‹section›"). */
  section: string;
  /** The section's page. */
  sectionRoute: string;
}

export function workstationPlace(buildingId: BuildingId, workplaceNames: boolean): WorkstationPlace {
  const b = CAMPUS_BUILDINGS.find((x) => x.id === buildingId);
  const s = spotOf(buildingId);
  return {
    buildingId,
    spot: s ? spotWords(s) : 'Your desk',
    section: b ? buildingName(b, workplaceNames) : 'Campus',
    sectionRoute: b?.primary.route ?? '/portal/campus',
  };
}

/**
 * A story's bench: the stories in its release, in order, with the current one "On your desk". Done stories say how they got done
 * (verified by a commit, or marked done by you), never more than the store knows. Trimmed around the current story.
 */
export function storyBench(releaseTasks: ProjectTask[], currentId: string, routeFor: (t: ProjectTask) => string): BenchTicket[] {
  const all = releaseTasks.filter((t) => t.state !== 'skipped').map((t): BenchTicket => {
    const active = t.id === currentId;
    const done = t.state === 'done' || !!t.verifiedAt;
    return {
      key: t.id,
      tag: t.storyId || 'Task',
      title: bareTitle(t.storyId, t.title),
      state: active ? 'active' : done ? 'done' : 'queued',
      note: active ? 'On your desk' : done ? (t.verifiedAt ? 'Done by commit' : 'Done') : 'Queued',
      route: active ? null : routeFor(t),
    };
  });
  return around(all, all.findIndex((t) => t.state === 'active'));
}

/** A lesson's bench: today's plan, the current card "On your desk" (matched by its card id), done steps crossed out. */
export function planBench(stops: PlanStop[] | null, cardId: string): BenchTicket[] {
  if (!stops?.length) return [];
  const all = stops.map((s): BenchTicket => {
    const active = s.ref === `card:${cardId}` || s.route.endsWith(`/runtime/${cardId}`);
    return {
      key: s.key,
      tag: s.label || 'Today',
      title: s.title,
      state: active ? 'active' : s.done ? 'done' : 'queued',
      note: active ? 'On your desk' : s.done ? 'Done' : 'Queued',
      route: active ? null : s.route,
    };
  });
  return around(all, all.findIndex((t) => t.state === 'active'));
}

/** At most BENCH_MAX tickets, keeping the active one in view (one done ticket before it when there is one). */
function around(all: BenchTicket[], at: number): BenchTicket[] {
  if (all.length <= BENCH_MAX) return all;
  const start = Math.max(0, Math.min(at < 0 ? 0 : at - 1, all.length - BENCH_MAX));
  return all.slice(start, start + BENCH_MAX);
}
