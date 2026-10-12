import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * T211 — Explorer E/I/F in the canonical evidence package.
 *
 * Engagement, Intent and Fit are the scores the Explorer Growth engine reasons
 * with, and until now NO person view read them: an operator looking at a free AI
 * learner could see their lifecycle stage and their timeline but not the three
 * numbers the growth engine was actually acting on. The evidence package is
 * supposed to be what the engine sees.
 *
 * DEGRADES TO NULL, and that is the honest answer rather than zeros. A person
 * with no snapshot is not a person scoring 0/0/0 — they are a person the scorer
 * has not run for, usually because they are not an Explorer at all. Returning
 * zeros would put three confident numbers on the page for somebody the engine
 * has never assessed.
 */
export interface ExplorerScorePanel {
  /** The snapshot's own date, so a reader can see how fresh the scores are. */
  asOfDate: string;
  engagement: number;
  intent: number;
  fit: number;
  primaryState: string;
  overlays: string[];
}

/**
 * The NEWEST snapshot across this person's enrolments, or null.
 *
 * Ordered by `as_of_date` descending and limited to one: a person with several
 * enrolments has one current Explorer state, not a list, and showing the oldest
 * would be worse than showing none.
 */
export async function loadExplorerScore(
  enrollmentIds: string[],
): Promise<ExplorerScorePanel | null> {
  if (enrollmentIds.length === 0) return null;

  const rows = await sequelize.query<{
    as_of_date: string; e_score: number; i_score: number; f_score: number;
    primary_state: string; overlays: string[] | null;
  }>(
    `SELECT as_of_date, e_score, i_score, f_score, primary_state, overlays
       FROM explorer_score_snapshots
      WHERE enrollment_id IN (:enrollmentIds)
      ORDER BY as_of_date DESC, created_at DESC
      LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { enrollmentIds } },
  );

  const row = rows[0];
  if (!row) return null;

  return {
    asOfDate: String(row.as_of_date),
    engagement: Number(row.e_score),
    intent: Number(row.i_score),
    fit: Number(row.f_score),
    primaryState: row.primary_state,
    // The column is an array; a null reads as "no overlays", which is different
    // from "overlays unknown" only in theory here — the writer always sets it.
    overlays: Array.isArray(row.overlays) ? row.overlays : [],
  };
}
