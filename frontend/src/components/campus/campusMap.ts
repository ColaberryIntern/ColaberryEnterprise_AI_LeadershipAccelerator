/**
 * campusMap - the Colaberry Campus building catalog, as data.
 *
 * Source: CAMPUS-D4 Building Catalog (Basecamp, Colaberry Campus master index),
 * which is section 4 of COLABERRY_CAMPUS_BUILD_PROMPT.md. Every building is a
 * portal area: a route prefix, the rooms (real routes only), who may see it,
 * and how an Explorer may use it. Positions are the prototype's world
 * coordinates (a 1000 x 700 map) so C2 can draw the map from this file alone.
 *
 * RULES THIS FILE ENCODES (tested in __tests__/campusMap.test.ts):
 *  - real routes only: every room route is routed in routes/portalRoutes.tsx,
 *    except a route explicitly marked `planned` with the ticket that adds it;
 *  - never the prototype's illustrative routes (/portal/curriculum,
 *    /portal/verify, /portal/project/blueprint);
 *  - access never invents a rule: a locked or demo building names the
 *    GatedFeatureKey that already decides it (components/paywall/gatedFeatures).
 */
import type { GatedFeatureKey } from '../paywall/gatedFeatures';
import { mgmtBridgeTo } from '../../pages/portal/mgmtNext';

export type CampusAudience = 'member' | 'explorer' | 'business' | 'staff';
/** A building's state for THIS viewer (computed by campusAccess.buildingState, never stored in the catalog). */
export type ExplorerAccess = 'open' | 'preview' | 'demo' | 'locked';
/** What a building's page does for an Explorer once inside (Projects runs a demo, the Classroom feed is a week-0 preview). */
export type ExplorerMode = 'open' | 'preview' | 'demo';
export type BuildingId =
  | 'lecture' | 'library' | 'tower' | 'studio' | 'amphi' | 'testing'
  | 'observatory' | 'commons' | 'gallery' | 'career' | 'arcade' | 'gate';

export interface CampusRoom {
  label: string;
  route: string;
  /** Set only when the route does not exist yet; names the Basecamp ticket that adds it. */
  planned?: string;
  /** C6: an admin page reached through the Management Portal bridge. Opens in a new tab, never a door zoom; not a campus
   *  place, so search, the trail and route coverage skip it. */
  admin?: boolean;
}

export interface CampusBuilding {
  id: BuildingId;
  name: string;
  /** "Workplace" look names (Settings > Workplace names). */
  workplaceName: string;
  primary: { label: string; route: string; admin?: boolean };
  rooms: CampusRoom[];
  /** Every route that belongs to this building, for "where am I" lookups. */
  prefixes: string[];
  /** C6: what the page does for an Explorer once inside. 'locked' is not a catalog value: only the page paywall locks. */
  explorer: ExplorerMode;
  /** The page's PageGate key, if its route is wrapped in PageGate (routes/portalRoutes.tsx). Absent = not paywalled. */
  gate?: GatedFeatureKey;
  audiences: CampusAudience[];
  pos: { x: number; y: number; w: number; h: number };
}

const EVERYONE: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];

export const CAMPUS_BUILDINGS: readonly CampusBuilding[] = [
  { id: 'lecture', name: 'Classroom', workplaceName: 'Training Room',
    primary: { label: "Continue this week's lessons", route: '/portal/classroom' },
    rooms: [{ label: 'Classroom', route: '/portal/classroom' }, { label: 'Live sessions', route: '/portal/sessions' }],
    prefixes: ['/portal/classroom', '/portal/sessions', '/portal/class-checkin'],
    explorer: 'preview', gate: 'classroom', audiences: EVERYONE, pos: { x: 500, y: 185, w: 150, h: 78 } },
  { id: 'library', name: 'Library', workplaceName: 'Knowledge Base',
    primary: { label: 'Browse the library', route: '/portal/library' },
    rooms: [{ label: 'Library', route: '/portal/library' }],
    prefixes: ['/portal/library'], explorer: 'open', audiences: EVERYONE, pos: { x: 250, y: 215, w: 130, h: 64 } },
  { id: 'tower', name: 'Schedule', workplaceName: 'Calendar',
    primary: { label: 'Open my schedule', route: '/portal/schedule' },
    rooms: [{ label: 'Today', route: '/portal/today' }, { label: 'Schedule', route: '/portal/schedule' }],
    prefixes: ['/portal/today', '/portal/schedule'], explorer: 'open', audiences: EVERYONE, pos: { x: 395, y: 270, w: 52, h: 96 } },
  { id: 'studio', name: 'Project Studio', workplaceName: 'Project Studio',
    primary: { label: 'Open my projects', route: '/portal/projects' },
    rooms: [{ label: 'Projects', route: '/portal/projects' }, { label: 'Assignments', route: '/portal/assignments' }],
    prefixes: ['/portal/projects', '/portal/assignments'],
    explorer: 'demo', gate: 'projects', audiences: EVERYONE, pos: { x: 755, y: 215, w: 150, h: 70 } },
  { id: 'amphi', name: 'Events Hall', workplaceName: 'Town Hall',
    primary: { label: 'See events and RSVP', route: '/portal/events' },
    rooms: [{ label: 'Events', route: '/portal/events' }],
    prefixes: ['/portal/events'], explorer: 'open', audiences: EVERYONE, pos: { x: 700, y: 350, w: 132, h: 62 } },
  { id: 'testing', name: 'Cert Prep Center', workplaceName: 'Certification Center',
    primary: { label: 'Start the knowledge check', route: '/portal/cert-prep' },
    rooms: [{ label: 'Cert prep', route: '/portal/cert-prep' }],
    prefixes: ['/portal/cert-prep'], explorer: 'open', gate: 'cert-prep', audiences: EVERYONE, pos: { x: 150, y: 330, w: 104, h: 62 } },
  { id: 'observatory', name: 'My Progress', workplaceName: 'My Performance',
    primary: { label: 'View my path', route: '/portal/path' },
    rooms: [{ label: 'Path', route: '/portal/path' }, { label: 'Progress', route: '/portal/progress' }, { label: 'Points', route: '/portal/points' }],
    prefixes: ['/portal/path', '/portal/progress', '/portal/points'], explorer: 'open', audiences: EVERYONE, pos: { x: 130, y: 546, w: 96, h: 54 } },
  { id: 'commons', name: 'Community Lounge', workplaceName: 'Collab Cafe',
    primary: { label: 'Open live rooms', route: '/portal/rooms' },
    rooms: [{ label: 'Rooms', route: '/portal/rooms' }, { label: 'Community', route: '/portal/community' }, { label: 'People', route: '/portal/community/people' }],
    prefixes: ['/portal/rooms', '/portal/community'], explorer: 'open', audiences: EVERYONE, pos: { x: 310, y: 546, w: 124, h: 62 } },
  { id: 'gallery', name: 'Showcase Gallery', workplaceName: 'Portfolio Gallery',
    primary: { label: 'Open my portfolio', route: '/portal/portfolio' },
    rooms: [{ label: 'Portfolio', route: '/portal/portfolio' }, { label: 'Preview', route: '/portal/portfolio/preview' }, { label: 'Showcase', route: '/portal/showcase' }],
    prefixes: ['/portal/portfolio', '/portal/showcase'],
    explorer: 'open', gate: 'portfolio', audiences: EVERYONE, pos: { x: 690, y: 546, w: 120, h: 56 } },
  // One building, three faces: Career Center for members and interns, Partner Office for
  // org managers, Staff Office for staff. careerBuildingFor() picks the face.
  { id: 'career', name: 'Career Center', workplaceName: 'Engagements',
    primary: { label: 'Open the internship', route: '/portal/internship' },
    rooms: [{ label: 'Internship', route: '/portal/internship' }],
    prefixes: ['/portal/internship', '/portal/company'],
    // C6: open. Neither /portal/internship nor /portal/company is paywalled; C2's 'locked' here was a rule the campus invented.
    explorer: 'open', audiences: EVERYONE, pos: { x: 870, y: 546, w: 116, h: 76 } },
  { id: 'arcade', name: 'Game Room', workplaceName: 'Break Room',
    primary: { label: 'Games and leaderboards', route: '/portal/game-room' },
    rooms: [{ label: 'Game Room', route: '/portal/game-room', planned: 'C10' }],
    prefixes: ['/portal/game-room'], explorer: 'open', audiences: EVERYONE, pos: { x: 210, y: 448, w: 108, h: 50 } },
  { id: 'gate', name: 'Main Gate', workplaceName: 'Visitor Entrance',
    primary: { label: 'Start on Today', route: '/portal/today' }, // C6: Maya's desk is in this card now; the button goes to Today, so it says so
    rooms: [], prefixes: [], explorer: 'open', audiences: ['explorer', 'staff'], pos: { x: 500, y: 622, w: 90, h: 50 } },
];

/** The career building's face per audience (D4 career row). C6: the Staff Office links go to existing admin pages THROUGH
 *  the Management Portal bridge (a direct /admin link lands on the admin login without a bridged session), and the old
 *  /portal/view-as link is gone: that page needs a token minted by an admin and showed an error when browsed to. */
export function careerBuildingFor(audience: CampusAudience): Pick<CampusBuilding, 'name' | 'primary' | 'rooms'> {
  if (audience === 'business') {
    return { name: 'Partner Office', primary: { label: 'Open your company', route: '/portal/company' }, rooms: [{ label: 'Company', route: '/portal/company' }] };
  }
  if (audience === 'staff') {
    return {
      name: 'Staff Office',
      primary: { label: 'Open the Management Portal', route: '/portal/mgmt-enter', admin: true },
      rooms: [
        { label: 'Handoffs', route: mgmtBridgeTo('/admin/growth-journey?tab=handoffs'), admin: true },
        { label: 'People', route: mgmtBridgeTo('/admin/people'), admin: true },
        { label: 'View as a learner', route: mgmtBridgeTo('/admin/accelerator'), admin: true },
      ],
    };
  }
  const b = CAMPUS_BUILDINGS.find((x) => x.id === 'career') as CampusBuilding;
  return { name: b.name, primary: b.primary, rooms: b.rooms };
}

/** Buildings this audience can see on the map. */
export function buildingsFor(audience: CampusAudience): CampusBuilding[] {
  return CAMPUS_BUILDINGS.filter((b) => b.audiences.includes(audience));
}

/** Which building a portal path belongs to (longest matching prefix wins), or null. */
export function buildingForPath(pathname: string): CampusBuilding | null {
  let best: CampusBuilding | null = null;
  let bestLen = -1;
  for (const b of CAMPUS_BUILDINGS) {
    for (const p of b.prefixes) {
      if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) { best = b; bestLen = p.length; }
    }
  }
  return best;
}

/** Display name honoring the Workplace names setting. */
export function buildingName(b: Pick<CampusBuilding, 'name' | 'workplaceName'>, workplaceNames: boolean): string {
  return workplaceNames ? b.workplaceName : b.name;
}
