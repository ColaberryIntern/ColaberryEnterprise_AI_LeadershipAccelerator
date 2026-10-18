/**
 * PURE, deterministic on-time probability for the gov build countdown band.
 *
 * CLAUDE.md requires production decisions to be deterministic and reproducible: this is NOT a learned/calibrated
 * model, it is a documented monotonic function from three measured inputs to a banded probability, so the same
 * inputs always give the same answer and the band can be re-derived by hand from the tooltip. No I/O, no `Date.now()`
 * - the caller measures the inputs (using govWorkingDays for the day counts) and passes them in. A missing input
 * returns `null` ("-") with the reason, never a guessed number (no-fabricated-data rail).
 *
 * The three inputs:
 *  - workingDaysToShipBy      - working days from `now` to ship-by (the day BEFORE the deadline; see govScheduleWindow)
 *  - remainingCriticalPathDays - remaining build work in working days along the longest release/story path
 *  - humanBlockedCount        - unresolved gaps waiting on a human answer; each adds BLOCKED_DAY_COST working days
 */

/** Each unresolved human-blocked item adds this many working days of latency (waiting on an answer). */
export const BLOCKED_DAY_COST = 2;

/**
 * slackRatio = workingDaysToShipBy / effectiveNeeded, mapped to a probability. Monotonic (more slack never lowers
 * the probability) and clamped to [5, 95] - never 0 or 100, because there is always some uncertainty either way.
 */
export const PROBABILITY_BANDS: ReadonlyArray<readonly [number, number]> = [
  [1.5, 95], [1.2, 85], [1.0, 70], [0.85, 50], [0.7, 30], [0.5, 15],
];

export interface OnTimeInput {
  workingDaysToShipBy: number | null;
  remainingCriticalPathDays: number | null;
  humanBlockedCount: number;
}

export interface OnTimeResult {
  /** 0-100, or null when a required input is missing (renders "-"). */
  probability: number | null;
  /** Why it is "-", or a one-line risk note; null when comfortably on track. */
  reason: string | null;
  /** Every number that produced the answer, for the tooltip (so the band is reproducible by hand). */
  inputs: {
    workingDaysToShipBy: number | null;
    remainingCriticalPathDays: number | null;
    humanBlockedCount: number;
    blockedDayCost: number;
    effectiveNeeded: number | null;
    slackRatio: number | null;
  };
}

export function onTimeProbability(input: OnTimeInput): OnTimeResult {
  const avail = input.workingDaysToShipBy;
  const need = input.remainingCriticalPathDays;
  const blocked = Math.max(0, Math.floor(input.humanBlockedCount || 0));
  const inputs = {
    workingDaysToShipBy: avail, remainingCriticalPathDays: need, humanBlockedCount: blocked,
    blockedDayCost: BLOCKED_DAY_COST, effectiveNeeded: null as number | null, slackRatio: null as number | null,
  };

  if (avail === null || need === null) {
    return { probability: null, reason: avail === null ? 'no submission deadline' : 'no build plan yet', inputs };
  }
  const effectiveNeeded = need + blocked * BLOCKED_DAY_COST;
  inputs.effectiveNeeded = effectiveNeeded;
  // Nothing (or nothing more) to build: the schedule side is satisfied. Highest band, still not a certain 100.
  if (effectiveNeeded <= 0) return { probability: 95, reason: null, inputs };

  const ratio = avail / effectiveNeeded;
  inputs.slackRatio = Math.round(ratio * 100) / 100;
  let probability = 5;
  for (const [threshold, p] of PROBABILITY_BANDS) { if (ratio >= threshold) { probability = p; break; } }

  const reason = probability >= 70 ? null
    : blocked > 0
      ? `${blocked} item(s) waiting on your answer; ${avail} working days to ship-by vs ${effectiveNeeded} needed`
      : `${avail} working days to ship-by vs ${effectiveNeeded} of remaining build work`;
  return { probability, reason, inputs };
}
