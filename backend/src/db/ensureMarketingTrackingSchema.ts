import { sequelize } from '../config/database';

/**
 * Marketing Operations — tracked links and click capture.
 *
 * Ensured via idempotent raw SQL rather than `sequelize.sync({ alter: true })`, matching
 * the other ensure*Schema modules (the alter pass hits pre-existing index conflicts on
 * the 200+ model graph — see ensureMultiTenantSchema.ts's header for the full history).
 * Every statement is CREATE ... IF NOT EXISTS and wrapped in its own try/catch, so a
 * partial database self-heals and re-running boot is a no-op.
 *
 * ADDITIVE ONLY: creates 2 new tables. It never alters, drops or retypes anything that
 * already exists.
 *
 * ── Why these two tables exist ───────────────────────────────────────────────────────
 *
 * Before this, the entire platform could persist exactly one tracked link per campaign —
 * `campaigns.tracking_link`, a single VARCHAR(500) written by campaignLinkService — and
 * it recorded NO clicks at all. The only click rows anywhere were `qr_scan_events`, which
 * has no campaign association. So "which ad, post, creative or CTA actually produced
 * traction" was unanswerable by construction, not by accident.
 *
 * ── Design decisions worth not re-litigating ─────────────────────────────────────────
 *
 * 1. `tracked_links.tenant_id` is NOT NULL but `brand_id` is NULLABLE. This mirrors
 *    delivery_engagements / delivery_projects. Tenant is always resolvable; brand is not
 *    — campaignBrandAssignment.ts deliberately REFUSES to guess a brand and leaves it
 *    null so it reads as "Unattributed". Forcing NOT NULL here would push callers into
 *    inventing a brand, which is the exact failure that service exists to prevent.
 *
 * 2. `link_clicks.tracked_link_id` DOES carry a foreign key to its immediate parent, while
 *    tenant_id/brand_id/campaign_id are bare denormalized UUIDs with none.
 *
 *    An earlier draft of this file gave those columns no FK at all and justified it as
 *    "the same choice page_events and visitor_sessions make". That justification was
 *    wrong, and checking it is what corrected the design: `PageEvent.ts:65,70` declares
 *    real `references` to visitor_sessions and visitors, and `seedQrTracking.ts:32` gives
 *    `qr_scan_events.qr_code_id` a `REFERENCES qr_codes(id)`. qr_scan_events is the exact
 *    analogue of this table — a click log pointing at the link table a redirect resolved —
 *    and it has the FK.
 *
 *    So the repo's real convention is narrower than "high-write tables skip FKs": the edge
 *    to the IMMEDIATE PARENT is constrained, and only CROSS-DOMAIN references are left
 *    bare. `PageEvent.ts:72` states that per-column ("No `references` here on purpose" for
 *    `lead_id`), and ensureMultiTenantSchema.ts:316-319 does the same for the tenancy
 *    columns it adds to page_events. This table now follows that convention rather than a
 *    generalization of it.
 *
 *    No ON DELETE CASCADE: deleting a tracked link should be REFUSED while clicks exist,
 *    because those clicks are attribution history. Retirement is `superseded_by`, not
 *    deletion.
 *
 * 3. `link_clicks.id` is BIGSERIAL, not UUID — matching qr_scan_events, the other
 *    high-volume click table. Monotonic ids keep the (tracked_link_id, occurred_at)
 *    index dense.
 *
 * 4. Only `ip_hash` is stored, never a raw IP. Same SHA-256 treatment qrRedirectRoutes
 *    already applies, so no address that identifies a person is persisted.
 *
 *    TWO HONEST CAVEATS, stated here because an earlier version of this comment cited a
 *    "marketing data-retention note" that does not exist anywhere in the repo:
 *
 *    - There is NO retention policy for this table yet. Rows are kept indefinitely. Writing
 *      one is a real task, not a citation.
 *    - `referrer` is stored WHOLE, query string included, matching what qrRedirectRoutes
 *      already does. A referrer can carry personal data in its query (an email address in a
 *      webmail URL, a session token), so "no PII" is true of the IP and NOT true of the
 *      referrer. Truncating to origin would fix it and would also destroy the attribution
 *      detail the column exists for, so it is a deliberate trade to decide, not an oversight
 *      to paper over.
 *
 * 5. Click IDs get BOTH normalized columns and a JSONB overflow. The four named columns
 *    (fbclid, gclid, msclkid, ttclid) are the platforms we actually adopt, and they are
 *    indexed; `click_ids` catches future platforms without a migration. Burying them all
 *    in JSONB is what was already done to utm_term/utm_content in `strapi_attribution`,
 *    and it is precisely why those are unqueryable today.
 *
 * 6. Attribution semantics are immutable after publication. A published link is never
 *    edited — `superseded_by` points at its replacement. Editing a live link's UTMs would
 *    silently rewrite the meaning of clicks already recorded against it.
 */

export const MARKETING_TRACKING_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS tracked_links (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     campaign_id UUID,
     placement_id UUID,
     variant_code VARCHAR(64),
     short_code VARCHAR(32) NOT NULL,
     destination_url TEXT NOT NULL,
     utm_source VARCHAR(100),
     utm_medium VARCHAR(100),
     utm_campaign VARCHAR(200),
     utm_content VARCHAR(200),
     utm_term VARCHAR(200),
     status VARCHAR(20) NOT NULL DEFAULT 'draft',
     consent_classification VARCHAR(30),
     created_by UUID,
     published_at TIMESTAMPTZ,
     superseded_by UUID,
     first_click_at TIMESTAMPTZ,
     last_click_at TIMESTAMPTZ,
     click_count INTEGER NOT NULL DEFAULT 0,
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tracked_links_short_code_unique ON tracked_links (short_code)`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_links_scope ON tracked_links (tenant_id, brand_id, campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_links_campaign ON tracked_links (campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_links_status ON tracked_links (status)`,
  // Collision guard for the canonical creative code within one campaign. Partial, because
  // variant_code is optional and several links may legitimately have none.
  `CREATE UNIQUE INDEX IF NOT EXISTS tracked_links_campaign_variant_unique
     ON tracked_links (campaign_id, variant_code)
     WHERE variant_code IS NOT NULL AND campaign_id IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS link_clicks (
     id BIGSERIAL PRIMARY KEY,
     tracked_link_id UUID NOT NULL REFERENCES tracked_links(id),
     tenant_id UUID,
     brand_id UUID,
     campaign_id UUID,
     occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ip_hash CHAR(64),
     user_agent TEXT,
     referrer TEXT,
     visitor_fingerprint VARCHAR(64),
     session_id UUID,
     is_bot BOOLEAN NOT NULL DEFAULT FALSE,
     bot_reason VARCHAR(64),
     fbclid VARCHAR(255),
     gclid VARCHAR(255),
     msclkid VARCHAR(255),
     ttclid VARCHAR(255),
     click_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_link_time ON link_clicks (tracked_link_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_occurred_at ON link_clicks (occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_scope_time ON link_clicks (tenant_id, brand_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_campaign ON link_clicks (campaign_id)`,
  // Human clicks are what every report reads; bot rows are kept for auditability but are
  // filtered out of nearly every query, so the common path gets its own partial index.
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_human ON link_clicks (tracked_link_id, occurred_at) WHERE is_bot = FALSE`,
];

/** Columns whose absence would break the redirect or the attribution join outright. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  tracked_links: ['id', 'tenant_id', 'short_code', 'destination_url', 'status', 'superseded_by'],
  link_clicks: ['id', 'tracked_link_id', 'occurred_at', 'is_bot', 'fbclid', 'gclid', 'click_ids'],
};

/**
 * Returns `{ ok, missing }` rather than `void` so the post-condition is assertable.
 *
 * `ensureEmailSendLedgerSchema` established this: a check that only logs cannot be
 * unit-tested, so nothing proves it would actually fire on a failed create. Returning the
 * result lets a DB-less test drive it.
 */
export interface MarketingTrackingSchemaResult {
  ok: boolean;
  missing: Array<{ table: string; columns: string[] }>;
}

export async function ensureMarketingTrackingSchema(): Promise<MarketingTrackingSchemaResult> {
  for (const sql of MARKETING_TRACKING_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] marketing tracking schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }

  // Post-condition. The loop above only warns, so "it did not throw" is NOT evidence the
  // tables landed — and a silently-missing tracked_links would make every /r/:shortCode
  // request 404 while the deploy looked clean. Verify against the catalog instead.
  const missing: Array<{ table: string; columns: string[] }> = [];
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
  } catch (err: any) {
    console.warn('[DB] marketing tracking schema verification failed:', err?.message);
  }

  console.log('[DB] Marketing tracking schema ensured');
  return { ok: missing.length === 0, missing };
}
