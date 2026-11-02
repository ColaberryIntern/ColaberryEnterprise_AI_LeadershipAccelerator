import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { SpendSource, SpendFact } from './spendAllocation';
import type { SpendInput } from './spendInput';

/**
 * Reads and writes of marketing_spend_facts. Every write is an upsert on the table's identity
 * (platform, campaign_ref, placement, period, source), inside one transaction, so:
 *   - importing the same export twice, or syncing the same days twice, changes nothing the second time;
 *   - a failed import writes nothing, never half a file.
 */

export interface SpendRecord {
  id: number;
  platform: string;
  accountId: string | null;
  campaignRef: string;
  campaignName: string | null;
  placement: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  impressions: number | null;
  clicks: number | null;
  source: SpendSource;
  enteredBy: string | null;
  note: string | null;
  updatedAt: string;
}

const UPSERT = `
  INSERT INTO marketing_spend_facts
    (platform, account_id, campaign_ref, campaign_name, placement, period_start, period_end,
     amount_cents, impressions, clicks, source, entered_by, note)
  VALUES
    (:platform, :accountId, :campaignRef, :campaignName, :placement, :periodStart, :periodEnd,
     :amountCents, :impressions, :clicks, :source, :enteredBy, :note)
  ON CONFLICT (platform, campaign_ref, placement, period_start, period_end, source) DO UPDATE SET
    account_id    = EXCLUDED.account_id,
    campaign_name = COALESCE(EXCLUDED.campaign_name, marketing_spend_facts.campaign_name),
    amount_cents  = EXCLUDED.amount_cents,
    impressions   = EXCLUDED.impressions,
    clicks        = EXCLUDED.clicks,
    entered_by    = EXCLUDED.entered_by,
    note          = COALESCE(EXCLUDED.note, marketing_spend_facts.note),
    updated_at    = now()`;

/** Write rows from one source. Returns how many rows were written (inserted or updated). */
export async function upsertSpend(rows: SpendInput[], source: SpendSource, enteredBy: string | null): Promise<number> {
  if (rows.length === 0) return 0;
  return sequelize.transaction(async (transaction) => {
    for (const r of rows) {
      await sequelize.query(UPSERT, {
        transaction,
        replacements: {
          platform: r.platform,
          accountId: r.accountId ?? null,
          campaignRef: r.campaignRef,
          campaignName: r.campaignName ?? null,
          placement: r.placement ?? '',
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          amountCents: r.amountCents,
          impressions: r.impressions ?? null,
          clicks: r.clicks ?? null,
          source,
          enteredBy,
          note: r.note ?? null,
        },
      });
    }
    return rows.length;
  });
}

interface DbRow {
  id: string; platform: string; account_id: string | null; campaign_ref: string; campaign_name: string | null;
  placement: string; period_start: string; period_end: string; amount_cents: string; impressions: string | null;
  clicks: string | null; source: SpendSource; entered_by: string | null; note: string | null; updated_at: string;
}

const day = (v: string) => String(v).slice(0, 10);
const numOrNull = (v: string | null) => (v == null ? null : Number(v));

function toRecord(r: DbRow): SpendRecord {
  return {
    id: Number(r.id), platform: r.platform, accountId: r.account_id, campaignRef: r.campaign_ref,
    campaignName: r.campaign_name, placement: r.placement, periodStart: day(r.period_start), periodEnd: day(r.period_end),
    amountCents: Number(r.amount_cents), impressions: numOrNull(r.impressions), clicks: numOrNull(r.clicks),
    source: r.source, enteredBy: r.entered_by, note: r.note, updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/**
 * Every fact overlapping [from, to] (inclusive dates), newest first. `limit: null` reads them all,
 * which the report needs: a cap would drop the oldest days and understate spend silently.
 */
export async function listSpend(from: string, to: string, limit: number | null = 500): Promise<SpendRecord[]> {
  const rows = await sequelize.query<DbRow>(
    // Dates as text: the driver would otherwise hand back a JS Date at local midnight, which can
    // land on the previous day once serialised.
    `SELECT id, platform, account_id, campaign_ref, campaign_name, placement,
            period_start::text AS period_start, period_end::text AS period_end,
            amount_cents, impressions, clicks, source, entered_by, note, updated_at
       FROM marketing_spend_facts
      WHERE period_end >= :from AND period_start <= :to
      ORDER BY period_start DESC, amount_cents DESC
      ${limit === null ? '' : 'LIMIT :limit'}`,
    { type: QueryTypes.SELECT, replacements: { from, to, limit: limit ?? 0 } },
  );
  return rows.map(toRecord);
}

/** How many facts overlap [from, to], so a capped listing can say what it left out. */
export async function countSpend(from: string, to: string): Promise<number> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM marketing_spend_facts WHERE period_end >= :from AND period_start <= :to`,
    { type: QueryTypes.SELECT, replacements: { from, to } },
  );
  return Number(rows[0]?.n) || 0;
}

export function toFacts(records: SpendRecord[]): SpendFact[] {
  return records.map((r) => ({
    platform: r.platform, campaignRef: r.campaignRef, campaignName: r.campaignName, placement: r.placement,
    periodStart: r.periodStart, periodEnd: r.periodEnd, amountCents: r.amountCents, source: r.source,
  }));
}

/** Delete one row. Returns false when it did not exist. A synced row comes back on the next sync. */
export async function deleteSpend(id: number): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>(
    `DELETE FROM marketing_spend_facts WHERE id = :id RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { id } },
  );
  return rows.length > 0;
}

export interface KnownCampaign { utmSource: string | null; utmCampaign: string; signups: number; lastSignup: string }

/**
 * The utm_campaign values signups actually arrived with, for the entry form's suggestions. Typing
 * spend against a campaign id nobody signed up through is how spend ends up matched to nothing.
 */
export async function knownCampaigns(sources: string[], days = 180): Promise<KnownCampaign[]> {
  const rows = await sequelize.query<{ utm_source: string | null; utm_campaign: string; signups: number; last_signup: string }>(
    `SELECT l.utm_source, l.utm_campaign, count(*)::int AS signups, max(l.created_at) AS last_signup
       FROM leads l
      WHERE l.source IN (:sources)
        AND l.utm_campaign IS NOT NULL AND btrim(l.utm_campaign) <> ''
        AND l.created_at >= now() - (:days || ' days')::interval
      GROUP BY l.utm_source, l.utm_campaign
      ORDER BY max(l.created_at) DESC
      LIMIT 100`,
    { type: QueryTypes.SELECT, replacements: { sources, days: String(days) } },
  );
  return rows.map((r) => ({
    utmSource: r.utm_source, utmCampaign: r.utm_campaign, signups: r.signups, lastSignup: new Date(r.last_signup).toISOString(),
  }));
}
