import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * marketing_spend_facts - what was actually spent on ads, per campaign, per day (or per range).
 *
 * WHY. Ali, 2026-11-02: "setup a system that allows the marketing team to record their ad spend
 * or we pull that information in from facebook ... Then we can really start to see if these ads
 * are profitable." The metric registry has named this table since `marketing.ad_spend` was
 * registered (`SUM(spend) FROM marketing_spend_facts`); nothing created it until now.
 *
 * THREE WRITERS, ONE TABLE. `source` says who wrote a row: a person typing it (`manual`), an Ads
 * Manager export (`csv`), or the Marketing API (`meta_api`). They can overlap - someone types last
 * week's total, then the sync pulls the same days - so the report picks ONE source per campaign per
 * day (spendAllocation.ts) instead of adding them. Keeping every row, rather than overwriting the
 * typed one, means the typed figure is still there to compare when the two disagree.
 *
 * IDEMPOTENT BY CONSTRUCTION. The unique key is the whole identity of a fact, so re-running an
 * import or a sync for the same days updates the same rows instead of adding a second copy.
 * `placement` is '' rather than NULL for "not broken down": NULLs are never equal in a unique
 * index, which would let the same manual row be inserted twice.
 *
 * MONEY IN CENTS, USD ONLY. Mixed currencies summed as one number is a wrong number, so the column
 * refuses anything else; the Meta sync checks the ad account's currency before writing.
 *
 * Additive only, with a post-condition like every ensure* here: the boot DDL loop warns and
 * continues on failure, so this proves the objects exist or stops the boot naming what is missing.
 */

export const MARKETING_SPEND_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS marketing_spend_facts (
     id            BIGSERIAL PRIMARY KEY,
     platform      VARCHAR(20)  NOT NULL,
     account_id    VARCHAR(40),
     campaign_ref  VARCHAR(120) NOT NULL,
     campaign_name VARCHAR(255),
     placement     VARCHAR(30)  NOT NULL DEFAULT '',
     period_start  DATE         NOT NULL,
     period_end    DATE         NOT NULL,
     amount_cents  BIGINT       NOT NULL,
     currency      CHAR(3)      NOT NULL DEFAULT 'USD',
     impressions   BIGINT,
     clicks        BIGINT,
     source        VARCHAR(10)  NOT NULL,
     entered_by    VARCHAR(255),
     note          TEXT,
     created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
     updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
     CONSTRAINT marketing_spend_platform_known CHECK (platform IN ('meta', 'google', 'linkedin', 'tiktok', 'other')),
     CONSTRAINT marketing_spend_source_known   CHECK (source IN ('manual', 'csv', 'meta_api')),
     CONSTRAINT marketing_spend_usd_only       CHECK (currency = 'USD'),
     CONSTRAINT marketing_spend_amount_nonneg  CHECK (amount_cents >= 0),
     CONSTRAINT marketing_spend_period_order   CHECK (period_end >= period_start),
     CONSTRAINT marketing_spend_period_bounded CHECK (period_end - period_start <= 366)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS marketing_spend_facts_identity
     ON marketing_spend_facts (platform, campaign_ref, placement, period_start, period_end, source)`,
  `CREATE INDEX IF NOT EXISTS marketing_spend_facts_period
     ON marketing_spend_facts (period_end, period_start)`,

  // One row per sync attempt, so "when did Facebook last answer" is a fact, not a guess.
  `CREATE TABLE IF NOT EXISTS marketing_spend_syncs (
     id           BIGSERIAL PRIMARY KEY,
     platform     VARCHAR(20) NOT NULL,
     started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     finished_at  TIMESTAMPTZ,
     range_start  DATE,
     range_end    DATE,
     outcome      VARCHAR(10) NOT NULL DEFAULT 'running',
     rows_written INTEGER     NOT NULL DEFAULT 0,
     error_class  VARCHAR(40),
     error        TEXT,
     triggered_by VARCHAR(255),
     CONSTRAINT marketing_spend_sync_outcome CHECK (outcome IN ('running', 'success', 'failure', 'skipped'))
   )`,
  `CREATE INDEX IF NOT EXISTS marketing_spend_syncs_recent ON marketing_spend_syncs (platform, started_at DESC)`,
];

const REQUIRED_TABLES: readonly string[] = ['marketing_spend_facts', 'marketing_spend_syncs'];

export async function ensureMarketingSpendSchema(): Promise<void> {
  for (const statement of MARKETING_SPEND_SCHEMA_STATEMENTS) {
    await sequelize.query(statement);
  }
  // to_regclass, NOT `SELECT table_name FROM information_schema.tables`: Sequelize recognises that
  // exact text as a "show tables" query and returns bare value arrays instead of rows, so a check
  // written that way reports existing tables as missing. Found by running this against Postgres 16.
  const rows = await sequelize.query<{ name: string; present: boolean }>(
    `SELECT t.name, to_regclass(t.name) IS NOT NULL AS present
       FROM unnest(ARRAY['marketing_spend_facts', 'marketing_spend_syncs']) AS t(name)`,
    { type: QueryTypes.SELECT },
  );
  const present = new Set(rows.filter((r) => r.present).map((r) => r.name));
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
  if (missing.length) {
    throw new Error(`ensureMarketingSpendSchema did not apply: missing tables [${missing.join(', ')}]`);
  }
}
