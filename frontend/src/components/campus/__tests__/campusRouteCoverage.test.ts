/**
 * C3 route coverage (D2, D2a): every room a learner can walk into shows the campus banner when the
 * campus is active. Read as text, like campusMap.test, so the ~60 lazily imported pages are not
 * pulled into this unit suite. A room route is covered when it is either
 *  - inside the <Route element={<PortalLayout />}> block (PortalLayout renders CampusScopedChrome), or
 *  - routed to a page component whose source renders PortalShell (which renders CampusBanner) or
 *    CampusScopedChrome directly (Showcase).
 * The only exclusions are the two chromeless routes named in the execution contract.
 */
import fs from 'fs';
import path from 'path';
import { campusBuildingsFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';
import { CHOW_ROUTE, CAMPUS_BUILDINGS } from '../campusMap';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');
const ROUTES_FILE = path.join(SRC_ROOT, 'routes', 'portalRoutes.tsx');
const ROUTES_SRC = fs.readFileSync(ROUTES_FILE, 'utf8');
// C6: /portal/view-as is no longer a room (the Staff Office links go through the Management Portal instead).
export const EXCLUDED = ['/portal/portfolio/preview'];
const AUDIENCES: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];

function roomRoutes(): string[] {
  const all = new Set<string>();
  for (const a of AUDIENCES) for (const b of campusBuildingsFor(a)) {
    // C6: admin links (Staff Office) are not campus pages; they open the Management Portal in a new tab.
    // C39: Chow Hall's door opens the order sheet; it has no page (checked below)
    if (!b.primary.admin && b.primary.route !== CHOW_ROUTE && !b.rooms.find((r) => r.route === b.primary.route)?.planned) all.add(b.primary.route);
    for (const r of b.rooms) if (!r.planned && !r.admin) all.add(r.route);
  }
  return Array.from(all).sort();
}

const layoutStart = ROUTES_SRC.indexOf('<Route element={<PortalLayout />}>');
const layoutEnd = ROUTES_SRC.indexOf('</Route>', layoutStart);

/** The JSX of the <Route> that declares `route`: from its "<Route" to the next "<Route" or "</Route>". */
function routeJsx(route: string): { jsx: string; at: number } | null {
  const at = ROUTES_SRC.search(new RegExp(`path="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  if (at < 0) return null;
  const start = ROUTES_SRC.lastIndexOf('<Route', at);
  const rest = ROUTES_SRC.slice(at);
  const ends = [rest.indexOf('<Route'), rest.indexOf('</Route>')].filter((n) => n >= 0);
  return { jsx: ROUTES_SRC.slice(start, at + Math.min(...ends)), at };
}

/** File a component identifier is imported from in portalRoutes.tsx (static or lazy import). */
function fileFor(name: string): string | null {
  const m = ROUTES_SRC.match(new RegExp(`(?:import\\s+${name}\\s+from|const\\s+${name}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\()\\s*'([^']+)'`));
  if (!m) return null;
  const base = path.resolve(path.dirname(ROUTES_FILE), m[1]);
  for (const ext of ['.tsx', '.ts', '/index.tsx']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

/** Imports AND renders PortalShell or CampusScopedChrome (an unused import would not show a banner). */
function rendersCampusChrome(file: string): boolean {
  const s = fs.readFileSync(file, 'utf8');
  const shell = /from '[^']*\/PortalShell'/.test(s) && /<PortalShell[\s>]/.test(s);
  const scoped = /from '[^']*\/campus\/CampusScopedChrome'/.test(s) && /<CampusScopedChrome\s*\/>/.test(s);
  return shell || scoped;
}

describe('every walkable room shows the campus banner (D2, D2a)', () => {
  const routes = roomRoutes();

  it('found the PortalLayout block and a real set of rooms', () => {
    expect(layoutStart).toBeGreaterThan(0);
    expect(routes.length).toBeGreaterThan(15);
  });

  it.each(routes.filter((r) => !EXCLUDED.includes(r)))('%s renders a campus chrome', (route) => {
    const found = routeJsx(route);
    expect({ route, routed: !!found }).toEqual({ route, routed: true });
    if (found!.at > layoutStart && found!.at < layoutEnd) return; // PortalLayout child
    const names = Array.from(found!.jsx.matchAll(/<([A-Z]\w+)/g)).map((m) => m[1]).filter((n) => n !== 'Route' && n !== 'PageGate' && n !== 'Navigate');
    const files = names.map(fileFor).filter((f): f is string => !!f);
    expect({ route, covered: files.some(rendersCampusChrome) }).toEqual({ route, covered: true });
  });

  it('the exclusion list is exactly the one chromeless room, and it is a real room', () => {
    expect(EXCLUDED).toEqual(['/portal/portfolio/preview']);
    for (const r of EXCLUDED) expect(routes).toContain(r);
  });
});

it('C39: Chow Hall has no page: the router declares no route for its door target, and it has no rooms', () => {
  expect(ROUTES_SRC.includes('/campus/chow')).toBe(false);
  expect(ROUTES_SRC).not.toMatch(/ChowHallPage/);
  const chow = CAMPUS_BUILDINGS.find((b) => b.id === 'chow')!;
  expect([chow.primary.route, chow.rooms, chow.prefixes]).toEqual([CHOW_ROUTE, [], []]);
});
