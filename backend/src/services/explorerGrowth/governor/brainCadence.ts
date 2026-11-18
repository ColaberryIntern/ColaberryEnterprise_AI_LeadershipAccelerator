import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { hoursBetweenDecisionDates } from './contactPolicy';

/**
 * OH1j: how long since this person's last brain pick, for BRAIN_PICK_MIN_HOURS.
 *
 * A brain pick is an Explorer draft built around one piece of the content brain; the draft
 * render records it on the row as `metadata.brain_pick`. SHADOW PICKS COUNT (every draft is
 * a shadow pick today), or the cadence would never trigger before execution is switched on.
 *
 * The current decision date is excluded, so re-running the Governor on a day that was
 * already drafted does not turn that day's own decision into a WAIT. Superseded drafts are
 * excluded because each one has a current version on the same decision that already counts.
 *
 * Same shape as openHouseHold.ts: injectable for tests, and an unreadable history is treated
 * as "picked just now" (0 hours). An unknown is not permission to write again.
 */
export interface BrainCadenceDeps {
  /** The newest decision date (YYYY-MM-DD) of a brain pick for this lead before `before`, or null. */
  lastPickDate: (leadId: number, before: string) => Promise<string | null>;
}

const LAST_PICK_SQL = `SELECT MAX(metadata->>'explorer_decision_date') AS last
  FROM scheduled_emails
 WHERE lead_id = :leadId
   AND (metadata->'brain_pick') IS NOT NULL
   AND status <> 'explorer_draft_superseded'
   AND (metadata->>'explorer_decision_date') < :before`;

function defaultDeps(): BrainCadenceDeps {
  return {
    lastPickDate: async (leadId, before) => {
      const rows = await sequelize.query<{ last: string | null }>(LAST_PICK_SQL, {
        type: QueryTypes.SELECT,
        replacements: { leadId, before },
      });
      return rows[0]?.last ? String(rows[0].last) : null;
    },
  };
}

/** Null = never had a pick (or no lead row, so no draft can exist). */
export async function hoursSinceLastBrainPick(
  leadId: number | string | null | undefined,
  decisionDate: string,
  deps: BrainCadenceDeps = defaultDeps(),
): Promise<number | null> {
  const id = Number(leadId);
  if (leadId == null || !Number.isFinite(id) || id <= 0) return null;
  try {
    const last = await deps.lastPickDate(id, decisionDate);
    if (!last) return null;
    const hours = hoursBetweenDecisionDates(decisionDate, last);
    return Number.isFinite(hours) ? hours : 0;
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'explorer-governor', event: 'brain_cadence_read_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError',
      context: { lead_id: id, treated_as: 'picked_just_now' },
    }));
    return 0;
  }
}
