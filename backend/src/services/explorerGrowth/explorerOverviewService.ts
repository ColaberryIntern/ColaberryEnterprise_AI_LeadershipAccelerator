import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { ExplorerOverlay, ExplorerPrimaryState } from '../../types/explorerGrowth';
import type { LearnersQuery } from '../../schemas/explorerGrowthSchema';

/**
 * The aggregate tabs: Overview, Journey, and the mode Settings displays.
 *
 * Split from `explorerDecisionsService` because six queries plus their shaping in
 * one file breaches this plan's 300-line ceiling, and the ceiling exists so a
 * reader can hold a file in their head.
 *
 * ── READ-ONLY ───────────────────────────────────────────────────────────────
 * Every statement here is a SELECT. Phase A writes nothing; the mode switch and
 * kill switch are Phase B, where a human sees the consequence as they flip it.
 *
 * ── THE QUERIES WERE RUN BEFORE THE CODE WAS WRITTEN ────────────────────────
 * Each was executed against production on 2026-09-02 and confirmed to return
 * rows, because "complete plumbing carrying no water" — correct code pointed at
 * an empty or wrong source — is this programme's signature failure.
 *
 * Every replacement in this file is a scalar, so what Sequelize renders is what
 * was run. That is NOT automatic: the sibling service binds arrays, where
 * `replacements` substitutes text rather than binding, and hand-written SQL
 * verified against production did not match what the code emitted. Measured:
 *
 *   summary       153 decisions, mode=shadow, 11 waited / 142 actionable
 *                 130 with content, 0 executed, 12 gaps
 *   distribution  153 snapshots per day, 5 distinct states, 5+ days of history
 *   learners      ACTIVATING 131, CONVERTED 10, ACTIVE_LEARNER 7,
 *                 ENGAGED_LEARNER 3, CONNECTED_TO_COMMUNITY 2
 */

export interface ExplorerSummary {
  /** The most recent decision date, which is what every count below is for. */
  decision_date: string | null;
  /** Distinct modes seen that day. Normally one; more than one means a mid-run change. */
  modes: string[];
  total: number;
  waited: number;
  actionable: number;
  with_content: number;
  executed: number;
  /** Decisions whose reason names an asset gap. */
  gaps: number;
  learners_with_profile: number;
}

export interface ExplorerStateCount {
  primary_state: ExplorerPrimaryState;
  count: number;
}

export interface ExplorerDistributionPoint {
  as_of_date: string;
  counts: ExplorerStateCount[];
}

export interface ExplorerDistribution {
  today: ExplorerStateCount[];
  trend: ExplorerDistributionPoint[];
  overlays: { overlay: ExplorerOverlay; count: number }[];
}

export interface ExplorerLearnerRow {
  enrollment_id: string;
  lead_id: number | null;
  email_normalized: string;
  primary_state: ExplorerPrimaryState | null;
  overlays: ExplorerOverlay[];
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
  days_since_last_activity: number | null;
  state_entered_at: string | null;
  last_decision_at: string | null;
  scores_computed_at: string | null;
}

export interface ExplorerLearnerPage {
  rows: ExplorerLearnerRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Counts for the most recent decision run.
 *
 * Anchored on `MAX(decision_date)` rather than "today". The recompute runs
 * nightly, so on a morning where it has not yet run — or a day it failed —
 * "today" returns zeroes, which reads as "the system decided nothing" rather
 * than "the system has not run yet". The date is returned so the caller can say
 * which run it is showing.
 */
export async function getSummary(): Promise<ExplorerSummary> {
  const [row] = await sequelize.query<{
    decision_date: string | null;
    modes: string[] | null;
    total: string;
    waited: string;
    actionable: string;
    with_content: string;
    executed: string;
    gaps: string;
  }>(
    `SELECT d.decision_date,
            ARRAY_AGG(DISTINCT d.mode) AS modes,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE d.selected_action = 'WAIT') AS waited,
            COUNT(*) FILTER (WHERE d.selected_action <> 'WAIT') AS actionable,
            COUNT(*) FILTER (WHERE jsonb_array_length(d.selected_content_assets) > 0) AS with_content,
            COUNT(*) FILTER (WHERE d.executed) AS executed,
            COUNT(*) FILTER (WHERE d.reason LIKE '%asset gaps:%') AS gaps
       FROM explorer_journey_decisions d
      WHERE d.decision_date = (SELECT MAX(decision_date) FROM explorer_journey_decisions)
      GROUP BY d.decision_date`,
    { type: QueryTypes.SELECT },
  );

  const [profiles] = await sequelize.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM explorer_journey_profiles',
    { type: QueryTypes.SELECT },
  );

  return {
    decision_date: row?.decision_date ?? null,
    modes: row?.modes ?? [],
    total: Number(row?.total ?? 0),
    waited: Number(row?.waited ?? 0),
    actionable: Number(row?.actionable ?? 0),
    with_content: Number(row?.with_content ?? 0),
    executed: Number(row?.executed ?? 0),
    gaps: Number(row?.gaps ?? 0),
    learners_with_profile: Number(profiles?.count ?? 0),
  };
}

/**
 * State distribution now, plus its trend.
 *
 * The trend reads `explorer_score_snapshots`, which is append-only and one row
 * per learner per day — the only source that can answer "what did the population
 * look like last Tuesday". Deriving it from current profiles would redraw
 * history every night with today's values.
 */
export async function getDistribution(days: number): Promise<ExplorerDistribution> {
  const today = await sequelize.query<{ primary_state: ExplorerPrimaryState; count: string }>(
    `SELECT primary_state, COUNT(*) AS count
       FROM explorer_journey_profiles
      WHERE primary_state IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC`,
    { type: QueryTypes.SELECT },
  );

  const trendRows = await sequelize.query<{
    as_of_date: string;
    primary_state: ExplorerPrimaryState;
    count: string;
  }>(
    `SELECT as_of_date, primary_state, COUNT(*) AS count
       FROM explorer_score_snapshots
      WHERE as_of_date > CURRENT_DATE - CAST(:days AS integer)
      GROUP BY 1, 2 ORDER BY 1 ASC, 3 DESC`,
    { replacements: { days }, type: QueryTypes.SELECT },
  );

  const overlays = await sequelize.query<{ overlay: ExplorerOverlay; count: string }>(
    `SELECT UNNEST(overlays) AS overlay, COUNT(*) AS count
       FROM explorer_journey_profiles
      GROUP BY 1 ORDER BY 2 DESC`,
    { type: QueryTypes.SELECT },
  );

  const byDate = new Map<string, ExplorerStateCount[]>();
  for (const r of trendRows) {
    const key = String(r.as_of_date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push({ primary_state: r.primary_state, count: Number(r.count) });
  }

  return {
    today: today.map((r) => ({ primary_state: r.primary_state, count: Number(r.count) })),
    trend: [...byDate.entries()].map(([as_of_date, counts]) => ({ as_of_date, counts })),
    overlays: overlays.map((r) => ({ overlay: r.overlay, count: Number(r.count) })),
  };
}

/** WHERE fragments and their bindings, built from validated filters. */
function learnerFilters(q: LearnersQuery): { sql: string; bind: Record<string, unknown> } {
  const clauses: string[] = [];
  const bind: Record<string, unknown> = {};

  if (q.state) {
    clauses.push('p.primary_state = :state');
    bind.state = q.state;
  }
  if (q.overlay) {
    // Overlays are a text[]; a learner matches if the filter is among them.
    clauses.push(':overlay = ANY(p.overlays)');
    bind.overlay = q.overlay;
  }
  const ranges: [keyof LearnersQuery, string, string][] = [
    ['e_min', 'p.e_score >=', 'e_min'],
    ['e_max', 'p.e_score <=', 'e_max'],
    ['i_min', 'p.i_score >=', 'i_min'],
    ['i_max', 'p.i_score <=', 'i_max'],
    ['f_min', 'p.f_score >=', 'f_min'],
  ];
  for (const [key, op, name] of ranges) {
    const value = q[key];
    if (value !== undefined) {
      clauses.push(`${op} :${name}`);
      bind[name] = value;
    }
  }
  if (q.search) {
    // Bound as a parameter, never interpolated — this value is caller-supplied.
    clauses.push('p.email_normalized ILIKE :search');
    bind.search = `%${q.search}%`;
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', bind };
}

/**
 * The Journey roster, filtered and paginated.
 *
 * `total` is the count BEFORE pagination, so the page can say "50 of 131" rather
 * than implying the filter matched only what fits on one screen.
 */
export async function getLearners(q: LearnersQuery): Promise<ExplorerLearnerPage> {
  const { sql: where, bind } = learnerFilters(q);

  const [count] = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM explorer_journey_profiles p ${where}`,
    { replacements: bind, type: QueryTypes.SELECT },
  );

  const rows = await sequelize.query<ExplorerLearnerRow>(
    `SELECT p.enrollment_id, p.lead_id, p.email_normalized, p.primary_state, p.overlays,
            p.e_score, p.i_score, p.f_score, p.days_since_last_activity,
            p.state_entered_at, p.last_decision_at, p.scores_computed_at
       FROM explorer_journey_profiles p
       ${where}
      ORDER BY p.i_score DESC NULLS LAST, p.e_score DESC NULLS LAST, p.enrollment_id
      LIMIT :limit OFFSET :offset`,
    { replacements: { ...bind, limit: q.limit, offset: q.offset }, type: QueryTypes.SELECT },
  );

  return { rows, total: Number(count?.count ?? 0), limit: q.limit, offset: q.offset };
}
