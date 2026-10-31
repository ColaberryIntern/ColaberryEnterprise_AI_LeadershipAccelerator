import fs from 'fs';
import path from 'path';
import { ALL_LINKS, NAV_GROUPS, PINNED_LINKS, type NavGroup } from '../../../Layout/adminNav';
import {
  buildHq, EXECUTIVE_FLOOR_LABEL, badgeLevel, floorStatus, buttonSub, roomHref, roomName, hqSearch, rideOrder, conciergeLine,
  readerLine, groundFor, openFloors, placePeople, type HqFloor,
} from '../hqModel';

/**
 * Campus HQ H1. The building is the admin sidebar: these tests pin the generation rules, every role's badge, and two drift
 * guards (the sidebar against the building, and the building against the admin routes) so a nav edit can never leave the
 * building, the routes and the bridge disagreeing.
 */
const REPO = path.join(__dirname, '../../../../../..');

/** The role table AS THE SERVER DEFINES IT, read from backend/src/services/access/mgmtRoles.ts (the frontend cannot import
 *  backend code; reading the source means a role change there is checked here, not copied and left to drift). */
function serverRoles(): Record<string, string[]> {
  const src = fs.readFileSync(path.join(REPO, 'backend/src/services/access/mgmtRoles.ts'), 'utf8');
  const keys = [...(src.match(/SECTION_KEYS = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const consts: Record<string, string[]> = { ALL_SECTIONS: keys, ADMIN_EXCEPT_INBOX: keys.filter((k) => k !== 'inbox_content') };
  expect(src).toContain("ADMIN_EXCEPT_INBOX: SectionKey[] = ALL_SECTIONS.filter((s) => s !== 'inbox_content')");
  const out: Record<string, string[]> = {};
  for (const m of src.matchAll(/role: '([a-z_]+)',\s*label: '[^']*',\s*sections: (\[[^\]]*\]|[A-Z_]+)/g)) {
    out[m[1]] = m[2].startsWith('[') ? [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : consts[m[2]];
  }
  return out;
}
const ROLES = serverRoles();
const hqFor = (role: string) => buildHq((s) => ROLES[role].includes(s), true);
const floorOf = (fs2: HqFloor[], label: string) => fs2.find((f) => f.label === label) as HqFloor;
const openLabels = (f: HqFloor) => f.rooms.filter((r) => r.open).map((r) => r.label);

describe('the building is generated from adminNav.ts', () => {
  const hq = buildHq(() => true, true);

  it('read the whole server role table (14 roles, owner = every section)', () => {
    expect(Object.keys(ROLES)).toHaveLength(14);
    expect(ROLES.owner).toContain('brands');
    expect(ROLES.mentor).toEqual(['dashboard', 'career_review']);
  });

  it('has one floor per sidebar group plus the Executive Floor', () => {
    expect(hq.floors).toHaveLength(NAV_GROUPS.length + 1);
    expect(hq.floors[0]).toMatchObject({ num: 'PH', label: EXECUTIVE_FLOOR_LABEL });
  });

  it('keeps sidebar order, top to bottom, numbered from groups+1 down to 2', () => {
    expect(hq.floors.slice(1).map((f) => f.label)).toEqual(NAV_GROUPS.map((g) => g.label ?? g.section));
    expect(hq.floors.slice(1).map((f) => f.num)).toEqual(NAV_GROUPS.map((_g, i) => String(NAV_GROUPS.length + 1 - i)));
    expect(hq.floors[hq.floors.length - 1].num).toBe('2');
    expect(rideOrder(hq)[0]).toBe('G');
    expect(rideOrder(hq)[rideOrder(hq).length - 1]).toBe('PH');
  });

  it('has every ALL_LINKS entry as exactly one room, with its section, and nothing else', () => {
    const rooms = hq.floors.flatMap((f) => f.rooms);
    expect(rooms.map((r) => r.path)).toEqual(ALL_LINKS.map((l) => l.path));
    expect(rooms.map((r) => r.section)).toEqual(ALL_LINKS.map((l) => l.section));
    expect(new Set(rooms.map((r) => r.path)).size).toBe(rooms.length);
  });

  it('pinned links are the Executive Floor, with their icons', () => {
    expect(hq.floors[0].rooms.map((r) => r.label)).toEqual(PINNED_LINKS.map((l) => l.label));
    expect(hq.floors[0].rooms.map((r) => r.icon)).toEqual(PINNED_LINKS.map((l) => l.icon));
  });

  it('a link inherits its group section unless it carries its own (Leads in Revenue stays on leads)', () => {
    const revenue = floorOf(hq.floors, 'Revenue');
    expect(revenue.rooms.find((r) => r.label === 'Leads')?.section).toBe('leads');
    expect(revenue.rooms.find((r) => r.label === 'Refunds')?.section).toBe('revenue');
    const revenueOnly = buildHq((s) => s === 'revenue', true);
    expect(openLabels(floorOf(revenueOnly.floors, 'Revenue'))).not.toContain('Leads');
  });

  it('marks external and new-tab rooms', () => {
    const myDay = hq.floors[0].rooms.find((r) => r.label === 'My Day');
    expect(myDay).toMatchObject({ external: true, newTab: true });
    expect(roomHref(myDay!)).toBe('https://advisor.colaberry.ai/my-day/');
  });

  it('opens every internal room through the bridge with an allowed next', () => {
    for (const r of hq.floors.flatMap((f) => f.rooms).filter((x) => !x.external)) {
      expect(roomHref(r)).toBe(`/portal/mgmt-enter?next=${encodeURIComponent(r.path)}`);
    }
  });
});

describe('a changed sidebar changes the building with no other edit', () => {
  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({ ...g, links: [...g.links] }));
  const nav = () => ({ pinned: PINNED_LINKS, groups });

  it('an added group is a new floor, in place, and everything below renumbers', () => {
    const finance: NavGroup = { label: 'Finance', section: 'revenue', links: [{ path: '/admin/finance/invoices', label: 'Invoices', icon: 'bill-line' }] };
    const hq = buildHq(() => true, true, 'staff', { pinned: PINNED_LINKS, groups: [groups[0], finance, ...groups.slice(1)] });
    expect(hq.floors).toHaveLength(NAV_GROUPS.length + 2);
    expect(hq.floors[2]).toMatchObject({ label: 'Finance', num: String(NAV_GROUPS.length + 1) });
    expect(hq.floors[2].rooms[0]).toMatchObject({ path: '/admin/finance/invoices', section: 'revenue', open: true });
  });

  it('a renamed group renames its floor', () => {
    const renamed = groups.map((g) => (g.label === 'Program' ? { ...g, label: 'Delivery' } : g));
    const hq = buildHq(() => true, true, 'staff', { pinned: PINNED_LINKS, groups: renamed });
    expect(hq.floors.map((f) => f.label)).toContain('Delivery');
    expect(hq.floors.map((f) => f.label)).not.toContain('Program');
  });

  it('a moved link moves rooms and keeps its own access', () => {
    const rev = groups.find((g) => g.label === 'Revenue')!;
    const mk = groups.find((g) => g.label === 'Marketing')!;
    const moved = groups.map((g) => (g === rev ? { ...g, links: g.links.filter((l) => l.label !== 'Leads') }
      : g === mk ? { ...g, links: [...g.links, rev.links.find((l) => l.label === 'Leads')!] } : g));
    const hq = buildHq((s) => s === 'leads', true, 'staff', { pinned: PINNED_LINKS, groups: moved });
    expect(floorOf(hq.floors, 'Marketing').rooms.find((r) => r.label === 'Leads')).toMatchObject({ section: 'leads', open: true });
    expect(floorOf(hq.floors, 'Revenue').rooms.map((r) => r.label)).not.toContain('Leads');
    expect(nav().groups).toHaveLength(NAV_GROUPS.length); // the real nav is untouched
  });

  it('a link with no section is unreachable, never public', () => {
    const bare: NavGroup = { label: 'Bare', section: '', links: [{ path: '/admin/bare', label: 'Bare', icon: 'x' }] };
    const hq = buildHq(() => true, true, 'staff', { pinned: [], groups: [bare] });
    expect(hq.floors[1]).toMatchObject({ access: 'none', openCount: 0 });
  });
});

describe('every role gets the badge its sections give it', () => {
  it.each(Object.keys(ROLES))('%s: a room is open exactly when the role holds its section', (role) => {
    for (const r of hqFor(role).floors.flatMap((f) => f.rooms)) expect(r.open).toBe(ROLES[role].includes(r.section));
  });

  it('owner: every floor and room, ALL-ACCESS BADGE', () => {
    const hq = hqFor('owner');
    expect(hq.floors.every((f) => f.access === 'all')).toBe(true);
    expect(badgeLevel(hq)).toBe('ALL-ACCESS BADGE');
  });

  it('mentor: the Executive Floor partly (Dashboard and Portfolio Review), and My Domain + Change Requests on Program', () => {
    const hq = hqFor('mentor');
    expect(hq.floors[0].access).toBe('some');
    expect(openLabels(hq.floors[0])).toEqual(['Dashboard', 'Portfolio Review']);
    // Both Program rooms a mentor can open carry `section: 'dashboard'` as an explicit override on
    // the link rather than inheriting the group's 'program'. Those overrides exist because the
    // people those two surfaces are FOR hold only 'dashboard' — AF8.3 found all six interns
    // getting a 403 without it on 19 Oct. `dashboard` is the one section every mgmt role carries,
    // so a mentor sees them too. Intended, and not the access control: Change Requests lets a
    // mentor FILE one, while deciding is `requireAdmin` at the API (AF4.2).
    expect(openLabels(floorOf(hq.floors, 'Program'))).toEqual(['My Domain', 'Change Requests']);
    expect(openFloors(hq).map((f) => f.label)).toEqual([EXECUTIVE_FLOOR_LABEL, 'Program']);
  });

  it('support: the Executive Floor partly (Student Story, My Day, AI Training) and nothing else', () => {
    const hq = hqFor('support');
    expect(openLabels(hq.floors[0])).toEqual(['Student Story', 'My Day', 'AI Training']);
    expect(openFloors(hq)).toHaveLength(1);
  });

  it('admissions: Lead Ingestion and Interns whole, plus Dashboard and My Domain', () => {
    const hq = hqFor('admissions');
    expect(floorOf(hq.floors, 'Lead Ingestion').access).toBe('all');
    expect(floorOf(hq.floors, 'Interns').access).toBe('all');
    expect(openLabels(hq.floors[0])).toEqual(['Dashboard']);
    expect(openFloors(hq).map((f) => f.label)).toEqual([EXECUTIVE_FLOOR_LABEL, 'Lead Ingestion', 'Interns', 'Program']);
    expect(badgeLevel(hq)).toBe(`OPENS 4 OF ${hq.floors.length} FLOORS`);
  });

  it('marketing (Sarbjit today, one role): Marketing, Brands, Campaigns; Interns stays locked until H4', () => {
    const hq = hqFor('marketing');
    for (const l of ['Marketing', 'Brands', 'Campaigns']) expect(floorOf(hq.floors, l).access).toBe('all');
    expect(floorOf(hq.floors, 'Interns').access).toBe('none');
  });

  it('explorers and members: every staff floor is none, ground floor only, Staff only everywhere', () => {
    for (const aud of ['explorer', 'member', 'business'] as const) {
      const hq = buildHq(() => true, false, aud);
      expect(hq.floors.every((f) => f.access === 'none')).toBe(true);
      expect(badgeLevel(hq)).toBe('GROUND FLOOR ONLY');
      expect(hq.floors.map((f) => floorStatus(f, false))).toEqual(hq.floors.map(() => 'Staff only'));
      expect(hq.floors.map((f) => buttonSub(f, false))).toEqual(hq.floors.map(() => 'Staff only'));
      expect(roomName(hq.floors[1].rooms[0], false)).toBe('Staff room');
      expect(hqSearch(hq, 'leads')).toEqual([]);
    }
  });
});

describe('the words on the badge, the floors and the lobby', () => {
  it('floor status and button lines', () => {
    const hq = hqFor('mentor');
    expect(floorStatus(hq.floors[0], true)).toBe(`✓ 2 of ${PINNED_LINKS.length} rooms`);
    expect(floorStatus(floorOf(hq.floors, 'Revenue'), true)).toBe('🔒 No access');
    expect(buttonSub(floorOf(hq.floors, 'Revenue'), true)).toBe('No access');
    const owner = hqFor('owner');
    expect(floorStatus(floorOf(owner.floors, 'Marketing'), true)).toBe('✓ Your badge');
    expect(buttonSub(floorOf(owner.floors, 'Marketing'), true)).toBe('1 room');
  });

  it('the concierge names your first three floors, or says the ground floor for learners', () => {
    expect(conciergeLine(hqFor('marketing'), 'Sarbjit', 'staff', 9)).toBe('Good morning, Sarbjit. Your badge opens 5 floors: Executive Floor, Marketing, Brands…. The elevators are straight ahead.');
    expect(conciergeLine(hqFor('owner'), 'Ali', 'staff', 20)).toMatch(/^Good evening, Ali\. Your badge opens every floor: /);
    expect(conciergeLine(buildHq(() => false, false, 'member'), 'Priya', 'member', 14)).toBe('Welcome, Priya. The ground floor is yours: Career Center. The floors above are for Colaberry staff.');
    expect(conciergeLine(buildHq(() => false, false, 'business'), 'Dana', 'business', 14)).toContain('Partner suite');
    expect(conciergeLine(buildHq(() => false, true), 'Kes', 'staff', 14)).toContain('opens the ground floor');
    expect(conciergeLine(hqFor('marketing'), '', 'staff', 9)).toMatch(/^Good morning\. Your badge opens/); // no name, no stand-in
    expect(conciergeLine(buildHq(() => false, false, 'member'), '', 'member', 9)).toMatch(/^Welcome\. The ground floor is yours: Career Center\./);
  });

  it('the badge reader', () => {
    expect(readerLine(hqFor('support'), 'staff')).toBe('Tap your badge · 1 floor');
    expect(readerLine(buildHq(() => false, false, 'explorer'), 'explorer')).toBe('Visitor badge · ground floor');
    expect(readerLine(buildHq(() => false, false, 'business'), 'business')).toBe('Partner badge · ground floor');
  });

  it('the ground floor per face', () => {
    expect(groundFor('member').map((g) => g.label)).toEqual(['Career Center']);
    expect(groundFor('explorer').map((g) => g.label)).toEqual(['Career Center']);
    expect(groundFor('business').map((g) => g.label)).toEqual(['Partner suite']);
    expect(groundFor('staff').map((g) => g.label)).toEqual(['Career Center', 'Management Portal']);
    // the Workplace look: the internship building is Engagements, everywhere the HQ names it
    expect(groundFor('member', 'Engagements').map((g) => g.label)).toEqual(['Engagements']);
    expect(conciergeLine(buildHq(() => false, false, 'member', undefined, 'Engagements'), 'Priya', 'member', 9)).toContain('The ground floor is yours: Engagements.');
  });

  it('search finds floors and the rooms you can open, never a locked one', () => {
    const hq = hqFor('marketing');
    expect(hqSearch(hq, 'brands').map((h) => h.kind)).toEqual(['floor', 'room']);
    expect(hqSearch(hq, 'leads')).toEqual([]);
    expect(hqSearch(hqFor('owner'), 'Leads').map((h) => h.label)).toEqual(['Leads']);
    expect(hqSearch(hq, '  ')).toEqual([]);
  });
});

describe('a member’s own office floor (H4): the one floor an intern’s badge opens', () => {
  const office = { label: 'Gov Contracts', projects: [{ projectId: 'p1', name: 'Saratoga Springs RFP' }, { projectId: 'p2', name: 'Herriman' }] };
  const mhq = buildHq(() => false, false, 'member', undefined, undefined, office);
  const off = mhq.floors[mhq.floors.length - 1];

  it('appends ONE office floor for a member, numbered 1, with a room per assigned project', () => {
    expect(mhq.floors).toHaveLength(NAV_GROUPS.length + 2); // the staff floors + PH, plus the office
    expect(off).toMatchObject({ key: 'office', num: '1', label: 'Gov Contracts', access: 'all', own: true });
    expect(off.rooms.map((r) => r.path)).toEqual(['/portal/gov-projects/p1', '/portal/gov-projects/p2']);
    expect(off.rooms.map((r) => r.label)).toEqual(['Saratoga Springs RFP', 'Herriman']);
    expect(off.rooms.every((r) => r.open && r.own && !r.external)).toBe(true);
    expect(off.num < mhq.floors[mhq.floors.length - 2].num).toBe(true); // '1' sits below every staff floor ('2'+)
  });

  it('leaves every staff floor shut — the member has the building, but only this one office', () => {
    expect(mhq.floors.slice(0, -1).every((f) => f.access === 'none' && !f.own)).toBe(true);
    expect(openFloors(mhq).map((f) => f.key)).toEqual(['office']);
  });

  it('reads the badge, floor and room as THEIRS, never "Staff only"', () => {
    expect(badgeLevel(mhq)).toBe(`OPENS 1 OF ${mhq.floors.length} FLOORS`);
    expect(floorStatus(off, false)).toBe('✓ Your badge');
    expect(buttonSub(off, false)).toBe('2 rooms');
    expect(roomName(off.rooms[0], false)).toBe('Saratoga Springs RFP'); // own rooms are named even for a non-staff viewer
    expect(roomHref(off.rooms[0])).toBe('/portal/gov-projects/p1'); // a portal route, reached directly, not the admin bridge
  });

  it('the concierge and the badge reader name the office', () => {
    expect(conciergeLine(mhq, 'Priya', 'member', 9)).toBe('Welcome, Priya. Your badge opens the ground floor and your office: Saratoga Springs RFP, Herriman. The other floors are for Colaberry staff.');
    expect(readerLine(mhq, 'member')).toBe('Member badge · 1 floor');
  });

  it('is gated: staff ignore the office (they have real floors), and an empty office adds nothing', () => {
    const staff = buildHq(() => true, true, 'staff', undefined, undefined, office);
    expect(staff.floors).toHaveLength(NAV_GROUPS.length + 1);
    expect(staff.floors.some((f) => f.own)).toBe(false);

    const empty = buildHq(() => false, false, 'member', undefined, undefined, { label: 'Gov Contracts', projects: [] });
    expect(empty.floors.some((f) => f.own)).toBe(false);
    expect(badgeLevel(empty)).toBe('GROUND FLOOR ONLY');

    const none = buildHq(() => false, false, 'member'); // no office arg at all — the old behavior, unchanged
    expect(none.floors.some((f) => f.own)).toBe(false);
    expect(badgeLevel(none)).toBe('GROUND FLOOR ONLY');
  });
});

describe('who is where in the building', () => {
  const hq = hqFor('owner');
  type P = { name: string; hq_path?: string };
  const kes: P = { name: 'Kes', hq_path: '/admin/internship' };
  const sam: P = { name: 'Sam' };
  const old: P = { name: 'Old', hq_path: '/admin/retired-page' };
  const two: P = { name: 'Two', hq_path: '/admin/internship' };

  it('a sidebar page puts a person on its floor and at its door', () => {
    const placed = placePeople(hq, [kes, two]);
    const num = floorOf(hq.floors, 'Interns').num;
    expect(placed.byFloor.get(num)).toEqual([kes, two]);
    expect(placed.byRoom.get('/admin/internship')).toEqual([kes, two]);
    expect(placed.lobby).toEqual([]);
  });

  it('no page, or a page the sidebar no longer has, is the lobby', () => {
    const placed = placePeople(hq, [sam, old]);
    expect(placed.lobby).toEqual([sam, old]);
    expect(placed.byFloor.size).toBe(0);
  });

  it('a learner viewer gets everyone in the lobby, even if a page reached the client', () => {
    const placed = placePeople(buildHq(() => false, false, 'member'), [kes, sam]);
    expect(placed.lobby).toEqual([kes, sam]);
    expect(placed.byFloor.size).toBe(0);
  });

  it('places by the page even on a floor the viewer cannot open (where someone is is not access)', () => {
    const mentor = hqFor('mentor');
    expect(floorOf(mentor.floors, 'Interns').access).toBe('none');
    expect(placePeople(mentor, [kes]).byFloor.get(floorOf(mentor.floors, 'Interns').num)).toEqual([kes]);
  });
});

describe('drift guard: the sidebar, the building and the admin routes agree', () => {
  const routes = new Set([...fs.readFileSync(path.join(REPO, 'frontend/src/routes/adminRoutes.tsx'), 'utf8').matchAll(/path="(\/admin[^"]*)"/g)].map((m) => m[1]));
  const rooms = buildHq(() => true, true).floors.flatMap((f) => f.rooms);

  it('read the real admin routes', () => {
    expect(routes.size).toBeGreaterThan(50);
    expect(routes.has('/admin/dashboard')).toBe(true);
  });

  it('every internal room is a real admin route (a room never opens a 404)', () => {
    expect(rooms.filter((r) => !r.external && !routes.has(r.path)).map((r) => r.path)).toEqual([]);
  });

  it('every admin route that has a sidebar entry is a room, and every room is in the sidebar', () => {
    const navPaths = new Set(ALL_LINKS.map((l) => l.path));
    const roomPaths = new Set(rooms.map((r) => r.path));
    expect([...routes].filter((p) => navPaths.has(p) && !roomPaths.has(p))).toEqual([]);
    expect([...roomPaths].filter((p) => !navPaths.has(p))).toEqual([]);
  });
});
