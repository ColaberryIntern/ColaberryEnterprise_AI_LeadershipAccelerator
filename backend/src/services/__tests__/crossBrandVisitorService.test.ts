/**
 * The cross-brand query's composition and bounds.
 *
 * WHAT THIS TESTS, AND WHAT IT DOES NOT. It asserts how the SQL is composed and how the
 * inputs are clamped — not what the database returns, which needs a database. The query
 * itself was verified by running it against production read-only: 250ms, two rows, shapes
 * as expected. That is recorded here because a green unit test over a mocked driver would
 * otherwise imply more than it proves.
 *
 * The composition is worth pinning for one reason: the bot predicate is interpolated as a
 * STRING into the SQL. Interpolation is how injection happens, so the test fixes both
 * where it comes from (the shared helper, never a caller) and that the only caller-
 * controlled values travel as bound parameters.
 */
import { QueryTypes } from 'sequelize';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import { getCrossBrandVisitors } from '../crossBrandVisitorService';

const queryMock = sequelize.query as unknown as jest.Mock;

function lastCall() {
  const call = queryMock.mock.calls[queryMock.mock.calls.length - 1];
  return { sql: call[0] as string, opts: call[1] as any };
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

describe('caller input is bound, never interpolated', () => {
  it('passes every caller value as a replacement rather than into the SQL text', async () => {
    await getCrossBrandVisitors({ minBrands: 3, days: 90, limit: 25 });
    const { sql, opts } = lastCall();
    expect(opts.type).toBe(QueryTypes.SELECT);
    expect(opts.replacements).toEqual({ minBrands: 3, days: 90, limit: 25 });
    // The values must appear as placeholders, not as literals someone could shape.
    expect(sql).toContain(':minBrands');
    expect(sql).toContain(':days');
    expect(sql).toContain(':limit');
  });

  it('clamps absurd or hostile bounds instead of trusting them', async () => {
    await getCrossBrandVisitors({ minBrands: 999, days: 99999, limit: 10_000_000 });
    expect(lastCall().opts.replacements).toEqual({ minBrands: 10, days: 365, limit: 500 });

    await getCrossBrandVisitors({ minBrands: -5, days: 0, limit: -1 });
    // 0 and negatives fall back to the defaults rather than to zero, which would return
    // an empty screen that looks like "no cross-brand visitors" instead of a bad input.
    expect(lastCall().opts.replacements).toEqual({ minBrands: 2, days: 30, limit: 50 });
  });

  it('defaults to a 2-brand, 30-day, 50-row question', async () => {
    await getCrossBrandVisitors();
    expect(lastCall().opts.replacements).toEqual({ minBrands: 2, days: 30, limit: 50 });
  });
});

describe('bots are excluded by default', () => {
  it('applies a user-agent predicate unless asked not to', async () => {
    await getCrossBrandVisitors();
    expect(lastCall().sql).toContain('user_agent');

    await getCrossBrandVisitors({ includeBots: true });
    expect(lastCall().sql).not.toContain('user_agent');
  });

  it('joins visitors so the predicate has a column to test', async () => {
    // The predicate reads bv."user_agent"; without this join the SQL is invalid, and it
    // would fail at runtime rather than at compile time.
    await getCrossBrandVisitors();
    expect(lastCall().sql).toContain('JOIN visitors bv');
  });
});

describe('the shape of the answer', () => {
  it('orders brands by first touch, not alphabetically', async () => {
    // "Which brand did they arrive through" is most of the value here. An unordered
    // aggregate would still return the right set and silently lose the journey.
    await getCrossBrandVisitors();
    expect(lastCall().sql).toContain('ARRAY_AGG(t.brand_slug ORDER BY t.first_touch)');
  });

  it('ranks by intent with unscored visitors last', async () => {
    // Without NULLS LAST an unscored visitor sorts above a scored one in Postgres
    // descending order, putting the least-known people at the top of a list whose entire
    // purpose is "who should we talk to".
    await getCrossBrandVisitors();
    expect(lastCall().sql).toContain('ORDER BY i.score DESC NULLS LAST');
  });

  it('excludes the meaningless category from the summary', async () => {
    // `other` is what an uncategorised page resolves to. Listing it would make every
    // visitor look like they engaged with something.
    await getCrossBrandVisitors();
    expect(lastCall().sql).toContain("pe.page_category <> 'other'");
  });
});
