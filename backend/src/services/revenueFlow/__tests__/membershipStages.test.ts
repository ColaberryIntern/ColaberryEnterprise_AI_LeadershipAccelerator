import {
  ClassifiableSubscription,
  MembershipStageKey,
  SUBSCRIPTION_STAGES,
  stagesForSubscription,
  tallyStages,
} from '../membershipStages';

/**
 * R26 — the one classifier behind both the funnel count and the per-stage roster.
 *
 * Taiwo Oludimimu, 25 Nov 2026: "can you make the data points clickable so they show a list
 * of students or leads that fall within each category?"
 *
 * The reason this module exists is that the count and the list must agree. A count of 27
 * above a list of 32 does not read as a bug in one of them; it reads as a reason to stop
 * trusting the page. So the rules live here once, the funnel tallies them and the roster
 * filters by them, and the invariant is asserted directly below.
 *
 * The rules themselves were MOVED, not redesigned, so these also pin the two behaviours that
 * look like bugs and are deliberate: overlapping stages, and a renewal check that does not
 * exclude comps.
 */
const TODAY = '2026-11-25';

const sub = (over: Partial<ClassifiableSubscription> = {}): ClassifiableSubscription => ({
  plan: 'monthly',
  status: 'active',
  amount_cents: 19900,
  has_payment: true,
  current_period_end: '2026-12-25T00:00:00.000Z',
  ...over,
});

describe('every row is counted as signed up, whatever else it is', () => {
  it('includes signed_up for every shape of row', () => {
    const shapes = [
      sub(),
      sub({ status: 'canceled' }),
      sub({ status: 'failed' }),
      sub({ plan: 'comp', amount_cents: 0 }),
      sub({ has_payment: false }),
      sub({ current_period_end: null }),
    ];
    for (const s of shapes) expect(stagesForSubscription(s, TODAY)).toContain('signed_up');
  });
});

describe('the paying / lapsed split, which is where the revenue number comes from', () => {
  it('counts a running paid term as paying', () => {
    expect(stagesForSubscription(sub(), TODAY)).toContain('paying');
  });

  /**
   * The correction of 2026-11-16. Nothing in this system cancels a lapse: the row stays
   * `active` and nobody is billed. Counting those as revenue overstated the annualized
   * figure by $26,268 a year.
   */
  it('counts an ENDED paid term as lapsed, not paying, even though the row says active', () => {
    const stages = stagesForSubscription(sub({ current_period_end: '2026-10-01' }), TODAY);
    expect(stages).toContain('lapsed');
    expect(stages).not.toContain('paying');
  });

  it('treats a missing period end as lapsed, because no running term can be shown', () => {
    const stages = stagesForSubscription(sub({ current_period_end: null }), TODAY);
    expect(stages).toContain('lapsed');
    expect(stages).not.toContain('paying');
  });

  it('counts the last day of the term as still paying, not already lapsed', () => {
    // An off-by-one here would move someone out of revenue a day early.
    expect(stagesForSubscription(sub({ current_period_end: TODAY }), TODAY)).toContain('paying');
  });
});

describe('the overlaps, which are the reason the Count column does not add up', () => {
  it('counts a failed row under BOTH failed and never paid', () => {
    const stages = stagesForSubscription(sub({ status: 'failed', has_payment: false }), TODAY);
    expect(stages).toContain('failed');
    expect(stages).toContain('never_paid');
  });

  /**
   * Preserved deliberately. `renewal_due` came from a separate filter that never excluded
   * comps, while the tally loop caught comps first and stopped. Correcting it moves a
   * published number, so it belongs in its own ticket — but it must not be corrected by
   * ACCIDENT during a refactor, which is what this test prevents.
   */
  it('counts a comp row carrying a payment id under BOTH comped and renewal ahead', () => {
    const stages = stagesForSubscription(
      sub({ plan: 'comp', amount_cents: 0, has_payment: true }),
      TODAY,
    );
    expect(stages).toContain('comped');
    expect(stages).toContain('renewal_due');
    // And NOT paying: the comp check runs first and stops.
    expect(stages).not.toContain('paying');
  });

  it('does not put a comp row with no payment id into renewal ahead', () => {
    // The control for the test above: renewal_due follows the payment id, not the comp.
    const stages = stagesForSubscription(
      sub({ plan: 'comp', amount_cents: 0, has_payment: false }),
      TODAY,
    );
    expect(stages).toContain('comped');
    expect(stages).not.toContain('renewal_due');
  });
});

describe('cancellation tells two different stories', () => {
  it('counts a cancel after paying as churned', () => {
    const stages = stagesForSubscription(sub({ status: 'canceled', has_payment: true }), TODAY);
    expect(stages).toContain('churned');
    expect(stages).not.toContain('never_paid');
  });

  it('counts a cancel that never paid as never paid, not as churn', () => {
    // Churn means we lost revenue. This row never produced any, and conflating them would
    // overstate what was lost.
    const stages = stagesForSubscription(sub({ status: 'canceled', has_payment: false }), TODAY);
    expect(stages).toContain('never_paid');
    expect(stages).not.toContain('churned');
  });
});

describe('a zero-amount row is a comp however its plan is spelled', () => {
  it('treats amount_cents 0 as comped even when the plan is not named comp', () => {
    const stages = stagesForSubscription(sub({ plan: 'monthly', amount_cents: 0 }), TODAY);
    expect(stages).toContain('comped');
  });
});

// ── THE INVARIANT ────────────────────────────────────────────────────────────────────────

describe('the count and the list are the same answer', () => {
  const POPULATION: ClassifiableSubscription[] = [
    sub(),                                                        // paying + renewal
    sub({ current_period_end: '2026-01-01' }),                    // lapsed
    sub({ current_period_end: null }),                            // lapsed, no term
    sub({ plan: 'comp', amount_cents: 0, has_payment: false }),   // comped
    sub({ plan: 'comp', amount_cents: 0, has_payment: true }),    // comped + renewal
    sub({ status: 'canceled', has_payment: true }),               // churned
    sub({ status: 'canceled', has_payment: false }),              // never paid
    sub({ status: 'failed', has_payment: false }),                // failed + never paid
    sub({ status: 'pending', has_payment: false }),               // never paid
  ];

  /**
   * The whole point of the module, asserted directly: for EVERY stage, the number the funnel
   * would print equals the number of rows a roster would list. True by construction here, and
   * this test is what keeps it true if someone adds a tenth stage or a new branch.
   */
  it('tallies exactly the rows a per-stage filter would return, for every stage', () => {
    const counts = tallyStages(POPULATION, TODAY);
    for (const stage of SUBSCRIPTION_STAGES) {
      const listed = POPULATION.filter(
        (r) => stagesForSubscription(r, TODAY).includes(stage),
      ).length;
      expect([stage, counts[stage]]).toEqual([stage, listed]);
    }
  });

  it('counts signed up once per row, not once per stage the row lands in', () => {
    expect(tallyStages(POPULATION, TODAY).signed_up).toBe(POPULATION.length);
  });

  it('reports a stage nobody is in as zero, not as missing', () => {
    const counts = tallyStages([sub()], TODAY);
    expect(counts.churned).toBe(0);
    expect(counts.refunded).toBe(0);
    // A measured zero is a finding; an absent key would be a crash at the call site.
    expect(Object.keys(counts)).toContain('churned');
  });

  it('proves the column really does not add up, which is why the page says so', () => {
    const counts = tallyStages(POPULATION, TODAY);
    const summed = (Object.keys(counts) as MembershipStageKey[])
      .filter((k) => k !== 'signed_up')
      .reduce((a, k) => a + counts[k], 0);
    expect(summed).toBeGreaterThan(counts.signed_up);
  });
});
