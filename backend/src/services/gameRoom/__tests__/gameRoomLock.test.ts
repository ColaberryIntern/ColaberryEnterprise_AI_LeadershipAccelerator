/**
 * C10: the PRODUCTION store really serializes credits. withDayLock runs inside a transaction that takes
 * pg_advisory_xact_lock(hashtext(key)) before the work, and updateRunIf is conditional on the seen last_beat_at and an unsubmitted run.
 */
const mockQueries: Array<{ sql: string; o: { replacements?: unknown; transaction?: unknown } }> = [];
const mockUpdates: Array<{ v: unknown; o: { where: Record<string, unknown>; transaction?: unknown } }> = [];
jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: async (fn: (t: unknown) => Promise<unknown>) => fn('TX'),
    query: async (sql: string, o: { replacements?: unknown; transaction?: unknown }) => { mockQueries.push({ sql, o }); return []; },
  },
}));
jest.mock('../../../models/GameScore', () => ({
  __esModule: true,
  default: { update: async (v: unknown, o: { where: Record<string, unknown> }) => { mockUpdates.push({ v, o }); return [1]; } },
}));
jest.mock('../../../models', () => ({ CommunityMember: { findAll: async () => [] } }));

import { productionStore } from '../gameRoomStore';

it('withDayLock takes the advisory lock on the key, inside the same transaction, before the work runs', async () => {
  const order: string[] = [];
  const out = await productionStore().withDayLock('game_room:enr-1:2026-10-19', async (tx) => { order.push(`work:${String(tx)}`); return 7; });
  expect(out).toBe(7);
  expect(mockQueries[0].sql).toBe('SELECT pg_advisory_xact_lock(hashtext(:key))');
  expect(mockQueries[0].o).toEqual({ replacements: { key: 'game_room:enr-1:2026-10-19' }, transaction: 'TX' });
  expect(order).toEqual(['work:TX']);
});

it('updateRunIf is conditional: the run, the last_beat_at the caller saw, and not yet submitted', async () => {
  const seen = new Date('2026-10-19T17:00:00Z');
  const n = await productionStore().updateRunIf('run-1', seen, { seconds_used: 15 }, 'TX');
  expect(n).toBe(1);
  expect(mockUpdates[0].o.where).toEqual({ id: 'run-1', last_beat_at: seen, submitted_at: null });
  expect(mockUpdates[0].o.transaction).toBe('TX');
});
