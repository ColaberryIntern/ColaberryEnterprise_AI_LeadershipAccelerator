/**
 * humanAiFlowLayout — lane assignment and geometry for the human/AI flow picture. No SVG.
 *
 * ## Why this is a separate module
 *
 * `humanAiFlowSvg.ts` reached 409 lines against this repo's 500-line hard ceiling, and L10.5
 * adds five more rule behaviours to it. The Modular Composition Rule says the next change to a
 * file at the ceiling splits it BEFORE adding code, so this is that split: deciding WHERE things
 * go is separable from emitting markup, and the two have different reasons to change.
 *
 * Every function here is pure and has no notion of colour, font or markup. That is the test of
 * whether the boundary is in the right place.
 *
 * ## The split was a MOVE, not a rewrite
 *
 * These definitions were extracted verbatim by line range rather than retyped. A 400-character
 * regex or a greedy wrap loop re-keyed by hand is how a refactor silently changes behaviour. The
 * proof is the existing test suite: every `it` body is byte-identical across the split and only
 * its import lines changed.
 */
import type {
  FactoryTask,
  Assignment,
  AllocationRow,
  TransitionEdge,
} from '../contracts/factoryContract';

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

export const LANE_ORDER: readonly Lane[] = ['ai', 'spine', 'human', 'unclassified'];

const NODE_W = 240;
const MIN_GAP = 60;
/** Condition labels render at 11px italic; this is the measured average advance per character. */
const COND_CHAR_W = 6.2;
const NODE_H = 104;
const ROW_GAP = 26;
const PAD_X = 28;
const HEADER_H = 92;
const LANE_LABEL_W = 0;

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

export interface Placed {
  task: FactoryTask;
  lane: Lane;
  alloc: AllocationRow | undefined;
  performer: Assignment | undefined;
  approver: Assignment | undefined;
  x: number;
  y: number;
}

/**
 * The node and page dimensions, as ONE export.
 *
 * Exported as a group rather than eight loose constants because this module's public surface is
 * part of its contract, and eight of them put it at 16 symbols against a ceiling of 12. The
 * functions above still read the bare constants, so their bodies are unchanged by the grouping.
 */
export const GEO = {
  NODE_W, MIN_GAP, COND_CHAR_W, NODE_H, ROW_GAP, PAD_X, HEADER_H, LANE_LABEL_W,
} as const;
