import { sequelize } from '../config/database';

/**
 * Turns `media_assets` from "files attached to a post" into a standing library that also holds
 * links. Additive and idempotent, with a post-condition, like ensureLandingPageSnackbarSchema
 * (the boot DDL loop only warns on failure, so "it booted" proves nothing).
 *
 *   media_assets.kind        'file' | 'link'. NOT NULL DEFAULT 'file', so the rows already in
 *                            the table become files without a backfill statement.
 *   media_assets.source_url  The URL, for a link. NULL for a file.
 *   media_assets.tags        Free tags, for finding things later. NOT NULL DEFAULT '{}' so every
 *                            read can treat it as an array without a null check.
 *
 * THE CHECK CONSTRAINT IS THE DELIVERABLE, NOT THE COLUMNS. Three nullable columns on their own
 * make a half-populated row perfectly legal: a 'link' with a storage_key and no URL, or a 'file'
 * with neither. Those rows would reach the publishing worker, which builds a provider payload
 * from `storage_key` and would hand a provider a UUID or an undefined. The database is the only
 * place that can refuse them for every writer at once - a service-layer guard protects the one
 * path it sits on and nothing else, including a hand-run script or a future second writer.
 *
 * WHY `storage_key` IS RELAXED AND `mime_type` IS NOT. A link has no stored bytes, so it cannot
 * have a storage key. It does have a type: `text/uri-list`. Leaving mime_type NOT NULL keeps
 * every existing reader of that column working unchanged - nullable would be a breaking contract
 * change rippling through the model, the service and the worker - and the CHECK below still
 * guarantees a file row carries both of the things a file needs.
 */
export const MEDIA_LIBRARY_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'file'`,
  `ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source_url TEXT`,
  `ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[]`,
  // Only this one. See the header: mime_type stays NOT NULL and a link carries 'text/uri-list'.
  // Re-running is a no-op once the column is already nullable.
  `ALTER TABLE media_assets ALTER COLUMN storage_key DROP NOT NULL`,

  // ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so idempotency is the exception handler.
  // Catching ONLY duplicate_object matters: a bare catch-all would swallow a genuine failure
  // (an existing row that violates the shape, say) and this module would report success while
  // the table stayed unprotected - which is the exact failure mode the post-condition exists for.
  //
  // Any value of `kind` other than 'file' or 'link' satisfies neither branch and is therefore
  // rejected, so this doubles as the enum check without a separate constraint.
  `DO $$
   BEGIN
     ALTER TABLE media_assets ADD CONSTRAINT media_assets_kind_shape CHECK (
       (kind = 'file' AND storage_key IS NOT NULL AND mime_type IS NOT NULL AND source_url IS NULL)
       OR
       (kind = 'link' AND source_url IS NOT NULL AND storage_key IS NULL)
     );
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,

  // One link per brand. The predicate DELIBERATELY MIRRORS media_assets_brand_checksum_unique
  // (ensureContentOsSchema.ts:169-178) and inherits its escape hatch for the same reason: a
  // tenant-level asset with no brand (brand_id IS NULL) can be added twice. That is a tidiness
  // problem. Deduplicating across brands would be a CONFIDENTIALITY problem - brand A would
  // discover that brand B had already saved a URL - so the hole is accepted deliberately rather
  // than closed.
  //
  // `archived_at IS NULL` is also deliberate: archiving is how an operator removes a link, and
  // re-adding one they archived last month must work. Without this clause the archived row would
  // block the new one and the only visible symptom would be "nothing happens when I paste it".
  `CREATE UNIQUE INDEX IF NOT EXISTS media_assets_link_unique
     ON media_assets (brand_id, source_url)
     WHERE kind = 'link' AND source_url IS NOT NULL AND brand_id IS NOT NULL AND archived_at IS NULL`,

  // Tag filtering in the library grid. GIN is the index type for @> and && on an array column;
  // a btree here would be built and then never used by the planner.
  `CREATE INDEX IF NOT EXISTS media_assets_tags_gin ON media_assets USING GIN (tags)`,

  // The library's default view: one brand's live assets, newest first.
  `CREATE INDEX IF NOT EXISTS media_assets_brand_live
     ON media_assets (brand_id, created_at DESC) WHERE archived_at IS NULL`,
];

const REQUIRED_COLUMNS = ['kind', 'source_url', 'tags'] as const;
const REQUIRED_INDEXES = ['media_assets_link_unique', 'media_assets_tags_gin', 'media_assets_brand_live'] as const;
const CONSTRAINT = 'media_assets_kind_shape';

interface ColumnRow { column_name: string; is_nullable: string }

/** Run the DDL. Separated from the check below; see assertMediaLibrarySchema for why. */
export async function applyMediaLibrarySchema(): Promise<void> {
  for (const statement of MEDIA_LIBRARY_SCHEMA_STATEMENTS) {
    await sequelize.query(statement);
  }
}

/**
 * The post-condition, EXPORTED SEPARATELY FROM THE DDL ON PURPOSE.
 *
 * The stated acceptance for this module is "the post-condition throws when the constraint is
 * dropped". Against `ensureMediaLibrarySchema` that is not reproducible and never was: it
 * re-runs the DDL first, so dropping the constraint and calling it simply re-creates the
 * constraint and returns cleanly. A check that cannot be observed failing is not evidence that
 * it works, so it is callable on its own and the integration suite drops each object in turn
 * and requires this to throw.
 */
export async function assertMediaLibrarySchema(): Promise<void> {
  // table_schema is pinned to current_schema() because this database carries the same table name
  // in more than one schema, and an unfiltered information_schema read judges an arbitrary one.
  const [columnRows] = await sequelize.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'media_assets'`,
  );
  const columns = new Map((columnRows as ColumnRow[]).map((r) => [r.column_name, r.is_nullable]));
  if (columns.size === 0) {
    throw new Error('ensureMediaLibrarySchema: media_assets not found in current_schema()');
  }

  const missing = REQUIRED_COLUMNS.filter((c) => !columns.has(c));
  if (missing.length) {
    throw new Error(`ensureMediaLibrarySchema: columns missing after DDL: ${missing.join(', ')}`);
  }

  // Both nullability facts are asserted, not just the one that changed. mime_type staying NOT
  // NULL is a decision this module depends on (the CHECK's file branch and every existing reader
  // of the column), so a later careless DROP NOT NULL should fail here rather than surface as a
  // provider rejecting a payload.
  if (columns.get('storage_key') !== 'YES') {
    throw new Error('ensureMediaLibrarySchema: storage_key is still NOT NULL, so a link row cannot be stored');
  }
  if (columns.get('mime_type') !== 'NO') {
    throw new Error('ensureMediaLibrarySchema: mime_type became nullable; the CHECK and its readers assume it is not');
  }

  // THE POINT OF THIS POST-CONDITION. The columns can all exist while the CHECK silently failed
  // to apply - the DO block swallows duplicate_object, and a boot loop that only warns would
  // hide anything else. Columns alone would pass and the table would be unprotected.
  const [constraintRows] = await sequelize.query(
    `SELECT c.conname FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema() AND t.relname = 'media_assets'
        AND c.contype = 'c' AND c.conname = 'media_assets_kind_shape'`,
  );
  if ((constraintRows as unknown[]).length === 0) {
    throw new Error(
      `ensureMediaLibrarySchema: CHECK constraint ${CONSTRAINT} is absent, so a half-populated asset row is still legal`,
    );
  }

  const [indexRows] = await sequelize.query(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'media_assets'`,
  );
  const indexes = new Set((indexRows as Array<{ indexname: string }>).map((r) => r.indexname));
  const missingIndexes = REQUIRED_INDEXES.filter((i) => !indexes.has(i));
  if (missingIndexes.length) {
    throw new Error(`ensureMediaLibrarySchema: indexes missing after DDL: ${missingIndexes.join(', ')}`);
  }
}

/**
 * The boot entry point: apply, then prove it applied.
 *
 * Unlike its neighbours in the boot sequence this THROWS. The CHECK constraint is the
 * deliverable, and a boot that merely warns about a missing constraint is how a 'link' row
 * carrying a storage_key reaches the publishing worker.
 */
export async function ensureMediaLibrarySchema(): Promise<void> {
  await applyMediaLibrarySchema();
  await assertMediaLibrarySchema();
}
