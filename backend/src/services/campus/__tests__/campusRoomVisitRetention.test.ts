const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../../db/ensureCampusRoomVisitsSchema', () => ({ ensureCampusRoomVisitsSchema: jest.fn().mockResolvedValue(undefined) }));

import {
  pruneCampusRoomVisits, pruneCampusRoomVisitsDaily, __resetCampusRoomVisitPruneForTests, BATCH_SIZE, MAX_BATCHES, RETENTION_DAYS,
} from '../campusRoomVisitRetention';

/** C101: campus_room_visits keeps 90 days, pruned in bounded batches, at most once a day, never blocking the writer. */
beforeEach(() => { query.mockReset(); __resetCampusRoomVisitPruneForTests(); });
const sql = (i = 0) => String(query.mock.calls[i]?.[0] ?? '');
const repl = (i = 0) => (query.mock.calls[i]?.[1] as { replacements: Record<string, unknown> }).replacements;
const flush = () => new Promise((r) => setImmediate(r));

describe('pruneCampusRoomVisits', () => {
  it('deletes only rows older than 90 days, in batches of 5,000, and stops at the first short batch', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockResolvedValueOnce(Array.from({ length: BATCH_SIZE }, (_, i) => ({ id: String(i) }))).mockResolvedValueOnce([{ id: 'x' }]);
    await expect(pruneCampusRoomVisits()).resolves.toEqual({ deleted: BATCH_SIZE + 1 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(sql()).toMatch(/DELETE FROM campus_room_visits[\s\S]*entered_at < NOW\(\) - make_interval\(days => :days\)[\s\S]*LIMIT :limit/);
    expect(repl()).toEqual({ days: 90, limit: 5000 });
    expect(RETENTION_DAYS).toBe(90);
    log.mockRestore();
  });

  it('is bounded: never more than MAX_BATCHES deletes in one run, however large the backlog', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockResolvedValue(Array.from({ length: BATCH_SIZE }, (_, i) => ({ id: String(i) })));
    await pruneCampusRoomVisits();
    expect(query).toHaveBeenCalledTimes(MAX_BATCHES);
    log.mockRestore();
  });

  it('nothing to delete is one cheap statement (idempotent)', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockResolvedValue([]);
    await expect(pruneCampusRoomVisits()).resolves.toEqual({ deleted: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe('pruneCampusRoomVisitsDaily', () => {
  it('runs at most once per UTC day, without being awaited', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockResolvedValue([]);
    expect(pruneCampusRoomVisitsDaily(new Date('2026-11-03T05:00:00Z'))).toBeUndefined();
    pruneCampusRoomVisitsDaily(new Date('2026-11-03T23:00:00Z'));
    await flush();
    expect(query).toHaveBeenCalledTimes(1);
    pruneCampusRoomVisitsDaily(new Date('2026-11-04T00:30:00Z'));
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('a failed prune is logged with an error_class and retried on the next call the same day', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(Object.assign(new Error('lock timeout'), { name: 'SequelizeTimeoutError' })).mockResolvedValue([]);
    pruneCampusRoomVisitsDaily(new Date('2026-11-03T05:00:00Z'));
    await flush();
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'campus_room_visits_prune_failed', error_class: 'SequelizeTimeoutError' });
    pruneCampusRoomVisitsDaily(new Date('2026-11-03T06:00:00Z'));
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    err.mockRestore(); log.mockRestore();
  });
});
