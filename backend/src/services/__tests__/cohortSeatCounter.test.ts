const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

import { recountCohortSeats, recountAllCohortSeats, UNLIMITED_COHORT_TYPES } from '../cohortSeatCounter';

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([[{ id: 'c-nov', seats_taken: 30 }], 1]);
});

describe('recountCohortSeats', () => {
  it('SETS the counter from active paid / invoiced rows; it never adds (happy path)', async () => {
    const out = await recountCohortSeats(['c-nov']);
    expect(out).toEqual([{ id: 'c-nov', seats_taken: 30 }]);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SET seats_taken = \(\s*SELECT count\(\*\)/);
    expect(sql).not.toMatch(/seats_taken \+/);
    expect(sql).toMatch(/e\.status = 'active'/);
    expect(sql).toMatch(/payment_status IN \('paid', 'pending_invoice'\)/);
    expect(opts.replacements).toEqual({ ids: ['c-nov'], unlimited: [...UNLIMITED_COHORT_TYPES] });
  });

  it('uses IN, not ANY(:ids), which Sequelize array replacement breaks', async () => {
    await recountCohortSeats(['a', 'b']);
    expect(mockQuery.mock.calls[0][0]).toMatch(/c\.id IN \(:ids\)/);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/ANY\(/);
  });

  it('leaves unlimited buckets (Explorer, internship) and finished classes alone', async () => {
    await recountCohortSeats(['c-explorer']);
    expect(mockQuery.mock.calls[0][0]).toMatch(/NOT IN \(:unlimited\)/);
    expect(mockQuery.mock.calls[0][0]).toMatch(/c\.status IS DISTINCT FROM 'completed'/);
    expect(UNLIMITED_COHORT_TYPES).toEqual(['explorer', 'ai_internship']);
  });

  it('drops null / empty / duplicate ids, and an empty list makes no query (boundary)', async () => {
    await recountCohortSeats(['c-nov', null, undefined, '', 'c-nov']);
    expect(mockQuery.mock.calls[0][1].replacements.ids).toEqual(['c-nov']);
    mockQuery.mockClear();
    expect(await recountCohortSeats([null, undefined])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is idempotent: the same call twice issues the same statement', async () => {
    await recountCohortSeats(['c-nov']);
    await recountCohortSeats(['c-nov']);
    expect(mockQuery.mock.calls[0]).toEqual(mockQuery.mock.calls[1]);
  });

  it('never throws outside a transaction: a payment that cleared must not fail on the counter', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'ConnectionError' }));
    await expect(recountCohortSeats(['c-nov'])).resolves.toEqual([]);
    const logged = JSON.parse(String(err.mock.calls[0][0]));
    expect(logged).toMatchObject({ event: 'cohort_seat_recount_failed', error_class: 'ConnectionError' });
    err.mockRestore();
  });

  it("rethrows inside a caller's transaction, so the caller's rollback covers it", async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('deadlock'));
    const t = {} as any;
    await expect(recountCohortSeats(['c-sponsor'], { transaction: t })).rejects.toThrow('deadlock');
    err.mockRestore();
  });

  it('passes the transaction through', async () => {
    const t = { id: 'tx' } as any;
    await recountCohortSeats(['c-sponsor'], { transaction: t });
    expect(mockQuery.mock.calls[0][1].transaction).toBe(t);
  });
});

describe('recountAllCohortSeats', () => {
  it('recounts every limited cohort and returns the new values', async () => {
    mockQuery.mockResolvedValue([[{ id: 'c-nov', name: 'Cohort - November 2026', seats_taken: 30 }], 1]);
    expect(await recountAllCohortSeats()).toEqual([{ id: 'c-nov', name: 'Cohort - November 2026', seats_taken: 30 }]);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/:ids/);
  });
});
