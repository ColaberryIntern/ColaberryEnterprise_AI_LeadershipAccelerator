import { sequelize } from '../config/database';

/**
 * Marketing Operations — Content OS.
 *
 * Seven new tables: content_items, content_variants, media_assets, content_item_media,
 * content_templates, content_approval_requests, content_approval_events.
 *
 * Idempotent additive raw SQL, matching the sibling ensure*Schema modules.
 * ADDITIVE ONLY: creates tables, never alters an existing one.
 *
 * ── Why a content-specific approval entity, rather than reusing `approval_requests` ────
 *
 * `models/ApprovalRequest.ts:8-13` states it outright: "SHADOW MODE ONLY: this milestone's
 * code never sets `status` to anything but `shadow_logged` ... nothing reads `status` to
 * gate a real action." Its table also FKs to `tickets`, `agent_runs` and
 * `work_ledger_events` — a different domain entirely. It is a logging surface, not a gate.
 *
 * Reusing it would mean either promoting it out of shadow mode (a behaviour change to an
 * existing subsystem, well outside this task) or building a gate on top of something whose
 * own header says nothing gates on it. Content approval gets its own pair instead, and the
 * shadow-mode table is left untouched.
 *
 * ── Foreign keys: parent edges constrained, cross-domain refs bare ────────────────────
 *
 * The convention was established the hard way in T001. `PageEvent.ts:65,70` declares real
 * `references` to its parents while `PageEvent.ts:72` explicitly declines one for the
 * cross-domain `lead_id`; `seedQrTracking.ts:32` constrains `qr_scan_events.qr_code_id`.
 * The rule applies per EDGE, not per table. Constrained: content_variants -> content_items,
 * approval_events -> approval_requests, approval_requests -> content_items, and BOTH edges of
 * content_item_media (a join table has two immediate parents, and both live in this module —
 * a row pointing at a deleted asset is meaningless rather than merely degraded).
 *
 * Left bare because they are genuinely cross-domain: `campaign_id`, `tenant_id`, `brand_id`,
 * `template_id`, `channel_account_id`, `tracked_link_id`, every `*_by` / `*_admin_id`, and
 * `content_approval_events.content_item_id` (denormalized for item-scoped audit reads).
 * That matches how ensureMultiTenantSchema leaves the tenancy columns it adds elsewhere.
 *
 * ── Tenancy by parent ────────────────────────────────────────────────────────────────
 *
 * Directly enumerable tables (content_items, media_assets, content_templates) carry
 * tenant_id/brand_id. content_variants and both approval tables are strict children and
 * scope by joining their parent — the rule stated in ensureRefactoredDeliverySchema.ts:13-22.
 *
 * ── Media storage is LOCAL DISK, not object storage ───────────────────────────────────
 *
 * Discovery confirmed there is no S3/GCS/Cloudinary client anywhere in backend/src, and
 * `sharp` is a dependency that is never imported. `media_assets.storage_key` therefore
 * refers to a path under the existing multer upload volume, matching `config/upload.ts`.
 * Recorded here so nobody reads `storage_key` and assumes a bucket exists.
 */

export const CONTENT_OS_SCHEMA_STATEMENTS: readonly string[] = [
  // ── content_items ──────────────────────────────────────────────────────────────────
  // The canonical package. One idea, many platform variants.
  `CREATE TABLE IF NOT EXISTS content_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     campaign_id UUID,
     title VARCHAR(300) NOT NULL,
     canonical_body TEXT,
     content_type VARCHAR(30) NOT NULL DEFAULT 'social_post',
     status VARCHAR(30) NOT NULL DEFAULT 'idea',
     owner_admin_id UUID,
     created_by UUID,
     template_id UUID,
     scheduled_for TIMESTAMPTZ,
     published_at TIMESTAMPTZ,
     -- Bumped on every edit to an approval-relevant field. contentWorkflowService (T021, NOT
     -- YET BUILT) will compare this against the value captured at approval to decide whether
     -- an approval is stale. Until then nothing reads it, and nothing should claim it does.
     -- An integer rather than a hash so the comparison is trivially auditable in a log.
     revision INTEGER NOT NULL DEFAULT 1,
     -- Provenance for AI-assisted drafts (spec 8.4). Null for human-authored content.
     ai_model VARCHAR(120),
     ai_prompt_version VARCHAR(60),
     ai_template_version VARCHAR(60),
     human_approved BOOLEAN NOT NULL DEFAULT FALSE,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_content_items_scope ON content_items (tenant_id, brand_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_content_items_campaign ON content_items (campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_items_scheduled ON content_items (scheduled_for) WHERE scheduled_for IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_content_items_active ON content_items (tenant_id, status) WHERE archived_at IS NULL`,

  // ── content_variants ───────────────────────────────────────────────────────────────
  // Platform-specific rendering of one content_item.
  `CREATE TABLE IF NOT EXISTS content_variants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     content_item_id UUID NOT NULL REFERENCES content_items(id),
     provider VARCHAR(40) NOT NULL,
     channel_account_id UUID,
     body TEXT,
     hashtags TEXT,
     cta_text VARCHAR(200),
     link_url TEXT,
     tracked_link_id UUID,
     media_crop VARCHAR(30),
     targeting_notes TEXT,
     disclosure_text VARCHAR(300),
     -- The spec is explicit that generating variants must never silently overwrite the
     -- operator's copy. Regeneration skips any variant with this set.
     is_manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
     edited_by UUID,
     edited_at TIMESTAMPTZ,
     validation_state VARCHAR(30) NOT NULL DEFAULT 'unvalidated',
     validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_content_variants_item ON content_variants (content_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_variants_provider ON content_variants (provider)`,
  // One variant per (item, provider, account). A second variant for the same account is a
  // duplicate post waiting to happen, not a feature.
  // ESCAPE HATCH, stated so it is a choice rather than a surprise: because NULLs are
  // distinct in a unique index and this one is partial, two variants for the same
  // (item, provider) ARE permitted while channel_account_id is unset. That is the normal
  // draft state - an operator writes a LinkedIn variant before choosing which LinkedIn
  // account it posts to - so constraining it would block ordinary drafting. Uniqueness
  // begins the moment an account is bound, which is the moment a duplicate could actually
  // reach an audience.
  `CREATE UNIQUE INDEX IF NOT EXISTS content_variants_item_provider_account_unique
     ON content_variants (content_item_id, provider, channel_account_id)
     WHERE channel_account_id IS NOT NULL`,

  // ── media_assets ───────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS media_assets (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     storage_key TEXT NOT NULL,
     original_filename VARCHAR(400),
     mime_type VARCHAR(120) NOT NULL,
     byte_size BIGINT,
     checksum_sha256 CHAR(64),
     width INTEGER,
     height INTEGER,
     duration_ms INTEGER,
     -- Accessibility is a stated requirement (spec 8.4), so alt text is a first-class
     -- column rather than a metadata key that can be quietly omitted.
     alt_text VARCHAR(1000),
     -- Rights tracking: publishing an asset past its licence is a legal exposure, not a
     -- content bug, so the expiry is queryable rather than buried in JSONB.
     rights_holder VARCHAR(300),
     rights_expires_at TIMESTAMPTZ,
     derived_from_id UUID REFERENCES media_assets(id),
     uploaded_by UUID,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_media_assets_scope ON media_assets (tenant_id, brand_id)`,
  // Dedup within a brand, not globally: two brands may legitimately hold the same file, and
  // deduping across them would let one brand's asset library leak into another's.
  // ESCAPE HATCH: a tenant-level asset with no brand (brand_id NULL) can be ingested
  // repeatedly without tripping this index. Accepted deliberately - the alternative is
  // deduping brand-agnostic assets across every brand in a tenant, which is the leak this
  // index exists to prevent. Duplicate tenant-level assets are a tidiness problem; a
  // cross-brand collision is a confidentiality one.
  `CREATE UNIQUE INDEX IF NOT EXISTS media_assets_brand_checksum_unique
     ON media_assets (brand_id, checksum_sha256)
     WHERE checksum_sha256 IS NOT NULL AND brand_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_media_assets_rights_expiry ON media_assets (rights_expires_at) WHERE rights_expires_at IS NOT NULL`,

  // ── content_item_media (join) ──────────────────────────────────────────────────────
  // BOTH sides are constrained. A join table has two immediate parents, not one, and both
  // live in this module — a row pointing at a deleted asset is not a degraded record, it is
  // a meaningless one. The parent-constrained / cross-domain-bare rule applies per EDGE, and
  // neither of these edges is cross-domain.
  `CREATE TABLE IF NOT EXISTS content_item_media (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     content_item_id UUID NOT NULL REFERENCES content_items(id),
     media_asset_id UUID NOT NULL REFERENCES media_assets(id),
     position INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS content_item_media_unique
     ON content_item_media (content_item_id, media_asset_id)`,

  // ── content_templates ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS content_templates (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     name VARCHAR(200) NOT NULL,
     provider VARCHAR(40),
     body_template TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     is_active BOOLEAN NOT NULL DEFAULT TRUE,
     created_by UUID,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_content_templates_scope ON content_templates (tenant_id, brand_id, is_active)`,
  // Versioned rather than edited in place: a template edit must not retroactively change
  // what already-published content was generated from.
  `CREATE UNIQUE INDEX IF NOT EXISTS content_templates_name_version_unique
     ON content_templates (tenant_id, brand_id, name, version)`,

  // ── content_approval_requests ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS content_approval_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     content_item_id UUID NOT NULL REFERENCES content_items(id),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     status VARCHAR(30) NOT NULL DEFAULT 'pending',
     requested_by UUID,
     requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     required_approver_id UUID,
     decided_by UUID,
     decided_at TIMESTAMPTZ,
     decision_note TEXT,
     -- The revision the content was at when approval was REQUESTED, and when it was
     -- DECIDED. An approval whose decided revision no longer matches the item's current
     -- revision is stale and must not authorise a publish (spec 8.3).
     revision_at_request INTEGER NOT NULL DEFAULT 1,
     revision_at_decision INTEGER,
     invalidated_at TIMESTAMPTZ,
     invalidated_reason VARCHAR(200),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_content_approval_item ON content_approval_requests (content_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_content_approval_pending ON content_approval_requests (tenant_id, status) WHERE status = 'pending'`,
  // At most one live request per item. Two open requests means two people can approve
  // different revisions of the same post.
  `CREATE UNIQUE INDEX IF NOT EXISTS content_approval_one_open_per_item
     ON content_approval_requests (content_item_id)
     WHERE status = 'pending'`,

  // ── content_approval_events (append-only) ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS content_approval_events (
     id BIGSERIAL PRIMARY KEY,
     approval_request_id UUID NOT NULL REFERENCES content_approval_requests(id),
     content_item_id UUID NOT NULL,
     event_type VARCHAR(40) NOT NULL,
     actor_admin_id UUID,
     actor_email VARCHAR(255),
     note TEXT,
     payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_content_approval_events_request ON content_approval_events (approval_request_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_content_approval_events_item ON content_approval_events (content_item_id, occurred_at)`,
];

/** Columns whose absence would break the content workflow outright. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  content_items: ['id', 'tenant_id', 'title', 'status', 'revision', 'human_approved'],
  content_variants: ['id', 'content_item_id', 'provider', 'is_manually_edited', 'validation_state'],
  media_assets: ['id', 'tenant_id', 'storage_key', 'mime_type', 'alt_text', 'rights_expires_at'],
  content_item_media: ['id', 'content_item_id', 'media_asset_id'],
  content_templates: ['id', 'tenant_id', 'body_template', 'version'],
  content_approval_requests: ['id', 'content_item_id', 'status', 'revision_at_request', 'revision_at_decision'],
  content_approval_events: ['id', 'approval_request_id', 'event_type', 'occurred_at'],
};

/**
 * Indexes whose absence is a correctness problem rather than a performance one.
 *
 * Same reasoning as ensureMarketingCampaignSchema: a missing column is loud, a missing
 * UNIQUE index is silent. Each of these prevents a specific duplicate:
 *   - two open approval requests on one item (two people approving different revisions)
 *   - two variants for the same account (a duplicate post)
 *   - the same asset ingested twice into one brand's library
 */
const REQUIRED_INDEXES: string[] = [
  'content_approval_one_open_per_item',
  'content_variants_item_provider_account_unique',
  'media_assets_brand_checksum_unique',
  'content_templates_name_version_unique',
  // Was asserted by the parity test but missing from this runtime list, so its absence in a
  // real database would have gone undetected at boot - the parity test only reads the DDL
  // text, it cannot know whether the statement actually executed.
  'content_item_media_unique',
];

export interface ContentOsSchemaResult {
  ok: boolean;
  missing: Array<{ table: string; columns: string[] }>;
  missingIndexes: string[];
}

export async function ensureContentOsSchema(): Promise<ContentOsSchemaResult> {
  for (const sql of CONTENT_OS_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] content OS schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }

  const missing: Array<{ table: string; columns: string[] }> = [];
  let missingIndexes: string[] = [];
  try {
    for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
      const [rows]: any = await sequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = :table`,
        { replacements: { table } },
      );
      const present = new Set((rows || []).map((r: any) => r.column_name));
      const absent = required.filter((c) => !present.has(c));
      if (absent.length > 0) {
        missing.push({ table, columns: absent });
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'backend',
          event: 'SchemaInvariantViolation',
          outcome: 'failure',
          error_class: 'SchemaInvariantViolation',
          context: { table, missing_columns: absent },
        }));
      }
    }

    const [idxRows]: any = await sequelize.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('content_items','content_variants','media_assets',
                           'content_templates','content_approval_requests','content_item_media',
                           'content_approval_events')`,
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
          missing_indexes: missingIndexes,
          impact: 'duplicate-prevention is NOT enforced; an item can carry two open approvals, an account can receive two variants, or an asset can be ingested twice',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] content OS schema verification failed:', err?.message);
  }

  console.log('[DB] Content OS schema ensured');
  return { ok: missing.length === 0 && missingIndexes.length === 0, missing, missingIndexes };
}
