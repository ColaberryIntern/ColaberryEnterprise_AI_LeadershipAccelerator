import { useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';
import { getCertDomains, getCertPrepSummary } from '../../../services/certPrepApi';
import { useProjectsList } from '../../../pages/portal/projects/projectsStore';
import type { BuildingId, CampusAudience } from '../campusMap';
import { fetchLibrary } from '../../../services/roomsApi';
import { eventsFor } from '../events/eventsModel';
import { fetchPublicEvents } from '../../../services/onboardingApi';
import { fetchCareerProfile } from '../../../services/careerApi';
import { fetchInternshipDashboard } from '../../../services/internshipApi';
import { useCampus } from '../CampusContext';
import type { SideTop } from './pageSummary';
import { careerBoard, eventsBoard, libraryBoard, portfolioBoard, progressBoard, scheduleBoard } from './wallBoards';
import { certPrepSummary, classroomSummary, plainSummary, projectsSummary } from './pageSummary';
import type { ClassroomFeed, PageSummary } from './pageSummary';
import { accountRows, useAccountFacts } from '../admissions/accountFacts';

/**
 * The room's board for the building you are in (v6 D1): its page's Next step, the card to its right, and what your spot opens,
 * read from the same sources the page reads (pageSummary). It fetches only while that room is open. A short shared cache (30 s)
 * means a room and the page you walk into from it do not fetch the same feed twice. Failing or loading: null (the room then shows
 * the building's plan step or a plain sign; never invented data).
 *
 * Buildings without a Next step of their own get a plain summary (the section name only). Failure classes are not surfaced: the
 * board simply falls back, and the page itself reports its own errors.
 */
export const SUMMARY_TTL_MS = 30_000;
const cache = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) return hit.p as Promise<T>;
  const p = load();
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key)); // a failure is not remembered: the next open tries again
  return p;
}
/** Tests: start from an empty cache. */
export const clearSummaryCache = (): void => cache.clear();

/**
 * `name` is the building as this viewer sees it (Workplace names respected): it names the section on the board and the tiles,
 * except the Classroom's "Week N", which is the week, not a building name.
 */
/** C43: the rooms whose left-wall board comes from wallBoards.ts (each from the data its page reads). */
const WALL_FETCH: Partial<Record<BuildingId, (section: string, audience?: CampusAudience) => Promise<SideTop>>> = {
  library: (s) => cached('library', fetchLibrary).then((v) => libraryBoard(v, s), () => libraryBoard(null, s)),
  amphi: (s, a) => cached('events-30', () => fetchPublicEvents(30)).then((e) => eventsBoard(eventsFor(a, e), new Date(), s), () => eventsBoard(null, new Date(), s)),
  observatory: (s) => cached('classroom', () => portalApi.get('/api/portal/classroom').then((r) => r.data as ClassroomFeed)).then((f) => progressBoard(f, s), () => progressBoard(null, s)),
  gallery: (s) => cached('career-profile', fetchCareerProfile).then((p) => portfolioBoard(p, s), () => portfolioBoard(null, s)),
  // a non-intern gets a 404 from the dashboard: the empty state, not an error
  career: (s) => cached('intern-dash', fetchInternshipDashboard).then((d) => careerBoard(d, s), () => careerBoard(null, s)),
};

export function usePageSummary(id: BuildingId, open: boolean, name: string, audience?: CampusAudience): PageSummary | null {
  const { planStops } = useCampus();
  const [wall, setWall] = useState<{ id: BuildingId; side: SideTop } | null>(null);
  // the Career Center is the Partner Office / Staff Office for those accounts: no intern board there
  const wallFetch = id === 'career' && (audience === 'business' || audience === 'staff') ? undefined : WALL_FETCH[id];
  useEffect(() => {
    if (!open || !wallFetch) return undefined;
    let alive = true;
    wallFetch(name, audience).then((side) => { if (alive) setWall({ id, side }); });
    return () => { alive = false; };
  }, [id, open, name, wallFetch, audience]);
  const projects = useProjectsList(); // a local store read (cheap); the page uses the same list
  const account = useAccountFacts(open && id === 'admissions'); // C21: the Admissions room's "Your account" wall board
  const [fetched, setFetched] = useState<{ id: BuildingId; s: PageSummary } | null>(null);
  useEffect(() => {
    if (!open || (id !== 'lecture' && id !== 'testing')) return undefined;
    let alive = true;
    const load = id === 'lecture'
      ? cached('classroom', () => portalApi.get('/api/portal/classroom').then((r) => r.data as ClassroomFeed)).then(classroomSummary)
      : cached('cert-prep', async () => {
        const sum = await getCertPrepSummary();
        if (!sum.data.availability.available) return null; // locked before its week: no board
        const det = await getCertDomains();
        return certPrepSummary(sum.data.readiness, det.data.domains);
      });
    load.then((s) => { if (alive && s) setFetched({ id, s }); }, () => { /* the board falls back to the plan step or a plain sign */ });
    return () => { alive = false; };
  }, [id, open]);
  if (!open) return null;
  if (id === 'studio') return { ...projectsSummary(projects), doorName: name };
  if (id === 'testing') return fetched?.id === id ? { ...fetched.s, doorName: name } : null;
  if (id === 'lecture') return fetched?.id === id ? fetched.s : null;
  // C21: Admissions draws its own board (plans & pricing); the summary carries only the left wall's "Your account"
  if (id === 'admissions') return { ...plainSummary(name), sideTop: account ? accountRows(account) : null };
  if (id === 'tower') return { ...plainSummary(name), sideTop: scheduleBoard(planStops, name) };
  if (wallFetch) return { ...plainSummary(name), sideTop: wall?.id === id ? wall.side : null };
  return plainSummary(name);
}
