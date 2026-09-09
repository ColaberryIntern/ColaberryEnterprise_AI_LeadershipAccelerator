/**
 * Explorer Growth OS — resolve the facts a message is allowed to state.
 * Plan §11.3; EPIC 5.
 *
 * The other half of `explorerFactGuard`. The guard rejects any date, price or
 * seat count that is not in the resolved set; this decides what goes in it.
 * With no resolver the set is empty, the guard fails closed, and any copy
 * naming a fact is refused — correct, and useless.
 *
 * IT STATES A DATE ONLY FROM A COHORT THAT HAS NOT STARTED. `selectNextOpenCohort`
 * falls back to an already-started cohort, and then to the most recently created
 * one, which is right for PLACEMENT — a new signup has to land somewhere. It is
 * wrong for a sentence in an email: "your cohort starts <a date in the past>" is
 * exactly the April 14 defect, which sat live for five months. §11.3 is explicit
 * that no cohort means the message is cancelled, not that we reach for an older
 * one.
 *
 * SURFACE FORMS ARE THIS MODULE'S JOB. The guard compares what the model WROTE
 * against these strings and deliberately does not reason about equivalence — a
 * guard that decides two dates are "the same really" is a guard that can be
 * argued into approving things. So every rendering we are willing to accept is
 * enumerated here, where it is reviewable.
 *
 * NO DEADLINE, EVER. §35 D-6: `cohorts` has no application-deadline column, so
 * there is no fact to resolve and nothing may state one.
 */
import { PLANS } from '../subscriptionService';
import type { ExplorerFactSet } from './explorerFactGuard';

/** What a cohort must look like to be quotable. */
export interface QuotableCohort {
  name: string;
  status: string;
  start_date: string;
  max_seats: number;
  seats_taken: number;
}

/**
 * A cohort whose seat count is implausible is a holding pen, not an intake.
 *
 * Production carries "Explorer — Prospects" with **100,000 seats**, which exists
 * to park Open House signups. "99,998 seats remaining" is not a sentence to send
 * anyone, and a number that large is the tell.
 */
export const IMPLAUSIBLE_SEAT_COUNT = 1000;

/**
 * The next cohort we are willing to name, or null.
 *
 * Deliberately NOT `selectNextOpenCohort`: that helper's fallbacks exist to
 * place a learner, and placing someone in a started cohort is fine. Naming its
 * start date in an email is not.
 */
export function nextQuotableCohort<T extends QuotableCohort>(
  cohorts: readonly T[],
  now: Date,
): T | null {
  const today = now.toISOString().slice(0, 10);
  const upcoming = cohorts
    .filter((c) => c.status === 'open')
    .filter((c) => String(c.start_date) >= today)
    // A holding pen is open and may well be upcoming; it is still not an intake.
    .filter((c) => Number(c.max_seats) < IMPLAUSIBLE_SEAT_COUNT)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  return upcoming[0] ?? null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Every rendering of one ISO date we are willing to see in copy.
 *
 * Parsed as UTC parts rather than `new Date(...)` local time: a `YYYY-MM-DD`
 * string parsed in a negative-offset timezone lands on the previous day, which
 * would authorise the wrong date — off by one, in the direction of telling
 * someone the class starts a day earlier than it does.
 */
export function dateSurfaceForms(isoDate: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return [];

  const [, y, mo, d] = m;
  const monthIdx = Number(mo) - 1;
  if (monthIdx < 0 || monthIdx > 11) return [];

  const month = MONTHS[monthIdx];
  const day = String(Number(d));

  return [
    isoDate,
    `${month} ${day}`,
    `${month.slice(0, 3)} ${day}`,
    `${day} ${month}`,
    `${Number(mo)}/${day}`,
    `${Number(mo)}/${day}/${y}`,
    `${month} ${day}, ${y}`,
  ];
}

/**
 * Renderings of a price.
 *
 * Handles non-whole amounts because `per_month` is one: the annual plan is
 * $149/year, which displays as $12.42/month, and a generator quoting the
 * monthly-equivalent is quoting a real fact from the catalogue.
 */
export function priceSurfaceForms(amount: number): string[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const cents = Math.round(amount * 100);
  const exact = (cents / 100).toFixed(2);
  const forms = [`$${exact}`, `${exact} dollars`, `USD ${exact}`];

  // Whole amounts are usually written without the decimals.
  if (cents % 100 === 0) {
    const whole = String(cents / 100);
    forms.push(`$${whole}`, `${whole} dollars`, `USD ${whole}`);
  }
  return forms;
}

/**
 * Renderings of a seat count, or nothing.
 *
 * Returns [] for a negative remainder. Production's July 2026 cohort has 50
 * seats and 58 taken — oversubscription is real, and "-8 seats remaining" is
 * worse than saying nothing. Zero is also omitted: a full cohort is a reason not
 * to advertise seats rather than a number to quote.
 */
export function seatSurfaceForms(maxSeats: number, seatsTaken: number): string[] {
  const remaining = Number(maxSeats) - Number(seatsTaken);
  if (!Number.isFinite(remaining) || remaining <= 0) return [];
  return [`${remaining} seats`, `${remaining} spots`, `${remaining} places`];
}

/**
 * Build the set of facts a message may state for this learner.
 *
 * Pure — cohorts are passed in. The caller does the I/O, so what may be said is
 * decidable without a database and every rule here is testable.
 *
 * An empty result is a legitimate and expected outcome: no upcoming cohort means
 * no date may be stated, the guard then rejects any copy that names one, and the
 * message is cancelled per §11.3. That is the system working.
 */
export function buildExplorerFactSet(
  cohorts: readonly QuotableCohort[],
  now: Date,
): ExplorerFactSet {
  const cohort = nextQuotableCohort(cohorts, now);

  const dates = cohort ? dateSurfaceForms(cohort.start_date) : [];
  const seats = cohort ? seatSurfaceForms(cohort.max_seats, cohort.seats_taken) : [];

  // Prices come from the plan catalogue, not a cohort — they are stateable
  // whether or not an intake is open. `comp` is excluded: it is an admin-granted
  // free seat, never listed for self-serve checkout, and quoting $0 to a
  // prospect would be false.
  const prices = Object.values(PLANS)
    .filter((p) => p.id !== 'comp')
    // Both the term price and the effective monthly figure: $149/year is
    // genuinely $12.42/month, and a generator quoting either is quoting the
    // catalogue rather than inventing.
    .flatMap((p) => [...priceSurfaceForms(p.price), ...priceSurfaceForms(p.per_month)]);

  return { dates, prices, seats };
}
