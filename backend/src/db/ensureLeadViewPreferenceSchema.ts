import { sequelize } from '../config/database';

/**
 * Per-user saved lead-list settings ("lock my settings"), ensured via idempotent
 * raw SQL rather than sequelize.sync({ alter: true }) — see
 * ensureLiveSessionSchema.ts for why (large prod model graph, alter-sync hits
 * pre-existing index conflicts).
 *
 * Ali, 2026-08-20: reps should "have the ability to lock their settings so
 * everytime they can have the same settings." A rep picks the websites they
 * work, locks it, and every later visit opens on exactly that.
 *
 * One row per admin_users identity. `websites` is the list of leadSourceGroups
 * keys they chose; `locked` is whether it should be reapplied automatically.
 * Deliberately a small jsonb-free shape: this is a settings row, not a document
 * store, and a text[] keeps it queryable.
 *
 * Additive only: creates one new table, never alters an existing one. Every
 * statement is IF NOT EXISTS and wrapped so a partial DB self-heals and
 * re-running boot is a no-op.
 */
export async function ensureLeadViewPreferenceSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS lead_view_preferences (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       admin_user_id UUID NOT NULL,
       websites TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
       locked BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One settings row per identity. The unique index is what makes the
    // upsert in leadViewPreferenceService idempotent.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_view_preferences_admin_user
       ON lead_view_preferences (admin_user_id)`,
    // Deleting an admin account should not strand its settings row.
    `ALTER TABLE lead_view_preferences DROP CONSTRAINT IF EXISTS fk_lead_view_preferences_admin_user`,
    `ALTER TABLE lead_view_preferences
       ADD CONSTRAINT fk_lead_view_preferences_admin_user
       FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Self-healing by design: a statement that loses a race with another boot
      // (or is already satisfied) must not stop the rest, and must never stop
      // the server from coming up over a settings table.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'backend',
          event: 'ensure_lead_view_preference_schema_statement_failed',
          outcome: 'partial',
          error_class: 'SchemaEnsureWarning',
          context: { statement: sql.slice(0, 80), message },
        })
      );
    }
  }
}
