import { sequelize } from '../config/database';

/**
 * Columns for the landing-page snack bar. Additive and idempotent, with a post-condition, like
 * ensureBrandPixelSchema (the boot DDL loop only warns on failure, so "it booted" proves nothing).
 *
 *   brands.snackbar_default_enabled   Brand-wide default. Every page that brand builds follows it
 *                                     unless the page overrides. Defaults ON (see below).
 *   landing_pages.snackbar_enabled    Per-page override: true / false / NULL (follow the brand).
 *   landing_pages.snackbar_config     Zod-validated settings (landingPageSnackbar.ts).
 *   leads.social_proof_opt_in         Written by the /portal/signup form. See below.
 *
 * ONE FORM COLLECTS social_proof_opt_in, AND NOBODY HAS TICKED IT. SNACK-2 (PR #4173, in the
 * running image 2026-11-18) added an optional, unchecked box to /portal/signup, which writes this
 * column. Measured 2026-11-22: 0 of 25,701 lead rows are opted in. The consequence is unchanged
 * in practice and is not cosmetic - the bar still says "Someone in <city>", and a page configured
 * `name_format: 'opted_in_only'` still drops every row and shows no bar at all. Treat that as the
 * known state, not a bug to re-diagnose.
 *
 * Why it stays that way: /portal/signup produced 3 of the 123 leads taken since the deploy. The
 * other 118 came through Open House registration, which does not ask for this consent. Until the
 * box is on the path most signups take, expect the by-name branch to stay unused.
 *
 * THE COLUMN DEFAULT IS `true`, AND THAT IS THE WHOLE FEATURE. Ali's ask (2026-11-02) was "this
 * process should be on every Landing page we create moving fwd" - so a brand created tomorrow has
 * to show a snack bar with nobody remembering to switch it on. The column shipped `DEFAULT false`,
 * which made the snack bar something each brand had to opt into through a screen that was never
 * built, so it was dark everywhere despite being deployed and working. Flipping the DEFAULT moves
 * the decision from "every operator, every time" to "once, here".
 *
 * THE DEFAULT ONLY GOVERNS BRANDS CREATED AFTERWARDS. `SET DEFAULT` does not touch existing rows,
 * which is the point: a brand an operator deliberately switched off must stay off across deploys.
 * Existing brands are turned on explicitly by `scripts/enableBrandSnackbar.ts`, once, by name -
 * never by a blanket UPDATE in this boot path, which would re-enable such a brand on every
 * restart and make the off switch a lie.
 */
export const LANDING_PAGE_SNACKBAR_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE brands ADD COLUMN IF NOT EXISTS snackbar_default_enabled BOOLEAN NOT NULL DEFAULT false`,
  // Flips the default for brands created from here on. Separate from ADD COLUMN because that
  // statement is a no-op once the column exists, so it can never revise the default on a database
  // where the column already landed - which is every database this has already shipped to.
  `ALTER TABLE brands ALTER COLUMN snackbar_default_enabled SET DEFAULT true`,
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

  // The DEFAULT is the feature, so it gets its own post-condition: a column that exists with the
  // old `false` default would leave every future brand dark while every column check passed.
  // `table_schema` is pinned because this database carries the same table name in more than one
  // schema, and an unfiltered information_schema read judges an arbitrary one.
  const [defaultRows] = await sequelize.query(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'brands' AND column_name = 'snackbar_default_enabled'`,
  );
  const columnDefault = (defaultRows as Array<{ column_default: string | null }>)[0]?.column_default;
  if (columnDefault === undefined) {
    throw new Error(
      'ensureLandingPageSnackbarSchema: brands.snackbar_default_enabled not found in current_schema()',
    );
  }
  if (!/true/i.test(columnDefault ?? '')) {
    throw new Error(
      `ensureLandingPageSnackbarSchema: brands.snackbar_default_enabled default is ${columnDefault ?? 'NULL'}, expected true`,
    );
  }
}
