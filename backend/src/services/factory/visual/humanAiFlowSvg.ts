/**
 * The human/AI task breakdown, as ONE whole-flow picture.
 *
 * ## Why this exists, in the DRI's words
 *
 * Demo Tuesday, 2026-11-03, 10:06 Central (transcript, 01:26:00):
 *
 *   "Take all of that information and then create a visual that gives you a flow in line with
 *    ... the whole thing is a big picture instead of individual positions."
 *
 * and the split it has to show, from Akiwam at 01:28:27, which Ali endorsed on the call:
 *
 *   "we let the AI work on most of parts, and we're gonna give a human, the approval side"
 *
 * The purpose is a screenshot for an RFP response (01:25:00: "we're gonna be taking screenshots
 * of this application"), so this renders at a fixed, print-friendly width and does not depend on
 * a browser, a CDN or a client-side chart library.
 *
 * ## Why server-generated SVG rather than Mermaid
 *
 * Following `services/delivery/scopeDiagram.ts`, whose header records the decision (Ali,
 * 2026-09-05). A chart that renders empty because a CDN was slow still looks finished, and this
 * output is going into a bid.
 *
 * ## What it draws from, and what it refuses to invent
 *
 * `AllocationRow.execution_class` is the authoritative human/AI axis. It is DERIVED, by
 * `deriveAllocation`, from the assignments — so this renderer never recomputes it. Where a task
 * has no allocation row, it is drawn as UNCLASSIFIED rather than guessed into a lane: a diagram
 * that silently shows an unclassified task as human is worse than one that admits the gap, since
 * the whole point is to show who does what.
 */
import type {
  FactoryTask,
  Assignment,
  AllocationRow,
  Role,
  TransitionEdge,
} from '../contracts/factoryContract';

export interface HumanAiFlowInput {
  readonly tasks: readonly FactoryTask[];
  readonly assignments: readonly Assignment[];
  readonly allocation: readonly AllocationRow[];
  readonly roles: readonly Role[];
  readonly transitions: readonly TransitionEdge[];
  /** Shown in the header. The project or bid this flow belongs to. */
  readonly title?: string;
  readonly subtitle?: string;
}

/** The lane a task is drawn in. `spine` carries START/END, which nobody performs. */
export type Lane = 'ai' | 'human' | 'spine' | 'unclassified';

export const LANE_LABELS: Readonly<Record<Lane, string>> = {
  ai: 'AI performs, human approves',
  human: 'Human performs',
  spine: 'Start and end',
  unclassified: 'Not classified',
};

/**
 * Lane for one task.
 *
 * `ai_autonomous` shares the AI lane but is flagged separately in the node badge, because an
 * agent acting with NO human approver is a materially different claim to make in a bid than an
 * agent whose work a human signs off.
 */
export function laneOf(task: FactoryTask, alloc: AllocationRow | undefined): Lane {
  if (task.kind === 'START' || task.kind === 'END') return 'spine';
  if (!alloc) return 'unclassified';
  switch (alloc.execution_class) {
    case 'human': return 'human';
    case 'ai_with_approval':
    case 'ai_autonomous':
    case 'deterministic_software': return 'ai';
    default: return 'unclassified';
  }
}

/**
 * Depth of each task from the START nodes, following forward edges only.
 *
 * Rework edges are excluded from layering on purpose: a rework edge points BACKWARDS, so counting
 * it would put a task at a greater depth than the step it corrects and the flow would read as
 * though the correction happens later than the thing being corrected. They are still DRAWN — see
 * `renderHumanAiFlowSvg` — just not used to decide position.
 *
 * A task unreachable from any START still gets a level (after the deepest reachable one) rather
 * than being dropped. Dropping it would hide work from a diagram whose job is to show all of it.
 */
export function levelsOf(
  tasks: readonly FactoryTask[],
  transitions: readonly TransitionEdge[],
): Map<string, number> {
  const ids = new Set(tasks.map((t) => t.id));
  const forward = transitions.filter((e) => !e.is_rework
    && ids.has(e.from_task_id) && ids.has(e.to_task_id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const t of tasks) { outgoing.set(t.id, []); indegree.set(t.id, 0); }
  for (const e of forward) {
    outgoing.get(e.from_task_id)!.push(e.to_task_id);
    indegree.set(e.to_task_id, (indegree.get(e.to_task_id) ?? 0) + 1);
  }

  const level = new Map<string, number>();
  // Seed with declared STARTs, else anything with no inbound edge, else the first task — so a
  // malformed graph still lays out instead of producing an empty picture.
  let frontier = tasks.filter((t) => t.kind === 'START').map((t) => t.id);
  if (frontier.length === 0) frontier = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  if (frontier.length === 0 && tasks.length > 0) frontier = [tasks[0].id];
  for (const id of frontier) level.set(id, 0);

  // Breadth-first with a visit cap, so a cycle among forward edges cannot spin forever.
  let guard = tasks.length * tasks.length + 8;
  while (frontier.length > 0 && guard-- > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const base = level.get(id) ?? 0;
      for (const to of outgoing.get(id) ?? []) {
        const proposed = base + 1;
        if ((level.get(to) ?? -1) < proposed) { level.set(to, proposed); next.push(to); }
      }
    }
    frontier = next;
  }

  const deepest = [...level.values()].reduce((m, v) => Math.max(m, v), 0);
  for (const t of tasks) if (!level.has(t.id)) level.set(t.id, deepest + 1);
  return level;
}

const LANE_ORDER: readonly Lane[] = ['ai', 'spine', 'human', 'unclassified'];

const NODE_W = 240;
const MIN_GAP = 60;
/** Condition labels render at 11px italic; this is the measured average advance per character. */
const COND_CHAR_W = 6.2;
const NODE_H = 104;
const ROW_GAP = 26;
const PAD_X = 28;
const HEADER_H = 92;
const LANE_LABEL_W = 0;

/** Cherry/leaf tokens from `frontend/src/styles/tokens.css`, not invented hex. */
const C = {
  cherry: '#FB2832',
  cherryDeep: '#C20E1E',
  cherryBg: '#FFF0F1',
  leaf: '#77BB4A',
  text: '#2d3748',
  textLight: '#718096',
  border: '#e2e8f0',
  bgAlt: '#f7fafc',
  white: '#ffffff',
};

/**
 * Column width, DERIVED from the longest branch-condition label rather than fixed.
 *
 * Two rounds of this diagram shipped with clipped conditions -- "administrative" rendering as
 * "adr", then as "administrativ" -- because a hardcoded column left a gap narrower than the
 * label centred in it. Bumping the constant fixes today's data and waits to break on a longer
 * condition, so the gap is computed from the labels instead. The conditions carry the branch
 * logic; a diagram that hides them misrepresents the flow.
 */
export function columnWidthFor(transitions: readonly TransitionEdge[]): number {
  const longest = transitions.reduce(
    (m, e) => Math.max(m, String(e.condition ?? '').length), 0,
  );
  return NODE_W + Math.max(MIN_GAP, Math.ceil(longest * COND_CHAR_W) + 20);
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Greedy word wrap to a character budget per line, capped at `maxLines` with an ellipsis. */
export function wrapText(text: string, perLine: number, maxLines: number): string[] {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur === '') { cur = w; continue; }
    if ((cur + ' ' + w).length <= perLine) { cur += ' ' + w; continue; }
    lines.push(cur); cur = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur !== '') lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:]+$/, '')}...`;
  }
  return lines.length > 0 ? lines : [''];
}

interface Placed {
  task: FactoryTask;
  lane: Lane;
  alloc: AllocationRow | undefined;
  performer: Assignment | undefined;
  approver: Assignment | undefined;
  x: number;
  y: number;
}

/**
 * The whole flow as one standalone SVG string.
 *
 * Standalone on purpose: it carries its own fonts-by-family and colours and references nothing
 * external, so it renders identically inside an HTML page, a PDF, or on its own.
 */
export function renderHumanAiFlowSvg(input: HumanAiFlowInput): string {
  const allocByTask = new Map(input.allocation.map((a) => [a.task_id, a]));
  const roleName = new Map(input.roles.map((r) => [r.id, r.name]));
  const perfByTask = new Map<string, Assignment>();
  const apprByTask = new Map<string, Assignment>();
  for (const a of input.assignments) {
    if (a.responsibility === 'PERFORMER' && !perfByTask.has(a.task_id)) perfByTask.set(a.task_id, a);
    // ACCOUNTABLE or APPROVER is "the approval side" in the DRI's phrasing; either counts.
    if ((a.responsibility === 'ACCOUNTABLE' || a.responsibility === 'APPROVER')
      && !apprByTask.has(a.task_id)) apprByTask.set(a.task_id, a);
  }

  const COL_W = columnWidthFor(input.transitions);
  const level = levelsOf(input.tasks, input.transitions);
  const lanes = new Map<string, Lane>();
  for (const t of input.tasks) lanes.set(t.id, laneOf(t, allocByTask.get(t.id)));

  // Only lanes that are actually used get vertical space: an empty "Not classified" band would
  // read as a finding when there is nothing wrong.
  const usedLanes = LANE_ORDER.filter((l) => [...lanes.values()].includes(l));

  // Stack within (level, lane) so a branch to two tasks at the same depth does not overlap.
  const slot = new Map<string, number>();
  const counter = new Map<string, number>();
  for (const t of [...input.tasks].sort((a, b) => (level.get(a.id)! - level.get(b.id)!))) {
    const key = `${level.get(t.id)}|${lanes.get(t.id)}`;
    const n = counter.get(key) ?? 0;
    slot.set(t.id, n);
    counter.set(key, n + 1);
  }

  const laneRows = new Map<Lane, number>();
  for (const l of usedLanes) {
    let maxStack = 1;
    for (const t of input.tasks) {
      if (lanes.get(t.id) !== l) continue;
      maxStack = Math.max(maxStack, (counter.get(`${level.get(t.id)}|${l}`) ?? 1));
    }
    laneRows.set(l, maxStack);
  }

  const laneTop = new Map<Lane, number>();
  let y = HEADER_H;
  for (const l of usedLanes) {
    laneTop.set(l, y);
    y += (laneRows.get(l) ?? 1) * (NODE_H + ROW_GAP) + 18;
  }
  const totalH = y + 96; // room for the legend
  const maxLevel = [...level.values()].reduce((m, v) => Math.max(m, v), 0);
  const totalW = PAD_X * 2 + LANE_LABEL_W + (maxLevel + 1) * COL_W;

  const placed: Placed[] = input.tasks.map((t) => {
    const lane = lanes.get(t.id)!;
    return {
      task: t,
      lane,
      alloc: allocByTask.get(t.id),
      performer: perfByTask.get(t.id),
      approver: apprByTask.get(t.id),
      x: PAD_X + LANE_LABEL_W + level.get(t.id)! * COL_W,
      y: (laneTop.get(lane) ?? HEADER_H) + (slot.get(t.id) ?? 0) * (NODE_H + ROW_GAP),
    };
  });
  const byId = new Map(placed.map((p) => [p.task.id, p]));

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" `
    + `viewBox="0 0 ${totalW} ${totalH}" role="img" `
    + `aria-label="${esc(input.title ?? 'Human and AI task flow')}">`);
  out.push(`<rect width="${totalW}" height="${totalH}" fill="${C.white}"/>`);
  out.push('<defs>'
    + `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
    + `<path d="M0,0 L10,5 L0,10 z" fill="${C.textLight}"/></marker>`
    + `<marker id="arrow-rework" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
    + `<path d="M0,0 L10,5 L0,10 z" fill="${C.cherry}"/></marker>`
    + '</defs>');

  // Header
  out.push(`<text x="${PAD_X}" y="38" font-family="Segoe UI, system-ui, sans-serif" `
    + `font-size="23" font-weight="700" fill="${C.cherry}">${esc(input.title ?? 'Human and AI task flow')}</text>`);
  if (input.subtitle) {
    out.push(`<text x="${PAD_X}" y="62" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="13" fill="${C.textLight}">${esc(input.subtitle)}</text>`);
  }

  // Lane bands
  for (const l of usedLanes) {
    const top = laneTop.get(l)! - 14;
    const h = (laneRows.get(l) ?? 1) * (NODE_H + ROW_GAP) + 6;
    out.push(`<rect x="${PAD_X - 10}" y="${top}" width="${totalW - PAD_X * 2 + 20}" height="${h}" `
      + `rx="10" fill="${l === 'ai' ? C.cherryBg : C.bgAlt}" stroke="${C.border}"/>`);
    out.push(`<text x="${PAD_X - 2}" y="${top + 15}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" font-weight="600" letter-spacing="0.6" `
      + `fill="${l === 'ai' ? C.cherryDeep : C.textLight}">${esc(LANE_LABELS[l].toUpperCase())}</text>`);
  }

  // Edges first, so nodes sit on top of them.
  for (const e of input.transitions) {
    const a = byId.get(e.from_task_id);
    const b = byId.get(e.to_task_id);
    if (!a || !b) continue;
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const mid = x1 + Math.max(18, (x2 - x1) / 2);
    const stroke = e.is_rework ? C.cherry : C.textLight;
    const dash = e.is_rework ? ' stroke-dasharray="6 4"' : '';
    const marker = e.is_rework ? 'arrow-rework' : 'arrow';
    // A rework edge runs backwards, so route it under the row rather than through the nodes.
    const d = e.is_rework
      ? `M ${x1 - NODE_W / 2} ${a.y + NODE_H} V ${Math.max(y1, y2) + 34} H ${x2 + NODE_W / 2} V ${b.y + NODE_H}`
      : `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
    out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"${dash} marker-end="url(#${marker})"/>`);
    if (e.condition) {
      // Centred on the vertical run, in the gap between columns, so it cannot be overdrawn by
      // the target node. Anchored middle rather than start for the same reason.
      out.push(`<text x="${mid}" y="${y2 - 8}" text-anchor="middle" `
        + `font-family="Segoe UI, system-ui, sans-serif" font-size="11" font-style="italic" `
        + `fill="${C.textLight}">${esc(e.condition)}</text>`);
    }
  }

  // Nodes
  for (const p of placed) {
    const isAi = p.lane === 'ai';
    const isSpine = p.lane === 'spine';
    const accent = p.lane === 'unclassified' ? C.textLight : (isAi ? C.cherry : (isSpine ? C.textLight : C.leaf));
    const h = isSpine ? 48 : NODE_H;
    const yTop = isSpine ? p.y + (NODE_H - 48) / 2 : p.y;
    out.push(`<rect x="${p.x}" y="${yTop}" width="${NODE_W}" height="${h}" rx="9" `
      + `fill="${C.white}" stroke="${C.border}" stroke-width="1.2"/>`);
    out.push(`<rect x="${p.x}" y="${yTop}" width="4.5" height="${h}" rx="2" fill="${accent}"/>`);

    if (isSpine) {
      out.push(`<text x="${p.x + 16}" y="${yTop + 29}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="12.5" font-weight="700" fill="${C.text}">${esc(p.task.title)}</text>`);
      continue;
    }

    const lines = wrapText(p.task.title, 34, 2);
    lines.forEach((ln, i) => {
      out.push(`<text x="${p.x + 15}" y="${yTop + 22 + i * 15}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="12.5" font-weight="600" fill="${C.text}">${esc(ln)}</text>`);
    });

    const badge = p.alloc
      ? (p.alloc.execution_class === 'ai_autonomous' ? 'AI, NO APPROVER' : p.alloc.execution_class.replace(/_/g, ' '))
      : 'unclassified';
    const badgeY = yTop + 22 + lines.length * 15 + 4;
    out.push(`<rect x="${p.x + 15}" y="${badgeY}" width="${Math.min(NODE_W - 30, 9 + badge.length * 6.1)}" height="16" `
      + `rx="8" fill="${isAi ? C.cherryBg : C.bgAlt}" stroke="${accent}" stroke-width="0.9"/>`);
    out.push(`<text x="${p.x + 20}" y="${badgeY + 12}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="9.5" font-weight="600" fill="${isAi ? C.cherryDeep : C.text}">${esc(badge.toUpperCase())}</text>`);

    const perf = p.performer
      ? `${p.performer.executor?.type === 'agent' ? 'Agent' : 'Person'}: ${roleName.get(p.performer.role_id) ?? p.performer.role_id}`
      : 'No performer recorded';
    const appr = p.approver
      ? `Approves: ${roleName.get(p.approver.role_id) ?? p.approver.role_id}`
      : (isAi ? 'No human approver' : '');
    out.push(`<text x="${p.x + 15}" y="${badgeY + 31}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="10.5" fill="${C.textLight}">${esc(wrapText(perf, 40, 1)[0])}</text>`);
    if (appr) {
      out.push(`<text x="${p.x + 15}" y="${badgeY + 45}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="10.5" fill="${p.approver ? C.text : C.cherry}" `
        + `font-weight="${p.approver ? '400' : '600'}">${esc(wrapText(appr, 40, 1)[0])}</text>`);
    }
  }

  // Legend. Counts are computed, never typed in.
  const counts = new Map<Lane, number>();
  for (const l of usedLanes) counts.set(l, placed.filter((p) => p.lane === l).length);
  const legendY = totalH - 52;
  out.push(`<line x1="${PAD_X}" y1="${legendY - 18}" x2="${totalW - PAD_X}" y2="${legendY - 18}" stroke="${C.border}"/>`);
  let lx = PAD_X;
  for (const l of usedLanes) {
    const col = l === 'ai' ? C.cherry : (l === 'human' ? C.leaf : C.textLight);
    out.push(`<rect x="${lx}" y="${legendY}" width="11" height="11" rx="3" fill="${col}"/>`);
    const label = `${LANE_LABELS[l]} (${counts.get(l) ?? 0})`;
    out.push(`<text x="${lx + 17}" y="${legendY + 10}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" fill="${C.text}">${esc(label)}</text>`);
    lx += 30 + label.length * 6.0;
  }
  const rework = input.transitions.filter((e) => e.is_rework).length;
  if (rework > 0) {
    out.push(`<line x1="${lx}" y1="${legendY + 6}" x2="${lx + 22}" y2="${legendY + 6}" `
      + `stroke="${C.cherry}" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    out.push(`<text x="${lx + 28}" y="${legendY + 10}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" fill="${C.text}">Rework (${rework})</text>`);
  }

  out.push('</svg>');
  return out.join('\n');
}
