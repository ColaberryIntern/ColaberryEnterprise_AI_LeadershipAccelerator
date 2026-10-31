import { sequelize } from '../config/database';

/**
 * Columns for the landing-page snack bar. Additive and idempotent, with a post-condition, like
 * ensureBrandPixelSchema (the boot DDL loop only warns on failure, so "it booted" proves nothing).
 *
 *   brands.snackbar_default_enabled   Brand-wide default. Every page that brand builds follows it
 *                                     unless the page overrides. Defaults OFF.
 *   landing_pages.snackbar_enabled    Per-page override: true / false / NULL (follow the brand).
 *   landing_pages.snackbar_config     Zod-validated settings (landingPageSnackbar.ts).
 *   leads.social_proof_opt_in         Set from the signup checkbox. Only opted-in people are ever
 *                                     shown by first name; everyone else is "Someone in <city>".
 */
export const LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE brands ADD COLUMN IF NOT EXISTS snackbar_default_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS snackbar_enabled BOOLEAN NULL`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS snackbar_config JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS social_proof_opt_in BOOLEAN NOT NULL DEFAULT false`,
  // The feed's hot path: recent leads for one source.
  `CREATE INDEX IF NOT EXISTS idx_leads_source_created ON leads (source_id, created_at DESC)`,
];

const REQUIRED: ReadonlyArray<[string, string]> = [
  ['brands', 'snackbar_default_enabled'],
  ['landing_pages', 'snackbar_enabled'],
  ['landing_pages', 'snackbar_config'],
  ['leads', 'social_proof_opt_in'],
];

export async function ensureLandingPageSnackbarSchema(): Promise<void> {
  for (const statement of LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS) {
    await sequelize.query(statement);
  }
  const [rows] = await sequelize.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('brands','landing_pages','leads')`,
  );
  const present = new Set((rows as Array<{ table_name: string; column_name: string }>)
    .map((r) => `${r.table_name}.${r.column_name}`));
  const missing = REQUIRED.filter(([t, c]) => !present.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`);
  if (missing.length) {
    throw new Error(`ensureLandingPageSnackbarSchema: columns missing after DDL: ${missing.join(', ')}`);
  }
}
