import type { BuildingId, CampusAudience, ExplorerAccess } from '../campusMap';

/**
 * The inside of a building, as the prototype draws it (renderRoom, spotsFor, P in docs/design/campus/colaberry-campus.html), as
 * pure data: each building's layout and wall feature, the room's perspective, and where people can sit or stand. The room is a
 * 1000 x 620 picture: a back wall from x 170 to 830 (y 70 to 330) and a floor widening to the full width at the front.
 */
export type Layout = 'rows' | 'tables' | 'desks' | 'benches' | 'circle' | 'standing' | 'pods' | 'board' | 'tiers';
export type Feature = 'arcade' | 'screen' | 'shelves' | 'schedule' | 'kanban' | 'stage' | 'quiet' | 'stars' | 'lounge' | 'frames' | 'city' | 'sprint' | 'clients' | 'screens';
export interface RoomDef { layout: Layout; feature: Feature; dark: boolean }

/** The prototype's INTERIOR table (colors live in campusArtTokens.css as --cm-art-in-<id>-wall / -floor). The Main Gate has no inside. */
export const ROOMS: Partial<Record<BuildingId, RoomDef>> = {
  arcade: { layout: 'standing', feature: 'arcade', dark: true },
  lecture: { layout: 'rows', feature: 'screen', dark: false },
  library: { layout: 'tables', feature: 'shelves', dark: false },
  tower: { layout: 'standing', feature: 'schedule', dark: false },
  // the prototype's INTERIOR_BIZ rooms win for these three (base = INTERIOR_BIZ[id] || INTERIOR[id])
  studio: { layout: 'pods', feature: 'sprint', dark: false },
  // C26 (v6 D4): an auditorium: dark walls, a raised stage, six tiered rows of red seats, heads only for people really here
  amphi: { layout: 'tiers', feature: 'stage', dark: true },
  testing: { layout: 'desks', feature: 'quiet', dark: false },
  observatory: { layout: 'standing', feature: 'stars', dark: true },
  // C29 (v7 R2): Meeting Rooms is a hallway of doors: people stand in it (no tables, no couch)
  commons: { layout: 'standing', feature: 'lounge', dark: false },
  gallery: { layout: 'standing', feature: 'screens', dark: false },
  career: { layout: 'board', feature: 'clients', dark: false },
  // C21 (v6 D3): the pink-walled Admissions lobby: people stand; the board carries plans & pricing (the 3D room's own board)
  admissions: { layout: 'standing', feature: 'screen', dark: false },
};

/** Floor position (u across, t from back wall to front) to picture x, y and the figure scale (prototype P). */
export function P(u: number, t: number): { x: number; y: number; s: number } {
  const l = 170 - 170 * t, r = 830 + 170 * t;
  return { x: l + u * (r - l), y: 330 + 290 * t, s: 0.62 + 0.55 * t };
}

export interface Spot { u: number; t: number; pose: 'sit' | 'stand'; row?: number; bench?: boolean; table?: [number, number]; desk?: boolean; dual?: boolean; board?: boolean }

/** Every seat or standing spot of a layout, and a fixed shuffled order to fill them in (prototype spotsFor). */
export function spotsFor(layout: Layout): { all: Spot[]; order: Spot[] } {
  const S: Spot[] = [];
  if (layout === 'rows') [0.2, 0.42, 0.64, 0.86].forEach((t) => [0.2, 0.32, 0.44, 0.56, 0.68, 0.8].forEach((u) => S.push({ u, t, pose: 'sit', row: t })));
  else if (layout === 'tables') ([[0.27, 0.3], [0.7, 0.3], [0.22, 0.72], [0.52, 0.6], [0.8, 0.74]] as [number, number][])
    .forEach(([u, t]) => [[-0.07, -0.07], [0.07, -0.07], [-0.09, 0.05], [0.09, 0.05]].forEach(([du, dt]) => S.push({ u: u + du, t: t + dt, pose: 'sit', table: [u, t] })));
  else if (layout === 'desks') [0.25, 0.5, 0.75].forEach((t) => [0.2, 0.4, 0.6, 0.8].forEach((u) => S.push({ u, t, pose: 'sit', desk: true })));
  else if (layout === 'benches') [0.36, 0.72].forEach((t) => [0.22, 0.34, 0.46, 0.58, 0.7, 0.82].forEach((u) => S.push({ u, t, pose: 'sit', row: t, bench: true })));
  else if (layout === 'pods') [0.3, 0.64].forEach((t) => [0.17, 0.29, 0.45, 0.57, 0.73, 0.85].forEach((u) => S.push({ u, t, pose: 'sit', desk: true, dual: true })));
  else if (layout === 'board') { [0.3, 0.4, 0.5, 0.6, 0.7].forEach((u) => S.push({ u, t: 0.47, pose: 'sit', board: true })); [0.3, 0.4, 0.5, 0.6, 0.7].forEach((u) => S.push({ u, t: 0.66, pose: 'sit', board: true })); }
  else if (layout === 'circle') for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; S.push({ u: 0.5 + Math.cos(a) * 0.2, t: 0.5 + Math.sin(a) * 0.22, pose: 'stand' }); }
  else ([[0.3, 0.2], [0.62, 0.18], [0.45, 0.35], [0.2, 0.48], [0.75, 0.42], [0.55, 0.55], [0.35, 0.66], [0.82, 0.66], [0.15, 0.8], [0.62, 0.82], [0.44, 0.9], [0.9, 0.26]] as [number, number][])
    .forEach(([u, t]) => S.push({ u, t, pose: 'stand' }));
  const order = S.map((s, i) => [s, (Math.sin(i * 12.9898) * 43758.5453) % 1] as const).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  return { all: S, order };
}

/** Where "you" stand: the next free seat in a seated room, otherwise front and center (prototype youSpot). */
export function youSpotFor(layout: Layout, taken: number): Spot {
  const { all, order } = spotsFor(layout);
  if (layout === 'circle') return order[taken] ?? { u: 0.5, t: 0.85, pose: 'stand' };
  if (['rows', 'benches', 'desks', 'pods', 'board'].includes(layout)) return order[taken] ?? all[all.length - 1];
  return { u: 0.5, t: 0.92, pose: 'stand' };
}

/** The back door's sign (prototype doorLabel): your page, or what an Explorer will find there. */
export function doorLabel(audience: CampusAudience, access: ExplorerAccess): string {
  if (audience === 'explorer' && access === 'locked') return 'MEMBERS ONLY 🔒'; // WP-5: the prototype's lock, at the end
  if (audience === 'explorer' && access === 'demo') return 'DEMO MODE →';
  if (audience === 'business') return 'TEAM VIEW →';
  return 'YOUR PAGE →';
}
