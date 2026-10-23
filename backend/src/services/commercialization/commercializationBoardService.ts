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

/** Months of revenue a plan represents in a year. Unknown plans are reported, not guessed. */
const ANNUAL_MULTIPLIER: Record<string, number> = { monthly: 12, annual: 1, yearly: 1 };

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
 * Annualized revenue from app-originated active subscriptions.
 *
 * `paysimple_payment_id IS NOT NULL` is the app-origination marker: it is set when our
 * own checkout recorded the payment. It also happens to exclude every comp row, which
 * carries $0 and no payment id — so the revenue rule and the comp exclusion select the
 * same 27 rows rather than fighting each other.
 */
async function annualizedRevenue(): Promise<{ value: string; caveat?: string }> {
  const rows = await sequelize.query<{ plan: string; cents: string }>(
    `SELECT plan::text AS plan, COALESCE(SUM(amount_cents), 0)::bigint AS cents
     FROM subscriptions
     WHERE status = 'active' AND paysimple_payment_id IS NOT NULL
     GROUP BY 1`,
    { type: QueryTypes.SELECT },
  );

  let total = 0;
  const unknown: string[] = [];
  for (const r of rows) {
    const multiplier = ANNUAL_MULTIPLIER[r.plan];
    if (multiplier === undefined) { unknown.push(r.plan); continue; }
    total += Number(r.cents) * multiplier;
  }

  return {
    value: money(total),
    // Silently dropping an unrecognized plan would understate revenue with no trace.
    caveat: unknown.length
      ? `Excludes ${unknown.length} plan type(s) with no annualization rule: `
        + `${unknown.join(', ')}. Add a multiplier before quoting this figure.`
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
