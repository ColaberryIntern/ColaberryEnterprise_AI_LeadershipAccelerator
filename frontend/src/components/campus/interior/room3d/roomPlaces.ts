import type { Layout } from '../roomModel';

/**
 * Where people stand and where the furniture goes in the CSS 3D room (v3 §2.1 / v6 D1, the prototype's placeFigures in
 * docs/design/campus/colaberry-campus-v6.html). [x, z]: x is the share of the room's width from the left, z the share of its depth
 * from the front. Pure, so the placement is unit-tested without a browser.
 */
export type Place = [number, number];
type Kind = 'rows' | 'desks' | 'tables' | 'standing';

/** Our room layouts onto the prototype's four floor plans. */
export function planOf(layout: Layout): Kind {
  if (layout === 'rows' || layout === 'benches') return 'rows';
  if (layout === 'desks' || layout === 'pods' || layout === 'board') return 'desks';
  if (layout === 'tables') return 'tables';
  return 'standing';
}

/** The places people fill, in order. In a rows room with your spot (the Classroom's front-row seat), the rows shift left. */
export function peoplePlaces(layout: Layout, hasSpot: boolean): Place[] {
  switch (planOf(layout)) {
    case 'rows': return hasSpot
      ? [[0.24, 0.55], [0.4, 0.55], [0.56, 0.55], [0.22, 0.32], [0.38, 0.32], [0.54, 0.32], [0.62, 0.55]]
      : [[0.3, 0.55], [0.5, 0.55], [0.68, 0.55], [0.25, 0.32], [0.45, 0.32], [0.62, 0.32], [0.78, 0.32]];
    case 'desks': return [[0.3, 0.5], [0.55, 0.5], [0.75, 0.5], [0.3, 0.28], [0.55, 0.28]];
    case 'tables': return [[0.32, 0.5], [0.42, 0.56], [0.66, 0.42], [0.74, 0.5], [0.56, 0.3]];
    default: return [[0.35, 0.45], [0.6, 0.38], [0.48, 0.6], [0.72, 0.55], [0.28, 0.3]];
  }
}

/** Furniture pieces: class rows (two long desks), study desks (2 x 3 benches) or round tables. Width is a share of the room. */
export interface Piece { kind: 'row' | 'bench' | 'table'; x: number; z: number; w: number }
export function furnitureOf(layout: Layout, hasSpot: boolean): Piece[] {
  switch (planOf(layout)) {
    case 'rows': return [0.6, 0.37].map((z) => ({ kind: 'row' as const, x: hasSpot ? 0.4 : 0.5, z, w: hasSpot ? 0.5 : 0.62 }));
    case 'desks': return [0.55, 0.33].flatMap((z) => [0.3, 0.55, 0.75].map((x) => ({ kind: 'bench' as const, x, z, w: 0.17 })));
    case 'tables': return ([[0.37, 0.53], [0.7, 0.46]] as Place[]).map(([x, z]) => ({ kind: 'table' as const, x, z, w: 0 }));
    default: return [];
  }
}

/** You walk in from the front to here (prototype placeFigures: from [.5, -.05] to [.46, .12]). */
export const YOU_FROM: Place = [0.5, -0.05];
export const YOU_AT: Place = [0.46, 0.12];
/** The staff desk and its staffer (prototype: desk at [.2, .2], staffer just behind it). */
export const DESK_AT: Place = [0.2, 0.2];
export const STAFF_AT: Place = [0.2, 0.24];
/** The room's depth from its width (prototype layoutRoom): 0.6 x width, at most 820 px. */
export const roomDepth = (fw: number): number => Math.round(Math.min(fw * 0.6, 820));
