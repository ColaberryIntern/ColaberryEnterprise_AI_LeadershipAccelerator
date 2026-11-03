import {
  composeSponsoredCohorts,
  type SponsoredCohortLink,
} from '../orgSponsoredCohorts';

/**
 * An institution's sponsored-cohort view reports what it was sold and who of ITS OWN people
 * occupy it — and never the cohort's population.
 *
 * ## The failure this suite exists to prevent
 *
 * C8.9's brief warns that "a table with the right shape and zero records reads as capability
 * and is not". The dangerous variant is the opposite: a table with plenty of records that
 * mean something else. `org_cohorts` links an institution to a cohort, and `OrgCohort`'s own
 * header states that adding a link does NOT move any person into it — per-person placement
 * lives on `enrollments.cohort_id`.
 *
 * So answering "how many learners does this institution have here?" with the cohort's
 * enrollment count is wrong, and wrong in the expensive direction. In production the largest
 * cohort is "Explorer - Prospects" with 425 active enrollments, and it is a prospect pool.
 * Reporting that as a customer's learners would assert that 425 strangers belong to them.
 *
 * Every test below is pure. The arithmetic that produces a customer-facing number is
 * separated from its queries precisely so the cases that must yield `null` instead of a
 * confident `0` can be proved without a database.
 *
 * ## The fixture is the real production shape
 *
 * Measured read-only on 2026-11-02: `org_cohorts` holds 4 rows, all for the organization
 * "Colaberry", linked by ali@colaberry.com on 2026-10-20, and **every one has
 * `seats_sponsored` NULL**. The cohorts they point at carry 63, 56, 14 and 0 enrollments.
 * That makes the production rows a perfect test of the distinction: the cohort totals are
 * large, the entitlement is unknown, and the intersection with this org's 37 `org_members` is
 * a third number again.
 */

/** The four links that exist in production today, with their cohorts' real totals noted. */
const PRODUCTION_LINKS: SponsoredCohortLink[] = [
  // cohort total 63 enrollments — NOT this institution's number
  { cohort_id: 'c-nov', name: 'Cohort - November 2026', status: 'open', start_date: '2026-11-12', seats_sponsored: null, linked_at: '2026-10-20T19:54:00-05' },
  // cohort total 56
  { cohort_id: 'c-jul', name: 'Cohort - July 2026', status: 'open', start_date: '2026-07-23', seats_sponsored: null, linked_at: '2026-10-20T19:54:00-05' },
  // cohort total 14
  { cohort_id: 'c-apr', name: 'Cohort — April 2026', status: 'completed', start_date: '2026-04-14', seats_sponsored: null, linked_at: '2026-10-20T19:54:00-05' },
  // cohort total 0
  { cohort_id: 'c-int', name: 'AI Internship', status: 'open', start_date: '2026-09-15', seats_sponsored: null, linked_at: '2026-10-20T19:54:00-05' },
];

describe('it reports the institution\'s own people, never the cohort population', () => {
  it('THE INVARIANT: placement comes from the supplied map, not from cohort size', () => {
    // The cohorts hold 63, 56, 14 and 0 people. This institution has 9, 4, 1 and 0 of them.
    // If any output echoed a cohort total, this fails.
    const placed = new Map([['c-nov', 9], ['c-jul', 4], ['c-apr', 1]]);

    const out = composeSponsoredCohorts(PRODUCTION_LINKS, placed);

    expect(out.map((c) => c.members_placed)).toEqual([9, 4, 1, 0]);
    // Stated negatively as well, because this is the whole point of the module.
    expect(out.map((c) => c.members_placed)).not.toEqual([63, 56, 14, 0]);
  });

  it('a linked cohort with nobody from this org placed reads 0, not null', () => {
    // 0 is the right answer here: the read RAN and found nobody. That is a different claim
    // from "we could not tell", which is the next test.
    const out = composeSponsoredCohorts(PRODUCTION_LINKS, new Map());
    expect(out.every((c) => c.members_placed === 0)).toBe(true);
  });

  it('preserves order and identity, one row per link', () => {
    const out = composeSponsoredCohorts(PRODUCTION_LINKS, new Map([['c-jul', 2]]));
    expect(out).toHaveLength(4);
    expect(out.map((c) => c.cohort_id)).toEqual(['c-nov', 'c-jul', 'c-apr', 'c-int']);
    expect(out[0].name).toBe('Cohort - November 2026');
    expect(out[2].status).toBe('completed');
    expect(out[1].linked_at).toBe('2026-10-20T19:54:00-05');
  });

  it('returns nothing for an institution with no links', () => {
    expect(composeSponsoredCohorts([], new Map())).toEqual([]);
  });
});

describe('an unknown number is never reported as zero', () => {
  it('a failed placement read gives null members_placed, NOT 0', () => {
    // This is the failure-first case. An institution reading "0 of your people are enrolled"
    // would act on it; "unknown" is the only honest answer when the query did not complete.
    const out = composeSponsoredCohorts(PRODUCTION_LINKS, null);
    expect(out.every((c) => c.members_placed === null)).toBe(true);
    expect(out.every((c) => c.seats_unfilled === null)).toBe(true);
  });

  it('a null entitlement gives null seats_unfilled, even when placement is known', () => {
    // The production case: all four links have seats_sponsored NULL. An unknown entitlement
    // minus a known placement is not a number.
    const out = composeSponsoredCohorts(PRODUCTION_LINKS, new Map([['c-nov', 9]]));
    expect(out[0].members_placed).toBe(9);
    expect(out[0].seats_sponsored).toBeNull();
    expect(out[0].seats_unfilled).toBeNull();
  });

  it('CONTROL: with BOTH sides known, it does compute a number', () => {
    // Without this, a function that returned null for everything would pass every
    // assertion above.
    const links: SponsoredCohortLink[] = [
      { ...PRODUCTION_LINKS[0], seats_sponsored: 25 },
    ];
    const out = composeSponsoredCohorts(links, new Map([['c-nov', 9]]));
    expect(out[0].seats_sponsored).toBe(25);
    expect(out[0].members_placed).toBe(9);
    expect(out[0].seats_unfilled).toBe(16);
  });
});

describe('boundaries', () => {
  it('over-placement floors at 0 rather than going negative', () => {
    // More people enrolled than seats bought is a real situation (seats added informally,
    // or a seat count recorded after the fact). A negative "unfilled" would render as
    // nonsense in the UI and read as a data error rather than an overage.
    const links: SponsoredCohortLink[] = [{ ...PRODUCTION_LINKS[0], seats_sponsored: 5 }];
    const out = composeSponsoredCohorts(links, new Map([['c-nov', 12]]));
    expect(out[0].members_placed).toBe(12);
    expect(out[0].seats_unfilled).toBe(0);
  });

  it('exactly filled reads 0 unfilled', () => {
    const links: SponsoredCohortLink[] = [{ ...PRODUCTION_LINKS[0], seats_sponsored: 9 }];
    const out = composeSponsoredCohorts(links, new Map([['c-nov', 9]]));
    expect(out[0].seats_unfilled).toBe(0);
  });

  it('zero seats sponsored is a real entitlement, not a missing one', () => {
    // 0 and null mean different things here and must not collapse: 0 seats sold is a
    // decision, an absent seat count is an unrecorded one.
    const links: SponsoredCohortLink[] = [{ ...PRODUCTION_LINKS[0], seats_sponsored: 0 }];
    const out = composeSponsoredCohorts(links, new Map([['c-nov', 3]]));
    expect(out[0].seats_sponsored).toBe(0);
    expect(out[0].seats_unfilled).toBe(0);
  });

  it('normalizes absent optional fields to null rather than leaving them undefined', () => {
    const links = [{
      cohort_id: 'c-x', name: 'Bare', status: null, start_date: null,
      seats_sponsored: null, linked_at: null,
    }] as SponsoredCohortLink[];
    const out = composeSponsoredCohorts(links, new Map());
    expect(out[0]).toEqual({
      cohort_id: 'c-x',
      name: 'Bare',
      status: null,
      start_date: null,
      seats_sponsored: null,
      members_placed: 0,
      seats_unfilled: null,
      linked_at: null,
    });
  });

  it('IDEMPOTENCY: composing the same input twice gives the same result', () => {
    const placed = new Map([['c-nov', 9], ['c-jul', 4]]);
    const a = composeSponsoredCohorts(PRODUCTION_LINKS, placed);
    const b = composeSponsoredCohorts(PRODUCTION_LINKS, placed);
    expect(a).toEqual(b);
    // And it does not mutate what it was handed.
    expect(placed.get('c-nov')).toBe(9);
    expect(PRODUCTION_LINKS[0].seats_sponsored).toBeNull();
  });
});
