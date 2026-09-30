/**
 * capeLifecycleModeService — CAPE Phase 5 lifecycle-mode classifier (design
 * doc §10 "Pacing: infinite discovery, finite daily expectations", §16 Phase
 * 5). Read-only; never writes.
 *
 * SIMPLIFICATION vs the design doc's full 5-row §10 table (execution-contract.md
 * Assumption 1, logged): classifies using 4 real signals already available from
 * `capeLearnerStateService.getLearnerState()` (`has_resume`, `overall_placement`,
 * `overall_proficiency`, `recent_failure`) plus a derived
 * `days_since_last_activity` (MAX(`today_feed_impressions.served_at`) for the
 * enrollment — `null` for a learner who has never been served a Today feed
 * page, e.g. a brand-new account). Priority order, evaluated top to bottom:
 *
 *   1. returning_after_absence — days_since_last_activity >= 14 (takes
 *      priority over every other signal per §10's "do not dump the entire
 *      backlog first" guidance — an experienced learner returning after a
 *      long gap still gets the gentle-restart treatment, not their old
 *      advanced feed dumped back on them).
 *   2. foundation — !has_resume && overall_placement < 15.
 *   3. experienced_cold_start — has_resume && overall_proficiency < 20.
 *   4. architect_track — overall_proficiency >= 65.
 *   5. active_builder — default (everything else).
 *
 * This mode selects which bucket fills Today Plan slots 1-2 (see
 * capeTodayPlanService.ts) — it does NOT implement the design doc's full
 * weighted-percentage blend across the whole feed (60% foundation / 15%
 * practice / etc.). That full blend is a larger ranking-policy change better
 * suited to a future Feed Control (Phase 6) iteration; this task uses the
 * mode as a selection/emphasis signal only, which is safe (reversible,
 * low blast radius) per the execution contract's logged decision.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { getLearnerState } from './capeLearnerStateService';

export type LifecycleMode =
  | 'foundation'
  | 'experienced_cold_start'
  | 'active_builder'
  | 'architect_track'
  | 'returning_after_absence';

export interface LifecycleModeResult {
  mode: LifecycleMode;
  days_since_last_activity: number | null;
  reasoning: string;
}

const RETURNING_AFTER_ABSENCE_DAYS = 14;
const FOUNDATION_PLACEMENT_CEILING = 15;
const EXPERIENCED_COLD_START_PROFICIENCY_CEILING = 20;
const ARCHITECT_TRACK_PROFICIENCY_FLOOR = 65;

function logWarn(event: string, enrollmentId: string, err: any) {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service: 'backend',
    event,
    error_class: err?.name || 'Error',
    outcome: 'failure',
    context: { enrollment_id: enrollmentId, message: err?.message },
  }));
}

/**
 * Days since the enrollment's most recent served Today feed impression,
 * `null` when none has ever been served. Fail-soft: a DB error returns
 * `null` (no suppression, never blocks classification), matching this file
 * family's established convention (see capeLearnerStateService.ts's
 * `loadRecentFailure`).
 */
async function daysSinceLastActivity(enrollmentId: string, now: Date): Promise<number | null> {
  try {
    const rows = await sequelize.query<{ last_served: Date | null }>(
      `SELECT MAX(served_at) AS last_served FROM today_feed_impressions WHERE enrollment_id = :eid`,
      { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
    );
    const last = rows[0]?.last_served;
    if (!last) return null;
    const ms = now.getTime() - new Date(last).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  } catch (err: any) {
    logWarn('cape_lifecycle_mode_activity_lookup_failed', enrollmentId, err);
    return null;
  }
}

/**
 * Classify one enrollment's lifecycle mode. Never throws for a
 * missing/degraded activity signal (falls back to `null` days, which simply
 * cannot satisfy the `returning_after_absence` threshold) — but DOES
 * propagate a genuine `getLearnerState` failure (the skill ledger itself is
 * not optional input, same contract as capeLearnerStateService.ts).
 */
export async function getLifecycleMode(enrollmentId: string, now: Date = new Date()): Promise<LifecycleModeResult> {
  const state = await getLearnerState(enrollmentId);
  const days = await daysSinceLastActivity(enrollmentId, now);

  if (days !== null && days >= RETURNING_AFTER_ABSENCE_DAYS) {
    return {
      mode: 'returning_after_absence',
      days_since_last_activity: days,
      reasoning: `last active ${days} days ago (>= ${RETURNING_AFTER_ABSENCE_DAYS}d threshold) — gentle restart regardless of prior skill level`,
    };
  }

  if (!state.has_resume && state.overall_placement < FOUNDATION_PLACEMENT_CEILING) {
    return {
      mode: 'foundation',
      days_since_last_activity: days,
      reasoning: `no resume, placement ${state.overall_placement} < ${FOUNDATION_PLACEMENT_CEILING}`,
    };
  }

  if (state.has_resume && state.overall_proficiency < EXPERIENCED_COLD_START_PROFICIENCY_CEILING) {
    return {
      mode: 'experienced_cold_start',
      days_since_last_activity: days,
      reasoning: `has resume, proficiency ${state.overall_proficiency} < ${EXPERIENCED_COLD_START_PROFICIENCY_CEILING} (little verified evidence yet)`,
    };
  }

  if (state.overall_proficiency >= ARCHITECT_TRACK_PROFICIENCY_FLOOR) {
    return {
      mode: 'architect_track',
      days_since_last_activity: days,
      reasoning: `proficiency ${state.overall_proficiency} >= ${ARCHITECT_TRACK_PROFICIENCY_FLOOR}`,
    };
  }

  return {
    mode: 'active_builder',
    days_since_last_activity: days,
    reasoning: 'default: has some verified evidence, actively building',
  };
}
