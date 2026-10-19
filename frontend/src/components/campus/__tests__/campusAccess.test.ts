/**
 * Building state for a viewer (C6): what the building's page itself does, from the page's own signals. No campus rule.
 *  - locked iff the route is wrapped in PageGate and PageGate would show its paywall (PageGate: isStaff || hasFullAccess);
 *  - demo / preview iff the viewer is an Explorer and the page runs that mode for Explorers (Projects, Classroom);
 *  - open otherwise.
 * The catalog is checked against the real route table, so a gate key cannot drift from the page it describes.
 */
import fs from 'fs';
import path from 'path';
import { buildingState, accessLabel, enrollCta, AccessSignals } from '../campusAccess';
import { CAMPUS_BUILDINGS } from '../campusMap';

const SRC = path.join(__dirname, '..', '..', '..');
const ROUTES = fs.readFileSync(path.join(SRC, 'routes', 'portalRoutes.tsx'), 'utf8');
const PAGEGATE = fs.readFileSync(path.join(SRC, 'components', 'paywall', 'PageGate.tsx'), 'utf8');
const by = (s: AccessSignals) => Object.fromEntries(CAMPUS_BUILDINGS.map((b) => [b.id, buildingState(b, s)]));
const bools = [true, false];

describe('buildingState: the full matrix', () => {
  it.each(bools.flatMap((st) => bools.flatMap((full) => bools.map((ex) => [st, full, ex] as const))))('isStaff %s, hasFullAccess %s, isExplorer %s', (isStaff, hasFullAccess, isExplorer) => {
    for (const b of CAMPUS_BUILDINGS) {
      const paywalled = !!b.gate && !(isStaff || hasFullAccess);
      const want = paywalled ? 'locked' : isExplorer && (b.explorer === 'demo' || b.explorer === 'preview') ? b.explorer : 'open';
      expect({ id: b.id, state: buildingState(b, { isStaff, hasFullAccess, isExplorer }) }).toEqual({ id: b.id, state: want });
    }
  });

  it('page gate OFF (production default: everyone has full access): an Explorer sees Demo on Project Studio and Preview on the Classroom, nothing locked', () => {
    expect(by({ isStaff: false, hasFullAccess: true, isExplorer: true })).toMatchObject({ studio: 'demo', lecture: 'preview', testing: 'open', gallery: 'open', career: 'open', library: 'open' });
  });

  it('page gate ON, an unpaid Explorer: the paywalled pages are locked (as PageGate shows them), the rest open', () => {
    expect(by({ isStaff: false, hasFullAccess: false, isExplorer: true })).toMatchObject({ studio: 'locked', lecture: 'locked', testing: 'locked', gallery: 'locked', career: 'open', library: 'open' });
  });

  it('a member is never shown a demo or preview, and a paid member is never locked', () => {
    expect(Object.values(by({ isStaff: false, hasFullAccess: true, isExplorer: false }))).toEqual(CAMPUS_BUILDINGS.map(() => 'open'));
  });

  it('the career building is never locked by the campus (its pages are not paywalled)', () => {
    for (const isStaff of bools) for (const hasFullAccess of bools) for (const isExplorer of bools) {
      expect(buildingState(CAMPUS_BUILDINGS.find((b) => b.id === 'career')!, { isStaff, hasFullAccess, isExplorer })).toBe('open');
    }
  });

  it('the locked condition is PageGate\'s own (isStaff || hasFullAccess lets you in)', () => {
    expect(PAGEGATE).toContain('if (isStaff || hasFullAccess) return <>{children}</>;');
  });
});

describe('the catalog matches the route table', () => {
  /** The PageGate feature wrapping a route in portalRoutes.tsx, or null if the route is not wrapped. */
  function pageGateOf(route: string): string | null {
    const at = ROUTES.indexOf(`path="${route}"`);
    if (at < 0) throw new Error('route not found ' + route);
    const next = ROUTES.indexOf('<Route', at + 1);
    const m = ROUTES.slice(at, next < 0 ? undefined : next).match(/<PageGate feature="([^"]+)"/);
    return m ? m[1] : null;
  }

  // The gate has no route of its own. (Since C10 no primary is planned; the arcade's route has no PageGate, matching its missing gate key.)
  it.each(CAMPUS_BUILDINGS.filter((b) => b.id !== 'gate' && !b.rooms.find((r) => r.route === b.primary.route)?.planned).map((b) => [b.id, b] as const))('%s: gate key equals the PageGate on its primary route (or none)', (_id, b) => {
    expect({ id: b.id, gate: b.gate ?? null }).toEqual({ id: b.id, gate: pageGateOf(b.primary.route) });
  });

  it('only the pages with a real Explorer mode carry demo or preview (Projects demo, Classroom preview)', () => {
    expect(CAMPUS_BUILDINGS.filter((b) => b.explorer !== 'open').map((b) => `${b.id}:${b.explorer}`).sort()).toEqual(['lecture:preview', 'studio:demo']);
    const projects = fs.readFileSync(path.join(SRC, 'pages', 'portal', 'projects', 'ProjectsPage.tsx'), 'utf8');
    const classroom = fs.readFileSync(path.join(SRC, 'pages', 'portal', 'ClassroomPage.tsx'), 'utf8');
    expect(projects).toMatch(/const demo = useIsExplorer\(\)/);
    expect(classroom).toMatch(/is_explorer/);
  });
});

describe('accessLabel and enrollCta', () => {
  it('labels only non-open states', () => {
    expect(accessLabel('open')).toBeNull();
    expect(accessLabel('locked')).toBe('Members only');
    expect(accessLabel('demo')).toBe('Demo');
    expect(accessLabel('preview')).toBe('Preview');
  });

  it('reuses the paywall call to action (the building\'s own gate when it has one)', () => {
    const studio = CAMPUS_BUILDINGS.find((b) => b.id === 'studio')!;
    expect(enrollCta(studio)).toEqual({ label: 'Enroll to start building →', to: '/portal/settings?tab=subscription' });
    const career = CAMPUS_BUILDINGS.find((b) => b.id === 'career')!;
    expect(enrollCta(career).to).toBe('/portal/settings?tab=subscription');
  });
});
