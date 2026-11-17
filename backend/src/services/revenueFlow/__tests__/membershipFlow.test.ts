const m = { query: jest.fn() };
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
const mockAnnualized = jest.fn();
jest.mock('../../commercialization/commercializationBoardService', () => ({
  annualizedRevenueCents: (...a: unknown[]) => mockAnnualized(...a),
}));

import { buildMembershipFlow } from '../membershipFlow';

/**
 * The membership stream on Ram's Revenue Flow board — its first tests.
 *
 * The defect they pin: `status = 'active' AND paysimple_payment_id IS NOT NULL` was read as
 * "paying", and on production 2026-11-16 that was false for 9 of 29 monthly rows. Nothing in
 * this system cancels a lapse. When a term runs out and no payment renews it, the row just
 * stays `active` — one had been sitting that way for 79 days — so the funnel's "Paying now"
 * stage was counting members nobody can bill.
 *
 * A lapse is also not a cancellation: the member never said anything, and may renew tomorrow
 * or may already be gone. The database cannot tell which, so these rows get their own stage
 * instead of being folded into either neighbour. A stage reading 0 asserts a measurement; the
 * point of this one is to stop an unmeasurable state being asserted as revenue.
 */

const TODAY = '2026-11-16';
const WINDOW_START = new Date('2026-08-18T00:00:00Z');

function sub(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    plan: 'monthly',
    status: 'active',
    amount_cents: 19900,
    has_payment: true,
    created_at: '2026-09-01T00:00:00Z',
    started_at: '2026-09-01T00:00:00Z',
    canceled_at: null,
    current_period_end: '2026-12-01T00:00:00Z',
    ...over,
  };
}

/** Wires the three queries buildMembershipFlow makes: tableExists, subs, refunds. */
function withRows(subs: unknown[], refunds: unknown[] = []) {
  m.query.mockImplementation((sql: string) => {
    if (String(sql).includes('information_schema.tables')) return Promise.resolve([{ n: 1 }]);
    if (String(sql).includes('FROM refunds')) return Promise.resolve(refunds);
    return Promise.resolve(subs);
  });
}

const stage = (flow: Awaited<ReturnType<typeof buildMembershipFlow>>, key: string) => {
  const found = flow.stream.funnel.find((f) => f.key === key);
  if (!found) throw new Error(`no stage called ${key}`);
  return found;
};

describe('buildMembershipFlow: paying versus lapsed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnnualized.mockResolvedValue({ cents: 5_550_000 });
    jest.useFakeTimers().setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });
  afterEach(() => jest.useRealTimers());

  it('counts a member whose term is still running as paying', async () => {
    withRows([sub({ current_period_end: '2026-12-01T00:00:00Z' })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'paying').count).toBe(1);
    expect(stage(flow, 'paying').value.cents).toBe(19900);
    expect(stage(flow, 'lapsed').count).toBe(0);
  });

  it('does NOT count a member whose term ended as paying (regression: 9 of 29 rows on 2026-11-16)', async () => {
    withRows([sub({ current_period_end: '2026-08-30T00:00:00Z' })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'paying').count).toBe(0);
    expect(stage(flow, 'lapsed').count).toBe(1);
    // The money is still shown — it was real for the term that ran — but on the stage that
    // says the term is over, not the one that says they are paying.
    expect(stage(flow, 'lapsed').value.cents).toBe(19900);
  });

  it('treats a row with no period end as not-running rather than as income', async () => {
    // Zero such rows exist in production today. The branch is tested so that the first one
    // does not arrive as revenue.
    withRows([sub({ current_period_end: null })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'paying').count).toBe(0);
    expect(stage(flow, 'lapsed').count).toBe(1);
  });

  it('counts a term ending TODAY as still running, not lapsed', async () => {
    // The boundary is inclusive on purpose: the member has paid through today. Excluding it
    // would report someone as unbillable on the last day they are actually covered.
    withRows([sub({ current_period_end: `${TODAY}T00:00:00Z` })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'paying').count).toBe(1);
    expect(stage(flow, 'lapsed').count).toBe(0);
  });

  it('keeps a lapsed row out of churn, because nobody canceled it', async () => {
    withRows([sub({ current_period_end: '2026-08-30T00:00:00Z' })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'churned').count).toBe(0);
    expect(stage(flow, 'lapsed').definition).toMatch(/neither paying nor churned/i);
  });

  it('counts a canceled payer as churn and never as lapsed', async () => {
    withRows([sub({ status: 'canceled', canceled_at: '2026-10-02T00:00:00Z', current_period_end: '2026-09-30T00:00:00Z' })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'churned').count).toBe(1);
    expect(stage(flow, 'lapsed').count).toBe(0);
  });

  it('says in words how many rows lapsed and that the state is ambiguous', async () => {
    withRows([
      sub({ id: 'a', current_period_end: '2026-08-30T00:00:00Z' }),
      sub({ id: 'b', current_period_end: '2026-09-30T00:00:00Z' }),
      sub({ id: 'c', current_period_end: '2026-12-01T00:00:00Z' }),
    ]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(flow.stream.caveat).toContain('2 subscription row(s)');
    // The reader must not be able to conclude these people left, nor that they are paying.
    expect(flow.stream.caveat).toMatch(/cannot tell which/i);
  });

  it('says nothing about lapses when there are none, rather than printing a zero', async () => {
    withRows([sub({ current_period_end: '2026-12-01T00:00:00Z' })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(flow.stream.caveat).not.toMatch(/subscription row\(s\) are still marked active/);
  });

  it('leaves a comp seat out of both stages', async () => {
    withRows([sub({ plan: 'comp', amount_cents: 0, has_payment: false, current_period_end: null })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'comped').count).toBe(1);
    expect(stage(flow, 'paying').count).toBe(0);
    expect(stage(flow, 'lapsed').count).toBe(0);
  });

  it('reads the headline from the shared revenue function, not from its own row tallies', async () => {
    // Two active rows for one person: the funnel counts 2 (rows), the headline counts the
    // person once. The two units must not be reconciled by making one of them wrong.
    withRows([sub({ id: 'a' }), sub({ id: 'b' })]);
    mockAnnualized.mockResolvedValue({ cents: 2_388_00 });

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'paying').count).toBe(2);
    expect(flow.annualizedCents).toBe(2_388_00);
    expect(stage(flow, 'paying').definition).toMatch(/per ROW.*per PERSON/s);
  });

  it('carries the shared function\'s caveat onto the stream', async () => {
    withRows([sub()]);
    mockAnnualized.mockResolvedValue({ cents: 5_550_000, caveat: 'Excluded: 9 active row(s) whose paid period has already ended.' });

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(flow.stream.caveat).toContain('9 active row(s)');
  });

  it('reports the headline as unreadable rather than zero when the revenue function throws', async () => {
    withRows([sub()]);
    mockAnnualized.mockRejectedValue(new Error('column gone'));

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(flow.annualizedCents).toBeNull();
    expect(flow.stream.headline.cents).toBeNull();
    // A dash or a 0 here would read as "no revenue". It has to say it cannot see.
    expect(flow.stream.headline.display).toMatch(/[a-z]/i);
    expect(flow.stream.status).toBe('unmeasurable');
  });

  it('refuses to count anything when the subscriptions table is absent', async () => {
    // A missing source is not an empty one — the distinction this whole surface is built on.
    m.query.mockImplementation((sql: string) => (
      String(sql).includes('information_schema.tables')
        ? Promise.resolve([{ n: 0 }])
        : Promise.resolve([])
    ));

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(flow.stream.status).toBe('unmeasurable');
    expect(flow.stream.headline.cents).toBeNull();
    expect(flow.stream.funnel).toEqual([]);
  });

  it('uses ONE reading of today for both the lapsed split and the renewal-ahead stage', async () => {
    // Two `new Date()` calls lived here until 2026-11-16. Microseconds apart is harmless
    // every day except across midnight, where one row could count as both lapsed and
    // renewal-ahead. A row ending today must appear in exactly one of them.
    withRows([sub({ current_period_end: `${TODAY}T00:00:00Z` })]);

    const flow = await buildMembershipFlow(WINDOW_START);

    expect(stage(flow, 'renewal_due').count).toBe(1);
    expect(stage(flow, 'lapsed').count).toBe(0);
  });
});
