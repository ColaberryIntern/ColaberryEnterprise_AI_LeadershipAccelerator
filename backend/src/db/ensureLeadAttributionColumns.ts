import { sequelize } from '../config/database';

/**
 * C94: two nullable attribution columns on `leads`, ensured with idempotent raw SQL rather than
 * sequelize.sync({ alter: true }) (see ensureLiveSessionSchema.ts for why prod never alter-syncs).
 *
 *   utm_content : which ad the person clicked (Meta fills it with the ad id)
 *   utm_term    : which placement or ad set
 *   utm_medium  : paid / organic / email — added by C10.4, see below
 *
 * Before this, both lived only on visitor_sessions, and only for visitors who did not block tracking; the
 * Oct 2026 ad audit had to rebuild an Explorer's ad source by email match. Additive only:
 * ADD COLUMN IF NOT EXISTS, no default, no backfill, so existing rows read NULL ("not known").
 *
 * ── utm_medium, ADDED BY C10.4 ──
 *
 * `utmBackfill.ts` asked for this column by name: it had to exclude `utm_medium` from the fields it
 * copies, because the column did not exist and Sequelize silently drops a key that is not a model
 * attribute — so the old copy's third field was landing nowhere while the success log named it.
 *
 * Until now the medium survived only as the second half of the `source|medium` convention the
 * signup form writes into `utm_source` (`fb|paid`), which `adSpend/utmSource.ts` has to split back
 * apart on read. That split is the settled fix for the rows already stored and is not being
 * undone here; this column is so that NEW rows can carry a medium as a value rather than as half
 * of a string, and so the session->lead copy has somewhere to put the one it already reads.
 *
 * Measured against production on 2026-11-08: 447 leads whose own visitor has a session carrying a
 * medium have nowhere for it to land, and `leads` carried exactly utm_source, utm_campaign,
 * utm_content and utm_term.
 *
 * Failure: each statement is wrapped so a statement that loses a race with another boot, or is already
 * satisfied, logs a warning and never stops the server from coming up. The model reads NULL until it lands.
 */
export const LEAD_ATTRIBUTION_STATEMENTS: readonly string[] = [
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255)',
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255)',
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255)',
];

export async function ensureLeadAttributionColumns(): Promise<void> {
  for (const sql of LEAD_ATTRIBUTION_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'backend',
        event: 'ensure_lead_attribution_columns_statement_failed',
        outcome: 'partial',
        error_class: 'SchemaEnsureWarning',
        context: { statement: sql.slice(0, 80), message },
      }));
    }
  }
}
