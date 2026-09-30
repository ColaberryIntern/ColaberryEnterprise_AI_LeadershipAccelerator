import { sequelize } from '../config/database';

/**
 * Marketing Operations — the attribution fields that were being validated and thrown away.
 *
 * Additive columns on the EXISTING `visitor_sessions` table. Idempotent raw SQL.
 * ADDITIVE ONLY: `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` exclusively.
 * `visitor_sessions` is a live, high-write table; nothing here is NOT NULL, and nothing is
 * backfilled.
 *
 * ── What was actually wrong ───────────────────────────────────────────────────────────
 *
 * `utm_term` and `utm_content` were not simply missing. They were ACCEPTED and DISCARDED:
 * `schemas/v1LeadSchema.ts` validates both, and `externalLeadIngestService` then packs them
 * into the `strapi_attribution` JSONB blob, where nothing can query them. So the system asked
 * for the data, confirmed it was well-formed, and put it somewhere it could never be read
 * from — which looks exactly like working attribution right up until somebody asks which
 * creative produced a lead.
 *
 * Platform click IDs were worse: `fbclid`, `gclid`, `msclkid` and `ttclid` appeared NOWHERE in
 * the codebase. Every paid click has arrived carrying one, and every one has been dropped on
 * the floor. Without them the ad platform's click and our conversion cannot be reconciled at
 * all, which is the single thing paid reporting depends on.
 *
 * ── Why these are columns and not more JSONB ──────────────────────────────────────────
 *
 * `strapi_attribution` is the cautionary example. The four adopted click IDs get real indexed
 * columns because reporting joins on them; anything not yet adopted goes to `click_ids` JSONB,
 * which is an overflow for platforms we have not committed to, not a general dumping ground.
 */

export const MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS: readonly string[] = [
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS utm_term VARCHAR(200)`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS utm_content VARCHAR(200)`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255)`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS gclid VARCHAR(255)`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS msclkid VARCHAR(255)`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS ttclid VARCHAR(255)`,
  `ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS click_ids JSONB`,

  // Partial indexes: the overwhelming majority of sessions are organic and carry no click ID,
  // and there is no value in indexing those rows. "Find the session for this platform click"
  // is the reconciliation query paid reporting is built on, so it needs to be fast on the
  // small subset that has one.
  `CREATE INDEX IF NOT EXISTS idx_visitor_sessions_fbclid ON visitor_sessions (fbclid) WHERE fbclid IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_visitor_sessions_gclid ON visitor_sessions (gclid) WHERE gclid IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_visitor_sessions_msclkid ON visitor_sessions (msclkid) WHERE msclkid IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_visitor_sessions_ttclid ON visitor_sessions (ttclid) WHERE ttclid IS NOT NULL`,
  // Creative-level reporting groups by (campaign, content). Partial for the same reason.
  `CREATE INDEX IF NOT EXISTS idx_visitor_sessions_utm_content
     ON visitor_sessions (utm_campaign, utm_content)
     WHERE utm_content IS NOT NULL`,
];

const REQUIRED_COLUMNS: string[] = [
  'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid', 'ttclid', 'click_ids',
];

export interface MarketingAttributionSchemaResult {
  ok: boolean;
  missing: string[];
}

export async function ensureMarketingAttributionSchema(): Promise<MarketingAttributionSchemaResult> {
  for (const sql of MARKETING_ATTRIBUTION_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] marketing attribution schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }

  // Post-condition. The loop only warns, so a failed ALTER leaves the column absent while boot
  // looks clean — and the model WOULD still declare it, so Sequelize emits it in every SELECT
  // and every visitor-session read in the product then fails at the database. The blast radius
  // is the existing tracker, not the new feature.
  let missing: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'visitor_sessions'`,
    );
    const present = new Set((rows || []).map((r: any) => r.column_name));
    missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
    if (missing.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: {
          table: 'visitor_sessions',
          missing_columns: missing,
          impact: 'paid-click reconciliation is unavailable; every visitor-session read may fail if the model declares a column the table lacks',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] marketing attribution schema verification failed:', err?.message);
  }

  console.log('[DB] Marketing attribution schema ensured');
  return { ok: missing.length === 0, missing };
}
