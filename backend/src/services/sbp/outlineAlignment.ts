/**
 * outlineAlignment — make a release's demo and its work agree about a measure.
 *
 * ## The incident
 *
 * ShiftFill v3 (2026-11-20): the outline wrote r3's demo as "Show the system
 * filling gaps within 30 minutes", then assigned REQ-012 (fill gaps within 30
 * minutes) to r1. The story for it landed in r1, so the plan promised a demo in
 * week 6 of work it scheduled in week 3, and a student reading r3 could not find
 * the story that delivers what r3 shows.
 *
 * ## The rule
 *
 * A number-bearing NFR whose figure ("30 minutes") appears in exactly ONE
 * release's demo is assigned to that release. Only when the reading is
 * unambiguous: the figure belongs to that one NFR alone, and only one demo
 * names it. Anything else is left exactly as the outline wrote it. Runs on the
 * outline, before any story is written, so the stories are written in the right
 * release rather than moved afterwards. PURE.
 */
import type { PlanRelease, PlanRequirement } from './planContract';

/** "30 minutes", "9 mornings", "40 hours": a number and the word it counts. */
const FIGURE = /\b(\d+(?:\.\d+)?)\s+([a-z]+)/gi;

/** "8 to 10", "9 out of 10": the word after the number is not what it counts. */
const NOT_A_UNIT = new Set(['to', 'of', 'out', 'and', 'or', 'a', 'an', 'the', 'per', 'in', 'on', 'at', 'by']);

export function figuresOf(text: string): string[] {
  return [...text.matchAll(FIGURE)]
    .filter((m) => !NOT_A_UNIT.has(m[2].toLowerCase()))
    .map((m) => `${m[1]} ${m[2].toLowerCase()}`);
}

const mentions = (text: string, figure: string): boolean => figuresOf(text).includes(figure);

/**
 * Reassign measures to the release whose demo promises them. Mutates `byReq`
 * (requirement id → release key) and returns the ids it moved, for the log.
 */
export function alignMeasuresToDemos(
  requirements: readonly PlanRequirement[],
  byReq: Map<string, string>,
  releases: ReadonlyArray<Pick<PlanRelease, 'demo'>>,
): string[] {
  const nfrs = requirements.filter((r) => r.kind === 'NFR' && byReq.has(r.id));
  const owners = new Map<string, Set<string>>();
  for (const r of nfrs) {
    for (const f of figuresOf(r.statement)) {
      if (!owners.has(f)) owners.set(f, new Set());
      owners.get(f)!.add(r.id);
    }
  }
  const moved: string[] = [];
  for (const r of nfrs) {
    const own = figuresOf(r.statement).filter((f) => owners.get(f)!.size === 1);
    const target = new Set<string>();
    for (const f of own) {
      releases.forEach((rel, i) => { if (mentions(rel.demo || '', f)) target.add(`r${i}`); });
    }
    if (target.size !== 1) continue;
    const key = [...target][0];
    if (byReq.get(r.id) !== key) {
      byReq.set(r.id, key);
      moved.push(r.id);
    }
  }
  return moved;
}
