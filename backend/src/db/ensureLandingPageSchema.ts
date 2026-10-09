import { sequelize } from '../config/database';

/**
 * landing_pages — turn a path registry into something that can hold a page.
 *
 * WHAT THIS TABLE WAS. Seven columns: `name`, `path`, `is_marketing_enabled`, `conversion_event`
 * and timestamps. No tenant, no brand, no content, no status. It never described a page; it
 * described a path on a site that exists somewhere else, so that a campaign could point at it and
 * a conversion event could be counted on it. Seventeen rows in production on 2026-10-01, written
 * only by `deploymentService.seedLandingPages()` at boot and two seed scripts. There is no create
 * endpoint and no admin UI.
 *
 * WHY IT HAS TO CHANGE. Ali asked for landing pages to be created in the platform, rendered by
 * the platform, and tracked end to end - "we should not be using landing page that wasn't built
 * by this system". None of that is possible against a table with no content and no owner.
 *
 * TENANCY. This is the only marketing model in the schema with neither `tenant_id` nor
 * `brand_id` (compare tracked_links, content_items, page_events, lead_sources). Both are added
 * NULLABLE because seventeen rows already exist and belong to nobody in particular; a NOT NULL
 * column would refuse to add itself, and inventing an owner for a legacy row is worse than
 * leaving it stated as unknown.
 *
 * SITE_SLUG IS NOT BRAND_ID, AND THAT MATTERS HERE. Five web properties - colaberry, enterprise,
 * worldoftaxonomy, advisor, trustbeforeintelligence - all resolve to one brand today, and
 * worldoftaxonomy alone carries over half the estate's events (services/trackingEstateService.ts).
 * `visitor_sessions.site_slug` is the real grain the analytics already group by. A page carrying
 * only `brand_id` would be invisible at the grain its own traffic is measured in, so it carries
 * both.
 *
 * KIND, RATHER THAN A MIGRATION. The seventeen existing rows are not pages and must keep working:
 * the Create Campaign modal reads them as a destination-path dropdown. `kind` defaults to
 * `external_path`, which is what they have always been. Pages this platform builds and serves are
 * `hosted`. One table, two honest meanings, and nothing to backfill.
 *
 * GIT IS THE MASTER COPY (Ali, 2026-10-01: "There should be a git repo stored somewhere for each
 * one. That is where the main copy will always be."). `repo_path` records where that copy lives,
 * so the row is a serving cache of a file under review rather than a second source of truth that
 * can silently disagree with it.
 *
 * Additive and idempotent like every ensure* in this workstream, with a post-condition, because
 * the DDL loop only warns on failure and "it booted" proves nothing about what landed.
 */

export const LANDING_PAGE_SCHEMA_STATEMENTS: readonly string[] = [
  // The table predates this file. CREATE IF NOT EXISTS so a fresh database gets the full shape
  // and an existing one is left to the ALTERs below.
  `CREATE TABLE IF NOT EXISTS landing_pages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(100) NOT NULL,
     path VARCHAR(255) NOT NULL UNIQUE,
     is_marketing_enabled BOOLEAN NOT NULL DEFAULT false,
     conversion_event VARCHAR(100),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Ownership. Nullable on purpose - see the header.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS tenant_id UUID`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id)`,
  // The property the page lives on, at the grain the analytics already use.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS site_slug VARCHAR(64)`,

  // What distinguishes a path we merely know about from a page we serve.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'external_path'`,

  // The page itself.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS slug VARCHAR(160)`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'`,
  // Sections, copy and CTAs as structured data - never raw HTML, which would make the renderer a
  // way to put arbitrary markup on our own origin.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS created_by UUID`,

  // Where the master copy lives, and which commit this row was built from.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS repo_path VARCHAR(500)`,
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS repo_commit VARCHAR(64)`,

  // A hosted page is addressed by (brand, slug). Partial, so the seventeen legacy rows - which
  // have neither - are not forced into a uniqueness they cannot satisfy.
  `CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_brand_slug_unique
     ON landing_pages (brand_id, slug)
     WHERE kind = 'hosted' AND brand_id IS NOT NULL AND slug IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages (tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_landing_pages_brand_status ON landing_pages (brand_id, status)`,

  // A hosted page without a slug could never be served, and a published one without content would
  // render blank at a public URL. Refuse both in the database rather than in one service.
  `DO $$ BEGIN
     ALTER TABLE landing_pages ADD CONSTRAINT landing_pages_hosted_needs_slug
       CHECK (kind <> 'hosted' OR slug IS NOT NULL);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE landing_pages ADD CONSTRAINT landing_pages_published_needs_content
       CHECK (status <> 'published' OR content <> '{}'::jsonb);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,


];

const REQUIRED_COLUMNS: readonly string[] = [
  'tenant_id', 'brand_id', 'site_slug', 'kind', 'slug', 'status',
  'content', 'published_at', 'created_by', 'repo_path', 'repo_commit',
];

const REQUIRED_INDEXES: readonly string[] = [
  'landing_pages_brand_slug_unique',
  'idx_landing_pages_tenant',
  'idx_landing_pages_brand_status',
];

async function columnsOf(table: string): Promise<Set<string>> {
  const [rows]: any = await sequelize.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`,
  );
  return new Set((rows || []).map((r: any) => r.column_name));
}

export async function ensureLandingPageSchema(): Promise<{
  ok: boolean;
  /** False when the post-condition could not be evaluated at all - distinct from "nothing missing". */
  verified: boolean;
  missing: string[];
  missingIndexes: string[];
}> {
  for (const statement of LANDING_PAGE_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: any) {
      console.warn('[DB] landing page schema statement failed:', err?.message);
    }
  }

  let missing: string[] = [];
  let missingIndexes: string[] = [];
  let verified = false;
  try {
    const cols = await columnsOf('landing_pages');
    missing = REQUIRED_COLUMNS.filter((c) => !cols.has(c)).map((c) => `landing_pages.${c}`);

    const [idxRows]: any = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'landing_pages'`,
    );
    const present = new Set((idxRows || []).map((r: any) => r.indexname));
    missingIndexes = REQUIRED_INDEXES.filter((i) => !present.has(i));
    verified = true;

    if (missing.length > 0 || missingIndexes.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: {
          tables: ['landing_pages'],
          missing_columns: missing,
          missing_indexes: missingIndexes,
          impact: missingIndexes.includes('landing_pages_brand_slug_unique')
            ? 'two pages could claim one brand+slug, so a public URL would resolve to whichever row was read first'
            : 'landing pages cannot be owned, served or published; the composer falls back to free-text destinations',
        },
      }));
    }
  } catch (err: any) {
    // Never fail the boot over this - but never call it healthy either. "We could not check" and
    // "nothing is missing" are different answers, and only one of them should read as ok.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'SchemaVerificationUnavailable',
      outcome: 'failure', error_class: 'SchemaVerificationUnavailable',
      context: {
        tables: ['landing_pages'],
        reason: err?.message ?? 'unknown',
        impact: 'the landing_pages DDL ran but was never confirmed; treat its shape as unknown',
      },
    }));
  }

  console.log('[DB] Landing page schema ensured');
  return {
    ok: verified && missing.length === 0 && missingIndexes.length === 0,
    verified,
    missing,
    missingIndexes,
  };
}
