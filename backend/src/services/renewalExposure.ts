/**
 * RENEWAL EXPOSURE - how much recurring revenue comes up for renewal, and when.
 *
 * WHY THIS MODULE EXISTS (C10.12), AND WHY THE TICKET'S PREMISE WAS WRONG
 * ----------------------------------------------------------------------
 * C10.12 asks for a plan to handle "the annual renewal cliff before the first cohort of
 * yearly members reaches it". Measured read-only against production on 2 November 2026,
 * there is no cohort:
 *
 *   - 45 annual subscriptions have ever been written. **23 are still `pending` and 17
 *     `failed`** - they never began, so they can never renew.
 *   - The entire annual cliff is **4 memberships and $7,152**: three renewing in July
 *     2027 and one in November 2027.
 *
 * So the cliff the ticket was raised about is immaterial. The exposure that is real is the
 * 124-schedule legacy subscription book, worth roughly $13,877 a month realized - about
 * 1.9x the whole annual plan's value *every month*.
 *
 * That is precisely why this module takes rows as an argument rather than querying the
 * `subscriptions` table itself. The annual plan and the legacy book live in different
 * places, and a function that only knew how to find one of them would keep reporting a
 * $7,152 cliff while the $13,877-a-month one went unmeasured.
 *
 * TWO NUMBERS, NOT ONE
 * --------------------
 * Every month reports nominal and realization-adjusted value, because **46.3% of billed
 * dollars actually clear** (measured; see `scripts/artifacts/tickets/turnaroundData.js`).
 * Planning a retention budget against nominal exposure overstates what is at stake by
 * roughly 2.2x, and planning against realized exposure understates what a save is worth
 * to a member. Both belong on the page.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not decide anything. A retention offer to the legacy book is C6.11 and is Ali's
 * call, and this module deliberately has no opinion about it. It reports exposure.
 *
 * @see membershipPrice.ts - the price of record, used here only to detect drift
 */

import { ANNUAL_CHARGE, MEMBERSHIP_PRICE } from './membershipPrice';

/** A subscription row, reduced to the four fields exposure depends on. */
export interface RenewalRow {
  /** Plan identifier as production stores it: 'annual', 'monthly', 'comp', or a legacy name. */
  plan: string;
  /** Status as production stores it. Only `active` rows can renew. */
  status: string;
  /** Billed amount in CENTS, matching `subscriptions.amount_cents`. */
  amountCents: number;
  /**
   * When the current paid period ends, ISO date or null. Null means the row cannot be
   * placed on a calendar, which is reported rather than silently dropped.
   */
  currentPeriodEnd: string | null;
}

export interface MonthExposure {
  /** Renewal month as `YYYY-MM`. */
  month: string;
  memberships: number;
  /** Billed value coming up for renewal that month, in dollars. */
  nominalValue: number;
  /** The same value after the measured realization rate, in dollars. */
  realizedValue: number;
}

export interface ExposureReport {
  months: MonthExposure[];
  totalMemberships: number;
  totalNominalValue: number;
  totalRealizedValue: number;
  /**
   * Active rows with no period end. They renew at an unknown time, so they are counted
   * and reported separately instead of being folded into a month they do not belong to.
   * In production this is how the comped and open-ended rows behave.
   */
  undatedActive: { memberships: number; nominalValue: number };
  /**
   * Active rows whose amount disagrees with the price of record. Not an error - a legacy
   * book legitimately carries legacy amounts - but a figure that must be visible, because
   * an unexplained amount is how a wrong price survives in a forecast.
   */
  offPriceOfRecord: { memberships: number; amountsSeen: number[] };
  /** Rows excluded because they are not active and therefore cannot renew. */
  excludedNotActive: number;
}

export class RenewalExposureInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenewalExposureInputError';
  }
}

/** Dollar amounts the price of record sanctions, in cents. */
const PRICE_OF_RECORD_CENTS = new Set<number>([
  MEMBERSHIP_PRICE.monthly * 100,
  ANNUAL_CHARGE * 100,
  0, // a comped row is legitimately zero
]);

const MONTH = /^\d{4}-\d{2}/;

function monthOf(iso: string): string {
  const m = MONTH.exec(iso);
  if (!m) {
    throw new RenewalExposureInputError(
      `currentPeriodEnd must start with YYYY-MM; received ${JSON.stringify(iso)}. ` +
        'A date this function cannot place on a calendar would otherwise be grouped ' +
        'under a month it does not belong to.'
    );
  }
  return m[0];
}

/**
 * Group active rows by renewal month.
 *
 * Pure: no database, no clock, no randomness. The clock matters - a function that asked
 * "what is coming up?" relative to `now` could not be tested against fixed expectations
 * and would quietly change its answer every day. Callers filter by date themselves.
 *
 * @param rows subscription rows; non-active rows are counted and excluded
 * @param realizationRate fraction of billed dollars that clear, > 0 and <= 1. Required:
 *   defaulting it to 1 would assert that every billed dollar is collected, which the
 *   measurement contradicts.
 */
export function computeRenewalExposure(
  rows: readonly RenewalRow[],
  realizationRate: number
): ExposureReport {
  if (!Array.isArray(rows)) {
    throw new RenewalExposureInputError('rows must be an array of RenewalRow.');
  }
  if (typeof realizationRate !== 'number' || !Number.isFinite(realizationRate)) {
    throw new RenewalExposureInputError(
      `realizationRate is required and must be a finite number; received ${String(realizationRate)}.`
    );
  }
  if (realizationRate <= 0 || realizationRate > 1) {
    throw new RenewalExposureInputError(
      `realizationRate must be greater than 0 and at most 1; received ${realizationRate}.`
    );
  }

  const byMonth = new Map<string, { memberships: number; cents: number }>();
  let excludedNotActive = 0;
  const undatedActive = { memberships: 0, nominalValue: 0 };
  const offPrice = new Set<number>();
  let offPriceCount = 0;

  for (const row of rows) {
    if (!row || typeof row.amountCents !== 'number' || !Number.isFinite(row.amountCents)) {
      throw new RenewalExposureInputError(
        `every row needs a finite amountCents; received ${JSON.stringify(row)}.`
      );
    }
    if (row.status !== 'active') {
      excludedNotActive += 1;
      continue;
    }
    if (!PRICE_OF_RECORD_CENTS.has(row.amountCents)) {
      offPriceCount += 1;
      offPrice.add(row.amountCents / 100);
    }
    if (!row.currentPeriodEnd) {
      undatedActive.memberships += 1;
      undatedActive.nominalValue += row.amountCents / 100;
      continue;
    }
    const month = monthOf(row.currentPeriodEnd);
    const slot = byMonth.get(month) ?? { memberships: 0, cents: 0 };
    slot.memberships += 1;
    slot.cents += row.amountCents;
    byMonth.set(month, slot);
  }

  const months: MonthExposure[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      memberships: v.memberships,
      nominalValue: round2(v.cents / 100),
      realizedValue: round2((v.cents / 100) * realizationRate),
    }));

  return {
    months,
    totalMemberships: months.reduce((n, m) => n + m.memberships, 0),
    totalNominalValue: round2(months.reduce((n, m) => n + m.nominalValue, 0)),
    totalRealizedValue: round2(months.reduce((n, m) => n + m.realizedValue, 0)),
    undatedActive: {
      memberships: undatedActive.memberships,
      nominalValue: round2(undatedActive.nominalValue),
    },
    offPriceOfRecord: {
      memberships: offPriceCount,
      amountsSeen: [...offPrice].sort((a, b) => a - b),
    },
    excludedNotActive,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
