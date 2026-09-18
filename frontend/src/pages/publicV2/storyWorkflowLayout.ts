import type { CaseStudyWorkflowLane, PublicCaseStudyWorkflowPanel } from '../../services/caseStudyPublicTypes';
import { wrapLabel } from './storyVisualModel';
import { bez, cubic, routeHorizontalEdges, settleColumnLabels } from './storyWorkflowEdges';
import type { WorkflowEdgePath, WorkflowNodeBox } from './storyWorkflowEdges';

export type { WorkflowEdgePath, WorkflowNodeBox } from './storyWorkflowEdges';

/**
 * storyWorkflowLayout - where each box and arrow of a workflow panel goes.
 *
 * PURE GEOMETRY. A total function of the panel, an orientation and a width; no
 * DOM, no window, no clock, so the same record draws the same SVG every time.
 *
 * TWO ORIENTATIONS, ONE ALGORITHM. Every node gets a STEP (longest path from a
 * source, so a rejoining branch lands after both feeders) and a LANE. Horizontal
 * puts steps on x and lanes on y; vertical stacks the steps in one column and
 * shows the lane as an indent and a stripe.
 *
 * IT FITS THE WIDTH IT IS GIVEN, OR SAYS SO. With `maxWidth` the horizontal
 * layout sizes boxes and gaps to span exactly that width, wraps labels to the
 * box, and reports `fits: false` when a box would drop below a readable width;
 * the caller then takes the vertical column, which always fits. The drawing
 * never asks the page for a horizontal scrollbar.
 *
 * NO EDGE IS EVER DROPPED. A retry or loop is drawn as a return curve below
 * the row; a graph the reader cannot follow is worse than one with a loop.
 * Where each horizontal arrow runs, and which labels the drawing has room
 * for, is `storyWorkflowEdges`; the box and edge types live there too.
 */

export type WorkflowOrientation = 'horizontal' | 'vertical';

export interface WorkflowLaneBand {
  readonly lane: CaseStudyWorkflowLane; readonly label: string;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}

export interface WorkflowLayout {
  readonly orientation: WorkflowOrientation;
  /** False when a horizontal layout could not give every box a readable width; take the vertical one. */
  readonly fits: boolean;
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  readonly nodes: readonly WorkflowNodeBox[];
  readonly edges: readonly WorkflowEdgePath[];
  readonly lanes: readonly WorkflowLaneBand[];
}

const LANE_ORDER: readonly CaseStudyWorkflowLane[] = ['primary', 'recovery', 'manual'];

/** Box and gap sizes, in viewBox units (one unit is one CSS pixel when the SVG spans its `maxWidth`). */
const H = { boxW: 172, boxWMin: 100, boxWMax: 200, gapX: 64, gapXMin: 24, gapY: 18, laneGap: 30, laneLabel: 26, pad: 16 } as const;
const V = { boxW: 296, boxWMax: 520, gapY: 44, indent: 20, pad: 16, maxWidth: 360 } as const;
/** Label metrics: ~6.4 px per character at 13 px, 24 px of box padding, 15 px per line; four lines hold a 40-character label in a laptop-width column of nine. */
const LABEL = { charPx: 6.4, padPx: 24, linePx: 15, maxLines: 4, headPx: 30 } as const;

const charsPerLine = (boxW: number): number => Math.max(10, Math.floor((boxW - LABEL.padPx) / LABEL.charPx));

/** `maxWidth`: the width the drawing may use, in CSS pixels; omit for the fixed default sizes. */
export interface LayoutOptions { readonly maxWidth?: number }

/**
 * The edges that point forward. A depth-first walk from each source, in
 * declared order, marks an edge as a RETURN when it lands on a node still on
 * the walk's own stack (a retry, a loop). Steps are computed over the rest, so
 * a loop never stalls the ordering and the return edge is still drawn.
 */
function forwardEdges(panel: PublicCaseStudyWorkflowPanel): readonly PublicCaseStudyWorkflowPanel['edges'][number][] {
  const state = new Map<string, 'open' | 'done'>();
  const returns = new Set<number>();
  const visit = (k: string): void => {
    state.set(k, 'open');
    panel.edges.forEach((e, i) => {
      if (e.from !== k || e.from === e.to) return;
      const s = state.get(e.to);
      if (s === 'open') returns.add(i);
      else if (s === undefined) visit(e.to);
    });
    state.set(k, 'done');
  };
  for (const n of panel.nodes) if (!state.has(n.key)) visit(n.key);
  return panel.edges.filter((e, i) => !returns.has(i) && e.from !== e.to);
}

/**
 * Longest-path step per node over the forward edges (Kahn's algorithm), so a
 * branch that rejoins lands after both of its feeders. Every node gets a step.
 */
export function workflowSteps(panel: PublicCaseStudyWorkflowPanel): ReadonlyMap<string, number> {
  const keys = panel.nodes.map((n) => n.key);
  const indegree = new Map<string, number>(keys.map((k) => [k, 0]));
  const out = new Map<string, string[]>(keys.map((k) => [k, []]));
  for (const e of forwardEdges(panel)) {
    if (!indegree.has(e.from) || !indegree.has(e.to)) continue;
    out.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  const step = new Map<string, number>();
  const queue = keys.filter((k) => indegree.get(k) === 0);
  for (const k of queue) step.set(k, 0);
  while (queue.length > 0) {
    const k = queue.shift()!;
    for (const next of out.get(k) ?? []) {
      step.set(next, Math.max(step.get(next) ?? 0, (step.get(k) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  let tail = Math.max(-1, ...step.values());
  for (const k of keys) if (!step.has(k)) step.set(k, ++tail);
  return step;
}

function lanesUsed(panel: PublicCaseStudyWorkflowPanel): readonly CaseStudyWorkflowLane[] {
  const present = new Set(panel.nodes.map((n) => n.lane));
  return LANE_ORDER.filter((lane) => present.has(lane));
}

function horizontal(panel: PublicCaseStudyWorkflowPanel, steps: ReadonlyMap<string, number>, maxWidth?: number): WorkflowLayout {
  const lanes = lanesUsed(panel);
  const boxes = new Map<string, WorkflowNodeBox>();
  const bands: WorkflowLaneBand[] = [];
  const maxStep = Math.max(0, ...steps.values());
  const columns = maxStep + 1;
  // Size the boxes to the width offered: as wide as the default allows, never
  // narrower than a label can be read in; the gaps take what is left.
  let boxW: number = H.boxW;
  let gapX: number = H.gapX;
  let fits = true;
  if (maxWidth !== undefined) {
    const inner = maxWidth - H.pad * 2;
    boxW = Math.min(H.boxWMax, Math.floor((inner - (columns - 1) * H.gapXMin) / columns));
    if (boxW < H.boxWMin) { fits = false; boxW = H.boxWMin; }
    gapX = columns > 1 ? Math.max(H.gapXMin, Math.min(H.gapX, (inner - columns * boxW) / (columns - 1))) : 0;
  }
  const chars = charsPerLine(boxW);
  const lines = new Map(panel.nodes.map((n) => [n.key, wrapLabel(n.label, chars, LABEL.maxLines)] as const));
  const boxH = LABEL.headPx + LABEL.linePx * Math.max(1, ...[...lines.values()].map((l) => l.length));
  const width = maxWidth !== undefined && fits ? maxWidth : H.pad * 2 + columns * boxW + (columns - 1) * gapX;
  let y = H.pad;
  for (const lane of lanes) {
    const members = panel.nodes.filter((n) => n.lane === lane);
    const rowsAt = new Map<number, number>();
    const top = y + H.laneLabel;
    let rows = 1;
    for (const n of members) {
      const step = steps.get(n.key) ?? 0;
      const row = rowsAt.get(step) ?? 0;
      rowsAt.set(step, row + 1);
      rows = Math.max(rows, row + 1);
      boxes.set(n.key, {
        key: n.key, lane, step,
        x: H.pad + step * (boxW + gapX),
        y: top + row * (boxH + H.gapY),
        width: boxW, height: boxH,
        labelLines: lines.get(n.key) ?? [n.label],
      });
    }
    const height = H.laneLabel + rows * boxH + (rows - 1) * H.gapY + H.gapY;
    bands.push({ lane, label: panel.laneLabels[lane], x: 0, y, width, height });
    y += height + H.laneGap;
  }
  const height = y - H.laneGap + H.pad;
  const edges = routeHorizontalEdges(panel, boxes, gapX, H.gapY);
  return { orientation: 'horizontal', fits, width, height, viewBox: `0 0 ${width} ${height}`, nodes: [...boxes.values()], edges, lanes: bands };
}

function vertical(panel: PublicCaseStudyWorkflowPanel, steps: ReadonlyMap<string, number>, maxWidth?: number): WorkflowLayout {
  const lanes = lanesUsed(panel);
  const laneIndex = new Map(lanes.map((lane, i) => [lane, i]));
  const ordered = [...panel.nodes].sort((a, b) =>
    (steps.get(a.key)! - steps.get(b.key)!) || (laneIndex.get(a.lane)! - laneIndex.get(b.lane)!));
  // One column as wide as the width offered allows, up to a comfortable line length.
  const width = maxWidth !== undefined ? Math.max(200, Math.floor(maxWidth)) : V.maxWidth;
  const boxW = Math.min(V.boxWMax, width - V.pad * 2 - (lanes.length - 1) * V.indent);
  const chars = charsPerLine(boxW);
  const lines = new Map(panel.nodes.map((n) => [n.key, wrapLabel(n.label, chars, LABEL.maxLines)] as const));
  const boxH = LABEL.headPx + LABEL.linePx * Math.max(1, ...[...lines.values()].map((l) => l.length));
  const boxes = new Map<string, WorkflowNodeBox>();
  ordered.forEach((n, i) => {
    boxes.set(n.key, {
      key: n.key, lane: n.lane, step: steps.get(n.key)!,
      x: V.pad + (laneIndex.get(n.lane) ?? 0) * V.indent,
      y: V.pad + i * (boxH + V.gapY),
      width: boxW, height: boxH,
      labelLines: lines.get(n.key) ?? [n.label],
    });
  });
  const height = V.pad * 2 + ordered.length * boxH + (ordered.length - 1) * V.gapY;
  const routed = panel.edges.map((e) => {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    const returns = b.y <= a.y;
    let d: string;
    let labelX: number;
    let labelY: number;
    if (!returns) {
      const x1 = a.x + a.width / 2; const y1 = a.y + a.height;
      const x2 = b.x + b.width / 2; const y2 = b.y;
      const dy = Math.max(12, (y2 - y1) / 2);
      d = cubic(x1, y1, x1, y1 + dy, x2, y2 - dy, x2, y2);
      labelX = bez(0.5, x1, x1, x2, x2); labelY = bez(0.5, y1, y1 + dy, y2 - dy, y2);
    } else {
      const x1 = a.x + a.width; const y1 = a.y + a.height / 2;
      const x2 = b.x + b.width; const y2 = b.y + b.height / 2;
      const bulge = 28;
      d = cubic(x1, y1, x1 + bulge, y1, x2 + bulge, y2, x2, y2);
      labelX = bez(0.5, x1, x1 + bulge, x2 + bulge, x2); labelY = bez(0.5, y1, y1, y2, y2);
    }
    return { from: e.from, to: e.to, d, labelX, labelY, label: e.label, status: e.status, motion: e.motion, returns, labelFits: true };
  });
  // A skip edge's midpoint is behind a box; its label finds a gap or is said in the panel.
  const edges = settleColumnLabels(routed, boxes, V.gapY);
  const bands = lanes.map((lane, i) => ({
    lane, label: panel.laneLabels[lane], x: V.pad + i * V.indent - 6, y: V.pad, width: 3, height: height - V.pad * 2,
  }));
  return { orientation: 'vertical', fits: true, width, height, viewBox: `0 0 ${width} ${height}`, nodes: [...boxes.values()], edges, lanes: bands };
}

/** Horizontal at 768 CSS px and wider, vertical below. */
export const orientationFor = (viewportWidth: number): WorkflowOrientation =>
  viewportWidth >= 768 ? 'horizontal' : 'vertical';

export function layoutWorkflow(panel: PublicCaseStudyWorkflowPanel, orientation: WorkflowOrientation, options: LayoutOptions = {}): WorkflowLayout {
  const known = new Set(panel.nodes.map((n) => n.key));
  const safe: PublicCaseStudyWorkflowPanel = {
    ...panel,
    // The server validates endpoints; this guard only keeps a malformed wire from throwing mid-render.
    edges: panel.edges.filter((e) => known.has(e.from) && known.has(e.to)),
  };
  const steps = workflowSteps(safe);
  return orientation === 'horizontal' ? horizontal(safe, steps, options.maxWidth) : vertical(safe, steps, options.maxWidth);
}

/**
 * How much wider than its canvas a horizontal drawing may be before stacking is
 * the better answer. The SVG is sized `width: 100%; height: auto`, so a wider
 * viewBox is SCALED into the canvas rather than clipped or scrolled: at 1.6 the
 * 12px node label renders at about 7.5px, which is the floor for reading it.
 */
const MAX_SCALE_DOWN = 1.6;

/**
 * The layout for the width the page offers: horizontal when the viewport is a
 * desk, vertical when it is a phone. The page never scrolls sideways for the
 * drawing either way, because the SVG scales to its canvas.
 *
 * WHY A NARROW CANVAS NO LONGER STACKS THE FLOW. The rule used to fall back to
 * the vertical column whenever the horizontal layout could not fit the canvas at
 * full size. That reads as a different drawing, not a smaller one: on
 * aiflotation.com, whose record column is 1024px against the training site's
 * 1384, the same twelve-step panel came out as a stack of boxes with the lanes
 * gone and the edge labels overlapping, while the other two sites drew lanes.
 * Ali, 2026-09-17: "I'm not feeling the chart here. It's just not even close to
 * the same effect." A viewBox wider than the canvas is scaled by the browser, so
 * keeping the horizontal composition and letting it shrink preserves the lanes,
 * the left-to-right reading and the step order at every desk width. Past
 * `MAX_SCALE_DOWN` the type would be too small to read and the column is again
 * the honest answer.
 */
export function layoutWorkflowToFit(panel: PublicCaseStudyWorkflowPanel, viewportWidth: number, maxWidth: number): WorkflowLayout {
  if (orientationFor(viewportWidth) === 'horizontal') {
    const h = layoutWorkflow(panel, 'horizontal', { maxWidth });
    if (h.fits) return h;
    // `maxWidth` of 0 or less is a canvas that has not been measured yet; the
    // ratio would be meaningless, so the unfitted horizontal layout stands.
    if (maxWidth <= 0 || h.width <= maxWidth * MAX_SCALE_DOWN) return h;
  }
  return layoutWorkflow(panel, 'vertical', { maxWidth });
}
