import type { BuildingId } from '../campusMap';

/**
 * "Your spot" in each room (Campus v6 D1, the prototype's SPOTS in docs/design/campus/colaberry-campus-v6.html): furniture where
 * you would actually do that building's work, with your name card. It replaces round 3's back door; the back-wall screen ("the
 * board") replaces the front door. Clicking a spot does what it opens:
 *  - 'ws': the workstation for the screen's card (walk to it, the camera drops in, then the workstation);
 *  - 'page': the building's page (the Game Room cabinet);
 *  - 'book': the "Book a call with admissions" sheet (the Admissions meeting table, v6 D3);
 *  - 'order': the order sheet (the Chow Hall counter, v11 C2).
 * Buildings where nobody works (Events Hall, My Progress) have no spot; their board's button does the action. C76 (Ali 2026-10-27):
 * the Schedule gets a planning desk; its chair opens your next unfinished Today item (usePageSummary sets the tower's card).
 * v7 R2 wins over v6 for the Community Lounge (now Meeting Rooms): no couch, it gets a hallway of doors instead.
 *
 * x and z place the spot on the floor (share of the room's width from the left, share of its depth from the front), w and h are
 * its size in px, as the prototype's billboards.
 */
export type SpotKind = 'desk' | 'seat' | 'carrel' | 'booth' | 'cabinet' | 'meet' | 'counter' | 'planner';
export type SpotOpens = 'ws' | 'page' | 'book' | 'order';
export interface SpotDef {
  kind: SpotKind;
  x: number; z: number; w: number; h: number;
  opens: SpotOpens;
  /** The arrival card's dark tile heading, and the workstation trail's "‹spot›" ("Your booth · ‹card›"). */
  tile: string;
  /** The tile's line ("Sit down and work on this card"). */
  sub: string;
}

export const SPOTS: Partial<Record<BuildingId | 'admissions', SpotDef>> = {
  studio: { kind: 'desk', x: 0.74, z: 0.16, w: 340, h: 250, opens: 'ws', tile: '🪑 Your desk', sub: 'Sit down and work on this card' },
  career: { kind: 'desk', x: 0.74, z: 0.16, w: 340, h: 250, opens: 'ws', tile: '🪑 Your desk', sub: 'Your seat at the team pod' },
  lecture: { kind: 'seat', x: 0.74, z: 0.18, w: 300, h: 215, opens: 'ws', tile: '💺 Your seat', sub: 'Take your seat and work on this card' },
  library: { kind: 'carrel', x: 0.75, z: 0.16, w: 300, h: 250, opens: 'ws', tile: '📚 Your carrel', sub: 'A quiet carrel for this guide' },
  testing: { kind: 'booth', x: 0.74, z: 0.16, w: 300, h: 260, opens: 'ws', tile: '🎧 Your booth', sub: 'A quiet booth for practice and the diagnostic' },
  // C36 (v8 G5): the Game Room has five cabinets in an aisle instead of one spot (games/ArcadeRoom)
  admissions: { kind: 'meet', x: 0.7, z: 0.2, w: 330, h: 220, opens: 'book', tile: '📅 Meet a person', sub: 'Book time with the admissions team' },
  // C39 (v11 C2): the Chow Hall service counter opens the order sheet
  chow: { kind: 'counter', x: 0.72, z: 0.2, w: 330, h: 230, opens: 'order', tile: '🛎 The counter', sub: 'Pick a craving, then your delivery app' },
  // C76: the Schedule's planning desk: sit down and your next Today item opens
  tower: { kind: 'planner', x: 0.66, z: 0.18, w: 340, h: 250, opens: 'ws', tile: '🪑 Your planning desk', sub: 'Sit down and start your next item for today' },
};

export const spotOf = (id: string): SpotDef | null => (SPOTS as Record<string, SpotDef | undefined>)[id] ?? null;

/** The arrival card's section heading for a room with a spot (v6 D1). */
export function waysHeading(s: SpotDef): string {
  if (s.opens === 'book') return 'Look up, or sit down with a person';
  if (s.opens === 'page') return 'Look up, or jump in';
  return 'Look up, or sit down';
}

/** The workstation trail's spot words: "Your booth" from "🎧 Your booth". */
export const spotWords = (s: SpotDef): string => s.tile.replace(/^\S+\s/, '');

/**
 * Up to three cubicles down the left side (v6 D2) for the rooms that work at desks; the spot itself stays the front-right one.
 * People present fill the cubicles first.
 */
export const CUBICLES: { x: number; z: number }[] = [{ x: 0.17, z: 0.3 }, { x: 0.17, z: 0.55 }, { x: 0.17, z: 0.8 }];
export const hasCubicles = (s: SpotDef | null): boolean => !!s && (s.kind === 'desk' || s.kind === 'carrel' || s.kind === 'booth');
