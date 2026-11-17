/**
 * C8.2 — fills the Commercialization Command Center tiles from production.
 *
 * Only two of the ten tiles have a number to fetch. The rest are declared by
 * `commercializationTiles.ts`, and this service's real job is to make sure a declared
 * status never drifts from what the database actually supports:
 *
 *   - A tile declared `measured_zero` is only reported as zero if its table is really
 *     there and really empty. If the table has gone missing the tile DEGRADES to
 *     `unmeasurable`, because "0" and "I cannot see" must never print the same.
 *   - A tile declared `measured_zero` whose table has gained rows is PROMOTED, so the
 *     board starts telling the truth the day somebody begins recording opportunities
 *     rather than waiting for this file to be edited.
 *
 * Read-only. No writes, ever: this is a reporting surface.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { PAYING_MEMBERS_CTE } from '../marketing/payingMembersSql';
import { IS_STAFF_SQL } from '../staffDetection';
import {
  TILE_DEFINITIONS,
  TileDefinition,
  TileStatus,
} from './commercializationTiles';

export interface CommercializationTile extends TileDefinition {
  /** Formatted for display, or null when the tile has no number to show. */
  value: string | null;
  /** Anything the reader must know to quote the number safely. */
  caveat?: string;
}

export interface CommercializationBoard {
  asOf: string;
  tiles: CommercializationTile[];
  summary: Record<TileStatus, number>;
}

// ANNUAL_MULTIPLIER lived here: { monthly: 12, annual: 1, yearly: 1 }. The annualization
// now rides on PAYING_MEMBERS_CTE, which already resolves every plan to a monthly-equivalent
// MRR (annual / 1200, monthly / 100), so there is one multiplication by 12 and no per-plan
// table to keep in step with the plan list. 'yearly' was in that table and has never
// appeared in production.

const money = (cents: number): string =>
  '$' + Math.round(cents / 100).toLocaleString('en-US');

/** True when the table exists in this database. A missing table is not an empty one. */
async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Annualized revenue from app-originated active subscriptions, counted as money that can
 * actually be billed today.
 *
 * `paysimple_payment_id IS NOT NULL` is the app-origination marker: it is set when our
 * own checkout recorded the payment. It also happens to exclude every comp row, which
 * carries $0 and no payment id — so the revenue rule and the comp exclusion select the
 * same rows rather than fighting each other.
 *
 * EXPORTED for the R1 Revenue Room, which shows the same figure on a different page.
 * Reusing the function rather than re-deriving the SQL is the point: two surfaces that
 * compute revenue independently will eventually disagree, and the first anyone will know
 * of it is a meeting where two screens show different numbers.
 *
 * ── WHICH IS EXACTLY WHAT HAPPENED (fixed 2026-11-16) ───────────────────────────────
 *
 * This function claimed to be the one place that knows the revenue rule, and it was not.
 * `marketing/payingMembersSql.ts` already held the rule in SQL, documented as the
 * canonical one — "an active annual or monthly subscription whose paid period is running
 * today, never staff. One row per person" — and it is what the landing page, the campaign
 * columns and the ad profitability report have always used. This function used a weaker
 * test, `status = 'active' AND paysimple_payment_id IS NOT NULL`, with no period check,
 * no per-member dedupe and no staff exclusion.
 *
 * Measured on production 2026-11-16, the two disagreed by $26,268 a year — $81,768 here
 * against $55,500 there, a 32% overstatement, on the figure Ram reads. The 11 monthly rows
 * responsible: 9 whose billing period had ended (one of them 79 days earlier) with nothing
 * renewing them, and 2 belonging to staff, one of which was also a member's second active
 * row. Monthly members read as 29; 18 had a term actually running.
 *
 * So it now composes PAYING_MEMBERS_CTE instead of restating the rule. There is one
 * definition, in SQL, shared by every surface — which is what the paragraph above always
 * promised. The annualization is the single `* 12` on an MRR the CTE has already resolved.
 */
export async function annualizedRevenue(): Promise<{ value: string; caveat?: string }> {
  const { cents, caveat } = await annualizedRevenueCents();
  return { value: money(cents), caveat };
}

/**
 * The same figure in CENTS, for callers that need to do arithmetic with it.
 *
 * Split out for R16's Revenue Flow dashboard, which has to add this to nothing and compare
 * it to a pipeline total, and therefore cannot work from a pre-formatted "$72,816". The
 * formatting function above now delegates here, so there is still exactly ONE place that
 * knows the app-origination rule and the annualization.
 *
 * Re-deriving the SQL in the new caller was the obvious alternative and is the thing this
 * function's own header warns against: "two surfaces that compute revenue independently
 * will eventually disagree, and the first anyone will know of it is a meeting where two
 * screens show different numbers."
 *
 * The `caveat` is not decoration. This figure is now smaller than the one it replaces, and
 * a reader who is told a number went down deserves to be told what came out of it. Every
 * excluded row is counted and named there.
 */
export async function annualizedRevenueCents(): Promise<{ cents: number; caveat?: string }> {
  const rows = await sequelize.query<{
    cents: string; people: string; lapsed: string; no_period: string; staff: string; duplicate: string;
  }>(
    `WITH ${PAYING_MEMBERS_CTE},
     counted AS (
       SELECT COALESCE(ROUND(SUM(mrr) * 12 * 100), 0)::bigint AS cents, COUNT(*)::bigint AS people
         FROM paying
     ),
     -- Every row the OLD rule would have counted, bucketed by the single reason the
     -- collectible rule drops it. One bucket per row (CASE, not FILTER), so the numbers
     -- in the caveat can be added up without double-counting a row that is both stale
     -- and staff.
     dropped AS (
       SELECT
         COUNT(*) FILTER (WHERE bucket = 'lapsed')::bigint    AS lapsed,
         COUNT(*) FILTER (WHERE bucket = 'no_period')::bigint AS no_period,
         COUNT(*) FILTER (WHERE bucket = 'staff')::bigint     AS staff,
         COUNT(*) FILTER (WHERE bucket = 'duplicate')::bigint AS duplicate
       FROM (
         SELECT CASE
                  WHEN ${IS_STAFF_SQL} THEN 'staff'
                  WHEN s.current_period_end IS NULL THEN 'no_period'
                  WHEN s.current_period_end < now() THEN 'lapsed'
                  WHEN ROW_NUMBER() OVER (
                         PARTITION BY lower(btrim(e.email))
                         ORDER BY s.current_period_end DESC
                       ) > 1 THEN 'duplicate'
                  ELSE 'counted'
                END AS bucket
           FROM subscriptions s
           JOIN enrollments e ON e.id = s.enrollment_id
           LEFT JOIN community_members cm ON cm.enrollment_id = e.id
          WHERE s.status = 'active'
            AND s.paysimple_payment_id IS NOT NULL
            AND s.plan IN ('annual', 'monthly')
            AND e.email IS NOT NULL
       ) b
     )
     SELECT counted.cents, counted.people, dropped.lapsed, dropped.no_period,
            dropped.staff, dropped.duplicate
       FROM counted, dropped`,
    { type: QueryTypes.SELECT },
  );

  const r = rows[0];
  const n = (v: string | undefined): number => Number(v ?? 0);
  const lapsed = n(r?.lapsed);
  const noPeriod = n(r?.no_period);
  const staff = n(r?.staff);
  const duplicate = n(r?.duplicate);

  // Nothing is dropped silently. Each clause names a count and why it is not collectible,
  // because the figure this replaces was 32% higher and gave no hint that it was.
  const notes: string[] = [];
  if (lapsed) {
    notes.push(
      `${lapsed} active row(s) whose paid period has already ended and which no payment has `
      + 'renewed. Still marked active because nothing cancels a lapse, so they are not '
      + 'cancellations either — they are unbillable until the member pays again.',
    );
  }
  if (duplicate) {
    notes.push(
      `${duplicate} second active row(s) for a member who already has one. A reminder-link `
      + 'renewal arrives as a new row, and counting both bills one person twice.',
    );
  }
  if (staff) notes.push(`${staff} staff row(s), which are not customer revenue.`);
  if (noPeriod) {
    notes.push(`${noPeriod} active row(s) with no current_period_end, so no period can be shown to be running.`);
  }

  return {
    cents: Number(r?.cents ?? 0),
    caveat: notes.length
      ? `Counts ${n(r?.people)} paying member(s) whose term is running today, one row each. `
        + `Excluded: ${notes.join(' ')}`
      : undefined,
  };
}

/**
 * Table names this service may read. A table name cannot be a bound parameter, so it is
 * interpolated — and the only way that is safe is if the value can never come from a
 * request. Every name here is a literal from the static tile registry; this allowlist
 * exists so a reviewer can confirm that without tracing every caller.
 */
const READABLE_TABLES = new Set([
  'subscriptions', 'revenue_opportunities', 'delivery_engagements',
  'delivery_contracts', 'interaction_outcomes',
]);

/** Count of rows in a table, or null when the table is absent. */
async function countOf(table: string, where = ''): Promise<number | null> {
  if (!READABLE_TABLES.has(table)) {
    throw new Error(`commercialization board refused to read unlisted table ${table}`);
  }
  if (!(await tableExists(table))) return null;
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ${table} ${where}`,
    { type: QueryTypes.SELECT },
  );
  return rows[0]?.n ?? 0;
}

/**
 * Reconcile a declared status against what the database can actually support.
 * Returns the status to render and the value to show beside it.
 */
async function resolve(def: TileDefinition): Promise<CommercializationTile> {
  const base: CommercializationTile = { ...def, value: null };

  if (def.key === 'annualized_revenue') {
    const { value, caveat } = await annualizedRevenue();
    return { ...base, value, caveat };
  }

  if (def.key === 'active_pilots') {
    const n = await countOf('delivery_engagements', "WHERE status = 'active'");
    return n === null
      ? { ...base, status: 'unmeasurable', sourceTable: null }
      : { ...base, value: String(n) };
  }

  if (def.key === 'executive_meetings') {
    const n = await countOf('interaction_outcomes', "WHERE outcome = 'booked_meeting'");
    return n === null
      ? { ...base, status: 'unmeasurable', sourceTable: null }
      : { ...base, value: String(n) };
  }

  // The declared-zero tiles. The table must be present AND empty for the zero to stand.
  if (def.status === 'measured_zero' || def.status === 'undefined_rate') {
    const n = def.sourceTable ? await countOf(def.sourceTable) : null;
    if (n === null) {
      return {
        ...base,
        status: 'unmeasurable',
        sourceTable: null,
        caveat: `${def.sourceTable} is not present in this database, so zero cannot be `
          + 'claimed. A missing source is not an empty one.',
      };
    }
    if (n > 0) {
      // Somebody started recording. Say so rather than printing a stale zero.
      return {
        ...base,
        status: 'proxy',
        value: String(n),
        caveat: `${def.sourceTable} now holds ${n} row(s). This tile was built when the `
          + 'table was empty and needs a real aggregate before the number is trustworthy.',
      };
    }
    return { ...base, value: def.status === 'undefined_rate' ? null : '0' };
  }

  return base;
}

/** Build the board. Every tile carries its status, its number and why. */
export async function getCommercializationBoard(): Promise<CommercializationBoard> {
  const tiles = await Promise.all(TILE_DEFINITIONS.map(resolve));

  const summary = tiles.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<TileStatus, number>);

  return { asOf: new Date().toISOString(), tiles, summary };
}
