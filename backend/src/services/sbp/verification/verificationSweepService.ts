/**
 * verificationSweepService - the cadence FLOOR. A bounded sweep that re-verifies the projects
 * with the oldest verification pass, so a project whose webhook has stopped firing is still
 * looked at.
 *
 * ----------------------------------------------------------------------------
 * IT IS A FLOOR, NOT A SCHEDULE
 * ----------------------------------------------------------------------------
 * The live cadence is per commit, through the GitHub push webhook, and it works: 2,473
 * deliveries since 16 August. This does not replace that or compete with it. It picks the
 * STALEST first, so a project that is pushing normally is never chosen while a project nobody
 * has heard from waits, and a healthy cohort makes this sweep do almost nothing.
 *
 * ----------------------------------------------------------------------------
 * WHY THE ORDERING SIGNAL IS NOT `student_tasks.updated_at`
 * ----------------------------------------------------------------------------
 * That was the obvious column and it is unusable. Measured on production 2026-11-18: 93 rows
 * share one identical `updated_at`, and three further groups of about 50 share theirs, because a
 * bulk write stomped the column. Ordering by it would have made the sweep pick nearly arbitrary
 * projects while reporting that it picked the stalest, which is worse than not sweeping.
 *
 * The signal used instead is `verification_json ->> 'checked_at'`, written by the verifier itself
 * on every pass. Measured, it holds genuinely distinct per-project values from 20 August to 18
 * November, and 34 projects with open stories have NO value at all, which is the true head of the
 * queue: never verified, not merely verified long ago. `NULLS FIRST` puts them there.
 *
 * ----------------------------------------------------------------------------
 * OFF BY DEFAULT, AND report_only DOES NOT CALL THE VERIFIER
 * ----------------------------------------------------------------------------
 * `verifyBuildFromRepo` is not a read. It latches stories verified, awards XP and records
 * evidence. Sweeping 34 never-verified projects, some dormant for two months, would fire a burst
 * of awards and completions for work nobody is watching, on a cohort that has not asked for it.
 * That is a real consequence and not a rollout detail.
 *
 * So there are three modes and the default is `off`:
 *   off          nothing happens at all.
 *   report_only  the batch is SELECTED and logged, and the verifier is never called. This
 *                measures what the sweep would have done, with no write of any kind.
 *   on           the batch is verified for real.
 *
 * A cooldown keeps it from thrashing: a project verified within COOLDOWN_HOURS is not picked,
 * so the push path always wins and a sweep cannot re-run the same project every quarter hour.
 */

import { QueryTypes } from 'sequelize';

import { sequelize } from '../../../config/database';

export type SweepMode = 'off' | 'report_only' | 'on';

/** How many projects one tick may touch. GitHub allows 5,000 authenticated calls an hour and a
 * pass costs a handful, so this is nowhere near the limit; the bound exists so one tick cannot
 * become a stampede, not to ration the API. */
export const DEFAULT_BATCH = 5;
/** A project verified this recently is left alone, so the sweep yields to the push path. */
export const COOLDOWN_HOURS = 6;

/** The flag. Anything unrecognized is `off`: this never switches itself on. */
export function sweepMode(env: Record<string, string | undefined> = process.env): SweepMode {
  const v = env.STORY_VERIFICATION_SWEEP;
  if (v === 'on') return 'on';
  if (v === 'report_only') return 'report_only';
  return 'off';
}

export function sweepBatchSize(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.STORY_VERIFICATION_SWEEP_BATCH);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_BATCH;
  return Math.min(Math.floor(raw), 25);
}

export interface SweepCandidate {
  project_id: string;
  open_stories: number;
  /** ISO, or null for a project that has never been verified. The head of the queue. */
  last_checked_at: string | null;
}

export interface SweepOutcome {
  mode: SweepMode;
  /** How many the sweep was allowed to touch. */
  batch_size: number;
  candidates: SweepCandidate[];
  /** Projects actually re-verified. Always empty unless mode is `on`. */
  verified: string[];
  /** Projects whose verification returned a classified failure, with the reason. */
  failed: Array<{ project_id: string; reason: string }>;
  /** Set when nothing was attempted. */
  skipped: null | 'mode_off' | 'no_candidates' | 'query_failed';
  reason: string | null;
}

const EMPTY = (mode: SweepMode, batch: number): SweepOutcome => ({
  mode,
  batch_size: batch,
  candidates: [],
  verified: [],
  failed: [],
  skipped: null,
  reason: null,
});

interface CandidateRow {
  project_id: string;
  open_stories: string | number;
  last_checked: string | null;
}

/**
 * The projects most overdue a look: open stories, outside the cooldown, oldest pass first, with
 * never-verified ahead of everything.
 *
 * Exported so the sweep's CHOICE can be inspected and tested without running a sweep.
 */
export async function sweepCandidates(limit: number): Promise<SweepCandidate[]> {
  const rows = await sequelize.query<CandidateRow>(
    `WITH per_project AS (
       SELECT project_id,
              COUNT(*) - COUNT(verified_at)              AS open_stories,
              MAX(verification_json ->> 'checked_at')    AS last_checked
         FROM student_tasks
        GROUP BY project_id
       HAVING COUNT(*) - COUNT(verified_at) > 0
     )
     SELECT project_id, open_stories, last_checked
       FROM per_project
      WHERE last_checked IS NULL
         OR last_checked::timestamptz < NOW() - (INTERVAL '1 hour' * ${COOLDOWN_HOURS})
      ORDER BY last_checked ASC NULLS FIRST
      LIMIT :limit`,
    { replacements: { limit }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    project_id: r.project_id,
    open_stories: Number(r.open_stories),
    last_checked_at: r.last_checked,
  }));
}

const log = (event: string, outcome: string, ctx: Record<string, unknown>): void => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-verification-sweep',
    event,
    outcome,
    context: ctx,
  }));
};

/**
 * Run one tick.
 *
 * NEVER THROWS. It runs from the cron registry, which wraps it in instrumentation and a
 * dead-letter queue, and a sweep that throws would take its own next tick with it. Every
 * expected condition is a classified outcome.
 */
export async function runVerificationSweep(opts: {
  mode?: SweepMode;
  batchSize?: number;
} = {}): Promise<SweepOutcome> {
  const mode = opts.mode ?? sweepMode();
  const batch = opts.batchSize ?? sweepBatchSize();
  if (mode === 'off') return { ...EMPTY(mode, batch), skipped: 'mode_off' };

  let candidates: SweepCandidate[];
  try {
    candidates = await sweepCandidates(batch);
  } catch (err: any) {
    log('sweep_candidate_query_failed', 'failure', { error: err?.message || String(err) });
    return { ...EMPTY(mode, batch), skipped: 'query_failed', reason: err?.message || String(err) };
  }

  if (!candidates.length) {
    return { ...EMPTY(mode, batch), skipped: 'no_candidates' };
  }

  const out = EMPTY(mode, batch);
  out.candidates = candidates;

  if (mode === 'report_only') {
    // Deliberately NO verifier call. This measures the choice and writes nothing.
    log('sweep_report_only', 'success', {
      batch_size: batch,
      picked: candidates.length,
      never_verified: candidates.filter((c) => !c.last_checked_at).length,
      oldest: candidates[0]?.last_checked_at ?? 'never',
      project_ids: candidates.map((c) => c.project_id),
      note: 'report only: the verifier was not called and nothing was written',
    });
    return out;
  }

  const { verifyBuildFromRepo } = await import('./buildVerificationService');
  for (const c of candidates) {
    try {
      const summary = await verifyBuildFromRepo(c.project_id, { correlationId: 'sweep' });
      if (summary.ok) out.verified.push(c.project_id);
      else out.failed.push({ project_id: c.project_id, reason: summary.reason || 'unknown' });
    } catch (err: any) {
      // The verifier is documented to classify every expected state. A throw is a defect in it,
      // and it must not cost the rest of the batch their turn.
      out.failed.push({ project_id: c.project_id, reason: err?.message || String(err) });
    }
  }

  log('sweep_completed', 'success', {
    batch_size: batch,
    picked: candidates.length,
    verified: out.verified.length,
    failed: out.failed.length,
    never_verified_in_batch: candidates.filter((c) => !c.last_checked_at).length,
  });
  return out;
}
