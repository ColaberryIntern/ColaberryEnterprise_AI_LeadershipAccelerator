import { isDailyRefreshDue } from '../todayDailyRefreshService';
import { sequelize } from '../../../config/database';

const mockQuery = jest.spyOn(sequelize, 'query');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isDailyRefreshDue', () => {
  it('boundary: no prior impressions -> due (true)', async () => {
    mockQuery.mockResolvedValueOnce([{ last: null }] as any);
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(true);
  });

  it('happy path: most recent impression is today (Central time) -> not due (false)', async () => {
    const now = new Date('2026-08-11T18:00:00.000Z'); // 2026-08-11 13:00 CDT
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    mockQuery.mockResolvedValueOnce([{ last: '2026-08-11T15:00:00.000Z' }] as any); // 2026-08-11 10:00 CDT, same Central date
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(false);
  });

  it('happy path: most recent impression is an earlier Central-time date -> due (true)', async () => {
    const now = new Date('2026-08-11T18:00:00.000Z'); // 2026-08-11 13:00 CDT
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    mockQuery.mockResolvedValueOnce([{ last: '2026-08-05T15:00:00.000Z' }] as any); // days earlier
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(true);
  });

  it('boundary (real Central-time day transition, NOT a naive UTC-date compare): an impression at 11:58pm Central and a check at 12:02am Central the next day are different Central dates -> due (true)', async () => {
    // Central 2026-08-10 23:58:00 CDT (UTC-5) = 2026-08-11T04:58:00.000Z
    // Central 2026-08-11 00:02:00 CDT (UTC-5) = 2026-08-11T05:02:00.000Z
    // Both timestamps fall on the SAME UTC calendar date (2026-08-11) — a naive
    // UTC-date comparison would wrongly see these as the same day and return
    // false. Real Central-time semantics correctly see two different dates.
    const now = new Date('2026-08-11T05:02:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    mockQuery.mockResolvedValueOnce([{ last: '2026-08-11T04:58:00.000Z' }] as any);
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(true);
  });

  it('boundary: same Central date on both sides of a UTC-date-adjacent instant -> not due (false)', async () => {
    // Central 2026-08-10 22:00:00 CDT = 2026-08-11T03:00:00.000Z (already past UTC midnight)
    // Central 2026-08-10 23:00:00 CDT = 2026-08-11T04:00:00.000Z
    // Both are Central date 2026-08-10 despite straddling UTC midnight.
    const now = new Date('2026-08-11T04:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    mockQuery.mockResolvedValueOnce([{ last: '2026-08-11T03:00:00.000Z' }] as any);
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(false);
  });

  it('failure path: a DB error degrades to false (fail-soft), never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(false);
  });

  it('boundary: a malformed last-served value is treated as due rather than throwing', async () => {
    mockQuery.mockResolvedValueOnce([{ last: 'not-a-date' }] as any);
    await expect(isDailyRefreshDue('enr-1')).resolves.toBe(true);
  });

  it('scopes the query to the given enrollment', async () => {
    mockQuery.mockResolvedValueOnce([{ last: null }] as any);
    await isDailyRefreshDue('enr-42');
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/MAX\(served_at\)/);
    expect((opts as any).replacements).toEqual({ eid: 'enr-42' });
  });
});
