import { sequelize } from '../config/database';

/**
 * Marketing Operations — campaign planning and taxonomy columns.
 *
 * Extends the EXISTING `campaigns` table rather than introducing a second campaign entity.
 * That is a deliberate constraint from the build spec: one canonical campaign connects
 * brand, content, paid and organic placements, tracking, visitors, leads and outcomes. A
 * parallel "marketing campaign" table would split attribution in half on day one.
 *
 * Ensured via idempotent additive raw SQL, matching the other ensure*Schema modules.
 * ADDITIVE ONLY: `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` exclusively.
 * No column is dropped, renamed, retyped, or backfilled, and nothing is made NOT NULL —
 * `campaigns` is a live table with production rows.
 *
 * ── What each column is for ──────────────────────────────────────────────────────────
 *
 * `funnel_stage`        Where this campaign sits in the funnel. Drives objective-aware
 *                       ranking: an awareness campaign must not be ranked on cost-per-lead,
 *                       and an acquisition campaign must not be ranked on likes.
 * `owner_admin_id`      Who is accountable. Today `created_by` records who typed it in,
 *                       which is not the same question.
 * `approver_admin_id`   Who must approve. `approved_by` already records who DID approve,
 *                       after the fact; this is the requirement, before it.
 * `planned_start_at`    Planned window. `started_at`/`completed_at` are ACTUALS, so pacing
 * `planned_end_at`      ("are we behind?") is uncomputable from them alone.
 * `utm_campaign_slug`   The stable tracking identity. Unique per tenant. NOT the display
 *                       name — a name is freely editable, and editing one silently rewrites
 *                       the meaning of every historical UTM that used it.
 * `goals_json`          Typed targets/thresholds. The existing `goals` column is free TEXT
 *                       and cannot be compared against actuals. `goals` is left untouched.
 * `parent_campaign_id`  Program rollups. Self-referential, nullable.
 * `archived_at`         Archival is not deletion. The existing `status` lifecycle has no
 * `archived_reason`     archived state, and campaigns carry attribution history that must
 *                       survive being taken out of the active list.
 *
 * ── Why `utm_campaign_slug` is unique per TENANT, not globally ────────────────────────
 *
 * Brands within one tenant share a lead pool and an operator roster, so a slug collision
 * between them is a genuine mistake worth blocking. Across tenants it is not: CPN and
 * Colaberry are separate legal entities and may both legitimately run `spring-openhouse`.
 * This mirrors `brands_tenant_slug_unique`, which is unique on `(tenant_id, slug)` for
 * exactly the same reason.
 *
 * ── Why the index is PARTIAL ──────────────────────────────────────────────────────────
 *
 * NOT because NULLs would collide. An earlier version of this comment claimed a plain
 * unique index "would collapse every existing NULL row into one conflict on the first boot"
 * — that is wrong about Postgres and worth correcting rather than quietly deleting. Postgres
 * treats NULLs as DISTINCT in a unique index, and a multicolumn unique index only rejects a
 * row when ALL key columns are equal, so `(tenant_id, NULL)` never conflicts with
 * `(tenant_id, NULL)`. A non-partial index would have built fine over an all-NULL column and
 * accepted unlimited NULL rows. (`NULLS NOT DISTINCT` is a PG15+ opt-in and is not used here.)
 *
 * The partial predicate is kept for three real reasons:
 *   1. Size — every existing production row has a NULL slug, and there is no value in
 *      indexing them.
 *   2. Intent — it says outright that uniqueness applies to slugged campaigns only, rather
 *      than leaving a reader to infer it from NULL semantics.
 *   3. Independence — it does not rely on NULL-distinctness holding, which is exactly the
 *      behaviour `NULLS NOT DISTINCT` exists to change.
 */

export const MARKETING_CAMPAIGN_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS funnel_stage VARCHAR(30)`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_admin_id UUID`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approver_admin_id UUID`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS planned_start_at TIMESTAMPTZ`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS planned_end_at TIMESTAMPTZ`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_campaign_slug VARCHAR(200)`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS goals_json JSONB`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS parent_campaign_id UUID`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS archived_reason TEXT`,

  // Partial + per-tenant. See the header for why both qualifiers are load-bearing.
  `CREATE UNIQUE INDEX IF NOT EXISTS campaigns_tenant_utm_slug_unique
     ON campaigns (tenant_id, utm_campaign_slug)
     WHERE utm_campaign_slug IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_funnel_stage ON campaigns (funnel_stage)`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_parent ON campaigns (parent_campaign_id)`,
  // Pacing reads "campaigns planned to be running now", so both bounds are queried together.
  `CREATE INDEX IF NOT EXISTS idx_campaigns_planned_window ON campaigns (planned_start_at, planned_end_at)`,
  // The active list excludes archived rows; partial keeps it small as archives accumulate.
  `CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns (status) WHERE archived_at IS NULL`,
];

/** Columns whose absence would break campaign planning or the taxonomy contract. */
const REQUIRED_COLUMNS: string[] = [
  'funnel_stage',
  'owner_admin_id',
  'approver_admin_id',
  'planned_start_at',
  'planned_end_at',
  'utm_campaign_slug',
  'goals_json',
  'parent_campaign_id',
  'archived_at',
  'archived_reason',
];

/**
 * Indexes whose absence is a correctness problem, not a performance one.
 *
 * Verified separately from columns because they fail differently. A missing column throws
 * on the next query and is loud. A missing UNIQUE index is **silent**: every write still
 * succeeds, and the only symptom is that two campaigns in one tenant can share a
 * `utm_campaign_slug` — at which point their clicks, sessions and leads merge into one
 * indistinguishable bucket and the attribution cannot be untangled after the fact.
 *
 * The DDL loop only warns, so without this check `ok: true` would be returned while
 * uniqueness was unenforced — the exact silent failure this module claims to guard against.
 */
const REQUIRED_INDEXES: string[] = ['campaigns_tenant_utm_slug_unique'];

export interface MarketingCampaignSchemaResult {
  ok: boolean;
  missing: string[];
  missingIndexes: string[];
}

export async function ensureMarketingCampaignSchema(): Promise<MarketingCampaignSchemaResult> {
  for (const sql of MARKETING_CAMPAIGN_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] marketing campaign schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }

  // Post-condition. The loop only warns, so a failed ALTER leaves the column absent while
  // boot looks clean — and the model WOULD still declare it, so Sequelize would emit it in
  // every SELECT and every campaign read would then fail at the database. Verify instead.
  let missing: string[] = [];
  let missingIndexes: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'campaigns'`,
    );
    const present = new Set((rows || []).map((r: any) => r.column_name));
    missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
    if (missing.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'SchemaInvariantViolation',
        outcome: 'failure',
        error_class: 'SchemaInvariantViolation',
        context: { table: 'campaigns', missing_columns: missing },
      }));
    }

    const [idxRows]: any = await sequelize.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'campaigns'`,
    );
    const presentIdx = new Set((idxRows || []).map((r: any) => r.indexname));
    missingIndexes = REQUIRED_INDEXES.filter((i) => !presentIdx.has(i));
    if (missingIndexes.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'SchemaInvariantViolation',
        outcome: 'failure',
        error_class: 'SchemaInvariantViolation',
        context: {
          table: 'campaigns',
          missing_indexes: missingIndexes,
          impact: 'utm_campaign_slug uniqueness is NOT enforced; two campaigns in one tenant can share a slug and their attribution will merge',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] marketing campaign schema verification failed:', err?.message);
  }

  console.log('[DB] Marketing campaign schema ensured');
  return { ok: missing.length === 0 && missingIndexes.length === 0, missing, missingIndexes };
}
