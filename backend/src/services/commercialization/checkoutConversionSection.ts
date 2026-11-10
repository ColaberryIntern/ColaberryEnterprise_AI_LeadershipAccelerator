/**
 * C10.1 criterion (2): checkout conversion, per person, REPORTED WEEKLY.
 *
 * `checkoutFunnelService` already computes the rate and `reportCheckoutFunnel` already prints
 * it. Neither is reported weekly, because the script is a thing somebody has to remember to
 * run, and the ticket asks for a cadence rather than a capability. This module closes that gap
 * by hanging the funnel off the weekly commercial report that already ships on a schedule,
 * rather than standing up a second cron to say the same thing to the same two people.
 *
 * THREE RULES CARRIED OVER FROM THE TICKET, each one a mistake that was actually made:
 *
 * 1. NEVER a single blended rate. A blended number fell from 76.6% to 14.3% between July and
 *    October and sent C10.1 hunting a broken payment page for a month. What had changed was
 *    the population arriving, not the page. Every rate here names the origin it belongs to,
 *    and `assertEveryRateNamesItsOrigin` fails the build if one ever does not.
 *
 * 2. A FAILED READ IS NOT A ZERO. If the query cannot run, the section says it could not be
 *    measured and prints no number at all. "0% converted" and "we could not look" are
 *    different weeks, and only one of them is an emergency.
 *
 * 3. THE FUNNEL'S OWN WARNINGS TRAVEL WITH IT. `originWarning` and `mixShiftWarning` become
 *    report caveats. The split between explorer-origin and never-explorer rests on markers
 *    that disagree, and a rate quoted without that attached reads as settled when it is not.
 *
 * The `ReportSection` import is type-only and therefore erased at compile time, so this module
 * and `weeklyCommercialReport` do not form a runtime cycle.
 */
import type { CheckoutAttemptRow, CheckoutFunnel, CheckoutFunnelRow } from '../checkoutFunnelService';
import type { ReportSection } from './weeklyCommercialReport';

/** How far back the weekly view reaches. Eight weeks shows a trend without burying it. */
export const CHECKOUT_WEEKS = 8;

export interface CheckoutConversionSnapshot {
  /** Null only when the figures could not be read at all. */
  funnel: CheckoutFunnel | null;
  /** Raw attempt rows considered, for the "what was this computed from" line. */
  attempts: number;
  /** A stable error class when the read failed, else null. Never a message with data in it. */
  error: string | null;
}

/** The `since` bound for the weekly view, as YYYY-MM-DD, UTC. */
export function sinceFor(now: Date = new Date(), weeks: number = CHECKOUT_WEEKS): string {
  return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** CLAUDE.md requires a stable `error_class` rather than a bare message. */
function errorClass(err: unknown): string {
  const name = (err as { constructor?: { name?: string } })?.constructor?.name;
  return name || 'Error';
}

/**
 * Read the attempts and compute the weekly funnel.
 *
 * The database and the funnel service are imported lazily on purpose. A static import of
 * `config/database` pulls a live Sequelize instance into every suite that touches the weekly
 * report, and an unclosed instance leaks handles and force-exits a jest worker. Lazy also
 * means a failure to load is caught by the same guard as a failure to query.
 */
export async function getCheckoutConversionSnapshot(
  now: Date = new Date(),
): Promise<CheckoutConversionSnapshot> {
  try {
    const { sequelize } = await import('../../config/database');
    const { computeCheckoutFunnel, CHECKOUT_ATTEMPTS_SQL } = await import('../checkoutFunnelService');
    // `since` bounds the OUTPUT, not the input: filtering rows first would make a returning
    // person look like a first-timer. See CHECKOUT_ATTEMPTS_SQL.
    const [rows] = await sequelize.query(CHECKOUT_ATTEMPTS_SQL);
    const attempts = rows as CheckoutAttemptRow[];
    return {
      funnel: computeCheckoutFunnel(attempts, { period: 'week', since: sinceFor(now) }),
      attempts: attempts.length,
      error: null,
    };
  } catch (err) {
    return { funnel: null, attempts: 0, error: errorClass(err) };
  }
}

/** The most recent period present, or null when there is nothing to report. */
export function latestPeriod(funnel: CheckoutFunnel | null): string | null {
  if (!funnel || funnel.rows.length === 0) return null;
  return funnel.rows.map((r) => r.period).sort().slice(-1)[0] ?? null;
}

function rateLine(r: CheckoutFunnelRow): string {
  const pct = r.pct_paid === null ? 'no rate, nobody started' : `${r.pct_paid}% paid`;
  return `${r.origin}: ${r.started} started, ${r.converted_paid} paid (${pct})`;
}

/**
 * Build the section and the caveats it carries.
 *
 * Returned together because a caveat that does not travel with its number is a caveat nobody
 * reads, which is rule 3 above.
 */
export function buildCheckoutSection(
  snap: CheckoutConversionSnapshot,
): { section: ReportSection; caveats: string[] } {
  const base = { key: 'checkout', heading: 'Checkout conversion, per person', kind: 'outcome' as const };

  if (snap.error) {
    return {
      section: {
        ...base,
        lines: [
          `Not measurable this week: the checkout funnel could not be read (${snap.error}). `
          + 'No rate is shown rather than a zero, because a failed read and a week in which '
          + 'nobody bought are different weeks.',
        ],
        empty: true,
      },
      caveats: [],
    };
  }

  const period = latestPeriod(snap.funnel);
  if (!snap.funnel || !period) {
    return {
      section: {
        ...base,
        lines: [
          `Nobody started a checkout in the last ${CHECKOUT_WEEKS} weeks. `
          + 'That is a real measured figure, not a missing one.',
        ],
        empty: true,
      },
      caveats: [],
    };
  }

  const current = snap.funnel.rows.filter((r) => r.period === period);
  const converted = current.reduce((n, r) => n + r.converted_paid, 0);
  const caveats = [snap.funnel.originWarning, snap.funnel.mixShiftWarning]
    .filter((w): w is string => typeof w === 'string' && w.length > 0);

  return {
    section: {
      ...base,
      lines: [
        `Week of ${period}, by origin. Each rate belongs to one population; no combined `
        + 'number is shown, because a blended rate is what pointed this at a broken payment '
        + 'page for a month when the page was fine.',
        ...current.map(rateLine),
      ],
      empty: converted === 0,
    },
    caveats,
  };
}

/* ------------------------------------------------------------------ *
 * Guard
 * ------------------------------------------------------------------ */

/**
 * Every percentage names the population it belongs to.
 *
 * This is rule 1 with teeth. The failure it prevents is not hypothetical: an aggregate rate,
 * printed without the population it came from, is the single error this ticket spent a month
 * inside. A line may carry a percentage only if it also names an origin.
 */
export function assertEveryRateNamesItsOrigin(section: ReportSection): void {
  const origins = ['explorer-origin', 'never-explorer'];
  for (const line of section.lines) {
    if (!/\d%/.test(line)) continue;
    if (!origins.some((o) => line.includes(o))) {
      throw new Error(`"${line}" reports a percentage without naming the population it `
        + 'belongs to; a blended checkout rate is the error C10.1 was built around');
    }
  }
}
