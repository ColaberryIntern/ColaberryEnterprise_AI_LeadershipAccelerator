import type {
  CaseStudyWorkflowLane,
  CaseStudyWorkflowStatus,
  PublicCaseStudyWorkflowPanel,
} from '../../services/caseStudyPublicTypes';

/**
 * storyWorkflowEdges - where each arrow of a horizontal workflow drawing runs,
 * and where its label may sit.
 *
 * PURE GEOMETRY, like the layout that calls it: boxes in, paths out, nothing
 * else consulted. Split out of `storyWorkflowLayout` when the routing grew past
 * a straight curve between two centres.
 *
 * AN ARROW CROSSES ROWS IN A GAP, NOT BEHIND A BOX. A curve that leaves its
 * box horizontally and bends halfway to a lower row runs behind every box
 * that sits between the two in the row it left. So a diagonal that spans
 * columns looks at both rows: when the row it leaves is occupied and the row
 * it enters is free, it steps down in the first gap and runs the rest in the
 * clear row; when the reverse holds, it runs first and steps down in the last
 * gap; otherwise it bends in the middle as before.
 *
 * A LABEL IS DRAWN ONCE, OR NOT AT ALL. A label sits on a run (its midpoint)
 * or between two rows (the bend's midpoint), never a few pixels past a box
 * edge where the box paints over half of it. Then every label is checked
 * against every box and every label already placed; one that would collide
 * is not drawn, and the step panel still says it under "Reached from". The
 * first-declared edge keeps its label, so an author can order the edges to
 * choose which one the drawing shows.
 */

export interface WorkflowNodeBox {
  readonly key: string; readonly lane: CaseStudyWorkflowLane; readonly step: number;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  /** The label, wrapped to the box's width. */
  readonly labelLines: readonly string[];
}

export interface WorkflowEdgePath {
  readonly from: string; readonly to: string;
  /** SVG path data, absolute coordinates in the layout's viewBox. */
  readonly d: string;
  /** Where the label sits; the graph draws its baseline `LABEL_LIFT` above `labelY`. */
  readonly labelX: number; readonly labelY: number;
  readonly label: string | null;
  readonly status: CaseStudyWorkflowStatus;
  readonly motion: boolean;
  /** True when the edge runs back to an earlier or equal step. */
  readonly returns: boolean;
  /** False when the label has no clear room on the drawing; the panel still says it. */
  readonly labelFits: boolean;
}

interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface Routed { readonly d: string; readonly labelX: number; readonly labelY: number; readonly labelFits: boolean }

/** The graph draws a label's baseline this many px above `labelY`. */
export const LABEL_LIFT = 6;
/** Label metrics at 11 px with a 4 px halo: ~6 px per character, 15 px tall, 11 of them above the baseline. */
const EDGE_LABEL = { charPx: 6, padPx: 8, heightPx: 15, ascentPx: 11 } as const;
/** A straight hop shorter than this has no run for a label to sit on. */
const MIN_RUN = 56;

export const cubic = (x1: number, y1: number, cx1: number, cy1: number, cx2: number, cy2: number, x2: number, y2: number): string =>
  `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

/** A point on a cubic at t. */
export const bez = (t: number, a: number, c1: number, c2: number, b: number): number =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * b;

const labelRect = (label: string, x: number, y: number): Rect => {
  const width = label.length * EDGE_LABEL.charPx + EDGE_LABEL.padPx;
  return { x: x - width / 2, y: y - LABEL_LIFT - EDGE_LABEL.ascentPx, width, height: EDGE_LABEL.heightPx };
};

const overlaps = (a: Rect, b: Rect, slack: number): boolean =>
  a.x < b.x + b.width + slack && b.x < a.x + a.width + slack && a.y < b.y + b.height + slack && b.y < a.y + a.height + slack;

/** True when a box other than the two endpoints sits between x1 and x2 and touches the band from yTop to yBottom. */
const blocked = (boxes: readonly WorkflowNodeBox[], x1: number, x2: number, yTop: number, yBottom: number, skip: readonly string[]): boolean =>
  boxes.some((b) => !skip.includes(b.key) && b.y <= yBottom && yTop <= b.y + b.height && b.x + b.width > x1 && b.x < x2);

/** The top of the nearest row below `a`, for the corridor between the rows; the far row's centre when nothing is nearer. */
const nextRowTop = (a: WorkflowNodeBox, boxes: readonly WorkflowNodeBox[], fallback: number): number =>
  boxes.reduce((top, b) => (b.y > a.y + a.height && b.y < top ? b.y : top), fallback);

/**
 * A forward edge. Along a row it is a run. Between rows it is a bend placed
 * where no box is: in the middle when the band between the two is clear; in
 * the first gap when the row it enters is clear; in the last gap when the row
 * it leaves is clear; otherwise a corridor between the rows, stepping down in
 * the first gap and again in the last. Vertical jumps happen only in gaps.
 */
function forward(a: WorkflowNodeBox, b: WorkflowNodeBox, boxes: readonly WorkflowNodeBox[], gapX: number): Routed {
  const x1 = a.x + a.width; const y1 = a.y + a.height / 2;
  const x2 = b.x; const y2 = b.y + b.height / 2;
  if (Math.abs(y2 - y1) < a.height) {
    const dx = Math.max(24, (x2 - x1) / 2);
    return { d: cubic(x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2), labelX: (x1 + x2) / 2, labelY: y1, labelFits: (x2 - x1) >= MIN_RUN };
  }
  const gap = Math.min(gapX, x2 - x1);
  const skip = [a.key, b.key];
  const spans = x2 - x1 > gap + 1;
  const bandClear = !spans || !blocked(boxes, x1, x2, Math.min(y1, y2), Math.max(y1, y2), skip);
  if (bandClear) {
    const xm = (x1 + x2) / 2;
    // The bend's midpoint is between the two rows; the label is centred on it, not lifted above.
    return { d: cubic(x1, y1, xm, y1, xm, y2, x2, y2), labelX: xm, labelY: (y1 + y2) / 2 + LABEL_LIFT + 4, labelFits: true };
  }
  const xg1 = x1 + gap; const xm1 = x1 + gap / 2;
  const xg2 = x2 - gap; const xm2 = x2 - gap / 2;
  if (!blocked(boxes, x1, x2, y2, y2, skip)) {
    return { d: `${cubic(x1, y1, xm1, y1, xm1, y2, xg1, y2)} L ${x2} ${y2}`, labelX: (xg1 + x2) / 2, labelY: y2, labelFits: true };
  }
  if (!blocked(boxes, x1, x2, y1, y1, skip)) {
    return { d: `M ${x1} ${y1} L ${xg2} ${y1} C ${xm2} ${y1}, ${xm2} ${y2}, ${x2} ${y2}`, labelX: (x1 + xg2) / 2, labelY: y1, labelFits: true };
  }
  const lower = y2 > y1;
  const ym = lower ? (a.y + a.height + nextRowTop(a, boxes, y2)) / 2 : (b.y + b.height + nextRowTop(b, boxes, y1)) / 2;
  return {
    d: `${cubic(x1, y1, xm1, y1, xm1, ym, xg1, ym)} L ${xg2} ${ym} C ${xm2} ${ym}, ${xm2} ${y2}, ${x2} ${y2}`,
    labelX: (xg1 + xg2) / 2, labelY: ym + LABEL_LIFT + 4, labelFits: true,
  };
}

/** A return edge: a curve dropped below the row, from bottom centre to bottom centre. */
function back(a: WorkflowNodeBox, b: WorkflowNodeBox, gapY: number): Routed {
  const x1 = a.x + a.width / 2; const y1 = a.y + a.height;
  const x2 = b.x + b.width / 2; const y2 = b.y + b.height;
  const drop = gapY + 20;
  return {
    d: cubic(x1, y1, x1, y1 + drop, x2, y2 + drop, x2, y2),
    labelX: bez(0.5, x1, x1, x2, x2), labelY: bez(0.5, y1, y1 + drop, y2 + drop, y2), labelFits: true,
  };
}

/**
 * The column layout's labels, settled after the fact. A forward edge that
 * skips boxes runs behind them, and its midpoint label sat under one (seen
 * live on every brand at 768 and 390 on 2026-09-16). Each label now tries,
 * in order: the point the routing gave it; the gap just below the box it
 * leaves; the gap just above the box it enters. The first spot clear of every
 * box and every label already placed wins; with none, the panel says it.
 */
export function settleColumnLabels(
  edges: readonly WorkflowEdgePath[],
  boxes: ReadonlyMap<string, WorkflowNodeBox>,
  gapY: number,
): readonly WorkflowEdgePath[] {
  const all = [...boxes.values()];
  const placed: Rect[] = [];
  const clear = (rect: Rect): boolean =>
    !all.some((box) => overlaps(rect, box, 1)) && !placed.some((p) => overlaps(rect, p, 2));
  return edges.map((e) => {
    if (!e.label || !e.labelFits) return e;
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    const spots: [number, number][] = [[e.labelX, e.labelY]];
    if (!e.returns) {
      spots.push([a.x + a.width / 2, a.y + a.height + gapY / 2 + LABEL_LIFT + 4]);
      spots.push([b.x + b.width / 2, b.y - gapY / 2 + LABEL_LIFT + 4]);
    }
    for (const [x, y] of spots) {
      const rect = labelRect(e.label, x, y);
      if (clear(rect)) { placed.push(rect); return { ...e, labelX: x, labelY: y }; }
    }
    return { ...e, labelFits: false };
  });
}

/**
 * Every edge of the panel routed over the boxes the horizontal layout placed,
 * in declared order, each label drawn only where nothing else is.
 */
export function routeHorizontalEdges(
  panel: PublicCaseStudyWorkflowPanel,
  boxes: ReadonlyMap<string, WorkflowNodeBox>,
  gapX: number,
  gapY: number,
): readonly WorkflowEdgePath[] {
  const all = [...boxes.values()];
  const placed: Rect[] = [];
  return panel.edges.map((e) => {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    const returns = b.step <= a.step;
    const r = returns ? back(a, b, gapY) : forward(a, b, all, gapX);
    let labelFits = r.labelFits;
    if (e.label && labelFits) {
      const rect = labelRect(e.label, r.labelX, r.labelY);
      labelFits = !all.some((box) => overlaps(rect, box, 1)) && !placed.some((p) => overlaps(rect, p, 2));
      if (labelFits) placed.push(rect);
    }
    return { from: e.from, to: e.to, d: r.d, labelX: r.labelX, labelY: r.labelY, label: e.label, status: e.status, motion: e.motion, returns, labelFits };
  });
}
