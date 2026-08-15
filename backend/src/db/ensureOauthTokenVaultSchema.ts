import { sequelize } from '../config/database';

/**
 * `oauth_token_vault` — persists OAuth refresh tokens that the provider ROTATES.
 *
 * Why this table exists at all: Microsoft Graph returns a NEW refresh token on
 * most refreshes. graphMailService noticed, logged
 * "Refresh token rotated — update MS_GRAPH_REFRESH_TOKEN env var", and then
 * discarded it. The env var therefore holds a token that is only still working
 * because the old one has not been invalidated yet — the deployment is one
 * invalidation away from Hotmail sync, auto-archive AND reply-sending going
 * dark, recoverable only by a human doing an interactive re-consent.
 *
 * Why NOT `system_settings`: `GET /api/admin/settings` returns every row of that
 * table verbatim (adminSettingsController.handleGetSettings), so putting a live
 * refresh token there would publish a credential over the admin API. This table
 * is deliberately not exposed by any route.
 *
 * Ensured via idempotent raw SQL rather than `sequelize.sync({ alter: true })`,
 * matching the other ensure*Schema modules. Additive only: one new table.
 */
export async function ensureOauthTokenVaultSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS oauth_token_vault (
      provider      VARCHAR(64) PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      rotated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(`[Schema] oauth_token_vault statement failed (non-blocking): ${err.message}`);
    }
  }

  // Post-condition: the statements above are best-effort and only warn, so
  // "it didn't throw" is not evidence the table landed. Verify against the
  // catalog — a silently-missing vault would send every rotation back to being
  // dropped on the floor, which is the exact failure this table exists to stop.
  try {
    const [rows]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'oauth_token_vault'`,
    );
    const present = new Set((rows || []).map((r: any) => r.column_name));
    const required = ['provider', 'refresh_token', 'rotated_at'];
    const missing = required.filter((c) => !present.has(c));
    if (missing.length > 0) {
      console.error(JSON.stringify({
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: { table: 'oauth_token_vault', missing_columns: missing },
      }));
    }
  } catch (err: any) {
    console.warn(`[Schema] oauth_token_vault verification failed: ${err.message}`);
  }
}
