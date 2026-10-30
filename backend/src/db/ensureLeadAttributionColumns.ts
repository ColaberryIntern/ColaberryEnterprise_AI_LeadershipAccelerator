import { sequelize } from '../config/database';

/**
 * C94: two nullable attribution columns on `leads`, ensured with idempotent raw SQL rather than
 * sequelize.sync({ alter: true }) (see ensureLiveSessionSchema.ts for why prod never alter-syncs).
 *
 *   utm_content : which ad the person clicked (Meta fills it with the ad id)
 *   utm_term    : which placement or ad set
 *
 * Before this, both lived only on visitor_sessions, and only for visitors who did not block tracking; the
 * Oct 2026 ad audit had to rebuild an Explorer's ad source by email match. Additive only: two
 * ADD COLUMN IF NOT EXISTS, no default, no backfill, so existing rows read NULL ("not known").
 *
 * Failure: each statement is wrapped so a statement that loses a race with another boot, or is already
 * satisfied, logs a warning and never stops the server from coming up. The model reads NULL until it lands.
 */
export const LEAD_ATTRIBUTION_STATEMENTS: readonly string[] = [
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255)',
  'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255)',
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
