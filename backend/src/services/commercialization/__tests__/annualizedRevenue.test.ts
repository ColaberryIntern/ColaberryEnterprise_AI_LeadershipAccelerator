const m = { query: jest.fn() };
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import {
  annualizedRevenue, annualizedRevenueCents, getCommercializationBoard,
} from '../commercializationBoardService';

/**
 * The revenue figure Ram reads, and the first tests it has ever had.
 *
 * That absence is not incidental — it is how the defect below survived. `annualizedRevenueCents`
 * carried a docblock promising it was the ONE place that knows the revenue rule, and
 * `marketing/payingMembersSql.ts` carried a docblock promising the same thing about itself.
 * Both were shipped, neither was tested against the other, and on production 2026-11-16 they
 * disagreed by $26,268 a year: $81,768 here against $55,500 there, a 32% overstatement.
 *
 * The cause, measured on 29 monthly rows marked `active`: 9 whose paid term had already ended
 * with nothing renewing them (the oldest 79 days past), and 2 belonging to staff, one of which
 * was also a member's second active row. Only 18 had a term actually running.
 *
 * So these tests are written against the BEHAVIOUR rather than the SQL string: what the figure
 * must refuse to count, and whether it says so out loud when it drops something. The SQL itself
 * is now one composed CTE shared with the marketing surfaces, which is the structural half of
 * the same fix.
 */

/** The shape the query returns: one row, the total plus one count per exclusion bucket. */
function row(over: Partial<Record<string, string>> = {}) {
  return {
    cents: '5550000', people: '25', lapsed: '0', no_period: '0', staff: '0', duplicate: '0', ...over,
  };
}

describe('annualizedRevenueCents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the total the collectible rule produced, with no caveat when nothing was dropped', async () => {
    m.query.mockResolvedValue([row()]);

    const { cents, caveat } = await annualizedRevenueCents();

    expect(cents).toBe(5_550_000);
    // Silence here is a claim: every active paying row was collectible. It must not be
    // manufactured, so it only happens when all four buckets are zero.
    expect(caveat).toBeUndefined();
  });

  it('composes the shared paying-members definition rather than restating the rule', async () => {
    m.query.mockResolvedValue([row()]);

    await annualizedRevenueCents();

    const sql = String(m.query.mock.calls[0][0]);
    // The three conditions this figure was missing before 2026-11-16, each of which cost money
    // on the board. Asserted on the SQL because there is no other way to prove a rule is
    // SHARED rather than re-derived, and re-derivation is the failure being prevented.
    expect(sql).toContain('paying AS (');              // the canonical CTE, not a local copy
    expect(sql).toContain('current_period_end >= now()'); // the term must be running
    expect(sql).toContain('DISTINCT ON');              // one row per person
    expect(sql).toContain('mgmt_role');                // staff are not customers
  });

  it('names every lapsed row it refused to count, and why that is not churn', async () => {
    m.query.mockResolvedValue([row({ lapsed: '9', people: '18' })]);

    const { caveat } = await annualizedRevenueCents();

    expect(caveat).toContain('9 active row(s)');
    expect(caveat).toContain('18 paying member(s)');
    // The distinction the stage exists for: a lapse is not a cancellation, so a reader must
    // not be left thinking these people quit.
    expect(caveat).toMatch(/not .*cancellations/i);
  });

  it('names a double-counted member as a second row, not as a second member', async () => {
    m.query.mockResolvedValue([row({ duplicate: '1' })]);

    const { caveat } = await annualizedRevenueCents();

    expect(caveat).toContain('1 second active row(s)');
    // The cause, in the caveat, because the reader is the person who has to decide whether
    // to care: a reminder-link renewal arrives as a new row.
    expect(caveat).toMatch(/bills one person twice/i);
  });

  it('reports staff and missing-period exclusions separately from lapses', async () => {
    m.query.mockResolvedValue([row({ staff: '2', no_period: '1', lapsed: '3' })]);

    const { caveat } = await annualizedRevenueCents();

    expect(caveat).toContain('2 staff row(s)');
    expect(caveat).toContain('1 active row(s) with no current_period_end');
    expect(caveat).toContain('3 active row(s)');
  });

  it('buckets each excluded row exactly once, so the caveat counts can be added up', async () => {
    m.query.mockResolvedValue([row()]);

    await annualizedRevenueCents();

    const sql = String(m.query.mock.calls[0][0]);
    // A row can be stale AND staff AND a duplicate at once — acda8718 on production was all
    // three. A FILTER per condition would have counted it three times and told the reader
    // that 3 rows were dropped when 1 was. A single CASE is what makes the numbers additive.
    expect(sql).toContain('CASE');
    expect(sql).toMatch(/bucket = 'lapsed'/);
    expect(sql).not.toMatch(/FILTER \(WHERE s\.current_period_end/);
  });

  it('reads zero as zero rather than throwing, when no row comes back at all', async () => {
    // An empty result is not an error, and it must not become NaN on a money tile.
    m.query.mockResolvedValue([]);

    const { cents, caveat } = await annualizedRevenueCents();

    expect(cents).toBe(0);
    expect(caveat).toBeUndefined();
  });
});

describe('annualizedRevenue (the formatted tile)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('formats the cents figure and passes the caveat through unchanged', async () => {
    m.query.mockResolvedValue([row({ cents: '5550000', lapsed: '9' })]);

    const { value, caveat } = await annualizedRevenue();

    expect(value).toBe('$55,500');
    // The tile and the Revenue Room must carry the same warning, or one screen looks clean
    // while the other admits the exclusion.
    expect(caveat).toContain('9 active row(s)');
  });

  it('delegates: one query for the figure, never a second definition for the display', async () => {
    m.query.mockResolvedValue([row()]);

    await annualizedRevenue();

    expect(m.query).toHaveBeenCalledTimes(1);
  });
});

/**
 * The board assembles with an unguarded `Promise.all`, so an exception in any one tile
 * rejects the whole thing and all ten tiles vanish.
 *
 * That was survivable while this figure read `subscriptions` alone. Moving it onto the
 * shared PAYING_MEMBERS_CTE added joins to `enrollments` and `community_members` — two
 * more tables that can be absent — so the blast radius of a missing table went from one
 * number to the entire page. Caught while reviewing that change rather than in production.
 */
describe('a failed revenue read costs one tile, not the board', () => {
  beforeEach(() => jest.clearAllMocks());

  it('degrades the revenue tile to unmeasurable instead of rejecting', async () => {
    m.query.mockImplementation((sql: string) => (
      String(sql).includes('paying AS (')
        ? Promise.reject(new Error('relation "community_members" does not exist'))
        : Promise.resolve([{ n: 0 }])
    ));

    const board = await getCommercializationBoard();

    const tile = board.tiles.find((t) => t.key === 'annualized_revenue');
    expect(tile).toBeDefined();
    expect(tile!.status).toBe('unmeasurable');
    // "0" and "I cannot see" must never print the same — this file's own rule.
    expect(tile!.value).toBeNull();
    expect(tile!.caveat).toContain('community_members');
  });

  it('still returns every other tile when the revenue read fails', async () => {
    m.query.mockImplementation((sql: string) => (
      String(sql).includes('paying AS (')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([{ n: 0 }])
    ));

    const board = await getCommercializationBoard();

    // The whole point: a broken number must not blank the nine tiles beside it.
    expect(board.tiles.length).toBeGreaterThan(1);
    expect(board.asOf).toBeTruthy();
  });
});
