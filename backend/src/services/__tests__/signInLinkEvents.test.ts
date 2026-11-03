const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../db/ensureSignInLinkEventsSchema', () => ({ ensureSignInLinkEventsSchema: jest.fn().mockResolvedValue(undefined) }));

import { recordSignInLinkUse, recordSignInLinkInvalid, RETENTION_DAYS, PRUNE_BATCH, __resetSignInLinkPruneForTests } from '../signInLinkEvents';

/**
 * C106: what is written for a sign-in link, that a flood of junk tokens cannot grow a table, that nothing secret is
 * stored, that a failure never reaches the caller, and that retention is bounded and runs at most once a day.
 */
const sqls = () => query.mock.calls.map((c) => String(c[0]));
const DAY1 = new Date('2026-11-03T04:00:00Z');
const DAY2 = new Date('2026-11-04T04:00:00Z');

beforeEach(() => { query.mockReset(); query.mockResolvedValue([]); __resetSignInLinkPruneForTests(); });

describe('recordSignInLinkUse', () => {
  it('inserts one row: the enrollment and the time, nothing else', async () => {
    await recordSignInLinkUse('e1', DAY1);
    expect(sqls()[0]).toBe('INSERT INTO sign_in_link_uses (enrollment_id, used_at) VALUES (:enrollmentId, NOW())');
    expect(query.mock.calls[0][1]).toMatchObject({ replacements: { enrollmentId: 'e1' } });
  });

  it('prunes rows older than 180 days at most once a day, in a capped batch', async () => {
    await recordSignInLinkUse('e1', DAY1);
    await recordSignInLinkUse('e2', DAY1);
    const prunes = () => sqls().filter((s) => s.startsWith('DELETE FROM sign_in_link_uses'));
    expect(prunes()).toHaveLength(1);
    expect(prunes()[0]).toMatch(/used_at < NOW\(\) - make_interval\(days => :days\)[\s\S]*LIMIT :limit/);
    expect(sqls().some((s) => s.startsWith('DELETE FROM sign_in_link_invalid_daily WHERE day < CURRENT_DATE - :days'))).toBe(true);
    await recordSignInLinkUse('e3', DAY2);
    expect(prunes()).toHaveLength(2);
    expect(RETENTION_DAYS).toBe(180);
    expect(PRUNE_BATCH).toBe(5000);
  });

  it('a failed write is logged with an error_class and never thrown to the caller', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(Object.assign(new Error('connection refused'), { name: 'SequelizeConnectionRefusedError' }));
    await expect(recordSignInLinkUse('e1', DAY1)).resolves.toBeUndefined();
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'sign_in_link_use_record_failed', error_class: 'SequelizeConnectionRefusedError' });
    err.mockRestore();
  });

  it('a failed prune is retried on the next call, not skipped for the day', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('lock timeout'));
    await recordSignInLinkUse('e1', DAY1);
    query.mockResolvedValue([]);
    await recordSignInLinkUse('e2', DAY1);
    expect(sqls().filter((s) => s.startsWith('DELETE FROM sign_in_link_uses'))).toHaveLength(2);
    err.mockRestore();
  });
});

describe('recordSignInLinkInvalid', () => {
  it('bumps one counter row for today, so any number of junk tokens is one row a day', async () => {
    await recordSignInLinkInvalid();
    await recordSignInLinkInvalid();
    expect(sqls()).toHaveLength(2);
    for (const s of sqls()) {
      expect(s).toMatch(/INSERT INTO sign_in_link_invalid_daily \(day, invalid_count, updated_at\) VALUES \(CURRENT_DATE, 1, NOW\(\)\)/);
      expect(s).toMatch(/ON CONFLICT \(day\) DO UPDATE SET invalid_count = sign_in_link_invalid_daily\.invalid_count \+ 1/);
    }
  });

  it('takes no arguments at all: there is nothing about the attempt it could store', () => {
    expect(recordSignInLinkInvalid.length).toBe(0);
  });

  it('a failure is logged and never thrown', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(new TypeError('boom'));
    await expect(recordSignInLinkInvalid()).resolves.toBeUndefined();
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'sign_in_link_invalid_record_failed', error_class: 'TypeError' });
    err.mockRestore();
  });
});
