import fs from 'fs';
import path from 'path';
import { CAMPUS_BUILDINGS, buildingForPath, buildingsFor, buildingName, careerBuildingFor } from '../campusMap';

// The catalog must only point at routes that exist. Read the route tree as text: importing it
// would pull every page component into this unit suite.
const ROUTES_SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'routes', 'portalRoutes.tsx'), 'utf8');
const ROUTED = new Set(Array.from(ROUTES_SRC.matchAll(/path="([^"]+)"/g)).map((m) => m[1]));
const allRoutes = (): { route: string; planned?: string; where: string }[] => CAMPUS_BUILDINGS.flatMap((b) => [
  { route: b.primary.route, planned: b.rooms.find((r) => r.route === b.primary.route)?.planned, where: b.id + ' primary' },
  ...b.rooms.map((r) => ({ route: r.route, planned: r.planned, where: b.id + ' room ' + r.label })),
]);

describe('campus catalog', () => {
  it('has the 12 buildings of the D4 catalog, each id once', () => {
    const ids = CAMPUS_BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['amphi', 'arcade', 'career', 'commons', 'gallery', 'gate', 'lecture', 'library', 'observatory', 'studio', 'testing', 'tower']);
  });

  it('points only at routes that are routed today, unless a route is marked planned with its ticket', () => {
    expect(ROUTED.size).toBeGreaterThan(20); // the regex really read the route tree
    for (const r of allRoutes()) {
      if (r.planned) { expect(r.planned).toMatch(/^C\d+$/); expect(ROUTED.has(r.route)).toBe(false); continue; }
      expect({ where: r.where, routed: ROUTED.has(r.route) }).toEqual({ where: r.where, routed: true });
    }
  });

  it('never uses the prototype-only illustrative routes', () => {
    const banned = ['/portal/curriculum', '/portal/verify', '/portal/project/blueprint'];
    for (const r of allRoutes()) expect(banned).not.toContain(r.route);
    for (const b of CAMPUS_BUILDINGS) for (const p of b.prefixes) expect(banned).not.toContain(p);
  });

  it('every non-open Explorer building names the existing gate that decides it, except the career building (audience face)', () => {
    for (const b of CAMPUS_BUILDINGS) {
      if (b.explorer === 'open' || b.id === 'career') continue;
      expect({ id: b.id, gate: b.gate }).toEqual({ id: b.id, gate: expect.any(String) });
    }
  });

  // C6: the column is what each page does for an Explorer once inside. 'locked' is no longer a catalog value: only the page
  // paywall (PageGate) locks, decided per viewer by campusAccess.buildingState. The career building was 'locked' with no gate,
  // a rule the campus had invented; its pages are not paywalled.
  it('matches the Explorer mode column (what each page does for an Explorer)', () => {
    const access = Object.fromEntries(CAMPUS_BUILDINGS.map((b) => [b.id, b.explorer]));
    expect(access).toEqual({ lecture: 'preview', library: 'open', tower: 'open', studio: 'demo', amphi: 'open', testing: 'open',
      observatory: 'open', commons: 'open', gallery: 'open', career: 'open', arcade: 'open', gate: 'open' });
  });

  it('shows the Main Gate (Maya\'s desk) only to Explorers and staff', () => {
    expect(buildingsFor('explorer').some((b) => b.id === 'gate')).toBe(true);
    expect(buildingsFor('staff').some((b) => b.id === 'gate')).toBe(true);
    expect(buildingsFor('member').some((b) => b.id === 'gate')).toBe(false);
    expect(buildingsFor('business').some((b) => b.id === 'gate')).toBe(false);
  });

  it('places every building inside the 1000 x 700 world', () => {
    for (const b of CAMPUS_BUILDINGS) {
      expect(b.pos.x).toBeGreaterThan(0); expect(b.pos.x).toBeLessThan(1000);
      expect(b.pos.y).toBeGreaterThan(0); expect(b.pos.y).toBeLessThan(700);
    }
  });

  it('gives the career building a face per audience', () => {
    expect(careerBuildingFor('member').name).toBe('Career Center');
    expect(careerBuildingFor('explorer').name).toBe('Career Center');
    expect(careerBuildingFor('business')).toMatchObject({ name: 'Partner Office', primary: { route: '/portal/company' } });
    expect(careerBuildingFor('staff')).toMatchObject({ name: 'Staff Office', primary: { route: '/portal/mgmt-enter', admin: true } });
  });

  // C6: the Staff Office's links reach real admin pages through the Management Portal bridge; /portal/view-as is gone (it
  // needs an admin-minted token and showed an error when browsed to).
  it('the Staff Office links go through the bridge to admin pages that exist, and never to /portal/view-as', () => {
    const ADMIN = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'routes', 'adminRoutes.tsx'), 'utf8');
    const staff = careerBuildingFor('staff');
    expect(staff.rooms.map((r) => r.label)).toEqual(['Handoffs', 'People', 'View as a learner']);
    for (const r of staff.rooms) {
      expect(r.admin).toBe(true);
      expect(r.route.startsWith('/portal/mgmt-enter?next=')).toBe(true);
      const target = decodeURIComponent(r.route.split('next=')[1]).split('?')[0];
      expect({ target, routed: ADMIN.includes(`path="${target.replace('/admin/', '')}"`) || ADMIN.includes(`path="${target}"`) }).toEqual({ target, routed: true });
    }
    expect(ROUTED.has('/portal/mgmt-enter')).toBe(true);
    expect(JSON.stringify(staff)).not.toContain('/portal/view-as');
  });
});

describe('buildingForPath', () => {
  it.each([
    ['/portal/classroom/week/3', 'lecture'], ['/portal/sessions/abc', 'lecture'], ['/portal/today', 'tower'],
    ['/portal/community/people', 'commons'], ['/portal/community', 'commons'], ['/portal/portfolio/preview', 'gallery'],
    ['/portal/projects/workspace/p/t', 'studio'], ['/portal/company', 'career'], ['/portal/points', 'observatory'],
  ])('%s -> %s', (p, id) => { expect(buildingForPath(p)?.id).toBe(id); });

  it('does not match on a bare prefix of a different word', () => {
    expect(buildingForPath('/portal/libraryx')).toBeNull();
    expect(buildingForPath('/portal/settings')).toBeNull();
  });
});

describe('buildingName', () => {
  it('uses the Workplace name only when the setting is on', () => {
    const lounge = CAMPUS_BUILDINGS.find((b) => b.id === 'commons')!;
    expect(buildingName(lounge, false)).toBe('Community Lounge');
    expect(buildingName(lounge, true)).toBe('Collab Cafe');
  });
});
