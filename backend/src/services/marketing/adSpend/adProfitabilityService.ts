import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { LANDING_SOURCES } from '../acquisitionFunnel';
import { COLLECTED_CTE, PAYING_MEMBERS_CTE, collectedCentsFor } from '../payingMembersSql';
import { IS_STAFF_SQL } from '../../staffDetection';
import { allocateSpend } from './spendAllocation';
import { buildProfitability, CohortRow, PAYBACK_TARGET_MONTHS, ProfitRow, ProfitTotals } from './profitability';
import { listSpend, toFacts } from './spendLedger';
import { centralToday, getSyncStatus, shiftDay, SyncStatus } from './metaSpendSync';

/**
 * GET /api/admin/marketing/ad-profitability - the report.
 *
 * ONE WINDOW FOR BOTH SIDES. Spend from the last N days (Central calendar days, today included)
 * is set against people who SIGNED UP in the same N days, and everything those people have paid
 * since. So a 30-day view is "what did last month's ads buy", and it will understate the return:
 * Explorers take weeks to pay, and the report says so beside the numbers. The 90-day view is the
 * one to judge a campaign on.
 *
 * PEOPLE, NOT LEAD ROWS. A person who submitted the form twice is one signup here (their first
 * submission in the window decides their campaign). The campaign table above counts lead rows, so
 * the two can differ by a handful; the cost-per-signup here is per person.
 *
 * Failure: two read queries and a status read. Any of them failing throws to the route (500), and
 * the card shows its error state; it never renders spend without the return or the other way round.
 */

export interface AdProfitability {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  rows: ProfitRow[];
  totals: ProfitTotals;
  /** Signups in the window from campaigns with no spend recorded (organic, untagged, or spend not entered). */
  unspentSignups: number;
  /** People who filled in a form in the window but were already paying before it. Not counted as ad signups. */
  existingCustomers: number;
  coverage: { daysCovered: number; windowDays: number; lastDayRecorded: string | null; staleDays: number | null };
  paybackTargetMonths: number;
  sync: SyncStatus;
}

interface CohortDbRow {
  utm_source: string | null; utm_campaign: string | null; signups: number; payers: number;
  mrr: number | string | null; collected_cents: number | string | null;
}

/**
 * Signups in the window, per utm_source / utm_campaign, with who pays and what they have paid.
 *
 * NEW PEOPLE ONLY. Someone who was already a paying member before they filled in the form (a
 * retargeting ad shown to an existing customer) is not a customer the ad acquired; crediting their
 * past payments and current MRR to the ad would flatter it. They are set aside and counted in
 * `existingCustomers`. Staff and test addresses are excluded, the same people the Revenue page
 * excludes.
 */
async function fetchCohorts(days: number): Promise<{ cohorts: CohortRow[]; existingCustomers: number }> {
  const rows = await sequelize.query<CohortDbRow & { existing: number }>(
    `WITH ${PAYING_MEMBERS_CTE},
     ${COLLECTED_CTE},
     people AS (
       SELECT DISTINCT ON (lower(btrim(l.email)))
              lower(btrim(l.email)) AS email, l.utm_source, l.utm_campaign, l.created_at AS signed_up_at
         FROM leads l
        -- IN, not ANY: see acquisitionFunnel.ts.
        WHERE l.source IN (:sources)
          AND l.created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Chicago') - ((:days)::int - 1) * interval '1 day') AT TIME ZONE 'America/Chicago'
          AND l.email IS NOT NULL
          AND lower(l.email) NOT LIKE 'e2e-%'
          AND lower(l.email) NOT LIKE '%@colaberry-test.local'
          AND NOT (lower(l.email) LIKE '%@colaberry.com' AND lower(l.email) NOT LIKE '%+%@colaberry.com')
          AND NOT EXISTS (
            SELECT 1 FROM enrollments e
              LEFT JOIN community_members cm ON cm.enrollment_id = e.id
             WHERE lower(btrim(e.email)) = lower(btrim(l.email)) AND ${IS_STAFF_SQL}
          )
        ORDER BY lower(btrim(l.email)), l.created_at ASC
     ),
     classified AS (
       SELECT p.*, (fp.at IS NOT NULL AND fp.at < p.signed_up_at) AS existing
         FROM people p
         LEFT JOIN first_paid fp ON fp.email = p.email
     )
     SELECT c.utm_source, c.utm_campaign,
            count(*) FILTER (WHERE NOT c.existing)::int AS signups,
            count(pay.email) FILTER (WHERE NOT c.existing)::int AS payers,
            COALESCE(sum(pay.mrr) FILTER (WHERE NOT c.existing), 0)::float AS mrr,
            COALESCE(sum(GREATEST(${collectedCentsFor('c.email')}, 0)) FILTER (WHERE NOT c.existing), 0)::float AS collected_cents,
            count(*) FILTER (WHERE c.existing)::int AS existing
       FROM classified c
       LEFT JOIN paying pay ON pay.email = c.email
      GROUP BY c.utm_source, c.utm_campaign`,
    { type: QueryTypes.SELECT, replacements: { sources: LANDING_SOURCES, days: String(days) } },
  );
  return {
    existingCustomers: rows.reduce((t, r) => t + (Number(r.existing) || 0), 0),
    cohorts: rows
      .filter((r) => Number(r.signups) > 0)
      .map((r) => ({
        utmSource: r.utm_source,
        utmCampaign: r.utm_campaign && r.utm_campaign.trim() ? r.utm_campaign : null,
        signups: Number(r.signups) || 0,
        payers: Number(r.payers) || 0,
        mrr: Math.round((Number(r.mrr) || 0) * 100) / 100,
        collectedCents: Math.round(Number(r.collected_cents) || 0),
      })),
  };
}

const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export async function getAdProfitability(days: number, nowMs: number = Date.now()): Promise<AdProfitability> {
  const windowEnd = centralToday(nowMs);
  const windowStart = shiftDay(windowEnd, -(days - 1));

  const [records, { cohorts, existingCustomers }, sync] = await Promise.all([
    // No row cap: a cap would drop the oldest days and understate spend without saying so.
    listSpend(windowStart, windowEnd, null),
    fetchCohorts(days),
    getSyncStatus(),
  ]);

  const allocation = allocateSpend(toFacts(records), windowStart, windowEnd);
  const { rows, totals } = buildProfitability(allocation.campaigns, cohorts);
  const unspentSignups = rows.filter((r) => r.verdict === 'no_spend').reduce((t, r) => t + r.signups, 0);

  // Yesterday is the last day spend can be complete; a record ending before it is stale.
  const yesterday = shiftDay(windowEnd, -1);
  const staleDays = allocation.lastDayRecorded ? Math.max(0, dayGap(allocation.lastDayRecorded, yesterday)) : null;

  return {
    windowDays: days, windowStart, windowEnd, rows, totals, unspentSignups, existingCustomers,
    coverage: { daysCovered: allocation.daysCovered, windowDays: allocation.windowDays, lastDayRecorded: allocation.lastDayRecorded, staleDays },
    paybackTargetMonths: PAYBACK_TARGET_MONTHS,
    sync,
  };
}
