import { sequelize } from '../config/database';

/**
 * brands.meta_pixel_id - the one value a brand needs before its pages can be advertised.
 *
 * WHY. Sohail asked (Basecamp todo 10361643851, 2026-10-14) for the Meta Pixel to be added to
 * a landing page so he can start running ads. Pasting his snippet into one page would answer
 * that request and nothing else: the next brand, and the next page, would each be another paste
 * into another file. Ali's actual ask was the general one - "there is an id that each brand needs
 * to be able to add the tracking. Create a process where the user can just pass that id and then
 * all the fb tracking will be added."
 *
 * So the ID is a property of the BRAND, and the renderer builds the tracking from it. An operator
 * types fifteen digits into the brand screen; every hosted page for that brand is then tracked,
 * with no code change and no snippet to paste wrongly.
 *
 * WHY A COLUMN AND NOT `metadata`. `brands.metadata` is JSONB and already exists, so this would
 * have needed no DDL at all. It is also an untyped blob, which CLAUDE.md's Contract Enforcement
 * layer forbids as inter-module currency - and this value crosses three of them (admin route,
 * renderer, and whatever reads conversions back). A column can be constrained, indexed and typed;
 * a JSON key can only be hoped for.
 *
 * DIGITS ONLY, AND CHECKED IN THE DATABASE. The ID is interpolated into a script tag on a public
 * page. It is operator-supplied, so the renderer escapes it - but the cheapest place to make a
 * script-injecting value impossible is the column itself, where it holds regardless of which
 * service writes next. Meta's IDs are 15-16 digit numerics; 8-20 leaves room without admitting
 * free text.
 *
 * Additive and idempotent like every ensure* in this workstream, with a post-condition, because
 * the DDL loop only warns on failure and "it booted" proves nothing about what landed.
 */

export const BRAND_PIXEL_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE brands ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(32)`,

  // The constraint is the point of using a column. A value that is not a run of digits cannot
  // reach a <script> tag, whatever a future caller forgets to validate.
  `DO $$ BEGIN
     ALTER TABLE brands ADD CONSTRAINT brands_meta_pixel_id_digits
       CHECK (meta_pixel_id IS NULL OR meta_pixel_id ~ '^[0-9]{8,20}$');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

const REQUIRED_COLUMNS: readonly string[] = ['meta_pixel_id'];
const REQUIRED_CONSTRAINTS: readonly string[] = ['brands_meta_pixel_id_digits'];

/**
 * Apply the statements, then PROVE they applied.
 *
 * The boot DDL loop logs and continues on failure, so a column that never arrived would show up
 * later as a brand screen that silently cannot save a pixel ID. Checking the catalog afterwards
 * turns that into a startup error naming the missing object.
 */
export async function ensureBrandPixelSchema(): Promise<void> {
  for (const statement of BRAND_PIXEL_SCHEMA_STATEMENTS) {
    await sequelize.query(statement);
  }

  const [columns] = await sequelize.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'brands'`,
  );
  const present = new Set((columns as Array<{ column_name: string }>).map((c) => c.column_name));
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !present.has(c));

  const [constraints] = await sequelize.query(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'brands'::regclass`,
  );
  const names = new Set((constraints as Array<{ conname: string }>).map((c) => c.conname));
  const missingConstraints = REQUIRED_CONSTRAINTS.filter((c) => !names.has(c));

  if (missingColumns.length || missingConstraints.length) {
    throw new Error(
      `ensureBrandPixelSchema did not apply: missing columns [${missingColumns.join(', ')}], `
      + `missing constraints [${missingConstraints.join(', ')}]`,
    );
  }
}
