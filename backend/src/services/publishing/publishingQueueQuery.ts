import { Op } from 'sequelize';

/**
 * Which publishing jobs are due right now.
 *
 * ── Why this is a separate, pure, tested module ───────────────────────────────────────
 *
 * The bug this replaces is not "there was no scheduled_for column". There WAS one —
 * `OpenclawTask.scheduled_for`, declared and indexed since long before this build, and never
 * written by any of its create sites.
 *
 * Stated precisely, because an earlier version of this comment overstated it and review
 * caught that. It is NOT true that no read path filtered on it: `openclawSupervisorAgent.ts`
 * does apply a `scheduled_for IS NULL OR <= now` predicate when promoting pending to
 * assigned. The actual defect is that `openclawBrowserWorkerAgent.ts` reads
 * `status IN ('assigned','pending')` ordered by priority with no time predicate at all,
 * bypassing that gate entirely — so a future-dated task is picked up and posted immediately
 * anyway. One guarded read path does not help when an unguarded one reads the same rows.
 *
 * A `publish_at` column with no filter would be the identical bug wearing a new name, and it
 * would be invisible in review — the schema would look right. So the predicate lives here as
 * a pure function with no I/O, and it is unit-tested directly. If a caller ever hand-rolls
 * its own `where` clause instead of using this, that is the regression to look for.
 */

export type PublishingJobState =
  | 'pending'
  | 'retrying'
  | 'claimed'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'
  | 'dead_lettered';

export const PUBLISHING_JOB_STATES: readonly PublishingJobState[] = [
  'pending', 'retrying', 'claimed', 'publishing',
  'published', 'failed', 'cancelled', 'dead_lettered',
];

/** The only states a scheduler will ever pick up. */
export const RUNNABLE_STATES: readonly PublishingJobState[] = ['pending', 'retrying'];

/** Minimal shape the predicate needs. Deliberately not the Sequelize model. */
export interface DueCheckableJob {
  state: PublishingJobState | string;
  publish_at: Date | string;
  next_retry_at?: Date | string | null;
  dead_lettered_at?: Date | string | null;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Is this a usable instant?
 *
 * Exists because the naive comparison FAILS OPEN: `NaN > nowMs` is `false`, so a job whose
 * `publish_at` did not parse would sail straight through a `publish_at > now` guard and be
 * treated as due. `publish_at` is typed `Date | string` precisely because Sequelize hands
 * back string dates under some configurations, so a malformed string is a DECLARED input
 * path, not a hypothetical one.
 *
 * Every other unknown-input case in this module already fails closed - an unrecognised
 * state is not runnable, a null next_retry_at is not due. This one did not, and that
 * asymmetry was the bug.
 */
function isUsableTime(ms: number): boolean {
  return Number.isFinite(ms);
}

/**
 * Is this job due at `now`?
 *
 * The rules, each of which corresponds to a way the old system got it wrong:
 *
 *  - **`publish_at` must have passed.** This is the whole point. A job scheduled for Tuesday
 *    is not due on Monday, no matter what state it is in.
 *  - **Only `pending` and `retrying` are runnable.** `claimed` and `publishing` belong to
 *    another worker; picking them up is how one post gets published twice.
 *  - **A retry also waits for `next_retry_at`.** Without this a failing job spins as fast as
 *    the loop runs, which is how a provider rate-limits an entire account.
 *  - **Dead-lettered jobs are never due**, whatever their state column says. The two are
 *    tracked separately so a human can inspect a dead job without it re-entering the queue.
 */
export function isJobDue(job: DueCheckableJob, now: Date): boolean {
  if (job.dead_lettered_at) return false;
  if (!RUNNABLE_STATES.includes(job.state as PublishingJobState)) return false;

  const nowMs = now.getTime();
  if (!isUsableTime(nowMs)) return false;
  // FAIL CLOSED on an unparseable publish_at. `NaN > nowMs` is false, so the naive
  // comparison treated a malformed date as DUE - publishing immediately, the exact
  // outcome this module exists to prevent. Caught in review.
  const publishAt = toTime(job.publish_at);
  if (!isUsableTime(publishAt)) return false;
  if (publishAt > nowMs) return false;

  if (job.state === 'retrying') {
    // A retrying job with no next_retry_at has nothing scheduling it, so treat it as not
    // ready rather than immediately due — "unset" must not mean "run now".
    if (!job.next_retry_at) return false;
    const retryAt = toTime(job.next_retry_at);
    if (!isUsableTime(retryAt)) return false;
    if (retryAt > nowMs) return false;
  }

  return true;
}

/**
 * The Sequelize `where` clause for the due-jobs read.
 *
 * Mirrors `isJobDue`, and the pair is asserted to agree in the unit tests — a predicate that
 * drifts from the query it represents is worse than having neither, because the tests would
 * keep passing while production selected different rows.
 *
 * KNOWN GAP in that guard, named rather than left to be discovered: the tests couple the two
 * through `RUNNABLE_STATES`, so a state added to one and not the other fails. They would NOT
 * catch a new FIELD condition added to `isJobDue` without a matching clause here (a future
 * `paused_at`, say). Closing that properly means evaluating the where-object against the same
 * fixtures the predicate is driven with.
 *
 * NOTE ON THE CLOCK: `now` is the application's, not the database's, so container clock skew
 * publishes early or late by the size of the skew. That matches every other scheduler in this
 * repo, but it is a genuine BREAK condition under CLAUDE.md's failure-first rules. Taking
 * `now` as a parameter rather than reading it inside is what would let a caller substitute
 * Postgres's `NOW()` if that ever matters.
 */
export function dueJobsWhere(now: Date): Record<string, unknown> {
  return {
    dead_lettered_at: { [Op.is]: null },
    publish_at: { [Op.lte]: now },
    [Op.or]: [
      { state: 'pending' },
      {
        state: 'retrying',
        next_retry_at: { [Op.ne]: null, [Op.lte]: now },
      },
    ],
  };
}

/**
 * Backoff for a failed attempt: exponential with jitter, capped.
 *
 * The repo has no exponential backoff anywhere today — every retry path is a fixed +30
 * minutes or "next cron tick". Fixed delays synchronise: a provider outage fails every job
 * at once, and they all retry together at the same instant, which is how a recovering
 * provider gets knocked over a second time. Jitter is what spreads them.
 */
export function nextRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const BASE_MS = 60_000;
  const CAP_MS = 6 * 60 * 60 * 1000; // 6h
  const exponential = Math.min(BASE_MS * 2 ** Math.max(0, attempt - 1), CAP_MS);
  // Full jitter over [50%, 100%] of the exponential value.
  return Math.floor(exponential * (0.5 + random() * 0.5));
}

/** Has this job exhausted its attempts and earned the dead-letter queue? */
export function shouldDeadLetter(job: { attempts: number; max_attempts: number }): boolean {
  return job.attempts >= job.max_attempts;
}
