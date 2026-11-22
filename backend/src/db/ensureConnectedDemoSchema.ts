import { sequelize } from '../config/database';

/**
 * ensureConnectedDemoSchema - the three additive columns the Connected Demo needs.
 *
 * ## The columns
 *
 * | column | why |
 * |---|---|
 * | `demo_share_token` | the unguessable public address of one project's demo |
 * | `demo_share_enabled` | whether that address resolves; DEFAULT false, so no existing project becomes public on deploy |
 * | `demo_spec` | the spec the public route renders the engine against |
 *
 * ## Why NOT `share_token` / `share_enabled`, which already exist
 *
 * Those are the PORTFOLIO switch: `portfolioShareService.getPortfolioByShareToken` reads
 * `{ share_token, share_enabled: true, archived_at: null }`. Reusing them would make "turn this
 * demo off" also mean "unpublish this project's portfolio", and one boolean cannot carry two
 * revocations. Measured before deciding: `share_enabled` was true on 0 of 98 projects, so this
 * was a latent coupling rather than a live exposure, and separating now costs nothing.
 *
 * ## Why the spec and not the rendered HTML
 *
 * `runtime_portfolio_artifacts` was the first choice and is wrong for this: it is keyed
 * `enrollment_id` with no project column (`models/PortfolioArtifact.ts:20-27`), so one demo per
 * PROJECT cannot be expressed, and `ensureCaseStudySchema.ts:327` documents a `kind` collision on
 * the same table that ten other modules read. Storing the small structured spec and rendering the
 * repo-versioned engine at request time also means an engine fix reaches every existing demo with
 * no regeneration.
 *
 * ## THIS ENSURE REJECTS. The one next to it does not, and that is the bug.
 *
 * `ensureProjectLifecycleSchema.ts` applies its DDL warn-only (`:384`), its paired
 * `assertProjectLifecycleSchema()` returns `false` rather than throwing, and the only caller
 * DISCARDS that boolean (`:387`). So a database where that schema failed to apply boots clean and
 * serves traffic while lifecycle registration fails at runtime. That defect was found by the L9.2
 * isolated review on 2026-11-03 and is still on main.
 *
 * This module does the inverse: a failed statement or a missing column REJECTS, so the failure is
 * a rejected promise rather than a log line nobody reads. The boot call site still wraps it in
 * try/catch and warns, exactly like every other ensure, because a demo feature must never take
 * the platform down. The difference is that the failure is now a value the caller could act on,
 * instead of one the caller could not see.
 */

/** The columns this module guarantees. Exported so the test asserts the list, not a copy of it. */
export const CONNECTED_DEMO_COLUMNS: ReadonlyArray<string> = [
  'demo_share_token',
  'demo_share_enabled',
  'demo_spec',
];

/**
 * Additive only. Every statement is `IF NOT EXISTS`, so a second run is a no-op and a re-deploy
 * costs nothing. No existing column is altered and no data is rewritten.
 */
const STATEMENTS: ReadonlyArray<string> = [
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo_share_token TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo_share_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo_spec JSONB`,
  // Unique so a token cannot address two projects. Partial, because the column is NULL for every
  // project that has no demo and a plain unique index would collide on the second NULL in some
  // engines; the partial form also keeps the index small, which is the same reasoning
  // ensureCaseStudySchema.ts gives for its own partial unique index.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_demo_share_token
     ON projects (demo_share_token) WHERE demo_share_token IS NOT NULL`,
];

export class ConnectedDemoSchemaError extends Error {
  readonly name = 'ConnectedDemoSchemaError';

  readonly error_class = 'ConnectedDemoSchemaUnavailable';

  constructor(message: string) {
    super(message);
  }
}

/**
 * Verify the columns are actually present.
 *
 * Separate from applying them because "the statements ran" and "the schema is right" are
 * different claims, and only the second one matters to the feature.
 */
export async function assertConnectedDemoSchema(): Promise<string[]> {
  const selects = CONNECTED_DEMO_COLUMNS
    .map((c, i) => `bool_or(column_name = '${c}') AS c${i}`)
    .join(', ');
  const [rows] = await sequelize.query(
    `SELECT ${selects} FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects'`,
  );
  const row = (((rows as unknown[]) || [])[0] || {}) as Record<string, boolean>;
  const missing: string[] = [];
  CONNECTED_DEMO_COLUMNS.forEach((c, i) => {
    if (!row[`c${i}`]) missing.push(c);
  });
  return missing;
}

/**
 * Apply the columns, then prove they are there.
 *
 * REJECTS on a failed statement or a missing column. See the header for why that is the whole
 * point of this module.
 */
export async function ensureConnectedDemoSchema(): Promise<void> {
  for (const sql of STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // NOT a warn-and-continue. A statement that did not apply means the next one may be
      // building on a schema that does not exist, and the assert below would report the symptom
      // without the cause.
      throw new ConnectedDemoSchemaError(
        `connected demo schema statement failed: ${message}`,
      );
    }
  }

  const missing = await assertConnectedDemoSchema();
  if (missing.length) {
    throw new ConnectedDemoSchemaError(
      `connected demo schema incomplete after apply: ${missing.join(', ')} missing from projects`,
    );
  }
}
