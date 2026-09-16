import type {
  CaseStudyWorkflowLane,
  CaseStudyWorkflowStatus,
  PublicCaseStudyWorkflowPanel,
} from '../../services/caseStudyPublicTypes';

/**
 * storyWorkflowLayout - where each box and arrow of a workflow panel goes.
 *
 * PURE GEOMETRY. A total function of the panel and an orientation; it reads no
 * DOM, no window and no clock, so the graph component renders the same SVG for
 * the same record every time and the tests can assert on coordinates.
 *
 * TWO ORIENTATIONS, ONE ALGORITHM. Every node gets a STEP (its distance from a
 * source, longest path, so a branch that rejoins lands after both of its
 * feeders) and a LANE (the record's own live / recovery / manual). Horizontal
 * puts steps on the x axis and lanes on the y axis, which is how a reader at a
 * desk follows a flow. Vertical, for a phone, stacks the steps top to bottom in
 * one column no wider than 360 and shows the lane as an indent and a stripe,
 * because three side-by-side lanes at phone width leave no room for words.
 *
 * NO EDGE IS EVER DROPPED. An edge whose target sits at or before its source
 * (a retry, a loop) is drawn as a return curve below the row rather than left
 * out; a graph the reader cannot follow is worse than one with a loop in it.
 */

export type WorkflowOrientation = 'horizontal' | 'vertical';

export interface WorkflowNodeBox {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lane: CaseStudyWorkflowLane;
  readonly step: number;
}

export interface WorkflowEdgePath {
  readonly from: string;
  readonly to: string;
  /** SVG path data, absolute coordinates in the layout's viewBox. */
  readonly d: string;
  /** Where the label sits: the curve's midpoint. */
  readonly labelX: number;
  readonly labelY: number;
  readonly label: string | null;
  readonly status: CaseStudyWorkflowStatus;
  readonly motion: boolean;
  /** True when the edge runs back to an earlier or equal step. */
  readonly returns: boolean;
}

export interface WorkflowLaneBand {
  readonly lane: CaseStudyWorkflowLane;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkflowLayout {
  readonly orientation: WorkflowOrientation;
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  readonly nodes: readonly WorkflowNodeBox[];
  readonly edges: readonly WorkflowEdgePath[];
  readonly lanes: readonly WorkflowLaneBand[];
}

const LANE_ORDER: readonly CaseStudyWorkflowLane[] = ['primary', 'recovery', 'manual'];

/** Box and gap sizes, in viewBox units. Fixed so the geometry is stable. */
const H = { boxW: 172, boxH: 64, gapX: 64, gapY: 18, laneGap: 30, laneLabel: 26, pad: 16 } as const;
const V = { boxW: 296, boxH: 60, gapY: 44, indent: 20, pad: 16, maxWidth: 360 } as const;

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

/** The lanes this panel actually uses, in the fixed live / recovery / manual order. */
function lanesUsed(panel: PublicCaseStudyWorkflowPanel): readonly CaseStudyWorkflowLane[] {
  const present = new Set(panel.nodes.map((n) => n.lane));
  return LANE_ORDER.filter((lane) => present.has(lane));
}

const cubic = (x1: number, y1: number, cx1: number, cy1: number, cx2: number, cy2: number, x2: number, y2: number): string =>
  `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

/** Point at t = 0.5 on a cubic: the label anchor. */
const mid = (a: number, c1: number, c2: number, b: number): number => (a + 3 * c1 + 3 * c2 + b) / 8;

function horizontal(panel: PublicCaseStudyWorkflowPanel, steps: ReadonlyMap<string, number>): WorkflowLayout {
  const lanes = lanesUsed(panel);
  const boxes = new Map<string, WorkflowNodeBox>();
  const bands: WorkflowLaneBand[] = [];
  const maxStep = Math.max(0, ...steps.values());
  const width = H.pad * 2 + (maxStep + 1) * H.boxW + maxStep * H.gapX;
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
        x: H.pad + step * (H.boxW + H.gapX),
        y: top + row * (H.boxH + H.gapY),
        width: H.boxW, height: H.boxH,
      });
    }
    const height = H.laneLabel + rows * H.boxH + (rows - 1) * H.gapY + H.gapY;
    bands.push({ lane, label: panel.laneLabels[lane], x: 0, y, width, height });
    y += height + H.laneGap;
  }
  const height = y - H.laneGap + H.pad;
  const edges = panel.edges.map((e) => {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    const returns = b.step <= a.step;
    let d: string;
    let labelX: number;
    let labelY: number;
    if (!returns) {
      const x1 = a.x + a.width; const y1 = a.y + a.height / 2;
      const x2 = b.x; const y2 = b.y + b.height / 2;
      const dx = Math.max(24, (x2 - x1) / 2);
      d = cubic(x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2);
      labelX = mid(x1, x1 + dx, x2 - dx, x2); labelY = mid(y1, y1, y2, y2);
    } else {
      const x1 = a.x + a.width / 2; const y1 = a.y + a.height;
      const x2 = b.x + b.width / 2; const y2 = b.y + b.height;
      const drop = H.gapY + 20;
      d = cubic(x1, y1, x1, y1 + drop, x2, y2 + drop, x2, y2);
      labelX = mid(x1, x1, x2, x2); labelY = mid(y1, y1 + drop, y2 + drop, y2);
    }
    return { from: e.from, to: e.to, d, labelX, labelY, label: e.label, status: e.status, motion: e.motion, returns };
  });
  return { orientation: 'horizontal', width, height, viewBox: `0 0 ${width} ${height}`, nodes: [...boxes.values()], edges, lanes: bands };
}

function vertical(panel: PublicCaseStudyWorkflowPanel, steps: ReadonlyMap<string, number>): WorkflowLayout {
  const lanes = lanesUsed(panel);
  const laneIndex = new Map(lanes.map((lane, i) => [lane, i]));
  const ordered = [...panel.nodes].sort((a, b) =>
    (steps.get(a.key)! - steps.get(b.key)!) || (laneIndex.get(a.lane)! - laneIndex.get(b.lane)!));
  const width = V.maxWidth;
  const boxW = V.boxW - (lanes.length - 1) * V.indent;
  const boxes = new Map<string, WorkflowNodeBox>();
  ordered.forEach((n, i) => {
    boxes.set(n.key, {
      key: n.key, lane: n.lane, step: steps.get(n.key)!,
      x: V.pad + (laneIndex.get(n.lane) ?? 0) * V.indent,
      y: V.pad + i * (V.boxH + V.gapY),
      width: boxW, height: V.boxH,
    });
  });
  const height = V.pad * 2 + ordered.length * V.boxH + (ordered.length - 1) * V.gapY;
  const edges = panel.edges.map((e) => {
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
      labelX = mid(x1, x1, x2, x2); labelY = mid(y1, y1 + dy, y2 - dy, y2);
    } else {
      const x1 = a.x + a.width; const y1 = a.y + a.height / 2;
      const x2 = b.x + b.width; const y2 = b.y + b.height / 2;
      const bulge = 28;
      d = cubic(x1, y1, x1 + bulge, y1, x2 + bulge, y2, x2, y2);
      labelX = mid(x1, x1 + bulge, x2 + bulge, x2); labelY = mid(y1, y1, y2, y2);
    }
    return { from: e.from, to: e.to, d, labelX, labelY, label: e.label, status: e.status, motion: e.motion, returns };
  });
  const bands = lanes.map((lane, i) => ({
    lane, label: panel.laneLabels[lane], x: V.pad + i * V.indent - 6, y: V.pad, width: 3, height: height - V.pad * 2,
  }));
  return { orientation: 'vertical', width, height, viewBox: `0 0 ${width} ${height}`, nodes: [...boxes.values()], edges, lanes: bands };
}

/** Horizontal at 768 CSS px and wider, vertical below; the caller passes the width it measured. */
export const orientationFor = (viewportWidth: number): WorkflowOrientation =>
  viewportWidth >= 768 ? 'horizontal' : 'vertical';

export function layoutWorkflow(panel: PublicCaseStudyWorkflowPanel, orientation: WorkflowOrientation): WorkflowLayout {
  const known = new Set(panel.nodes.map((n) => n.key));
  const safe: PublicCaseStudyWorkflowPanel = {
    ...panel,
    // The server validates endpoints; this guard only keeps a malformed wire from throwing mid-render.
    edges: panel.edges.filter((e) => known.has(e.from) && known.has(e.to)),
  };
  const steps = workflowSteps(safe);
  return orientation === 'horizontal' ? horizontal(safe, steps) : vertical(safe, steps);
}
