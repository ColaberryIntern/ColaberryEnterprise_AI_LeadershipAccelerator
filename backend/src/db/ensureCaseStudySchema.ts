import { sequelize } from '../config/database';

/**
 * Case Study OS schema — ensured via idempotent raw SQL, same pattern as
 * ensureEvidenceSchema.ts / ensureSbpSchema.ts. `sequelize.sync({alter:true})` is
 * gated off at server.ts:2726 because the alter pass is unreliable on this
 * 215-model graph, so a Sequelize model edit alone does NOTHING in production —
 * every table below has to be created here or it does not exist.
 *
 * Every statement is CREATE/ALTER ... IF NOT EXISTS and runs in its own try/catch,
 * so a partial database self-heals and re-running boot is a no-op.
 *
 * ADDITIVE ONLY: creates 10 new tables. Never alters or drops any existing column,
 * table, or constraint. Nothing outside the case_study_* namespace is touched.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE NO FOREIGN KEYS TO EXTERNAL TABLES
 * ---------------------------------------------------------------------------
 * `project_id`, `tenant_id`, `brand_id`, `github_connection_id`,
 * `evidence_record_id` and `portfolio_artifact_id` are plain UUID columns with
 * indexes, NOT `REFERENCES` constraints. Two independent reasons:
 *
 *   1. `projects` is created by no ensure* module in this repo (grep confirms:
 *      there is no `CREATE TABLE IF NOT EXISTS projects` anywhere in backend/src).
 *      A REFERENCES clause against a table that does not yet exist makes the whole
 *      CREATE TABLE fail — and because the failure is swallowed into a console.warn
 *      below, we would silently end up with NO case_studies table rather than a
 *      loud error. An FK would trade a real data-integrity guarantee for a
 *      boot-order landmine.
 *   2. It matches the established precedent. The 2026-08-22 tenancy work added
 *      `tenant_id`/`brand_id` to nine tables as bare `UUID` columns with no FK
 *      (ensureMultiTenantSchema.ts:324-330), and `evidence_records` carries no FKs
 *      at all.
 *
 * Intra-Case-Study references (everything pointing at case_studies.id) DO carry
 * real FKs — those tables are all created in this file, in order, so there is no
 * boot-order hazard and the integrity guarantee is free.
 *
 * ---------------------------------------------------------------------------
 * WHY REQUIRED_COLUMNS IS DERIVED, NOT HARDCODED
 * ---------------------------------------------------------------------------
 * ensureSbpSchema.ts carries a comment recording a real defect: a hardcoded column
 * list stopped covering columns added on new tables, and one entry then reported
 * missing on every boot forever while the column actually existed
 * (github_connections.webhook_secret). Here the list is parsed out of the DDL
 * itself by parseCreatedColumns(), so the post-check can never drift from the
 * statements it is checking. The same parser is reused by the model-parity test.
 */

/** Tables this module owns. Order matters: parents before children (real FKs). */
export const CASE_STUDY_TABLES = [
  'case_studies',
  'case_study_repo_collections',
  'case_study_repositories',
  'case_study_snapshots',
  'case_study_metrics',
  'case_study_evidence',
  'case_study_artifacts',
  'case_study_publications',
  'case_study_sync_runs',
  'case_study_collections',
] as const;

export const CASE_STUDY_STATEMENTS: string[] = [
  // --- case_studies : the canonical record --------------------------------------
  // One row per project story, independent of any publishing surface. `status` is
  // the editorial lifecycle; `visibility` and the two *_identity_mode columns are
  // the consent axis the publish gate reads (spec 16). They are deliberately
  // separate: a record can be `approved` while its organisation consent is still
  // `hidden`, and publishing must fail closed in that state.
  `CREATE TABLE IF NOT EXISTS case_studies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug VARCHAR(160) NOT NULL,
     title VARCHAR(300) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     project_id UUID,
     source_type VARCHAR(30) NOT NULL DEFAULT 'repo_collection',
     canonical_summary TEXT,
     industry VARCHAR(120),
     primary_capability VARCHAR(120),
     program_key VARCHAR(80),
     built_by_type VARCHAR(40),
     visibility VARCHAR(20) NOT NULL DEFAULT 'private',
     organization_display_name VARCHAR(255),
     organization_is_anonymized BOOLEAN NOT NULL DEFAULT true,
     organization_identity_mode VARCHAR(20) NOT NULL DEFAULT 'hidden',
     organization_naming_consent BOOLEAN NOT NULL DEFAULT false,
     builder_identity_mode VARCHAR(20) NOT NULL DEFAULT 'anonymous',
     builder_naming_consent BOOLEAN NOT NULL DEFAULT false,
     created_by VARCHAR(255),
     approved_by VARCHAR(255),
     approved_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     archived_at TIMESTAMPTZ
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS case_studies_slug_unique ON case_studies (slug)`,
  `CREATE INDEX IF NOT EXISTS idx_case_studies_status ON case_studies (status)`,
  `CREATE INDEX IF NOT EXISTS idx_case_studies_project_id ON case_studies (project_id)`,

  // --- case_study_repo_collections : the multi-repo container --------------------
  // Exists as its own table rather than a column on case_studies so that the
  // one-workspace-repo-per-Project invariant (a partial unique index on
  // github_connections.project_id) is never touched. A Project still has exactly
  // one workspace repo; a Case Study may cite many evidence repos.
  `CREATE TABLE IF NOT EXISTS case_study_repo_collections (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     name VARCHAR(200) NOT NULL DEFAULT 'Sources',
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cs_repo_collections_case_study ON case_study_repo_collections (case_study_id)`,

  // --- case_study_repositories --------------------------------------------------
  // `allow_public_repo_link` defaults false: a public repo link is opt-in per repo
  // AND requires the repo to actually be public AND the snapshot to approve it
  // (spec 16). Three independent gates, defaulting closed.
  `CREATE TABLE IF NOT EXISTS case_study_repositories (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     collection_id UUID NOT NULL REFERENCES case_study_repo_collections(id),
     repo_owner VARCHAR(255) NOT NULL,
     repo_name VARCHAR(255) NOT NULL,
     repo_url VARCHAR(512) NOT NULL,
     role VARCHAR(20) NOT NULL DEFAULT 'other',
     visibility VARCHAR(20) NOT NULL DEFAULT 'unknown',
     github_connection_id UUID,
     project_id UUID,
     default_branch VARCHAR(255),
     last_seen_sha VARCHAR(64),
     last_synced_at TIMESTAMPTZ,
     access_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
     allow_public_repo_link BOOLEAN NOT NULL DEFAULT false,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cs_repositories_collection ON case_study_repositories (collection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_repositories_owner_name ON case_study_repositories (repo_owner, repo_name)`,
  // Case-insensitive dedupe inside one collection: Owner/Repo and owner/repo are
  // the same repository. Enforced in the database as well as the service so a
  // concurrent double-attach cannot create two rows.
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_repositories_unique_per_collection
     ON case_study_repositories (collection_id, LOWER(repo_owner), LOWER(repo_name))`,
  // At most one primary repo per collection, enforced in the database rather than
  // only in the service. Added after T004's verification found a real race:
  // setRepositoryRole reads the current rows OUTSIDE its transaction and demotes
  // from that snapshot, so two concurrent promotions could each demote a stale
  // incumbent and both commit, leaving two primaries and an ambiguous Case Study.
  //
  // A partial unique index closes it fail-closed: the second promotion violates
  // the constraint and rolls back instead of silently corrupting the record. This
  // is the same mechanism the platform already uses for the one-workspace-repo-per
  // -Project invariant (github_connections_unique_project, a partial unique index
  // WHERE project_id IS NOT NULL), so the pattern is precedent, not invention.
  //
  // Demote-then-promote inside one transaction is unaffected: uniqueness is checked
  // per statement, so after the demote there are zero primaries and the promote
  // then lands cleanly.
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_repositories_one_primary_per_collection
     ON case_study_repositories (collection_id) WHERE role = 'primary'`,

  // --- case_study_snapshots : immutable versioned content ------------------------
  // Mirrors the build_plans precedent (ensureSbpSchema.ts:102-122): a regeneration
  // is a NEW VERSION, never an overwrite. `content_hash` is what makes a repeat
  // sync a no-op — identical normalised content produces an identical hash and no
  // new row, which is the spec's headline idempotency requirement.
  `CREATE TABLE IF NOT EXISTS case_study_snapshots (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     version INTEGER NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     source_commit_map JSONB NOT NULL DEFAULT '{}'::jsonb,
     content JSONB NOT NULL DEFAULT '{}'::jsonb,
     provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
     generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     generated_by VARCHAR(20) NOT NULL DEFAULT 'repo_sync',
     approved_by VARCHAR(255),
     approved_at TIMESTAMPTZ,
     content_hash VARCHAR(64) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_snapshots_unique_case_version
     ON case_study_snapshots (case_study_id, version)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_snapshots_case_hash ON case_study_snapshots (case_study_id, content_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_snapshots_status ON case_study_snapshots (status)`,

  // --- case_study_metrics -------------------------------------------------------
  // `publishable` defaults FALSE and `verification_class` defaults 'pending'. A
  // metric is invisible to the public surface until a human moves both. AI writes
  // rows here only as 'pending'; it may never set 'verified'.
  `CREATE TABLE IF NOT EXISTS case_study_metrics (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     metric_key VARCHAR(120) NOT NULL,
     label VARCHAR(300) NOT NULL,
     value_display VARCHAR(300),
     numeric_value DOUBLE PRECISION,
     unit VARCHAR(40),
     metric_type VARCHAR(30) NOT NULL DEFAULT 'technical',
     verification_class VARCHAR(20) NOT NULL DEFAULT 'pending',
     verification_method VARCHAR(20) NOT NULL DEFAULT 'manual',
     evidence_id UUID,
     evidence_description TEXT,
     baseline VARCHAR(300),
     sample VARCHAR(300),
     methodology TEXT,
     limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
     verified_by VARCHAR(255),
     verified_at TIMESTAMPTZ,
     is_headline BOOLEAN NOT NULL DEFAULT false,
     publishable BOOLEAN NOT NULL DEFAULT false,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cs_metrics_case_publishable ON case_study_metrics (case_study_id, publishable)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_metrics_verification_class ON case_study_metrics (verification_class)`,
  // ONE row per (case study, metric key). This is a correctness constraint, not a
  // lookup optimisation, and the failure it prevents is silent rather than loud:
  // `resolveChart` (caseStudyChartService.ts:87) builds
  // `new Map(metrics.map((m) => [m.metric_key, m]))`, and Map construction keeps
  // the LAST entry for a repeated key without complaint. Two rows sharing a key
  // therefore render a chart that is quietly wrong — it plots a real, verified,
  // publishable number, just not the one anybody chose — and nothing anywhere
  // reports that a choice was made. A duplicate that throws on write is a bug
  // report; a duplicate that resolves to an arbitrary row is a published claim
  // nobody can trace.
  //
  // Applied NOW, before the first producer exists, because it can never be
  // cheaper: the table has no write path anywhere in backend/src (two `findAll`
  // call sites, zero create/upsert/update/bulkCreate, and no `INSERT INTO
  // case_study_metrics` in the repository), so there is no existing data for the
  // index build to reject. Added after rows accumulate, this becomes a
  // data-cleanup exercise on figures that may already be published.
  //
  // A UNIQUE INDEX rather than an ALTER TABLE ... ADD CONSTRAINT for one concrete
  // reason: Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the constraint form
  // cannot satisfy this module's every-statement-is-idempotent rule, and a
  // non-idempotent statement here would warn on every boot forever. The unique
  // index enforces the same invariant, raises the same SQLSTATE 23505, and names
  // itself as the violated constraint. It is also the house pattern — 79 other
  // `CREATE UNIQUE INDEX IF NOT EXISTS` statements across backend/src/db, 8 of
  // them in this file.
  //
  // NOT partial. Every other unique index in this file that carries a WHERE clause
  // does so because the invariant is genuinely conditional (one PRIMARY repo per
  // collection; one PROPOSED draft per path). This invariant is not: a duplicate
  // key is wrong while pending, because the producer would accumulate a new row on
  // every run instead of updating one, and `loadCandidateMetrics` would hand the
  // snapshot builder two entries for one key.
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_metrics_unique_case_key ON case_study_metrics (case_study_id, metric_key)`,

  // --- case_study_evidence ------------------------------------------------------
  // `evidence_record_id` links the existing evidence_records table without owning
  // or mutating it. `is_publicly_openable` defaults false for the same reason as
  // repo links.
  `CREATE TABLE IF NOT EXISTS case_study_evidence (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     evidence_record_id UUID,
     metric_id UUID,
     source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
     source_ref VARCHAR(512),
     source_commit_sha VARCHAR(64),
     title VARCHAR(300) NOT NULL,
     description TEXT,
     verification_class VARCHAR(20) NOT NULL DEFAULT 'pending',
     is_publicly_openable BOOLEAN NOT NULL DEFAULT false,
     public_url VARCHAR(512),
     reviewed_by VARCHAR(255),
     reviewed_at TIMESTAMPTZ,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cs_evidence_case_study ON case_study_evidence (case_study_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_evidence_metric ON case_study_evidence (metric_id)`,
  // One link per (Case Study, EvidenceRecord). Added after T008's build found that
  // linking is check-then-create: sequential re-runs correctly write nothing, but two
  // SIMULTANEOUS syncs could each read "absent" and both insert, leaving a duplicate.
  // Same reasoning as cs_repositories_one_primary_per_collection: the service checks,
  // the database guarantees.
  //
  // WHERE ... IS NOT NULL is for explicitness, not necessity. Postgres treats NULLs as
  // distinct in a unique index, so a plain index would already admit many manually-
  // created rows (which carry a NULL source id). Saying so in the predicate states the
  // intent — "this constrains imported links only" — rather than leaving it to depend
  // on a NULL-comparison rule a reader has to remember, and keeps the index smaller.
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_evidence_unique_source_record
     ON case_study_evidence (case_study_id, evidence_record_id)
     WHERE evidence_record_id IS NOT NULL`,

  // --- case_study_artifacts -----------------------------------------------------
  // NOTE ON A NAME COLLISION: runtime_portfolio_artifacts.kind already uses the
  // literal string 'case_study' as its DEFAULT value, meaning "a learner's
  // case-study writeup". That is a different concept from a row in `case_studies`.
  // A PortfolioArtifact may become a row here; it is never itself a CaseStudy.
  `CREATE TABLE IF NOT EXISTS case_study_artifacts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     artifact_type VARCHAR(30) NOT NULL DEFAULT 'other',
     title VARCHAR(300) NOT NULL,
     description TEXT,
     source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
     source_ref VARCHAR(512),
     source_commit_sha VARCHAR(64),
     portfolio_artifact_id UUID,
     public_url VARCHAR(512),
     preview_url VARCHAR(512),
     visibility VARCHAR(20) NOT NULL DEFAULT 'private',
     status VARCHAR(20) NOT NULL DEFAULT 'candidate',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cs_artifacts_case_status ON case_study_artifacts (case_study_id, status)`,
  // One candidate per (Case Study, PortfolioArtifact) — same concurrent check-then-create
  // race as the evidence link above, same partial-index remedy and the same explicitness
  // rationale. Manually-added artifacts carry a NULL portfolio_artifact_id and fall
  // outside the index entirely.
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_artifacts_unique_portfolio_source
     ON case_study_artifacts (case_study_id, portfolio_artifact_id)
     WHERE portfolio_artifact_id IS NOT NULL`,

  // --- case_study_publications : surface binding --------------------------------
  // The whole point of the architecture: canonical truth lives in case_studies,
  // and a publication binds ONE approved snapshot to ONE surface. Adding Training
  // or AI Flotation later is a row here, not a schema change or a second database.
  // `published_snapshot_id` is what pins published content — a later sync creates
  // a new draft snapshot but never moves this pointer without an explicit republish.
  // tenant_id/brand_id are bare UUIDs by the precedent documented at the top.
  `CREATE TABLE IF NOT EXISTS case_study_publications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     surface_key VARCHAR(40) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     published_snapshot_id UUID,
     tenant_id UUID,
     brand_id UUID,
     featured BOOLEAN NOT NULL DEFAULT false,
     featured_rank INTEGER,
     surface_title_override VARCHAR(300),
     surface_summary_override TEXT,
     section_order JSONB,
     hidden_sections JSONB,
     cta_profile_key VARCHAR(80),
     published_by VARCHAR(255),
     published_at TIMESTAMPTZ,
     unpublished_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_publications_unique_case_surface
     ON case_study_publications (case_study_id, surface_key)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_publications_surface_status_featured
     ON case_study_publications (surface_key, status, featured)`,

  // --- case_study_sync_runs : append-only audit ---------------------------------
  `CREATE TABLE IF NOT EXISTS case_study_sync_runs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     case_study_id UUID NOT NULL REFERENCES case_studies(id),
     trigger VARCHAR(30) NOT NULL DEFAULT 'manual',
     status VARCHAR(20) NOT NULL DEFAULT 'running',
     repos_attempted INTEGER NOT NULL DEFAULT 0,
     repos_succeeded INTEGER NOT NULL DEFAULT 0,
     repos_failed INTEGER NOT NULL DEFAULT 0,
     facts_extracted INTEGER NOT NULL DEFAULT 0,
     candidate_metrics INTEGER NOT NULL DEFAULT 0,
     snapshot_id UUID,
     correlation_id VARCHAR(64),
     error_class VARCHAR(60),
     error_summary TEXT,
     started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cs_sync_runs_case_started ON case_study_sync_runs (case_study_id, started_at DESC)`,

  // --- case_study_collections : saved editorial filter sets ----------------------
  // Supports future curated paths (agents, insurance, built-by-learners) as a
  // filter definition rather than by duplicating records.
  `CREATE TABLE IF NOT EXISTS case_study_collections (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug VARCHAR(160) NOT NULL,
     surface_key VARCHAR(40) NOT NULL DEFAULT 'enterprise',
     title VARCHAR(300) NOT NULL,
     description TEXT,
     filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
     sort_config JSONB NOT NULL DEFAULT '{}'::jsonb,
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cs_collections_slug_unique ON case_study_collections (slug)`,
];

/**
 * The two DDL parsers live in `caseStudyDdlParser.ts`. They moved there when this
 * file crossed CLAUDE.md's 500-line ceiling; see that module's header for what
 * moved and, more importantly, what deliberately did not.
 *
 * They are RE-EXPORTED here rather than merely relocated. Three suites and the
 * Story Studio peer module import them from this path — including
 * `models/__tests__/caseStudyModelParity.test.ts:295`, which asserts its own
 * import specifiers are exactly `['../../db/ensureCaseStudySchema', 'fs',
 * 'path']`. Keeping the surface intact is what makes the split invisible to
 * every guard, instead of requiring each guard to be edited to accommodate a
 * refactor — and an edited guard is a weakened guard.
 */
export { parseCreatedColumns, parseCreatedIndexes } from './caseStudyDdlParser';

import { parseCreatedColumns, parseCreatedIndexes } from './caseStudyDdlParser';

export const CASE_STUDY_REQUIRED_COLUMNS: string[] = parseCreatedColumns(CASE_STUDY_STATEMENTS);

export const CASE_STUDY_REQUIRED_INDEXES: string[] = parseCreatedIndexes(CASE_STUDY_STATEMENTS);

export async function ensureCaseStudySchema(): Promise<void> {
  for (const sql of CASE_STUDY_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] case study schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Case Study OS schema ensured (10 tables)');
}

/**
 * Verify the post-condition against the catalog and report loudly if it is not met.
 *
 * This is NOT optional decoration. Every statement above is swallowed into a
 * console.warn, so `ensureCaseStudySchema()` resolving successfully proves
 * nothing whatsoever about whether the tables exist. Exported so a test can prove
 * the assertion actually fires against an un-migrated database — an assertion
 * nobody has watched fail is not an assertion.
 */
export async function assertCaseStudySchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT
         (SELECT array_agg(table_name) FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = ANY($tables)) AS tables,
         (SELECT array_agg(indexname) FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = ANY($indexes)) AS indexes`,
      { bind: { tables: [...CASE_STUDY_TABLES], indexes: [...CASE_STUDY_REQUIRED_INDEXES] } },
    );
    const foundTables: string[] = rows?.[0]?.tables ?? [];
    const foundIndexes: string[] = rows?.[0]?.indexes ?? [];
    for (const t of CASE_STUDY_TABLES) if (!foundTables.includes(t)) missing.push(`table:${t}`);
    for (const i of CASE_STUDY_REQUIRED_INDEXES) if (!foundIndexes.includes(i)) missing.push(`index:${i}`);

    // Columns are checked separately because CREATE TABLE IF NOT EXISTS is a no-op
    // on a table that already exists — on any database that already has these
    // tables, a column added later would never appear, and the code would write to
    // a column that is not there and have the value dropped without an error.
    const [colRows]: any = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...CASE_STUDY_TABLES] } },
    );
    const found = new Set((colRows ?? []).map((r: any) => `${r.table_name}.${r.column_name}`));
    for (const c of CASE_STUDY_REQUIRED_COLUMNS) if (!found.has(c)) missing.push(`column:${c}`);
  } catch (err: any) {
    console.warn('[DB] case study schema post-check could not run:', err?.message);
    return { ok: false, missing: ['post-check-failed'] };
  }

  if (missing.length > 0) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'case_study_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaInvariantViolation',
      context: {
        missing,
        impact:
          'Case Study records cannot be persisted or published. A missing snapshot column means an approved snapshot is not pinned, so published public content could silently change when a repository changes — the exact failure the versioning model exists to prevent.',
        remedy:
          'A missing table or index self-heals: inspect the [DB] case study schema stmt skipped warnings above, then restart — every statement is idempotent and safe to re-run. A missing COLUMN does NOT self-heal, because CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists and this module declares no ADD COLUMN statements. Adding a column to the DDL therefore also requires an explicit ALTER TABLE ... ADD COLUMN IF NOT EXISTS statement, or the column will be reported missing on every boot forever while the code silently drops writes to it.',
      },
    }));
    return { ok: false, missing };
  }

  console.log('[DB] Case Study OS schema verified (10 tables, indexes, columns)');
  return { ok: true, missing: [] };
}
