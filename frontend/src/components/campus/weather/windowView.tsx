import React from 'react';
import { CAMPUS_BUILDINGS, buildingName, type BuildingId } from '../campusMap';
import { MiniBuilding, MiniLandmark } from './miniArt';

/**
 * The real view out of a room's window (Campus v10 W5, Basecamp C38). The window looks EAST on the map: from the other buildings and
 * four landmarks (the pond, the Quad fountain, the Community Board, the Main Gate) keep those east of the room (dx > 20) within ±63°
 * of due east (|atan2(dy, dx)| < 1.1) and nearer than 620 map units, and take the nearest three. Positions come from campusMap, so the
 * view stays right if the map changes. Looking east, south is to the right: left = 50% + (angle / 1.1) x 38%; size = clamp(22%,
 * 9000 / (distance + 60), 58%) of the window; drawn back to front. Nothing in view (the east edge): a distant skyline.
 */
/** ratio: a building's real height / width on the map (C45: its mini is drawn at that proportion); landmarks carry 0. */
export interface ViewItem { id: string; name: string; kind: string; d: number; a: number; left: number; size: number; ratio: number }
export const LANDMARKS: { id: string; name: string; x: number; y: number; kind: string }[] = [
  { id: 'pond', name: 'the pond', x: 880, y: 200, kind: 'pond' },
  { id: 'fountain', name: 'the Quad fountain', x: 500, y: 400, kind: 'fountain' },
  { id: 'board', name: 'the Community Board', x: 560, y: 470, kind: 'board' },
  { id: 'gate-lm', name: 'the Main Gate', x: 500, y: 640, kind: 'gate' },
];

/** `workplace`: the Workplace names setting (the sign and tooltip never show a campus-only name with it on). */
export function viewFrom(id: BuildingId, workplace = false): ViewItem[] {
  const b = CAMPUS_BUILDINGS.find((x) => x.id === id);
  if (!b) return [];
  const others = CAMPUS_BUILDINGS.filter((o) => o.id !== id && o.id !== 'gate').map((o) => ({ id: o.id as string, name: buildingName(o, workplace), x: o.pos.x, y: o.pos.y, kind: o.kind as string, ratio: o.pos.h / o.pos.w }));
  const gate = CAMPUS_BUILDINGS.find((o) => o.id === 'gate');
  const marks = LANDMARKS.map((l) => ({ ...l, ratio: 0, ...(l.id === 'gate-lm' && gate ? { name: `the ${buildingName(gate, workplace)}` } : {}) }));
  return [...others, ...marks]
    .map((o) => { const dx = o.x - b.pos.x; const dy = o.y - b.pos.y; return { o, dx, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) }; })
    .filter((v) => v.dx > 20 && Math.abs(v.a) < 1.1 && v.d < 620)
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map((v) => ({ id: v.o.id, name: v.o.name, kind: v.o.kind, d: v.d, a: v.a, left: 50 + (v.a / 1.1) * 38, size: Math.min(58, Math.max(22, 9000 / (v.d + 60))), ratio: v.o.ratio }));
}

/** "Looking out at Project Studio" (the nearest), or the skyline. */
export const lookingOut = (items: ViewItem[]): string => (items.length ? `Looking out at ${items[0].name}` : 'Looking out at the city skyline');
export const viewTitle = (items: ViewItem[]): string => (items.length ? `you can see ${items.map((i) => i.name).join(', ')}` : 'you can see the city skyline');

/** The mini buildings and landmarks inside the window, back to front, standing on the hills (C45: the v12 drawings, miniArt.tsx);
 *  their panes light at dusk and night. bottom = max(6, 22 - size / 3)% of the glass. */
export function WindowView({ items, lit }: { items: ViewItem[]; lit: boolean }): React.ReactElement {
  if (!items.length) return <span className="cm-view sky-line" aria-hidden="true" data-view="skyline" />;
  return (
    <span className={`cm-view${lit ? ' is-lit' : ''}`} aria-hidden="true">
      {[...items].reverse().map((i) => (
        <span key={i.id} className={`mini k-${i.kind}`} data-view={i.id} style={{ left: `${i.left}%`, width: `${i.size}%`, bottom: `${Math.max(6, 22 - i.size / 3)}%` }}>
          {LANDMARKS.some((l) => l.id === i.id) ? <MiniLandmark kind={i.kind} /> : <MiniBuilding id={i.id} kind={i.kind} ratio={i.ratio} lit={lit} />}
        </span>
      ))}
    </span>
  );
}
