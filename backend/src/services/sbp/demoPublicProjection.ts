/**
 * demoPublicProjection - the named-field allow-list for the public demo route. PURE.
 *
 * ## Why an allow-list and not a filter
 *
 * The tempting shape is "take the project row and delete the fields we do not want". That is a
 * DENY-list, and a deny-list is wrong by construction here: the next column somebody adds to
 * `projects` is public the moment it lands, and nothing fails until a person notices. An
 * allow-list is the inverse. A new column is invisible until somebody names it here, and naming
 * it is a line in a diff a reviewer sees.
 *
 * ## Why this is enforced twice
 *
 * `DEMO_PUBLIC_COLUMNS` is passed to Sequelize as `attributes`, so the database never hands the
 * process a column this file does not name. Then `demoPublicProjection` builds the served object
 * by naming its fields. Either alone would be enough on a good day; together, a mistake in one is
 * caught by the other, and the sentinel test proves both at once.
 *
 * ## The one field that has to be let through
 *
 * `demo_spec` is on the list, and it is the field a response-side check could never vet, because
 * its whole purpose is to be rendered. That is why `demoSpec/contentPolicy.ts` runs at the WRITE
 * boundary instead. This module keeps every OTHER column out; the write boundary keeps restricted
 * data out of the one column this module must pass.
 */

/** Exactly the columns the public route may read. Adding one is a deliberate act. */
export const DEMO_PUBLIC_COLUMNS = ['demo_spec'] as const;

export interface DemoPublicRow {
  demo_spec: unknown;
}

/**
 * Build the served value by NAMING its fields.
 *
 * Never `{ ...row }`, never `delete row.x`. If a caller hands this a whole project row, what
 * comes back still contains one field, because the field list is written here rather than
 * inferred from the input.
 */
export function demoPublicProjection(row: unknown): DemoPublicRow | null {
  // `unknown` rather than a model type, and narrowed here. The caller hands over whatever
  // Sequelize's `get({ plain: true })` returned; widening that at the call site would need a
  // double cast, and a double cast at a security boundary is the kind of line that later gets
  // copied somewhere it does not belong.
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  return { demo_spec: (row as Record<string, unknown>).demo_spec ?? null };
}
