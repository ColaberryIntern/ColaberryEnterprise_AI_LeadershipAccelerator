/**
 * The shape of one scheduled-timer call site found in this codebase's own source.
 *
 * Why a source scan exists at all: `ai_agents` is a catalogue of what someone WROTE DOWN,
 * and `ai_agent_activity_logs` is a record of what bothered to report itself. Neither
 * answers "what is actually wired to a clock in this repo". A `cron.schedule(...)` or
 * `setInterval(...)` with no registry row behind it fires forever, reports nothing, and is
 * invisible to every health check we have. The only place that fact is written down is the
 * source, so the source is what we read.
 *
 * The scan is a build-time artifact (see `backend/src/scripts/scanUntrackedTimers.ts`),
 * committed as generated TypeScript rather than JSON so it survives the compile with no
 * build-copy step, and checked by a test that re-runs the scan and compares.
 */

/** How the timer is registered with the clock. */
export type TimerKind = 'cron' | 'interval';

/** One call site in the source tree. */
export interface TimerSite {
  /** Repo-relative path, forward slashes, e.g. `backend/src/server.ts`. */
  readonly file: string;
  /** 1-indexed line of the call. */
  readonly line: number;
  readonly kind: TimerKind;
  /**
   * The literal first argument when it is a plain string: a cron expression for `cron`,
   * the millisecond delay for `interval`. `null` when the argument is a variable, a
   * template string, or any other expression we refuse to guess at.
   */
  readonly schedule: string | null;
  /**
   * The agent name this call site reports under, taken from an `instrumentCronJob('Name', …)`
   * inside the call body. `null` when the body never instruments itself, which is the whole
   * point: a site with no name can never appear in `ai_agents` and so can never be checked.
   */
  readonly reportsAs: string | null;
}

/** The committed scan. Sorted by file then line, so re-running it is byte-stable. */
export interface TimerScan {
  readonly sites: readonly TimerSite[];
}
