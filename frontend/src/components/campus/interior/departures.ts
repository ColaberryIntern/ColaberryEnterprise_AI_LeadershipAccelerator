import portalApi from '../../../utils/portalApi';
import type { StudentProject } from '../../../pages/portal/projects/projectsStore';
import { nextTask } from '../../../pages/portal/projects/projectsStore';
import { ageLabel } from '../board/boardTime';
import type { SideRow, SideTop } from './pageSummary';

/**
 * C85 (Ali, Project Studio): the left wall is DEPARTURES, one row per project, last worked first, each row a button straight into
 * that project's next task. Every member starts with a test project, so the board always has a row; the empty line is only the
 * safety net for a list that failed to load.
 *
 * The projects are the browser's list (the same one the Projects page shows); "last worked" and "last commit" come from the server
 * (GET /api/portal/projects: last_commit, last_worked_at). A project the server has no time for keeps its list order, after the
 * timed ones. Each row shows how long ago it was last worked on ("2h ago", "Yesterday"), or "Open" when the server has no time.
 */
export interface StudioProjectFacts { id: string; last_commit: { sha: string; message: string; at: string } | null; last_worked_at: string | null }

const TIMEOUT_MS = 10_000;
/** Four rows, like the other wall boards: measured at the real wall sizes, a fifth row pushes "See all my projects" off the board. */
export const DEPARTURES_MAX = 4;

/** The server's per-project facts, keyed by id. Rejects on any failure (the board then shows list order with no times). */
export async function fetchStudioFacts(): Promise<Map<string, StudioProjectFacts>> {
  const r = await portalApi.get('/api/portal/projects', { timeout: TIMEOUT_MS });
  const rows: StudioProjectFacts[] = Array.isArray(r.data?.projects) ? r.data.projects : [];
  return new Map(rows.map((p) => [String(p.id), p]));
}

/** A local build matches its server row by its own id or the backend id it stands in for. */
const factsFor = (p: StudentProject, facts: Map<string, StudioProjectFacts> | null): StudioProjectFacts | null =>
  facts?.get(p.id) ?? (p.pipelineProjectId ? facts?.get(p.pipelineProjectId) ?? null : null);

/** Where a row goes: the project's next task in its workspace, else the Projects page. */
export function projectRoute(p: StudentProject): string {
  const n = nextTask(p);
  const key = n ? n.task.storyId || n.task.id : null;
  return key ? `/portal/projects/workspace/${p.id}/${encodeURIComponent(key)}` : '/portal/projects';
}

export function departuresBoard(projects: StudentProject[], facts: Map<string, StudioProjectFacts> | null, now: number): SideTop {
  const timed = projects.map((p, i) => ({ p, i, f: factsFor(p, facts) }));
  const at = (x: { f: StudioProjectFacts | null }) => (x.f?.last_worked_at ? Date.parse(x.f.last_worked_at) : NaN);
  timed.sort((a, b) => {
    const ta = at(a), tb = at(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
    if (!Number.isNaN(ta)) return -1;
    if (!Number.isNaN(tb)) return 1;
    return a.i - b.i;
  });
  const seen = new Map<string, number>();
  const rows: SideRow[] = timed.slice(0, DEPARTURES_MAX).map(({ p, f }) => {
    // the value stays short so the project name keeps the row (a commit sha or a story title squeezed the names to "My Te…")
    const value = f?.last_worked_at ? ageLabel(f.last_worked_at, now) : 'Open';
    // the board keys rows by label: two builds with one name still get two rows
    const k = seen.get(p.name) ?? 0;
    seen.set(p.name, k + 1);
    return { label: k ? `${p.name} (${k + 1})` : p.name, value, route: projectRoute(p) };
  });
  return {
    title: '🛫 Departures',
    note: 'Your projects, last worked first',
    rows,
    empty: 'Your projects could not be loaded',
    open: 'See all my projects',
  };
}
