import { NAV_GROUPS, PINNED_LINKS, type NavGroup, type NavLink } from '../../Layout/adminNav';
import { mgmtBridgeTo } from '../../../pages/portal/mgmtNext';
import { subNavEntries, type NavSubCards } from '../../Layout/adminSubNav';
import type { CampusAudience } from '../campusMap';

/**
 * Campus HQ (H1): the Staff Office / Career Center / Partner Office as an elevator tower, GENERATED from the admin sidebar
 * (components/Layout/adminNav.ts). PINNED_LINKS are the top floor (PH); every NAV_GROUPS entry is a floor in sidebar order,
 * top to bottom; every link is a room. There is no copy of the nav and no floor list here: add, move or rename a link in
 * adminNav.ts and the building changes in the same deploy.
 *
 * PRESENTATION ONLY. A room is open when the viewer is staff and holds the room's section (`link.section ?? group.section`,
 * the same rule as ALL_LINKS). Section keys stay the only access truth and mgmtSectionGate stays the one enforcement point,
 * so this building can never show open what the admin sidebar would hide (the principle at the top of adminOs/domains.ts).
 *
 * C92: a group's LIVE sub-lists (adminNav.ts `subLists`, e.g. Interns -> Gov Contracts, Agents) are rooms on that floor too,
 * built from the same cards and the same mapping as the sidebar (adminSubNav.ts), and only for a holder of the sub-list's
 * section, exactly as the sidebar shows them. So a new sidebar sub-list or sub-item reaches the building with no edit here.
 */

/** The one label the building owns: the sidebar's pinned set has no group label. */
export const EXECUTIVE_FLOOR_LABEL = 'Executive Floor';

export interface HqRoom { path: string; label: string; icon: string; section: string; newTab: boolean; external: boolean; open: boolean }
export interface HqFloor { key: string; num: string; label: string; rooms: HqRoom[]; openCount: number; access: 'all' | 'some' | 'none' }
export interface GroundRoom { key: 'career' | 'partner' | 'mgmt'; label: string; sub: string; icon: string; route: string; portal: boolean }
export interface HqNav { pinned: NavLink[]; groups: NavGroup[] }
export interface Hq { floors: HqFloor[]; ground: GroundRoom[]; isStaff: boolean }

const SIDEBAR: HqNav = { pinned: PINNED_LINKS, groups: NAV_GROUPS };
const isExternal = (path: string) => /^https?:/.test(path);

function room(link: NavLink, inherited: string, canSection: (s: string) => boolean, isStaff: boolean): HqRoom {
  // A link with no section is unreachable, never public (the rule accessibleLinksForDomain applies).
  const section = link.section ?? inherited;
  return {
    path: link.path, label: link.label, icon: link.icon, section, newTab: !!link.newTab, external: isExternal(link.path),
    open: isStaff && !!section && canSection(section),
  };
}

function floor(key: string, num: string, label: string, rooms: HqRoom[]): HqFloor {
  const openCount = rooms.filter((r) => r.open).length;
  return { key, num, label, rooms, openCount, access: openCount === 0 ? 'none' : openCount === rooms.length ? 'all' : 'some' };
}

/** The ground floor every audience shares: the career building's faces (careerBuildingFor) as rooms. `careerName` is the
 *  internship building's name as THIS viewer reads it (the Workplace look calls it Engagements), never a fixed string. */
export function groundFor(audience: CampusAudience, careerName = 'Career Center'): GroundRoom[] {
  if (audience === 'business') return [{ key: 'partner', label: 'Partner suite', sub: 'Your company', icon: 'building-2-line', route: '/portal/company', portal: true }];
  const career: GroundRoom = { key: 'career', label: careerName, sub: 'Internship', icon: 'briefcase-4-line', route: '/portal/internship', portal: true };
  if (audience !== 'staff') return [career];
  return [career, { key: 'mgmt', label: 'Management Portal', sub: 'Front desk', icon: 'door-open-line', route: '/portal/mgmt-enter', portal: false }];
}

/**
 * The building for one viewer. `canSection` is their admin sections (GET /api/portal/mgmt/status); `isStaff` is the staff
 * audience. `nav` is injectable so a test can prove a changed sidebar changes the building with no other edit.
 */
export function buildHq(canSection: (s: string) => boolean, isStaff: boolean, audience: CampusAudience = isStaff ? 'staff' : 'member', nav: HqNav = SIDEBAR, careerName?: string, subs: NavSubCards = {}): Hq {
  const top = nav.groups.length + 1;
  const subRooms = (g: NavGroup): HqRoom[] => (g.subLists ?? []).flatMap((sl) => (isStaff && canSection(sl.section)
    ? subNavEntries(sl.source, subs).map((e) => ({ path: e.to, label: e.label, icon: sl.icon, section: sl.section, newTab: true, external: false, open: true }))
    : []));
  const floors = [
    floor('pinned', 'PH', EXECUTIVE_FLOOR_LABEL, nav.pinned.map((l) => room(l, '', canSection, isStaff))),
    ...nav.groups.map((g, i) => floor(`group-${i}`, String(top - i), g.label ?? g.section, [...g.links.map((l) => room(l, g.section, canSection, isStaff)), ...subRooms(g)])),
  ];
  return { floors, ground: groundFor(audience, careerName), isStaff };
}

/** Where a room opens, in a new tab: an external link its own URL; every internal page through the Management Portal
 *  bridge (the allowlist holds every sidebar path, H3), including AI Training's own landing page. */
export function roomHref(r: HqRoom): string {
  return r.external ? r.path : mgmtBridgeTo(r.path);
}

/** The floors your badge opens (the lobby is always yours and is not counted, as in the prototype). */
export const openFloors = (hq: Hq): HqFloor[] => hq.floors.filter((f) => f.access !== 'none');

/** The badge's level line: ALL-ACCESS BADGE, OPENS n OF N FLOORS, or GROUND FLOOR ONLY. */
export function badgeLevel(hq: Hq): string {
  if (!hq.isStaff) return 'GROUND FLOOR ONLY';
  const n = openFloors(hq).length;
  return n === hq.floors.length ? 'ALL-ACCESS BADGE' : `OPENS ${n} OF ${hq.floors.length} FLOORS`;
}

export const roomsText = (n: number): string => `${n} ${n === 1 ? 'room' : 'rooms'}`;

/** A floor's status in the Floors list: ✓ Your badge, ✓ k of n rooms, 🔒 No access, or Staff only. */
export function floorStatus(f: HqFloor, isStaff: boolean): string {
  if (!isStaff) return 'Staff only';
  if (f.access === 'all') return '✓ Your badge';
  if (f.access === 'some') return `✓ ${f.openCount} of ${f.rooms.length} rooms`;
  return '🔒 No access';
}

/** A floor button's small line in the elevator. */
export function buttonSub(f: HqFloor, isStaff: boolean): string {
  if (f.access === 'none') return isStaff ? 'No access' : 'Staff only';
  return f.access === 'all' ? roomsText(f.rooms.length) : `${f.openCount} of ${f.rooms.length} rooms`;
}

/** What a viewer may read about a room: members and explorers never see room names on staff floors (H6). */
export const roomName = (r: HqRoom, isStaff: boolean): string => (isStaff ? r.label : 'Staff room');

export const lockedFloorToast = (f: HqFloor, isStaff: boolean): string => (isStaff
  ? `Your badge doesn’t open ${f.label}. Ask an admin to add it to your role.`
  : 'The floors above the lobby are for Colaberry staff.');

/** The lobby concierge's greeting (H5.3). `desk` is whoever is on duty (useStaffDesks); null shows the desk with no person. */
export function conciergeLine(hq: Hq, firstName: string, audience: CampusAudience, hour: number): string {
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const to = firstName ? `, ${firstName}` : ''; // no name read yet: the greeting goes without one, never "there"
  if (!hq.isStaff) return `Welcome${to}. The ground floor is yours: ${hq.ground.map((g) => g.label).join(', ')}. The floors above are for Colaberry staff.`;
  const open = openFloors(hq);
  if (open.length === 0) return `Good ${part}${to}. Your badge opens the ground floor. Ask an admin to add a floor to your role.`;
  const which = open.length === hq.floors.length ? 'every floor' : `${open.length} ${open.length === 1 ? 'floor' : 'floors'}`;
  return `Good ${part}${to}. Your badge opens ${which}: ${open.slice(0, 3).map((f) => f.label).join(', ')}${open.length > 3 ? '…' : ''}. The elevators are straight ahead.`;
}

/** The badge reader's line at the turnstiles. */
export function readerLine(hq: Hq, audience: CampusAudience): string {
  if (!hq.isStaff) return `${audience === 'explorer' ? 'Visitor' : audience === 'business' ? 'Partner' : 'Member'} badge · ground floor`;
  const n = openFloors(hq).length;
  return `Tap your badge · ${n} ${n === 1 ? 'floor' : 'floors'}`;
}

/** Floors in elevator order, bottom to top (G first): the indicator counts through these while riding. */
export const rideOrder = (hq: Hq): string[] => ['G', ...hq.floors.map((f) => f.num).reverse()];

/**
 * Who is where inside the HQ (Ali, 2026-10-28: "see and know where employees are in the building"). The server sends a staff
 * viewer each named employee's sidebar page (`hq_path`, from the Management Portal heartbeat); a page that is a room puts them
 * on its floor and at its door. No page, or a page the sidebar no longer has, is the lobby. Learners get no pages, so everyone
 * they see in the building is in the lobby, counted, never placed on a staff floor.
 */
export interface HqPlaced<P> { lobby: P[]; byFloor: Map<string, P[]>; byRoom: Map<string, P[]> }
export function placePeople<P extends { hq_path?: string }>(hq: Hq, people: P[]): HqPlaced<P> {
  const where = new Map<string, string>();
  for (const f of hq.floors) for (const r of f.rooms) where.set(r.path, f.num);
  const out: HqPlaced<P> = { lobby: [], byFloor: new Map(), byRoom: new Map() };
  for (const p of people) {
    // A learner is never shown anyone on a staff floor, even if a page reached the client (the server sends none to them).
    const num = hq.isStaff && p.hq_path ? where.get(p.hq_path) : undefined;
    if (!num || !p.hq_path) { out.lobby.push(p); continue; }
    out.byFloor.set(num, [...(out.byFloor.get(num) ?? []), p]);
    out.byRoom.set(p.hq_path, [...(out.byRoom.get(p.hq_path) ?? []), p]);
  }
  return out;
}

/** Where-to search (H5): floors by label for staff, and the rooms you can open. Rooms you can't open never appear. */
export interface HqSearchHit { kind: 'floor' | 'room'; floor: string; label: string; room?: HqRoom }
export function hqSearch(hq: Hq, query: string): HqSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q || !hq.isStaff) return [];
  const hits: HqSearchHit[] = [];
  for (const f of hq.floors) {
    if (f.access !== 'none' && f.label.toLowerCase().includes(q)) hits.push({ kind: 'floor', floor: f.num, label: f.label });
    for (const r of f.rooms) if (r.open && r.label.toLowerCase().includes(q)) hits.push({ kind: 'room', floor: f.num, label: r.label, room: r });
  }
  return hits;
}
