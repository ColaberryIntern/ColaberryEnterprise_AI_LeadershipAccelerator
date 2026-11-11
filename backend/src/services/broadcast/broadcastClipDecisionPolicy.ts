import {
  ARCHITECTURE_RUN_OF_SHOW, BUILD_RUN_OF_SHOW, ORIENTATION_RUN_OF_SHOW, OPEN_HOUSE_RUN_OF_SHOW,
  type SegmentMode,
} from '../classKit/runOfShow';

/**
 * D11 — keep it or cut it, decided once per segment.
 *
 * An editor handed a 120-minute recording does not start by choosing between 40 moments. They
 * start by throwing away the parts that were never going to be content - the break, the setup
 * chatter - and then work inside what is left. So the decision is per SEGMENT, and the clip
 * marks inside a segment inherit it.
 *
 * ## The default is derived, never stored
 *
 * A segment with no row means "nobody has decided", and what that SHOWS depends on the kind of
 * segment it is: a `break` is cut, everything else is kept. Writing those defaults into the
 * database at creation time would have meant a backfill, a decision no human made recorded as
 * though one had, and no way to tell a default from a choice afterwards.
 *
 * Derived costs nothing and keeps the three states distinct: kept by default, cut by default,
 * and decided by a person. The last of those is the only one worth storing.
 *
 * ## Why the mode comes from a lookup rather than from the airing
 *
 * A clip marker records `segment_id` and nothing about the kind of segment it was. Resolving
 * the mode properly would mean rebuilding the session's spec at read time - a database round
 * trip and a spec build inside what is otherwise a pure function over rows.
 *
 * Measured instead: across all four run-of-show templates there are 35 segments and 33 distinct
 * ids, and **no id maps to two different modes**. Two ids repeat (`welcome`, `reset`) and both
 * agree with themselves. So a flat id-to-mode map is exact, and a test asserts the absence of
 * clashes - so a template added later with a conflicting id fails that test instead of silently
 * mis-defaulting somebody's edit.
 */

export type ClipDecision = 'keep' | 'cut';

/** Every segment any template defines, by id. Built once, from the templates themselves. */
export const SEGMENT_MODES: Readonly<Record<string, SegmentMode>> = (() => {
  const map: Record<string, SegmentMode> = {};
  for (const s of [
    ...ARCHITECTURE_RUN_OF_SHOW, ...BUILD_RUN_OF_SHOW,
    ...ORIENTATION_RUN_OF_SHOW, ...OPEN_HOUSE_RUN_OF_SHOW,
  ]) {
    map[s.id] = s.mode;
  }
  return map;
})();

/**
 * Ids that two templates define with DIFFERENT modes. Exported so a test can require it empty.
 *
 * This is the one assumption the lookup rests on. Rather than assert it in a comment and find
 * out when an editor's break is kept, it is computed and checked.
 */
export function segmentModeClashes(): string[] {
  const seen: Record<string, SegmentMode> = {};
  const clashes: string[] = [];
  for (const s of [
    ...ARCHITECTURE_RUN_OF_SHOW, ...BUILD_RUN_OF_SHOW,
    ...ORIENTATION_RUN_OF_SHOW, ...OPEN_HOUSE_RUN_OF_SHOW,
  ]) {
    if (seen[s.id] && seen[s.id] !== s.mode) clashes.push(`${s.id}: ${seen[s.id]} vs ${s.mode}`);
    seen[s.id] = s.mode;
  }
  return clashes;
}

/**
 * What a segment reads as before anybody decides.
 *
 * KEEP is the default for everything except a break, and that asymmetry is deliberate. Cutting
 * by default would hide footage behind an action nobody took; keeping by default shows
 * everything and makes removal the deliberate act. A break is the one segment whose own
 * template says what it is worth - "Edited out", "Mostly edited out" - so defaulting it to cut
 * is reading the plan rather than guessing.
 *
 * An unknown segment id keeps. A segment this map has never heard of is not evidence that the
 * footage is worthless, and the failure direction matters: a wrongly kept segment costs an
 * editor a few seconds of scrubbing, a wrongly cut one loses the material.
 */
export function defaultDecision(segmentId: string | null | undefined): ClipDecision {
  if (!segmentId) return 'keep';
  return SEGMENT_MODES[segmentId] === 'break' ? 'cut' : 'keep';
}

export interface ResolvedDecision {
  decision: ClipDecision;
  /** True when a person chose this, false when it is the default for the segment kind. */
  decided: boolean;
}

/**
 * The decision for one segment: what a human stored, or the default for its kind.
 *
 * `decided` travels with it because the two must stay distinguishable all the way to the
 * screen. "Cut, because it is a break" and "Cut, because somebody looked at it and said so"
 * are different facts, and an editor re-reviewing a list needs to know which rows have been
 * through a pair of eyes.
 */
export function resolveDecision(
  segmentId: string | null | undefined,
  stored: ClipDecision | null | undefined,
): ResolvedDecision {
  if (stored === 'keep' || stored === 'cut') return { decision: stored, decided: true };
  return { decision: defaultDecision(segmentId), decided: false };
}

/** The wire contract. Anything else is a bad request, not a silent fallback to keep. */
export function isClipDecision(value: unknown): value is ClipDecision {
  return value === 'keep' || value === 'cut';
}
