import {
  buildExplorerFactSet,
  nextQuotableCohort,
  dateSurfaceForms,
  priceSurfaceForms,
  seatSurfaceForms,
  IMPLAUSIBLE_SEAT_COUNT,
  type QuotableCohort,
} from '../explorerFactResolver';
import { findUngroundedFacts } from '../explorerFactGuard';

/**
 * The other half of the fact guard: this decides what a message MAY state.
 *
 * The fixtures are production's real cohorts as of 2026-09-09, because each one
 * encodes a trap that a made-up fixture would have missed:
 *
 *   November 2026   open, 2026-11-12, 125 seats, 1 taken   — the genuine intake
 *   July 2026       open, 2026-07-23, 50 seats, 58 taken   — ALREADY STARTED, and
 *                                                            OVERSUBSCRIBED
 *   Explorer Prospects  open, 2026-07-12, 100000 seats     — a holding pen
 *   April 2026      completed, 2026-04-14                  — the cohort behind the
 *                                                            five-month-stale line
 */

const NOW = new Date('2026-09-09T12:00:00Z');

const PROD: QuotableCohort[] = [
  { name: 'Cohort - November 2026', status: 'open', start_date: '2026-11-12', max_seats: 125, seats_taken: 1 },
  { name: 'Cohort - July 2026', status: 'open', start_date: '2026-07-23', max_seats: 50, seats_taken: 58 },
  { name: 'Explorer — Prospects', status: 'open', start_date: '2026-07-12', max_seats: 100000, seats_taken: 2 },
  { name: 'Cohort — April 2026', status: 'completed', start_date: '2026-04-14', max_seats: 20, seats_taken: 13 },
];

describe('it names only a cohort that has not started', () => {
  it('picks the genuine upcoming intake', () => {
    expect(nextQuotableCohort(PROD, NOW)?.start_date).toBe('2026-11-12');
  });

  it('never names a started cohort, however open it is', () => {
    // selectNextOpenCohort falls back to these for PLACEMENT, which is right.
    // Naming the date in an email is the April 14 defect.
    const started = PROD.filter((c) => c.start_date < '2026-09-09');
    expect(nextQuotableCohort(started, NOW)).toBeNull();
  });

  it('never names a completed cohort', () => {
    const done = [PROD[3]];
    expect(nextQuotableCohort(done, NOW)).toBeNull();
  });

  it('skips a holding pen', () => {
    // "Explorer — Prospects" carries 100,000 seats and exists to park signups.
    // "99,998 seats remaining" is not a sentence to send anyone.
    const pen: QuotableCohort[] = [
      { name: 'pen', status: 'open', start_date: '2026-10-01', max_seats: IMPLAUSIBLE_SEAT_COUNT, seats_taken: 2 },
    ];
    expect(nextQuotableCohort(pen, NOW)).toBeNull();
  });

  it('returns null rather than reaching backwards when nothing is upcoming', () => {
    expect(nextQuotableCohort([], NOW)).toBeNull();
  });
});

describe('seat counts', () => {
  it('omits an oversubscribed cohort rather than quoting a negative', () => {
    // Production's July cohort: 50 seats, 58 taken. "-8 seats remaining" is
    // worse than saying nothing.
    expect(seatSurfaceForms(50, 58)).toEqual([]);
  });

  it('omits a full cohort', () => {
    // A reason not to advertise seats, not a number to quote.
    expect(seatSurfaceForms(50, 50)).toEqual([]);
  });

  it('quotes a real remainder in the forms copy actually uses', () => {
    expect(seatSurfaceForms(125, 1)).toEqual(['124 seats', '124 spots', '124 places']);
  });
});

describe('date surface forms', () => {
  it('covers the renderings a writer would plausibly use', () => {
    const forms = dateSurfaceForms('2026-11-12');
    for (const expected of ['2026-11-12', 'November 12', 'Nov 12', '12 November', '11/12']) {
      expect(forms).toContain(expected);
    }
  });

  it('does not shift the day across a timezone', () => {
    // `new Date('2026-11-12')` in a negative-offset zone lands on the 11th, and
    // authorising the wrong day errs toward telling someone class starts early.
    expect(dateSurfaceForms('2026-01-01')).toContain('January 1');
    expect(dateSurfaceForms('2026-01-01')).not.toContain('December 31');
  });

  it('returns nothing for an unparseable date', () => {
    expect(dateSurfaceForms('next tuesday')).toEqual([]);
    expect(dateSurfaceForms('')).toEqual([]);
  });
});

describe('prices', () => {
  it('renders whole and decimal amounts', () => {
    expect(priceSurfaceForms(149)).toContain('$149');
    expect(priceSurfaceForms(149)).toContain('$149.00');
    // The annual plan's effective monthly figure is not a whole number.
    expect(priceSurfaceForms(12.42)).toContain('$12.42');
  });

  it('refuses a zero or negative price', () => {
    // The comp plan is $0 and admin-granted. Quoting it to a prospect is false.
    expect(priceSurfaceForms(0)).toEqual([]);
    expect(priceSurfaceForms(-5)).toEqual([]);
  });
});

describe('the resolved set, against the real guard', () => {
  const facts = buildExplorerFactSet(PROD, NOW);

  it('permits the true start date', () => {
    expect(findUngroundedFacts('Your cohort starts November 12.', facts)).toEqual([]);
  });

  it('still rejects the April 14 date that shipped for five months', () => {
    // The whole point, end to end: the resolver does not authorise it, so the
    // guard refuses it.
    expect(findUngroundedFacts('Your cohort starts April 14.', facts)).toHaveLength(1);
  });

  it('permits a real plan price', () => {
    expect(findUngroundedFacts('It is $199 a month.', facts)).toEqual([]);
  });

  it('rejects an invented price', () => {
    expect(findUngroundedFacts('Just $99 a month!', facts)).toHaveLength(1);
  });

  it('permits the true seat count and rejects an invented one', () => {
    expect(findUngroundedFacts('124 seats left.', facts)).toEqual([]);
    expect(findUngroundedFacts('Only 3 seats left.', facts)).toHaveLength(1);
  });
});

describe('no upcoming cohort means no date may be stated', () => {
  const facts = buildExplorerFactSet([PROD[3]], NOW); // completed only

  it('resolves no dates and no seats', () => {
    expect(facts.dates).toEqual([]);
    expect(facts.seats).toEqual([]);
  });

  it('still resolves prices, which do not depend on an intake', () => {
    expect(facts.prices.length).toBeGreaterThan(0);
  });

  it('causes the guard to refuse any copy naming a date — §11.3 cancel', () => {
    // The system working: no cohort, so the message is cancelled rather than
    // sent with a plausible-looking date.
    expect(findUngroundedFacts('We start November 12.', facts)).toHaveLength(1);
  });
});
