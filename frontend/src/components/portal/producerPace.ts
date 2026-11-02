/**
 * The rundown's reading: where the show is against the plan, and whether it is keeping to it.
 *
 * NAMED FOR ITS SIBLING, AND NOT FOR THE COMPONENT IT FEEDS. `producerPace` sits beside
 * `producerClock` because the two are the same measurement read two ways, from the same instant
 * — which is the property that makes them comparable and is the easiest thing to break. The
 * obvious name, `producerRundown`, is also unusable: it differs from `ProducerRundown.tsx` only
 * in casing, and TypeScript rejects a program containing both (TS1149/TS1261) even though a
 * case-insensitive filesystem will happily hold them. Renaming it back fails the frontend
 * typecheck rather than failing at runtime, which is the good kind of failure and still a
 * wasted afternoon.
 *
 * WHY THE VERDICT IS COMPUTED HERE AND NOT ON THE SERVER. It changes every second and the plan
 * does not. The server sends the segments once a minute; a verdict in that payload would be up
 * to a minute stale, which is long enough to matter in the only moment anybody reads it — the
 * decision to cut a beat or let one run. The tick already exists in the strip for the clock, so
 * the verdict rides it, and the elapsed time comes from `elapsedSinceContentStart` rather than
 * a second subtraction, so the two readings beside each other can never be measured from
 * different instants.
 *
 * THE RULE IS THE DECK'S RULE, DELIBERATELY. The instructor's pace bar in `kitDeckScript.ts`
 * reads BEHIND when the elapsed minute is past the current segment's planned end and AHEAD when
 * it has not reached its planned start. Producers and instructors who compare notes mid-class
 * must not be working from two different definitions of "behind", so this is the same
 * comparison — against a different, better anchor. The deck measures from a `localStorage`
 * value set by a button somebody has to remember to press; this measures from
 * `content_started_at`, which `go_live` will not proceed without. See the spec finding on the
 * two class clocks.
 *
 * Pure, so the threshold below is a test rather than a judgement call made once in a render.
 */
import { elapsedSinceContentStart } from './producerClock';
import type { ProducerOccurrence, RundownSegment } from '../../services/broadcastProducer';

export type PaceVerdict = 'on_time' | 'behind' | 'ahead';

export interface PaceReading {
  verdict: PaceVerdict;
  /** Ready to render: `on time`, `behind 6 min`, `ahead 2 min`. */
  text: string;
  /** Whole minutes off the plan. Always 0 for `on_time`. */
  minutes: number;
}

/**
 * Under a minute off the plan is on time, and that is the whole reason this constant exists.
 *
 * Rounding the difference without it produces `behind 0 min` for a show thirty seconds over —
 * a judgement that reads as a problem and names no quantity. A producer cannot act on less than
 * a minute anyway: the smallest move available is to cut or extend a beat.
 */
const TOLERANCE_MIN = 1;

/** The planned window the verdict is measured against. A segment, narrowed to its two numbers. */
export type PlannedWindow = Pick<RundownSegment, 'planned_start_min' | 'planned_end_min'>;

/**
 * The pace verdict, or null when there is nothing to judge.
 *
 * Null rather than `on_time` whenever the inputs are incomplete, because "on time" is a claim.
 * No segment, no anchor, or a plan whose window is not two usable numbers all produce no
 * reading at all — the rundown then shows the plan and says nothing about the pace, which is
 * what it genuinely knows.
 */
export function rundownPace(
  segment: PlannedWindow | null | undefined,
  elapsedMs: number | null,
): PaceReading | null {
  if (!segment || elapsedMs === null) return null;
  const { planned_start_min: start, planned_end_min: end } = segment;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const elapsedMin = elapsedMs / 60_000;

  if (elapsedMin - end >= TOLERANCE_MIN) {
    const minutes = Math.round(elapsedMin - end);
    return { verdict: 'behind', text: `behind ${minutes} min`, minutes };
  }
  if (start - elapsedMin >= TOLERANCE_MIN) {
    const minutes = Math.round(start - elapsedMin);
    return { verdict: 'ahead', text: `ahead ${minutes} min`, minutes };
  }
  return { verdict: 'on_time', text: 'on time', minutes: 0 };
}

/**
 * Whether a pace verdict is worth showing at all, which is a question about the airing rather
 * than about the plan.
 *
 * ON AIR ONLY. An ended class has a duration, which the clock beside this already reports as
 * `ran 38:12`; judging it against the plan afterwards produces a verdict nobody can act on and
 * that will sit there until the page is closed. Before content starts there is no anchor, so
 * there is no reading either — the rundown is then the plan, which is exactly what a producer
 * wants to see while waiting for the feed.
 */
export function paceApplies(o: Pick<ProducerOccurrence, 'editorial_state'>): boolean {
  return o.editorial_state === 'live' || o.editorial_state === 'reconnecting';
}

/**
 * The elapsed time the verdict is measured from, or null.
 *
 * A one-line pass-through on purpose: it keeps `ProducerRundown` from importing the clock
 * module directly, so the rule that the pace and the clock share an anchor is visible in this
 * file rather than spread across two imports in a component.
 */
export function rundownElapsed(
  o: Pick<ProducerOccurrence, 'editorial_state' | 'content_started_at'>, now: number,
): number | null {
  return paceApplies(o) ? elapsedSinceContentStart(o, now) : null;
}

/**
 * Whether the show can still move, and therefore whether the rundown is worth re-reading.
 *
 * Expressed as "has this airing finished" rather than as a list of states that happen to tick:
 * the question the poll is asking is whether the deck could advance again, and an airing in
 * `ended`, `processing`, `replay_ready` or `cancelled` cannot be advanced by anyone. Those get
 * one read and then silence — a poll that runs for the rest of the page's life to re-fetch a
 * frozen answer is the same waste the clock's tick already refuses.
 */
export function showCanMove(o: Pick<ProducerOccurrence, 'editorial_state'>): boolean {
  const s = o.editorial_state;
  return s !== 'ended' && s !== 'processing' && s !== 'replay_ready' && s !== 'cancelled';
}

/**
 * The marker's position along the plan's bar, as a percentage, or null when there is nothing to
 * place.
 *
 * Clamped to the bar. A class twenty minutes over its plan is a real and ordinary thing, and a
 * marker that keeps traveling past the end of its own track reads as a rendering fault rather
 * than as a show running long — the `behind` verdict beside it is what carries that number.
 */
export function planProgressPct(elapsedMs: number | null, totalMinutes: number): number | null {
  if (elapsedMs === null || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return null;
  const pct = (elapsedMs / 60_000 / totalMinutes) * 100;
  return Math.min(100, Math.max(0, pct));
}
