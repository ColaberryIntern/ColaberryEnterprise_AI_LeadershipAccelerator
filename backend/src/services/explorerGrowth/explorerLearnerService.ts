import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { ExplorerOverlay, ExplorerPrimaryState } from '../../types/explorerGrowth';

/**
 * The learner drawer: one learner, in detail.
 *
 * READ-ONLY. Five routes are served from here — the profile, the score series,
 * the signal view, the decision history, and the eligibility snapshot. All of
 * them return `null` for an unknown learner so the controller can answer 404
 * rather than an empty object that reads as "this learner has nothing".
 *
 * ── WHAT EXISTS, MEASURED ON PRODUCTION 2026-09-02 ──────────────────────────
 *
 *   explorer_journey_profiles    153 rows, signal_summary populated on ALL 153
 *   explorer_score_snapshots     918 rows, 153 learners, 6 distinct dates
 *   explorer_journey_decisions   612 rows
 *   triggering_signals           0 of 612 rows populated  <-- see below
 */

export interface LearnerProfile {
  enrollment_id: string;
  lead_id: number | null;
  email_normalized: string;
  primary_state: ExplorerPrimaryState | null;
  overlays: ExplorerOverlay[];
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
  contactability: Record<string, unknown> | null;
  affinities: Record<string, unknown>[];
  signal_summary: Record<string, unknown> | null;
  days_since_last_activity: number | null;
  state_entered_at: string | null;
  last_decision_at: string | null;
  last_contacted_at: string | null;
  scores_computed_at: string | null;
}

export interface ScorePoint {
  as_of_date: string;
  e_score: number;
  i_score: number;
  f_score: number;
  primary_state: ExplorerPrimaryState;
  overlays: ExplorerOverlay[];
}

export interface LearnerSignals {
  enrollment_id: string;
  /** The rolled-up bands the scorer produced. Populated for all 153 learners. */
  summary: Record<string, unknown> | null;
  /** Observable signal history: the E/I/F series, which is what actually moves. */
  series: ScorePoint[];
  /**
   * FALSE, and it will stay false until the Governor writes the column.
   *
   * §27 describes this route as a "signal timeline with weights + decay". That
   * timeline is not recorded anywhere. `explorer_journey_decisions` declares
   * `triggering_signals JSONB NOT NULL DEFAULT '[]'`, and **no code path writes
   * it** — `runGovernor.ts` never references the column, and 0 of 612
   * production rows are populated.
   *
   * So this flag is the honest answer. Returning `signals: []` would read as
   * "this learner produced no signals", which is a false statement about a
   * learner whose scores demonstrably moved. Refuse and report, rather than
   * substitute something that looks like data.
   */
  per_signal_timeline_available: false;
  timeline_absent_reason: string;
}

export interface LearnerDecisionSummary {
  id: string;
  decision_date: string;
  mode: string;
  selected_action: string | null;
  channel: string | null;
  executed: boolean;
  suppressed_count: number;
  asset_count: number;
  reason: string;
}

export interface LearnerEligibility {
  enrollment_id: string;
  /** Resolved at the last decision, not re-evaluated now. */
  contactability: Record<string, unknown> | null;
  as_of_decision_date: string | null;
  candidates: Record<string, unknown>[];
  suppressed: Record<string, unknown>[];
  /** Stated when the learner has a profile but has never been decided on. */
  note: string | null;
}

const TIMELINE_ABSENT =
  'Per-signal weights and decay are not recorded. `explorer_journey_decisions.triggering_signals` ' +
  'exists and defaults to an empty array, but no code path writes it (0 of 612 rows populated on ' +
  '2026-09-02). The score series below is the observable signal history until the Governor ' +
  'persists the signals it reads.';

/** The full profile, or null when no such learner exists. */
export async function getLearnerProfile(enrollmentId: string): Promise<LearnerProfile | null> {
  const [row] = await sequelize.query<LearnerProfile>(
    `SELECT enrollment_id, lead_id, email_normalized, primary_state, overlays,
            e_score, i_score, f_score, contactability, affinities, signal_summary,
            days_since_last_activity, state_entered_at, last_decision_at,
            last_contacted_at, scores_computed_at
       FROM explorer_journey_profiles
      WHERE enrollment_id = :id`,
    { replacements: { id: enrollmentId }, type: QueryTypes.SELECT },
  );
  return row ?? null;
}

/** True when the learner has a profile. The 404 test for every drawer route. */
async function learnerExists(enrollmentId: string): Promise<boolean> {
  const [row] = await sequelize.query<{ n: string }>(
    'SELECT COUNT(*) AS n FROM explorer_journey_profiles WHERE enrollment_id = :id',
    { replacements: { id: enrollmentId }, type: QueryTypes.SELECT },
  );
  return Number(row?.n ?? 0) > 0;
}

async function scoreSeries(enrollmentId: string, days: number): Promise<ScorePoint[]> {
  const rows = await sequelize.query<{
    as_of_date: string;
    e_score: number;
    i_score: number;
    f_score: number;
    primary_state: ExplorerPrimaryState;
    overlays: ExplorerOverlay[];
  }>(
    `SELECT as_of_date, e_score, i_score, f_score, primary_state, overlays
       FROM explorer_score_snapshots
      WHERE enrollment_id = :id
        AND as_of_date > CURRENT_DATE - CAST(:days AS integer)
      ORDER BY as_of_date ASC`,
    { replacements: { id: enrollmentId, days }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    as_of_date: String(r.as_of_date),
    e_score: Number(r.e_score),
    i_score: Number(r.i_score),
    f_score: Number(r.f_score),
    primary_state: r.primary_state,
    overlays: r.overlays ?? [],
  }));
}

/** The E/I/F series for one learner. Null when the learner does not exist. */
export async function getLearnerScores(
  enrollmentId: string,
  days: number,
): Promise<{ enrollment_id: string; series: ScorePoint[] } | null> {
  if (!(await learnerExists(enrollmentId))) return null;
  return { enrollment_id: enrollmentId, series: await scoreSeries(enrollmentId, days) };
}

/**
 * The signal view — a summary and a score series, with the missing timeline
 * named rather than faked. See `per_signal_timeline_available`.
 */
export async function getLearnerSignals(
  enrollmentId: string,
  days: number,
): Promise<LearnerSignals | null> {
  const profile = await getLearnerProfile(enrollmentId);
  if (!profile) return null;

  return {
    enrollment_id: enrollmentId,
    summary: profile.signal_summary ?? null,
    series: await scoreSeries(enrollmentId, days),
    per_signal_timeline_available: false,
    timeline_absent_reason: TIMELINE_ABSENT,
  };
}

/** One learner's decision history, newest first, bounded by the caller's page. */
export async function getLearnerDecisions(
  enrollmentId: string,
  limit: number,
  offset: number,
): Promise<{ rows: LearnerDecisionSummary[]; total: number; limit: number; offset: number } | null> {
  if (!(await learnerExists(enrollmentId))) return null;

  const [count] = await sequelize.query<{ n: string }>(
    'SELECT COUNT(*) AS n FROM explorer_journey_decisions WHERE enrollment_id = :id',
    { replacements: { id: enrollmentId }, type: QueryTypes.SELECT },
  );

  const rows = await sequelize.query<LearnerDecisionSummary>(
    `SELECT id, decision_date, mode, selected_action, channel, executed, reason,
            jsonb_array_length(suppressed_actions) AS suppressed_count,
            jsonb_array_length(selected_content_assets) AS asset_count
       FROM explorer_journey_decisions
      WHERE enrollment_id = :id
      ORDER BY decision_date DESC, id
      LIMIT :limit OFFSET :offset`,
    { replacements: { id: enrollmentId, limit, offset }, type: QueryTypes.SELECT },
  );

  return { rows, total: Number(count?.n ?? 0), limit, offset };
}

/**
 * Eligibility as the last run resolved it.
 *
 * NOT a live re-evaluation. §27 calls this "dry-run candidate evaluation", and a
 * genuine dry run would invoke the Governor — which is a recompute, and would
 * answer "what would we decide now" while the page reports on what was decided.
 * Phase A reads; Phase B's write routes are where a re-evaluation belongs.
 */
export async function getEligibility(enrollmentId: string): Promise<LearnerEligibility | null> {
  const profile = await getLearnerProfile(enrollmentId);
  if (!profile) return null;

  const [decision] = await sequelize.query<{
    decision_date: string;
    candidate_actions: Record<string, unknown>[];
    suppressed_actions: Record<string, unknown>[];
  }>(
    `SELECT decision_date, candidate_actions, suppressed_actions
       FROM explorer_journey_decisions
      WHERE enrollment_id = :id
      ORDER BY decision_date DESC
      LIMIT 1`,
    { replacements: { id: enrollmentId }, type: QueryTypes.SELECT },
  );

  return {
    enrollment_id: enrollmentId,
    contactability: profile.contactability ?? null,
    as_of_decision_date: decision ? String(decision.decision_date) : null,
    candidates: decision?.candidate_actions ?? [],
    suppressed: decision?.suppressed_actions ?? [],
    note: decision
      ? null
      : 'This learner has a profile but no decision has been recorded, so no candidates were evaluated.',
  };
}
