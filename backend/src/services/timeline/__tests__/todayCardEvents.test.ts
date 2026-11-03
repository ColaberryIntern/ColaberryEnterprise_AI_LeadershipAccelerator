/**
 * C107 (C98 recommendation 3): seen cards and banner opens. Measurement only, so the contract is: first occurrence
 * kept, replays change nothing, input bounded, and a database failure never reaches the caller.
 */
const mockEnsure = jest.fn();
jest.mock('../../../db/ensureTodayCardEventsSchema', () => ({ ensureTodayCardEventsSchema: () => mockEnsure() }));

import { sequelize } from '../../../config/database';
import { recordTodayCardEvents, MAX_EVENTS_PER_CALL, type TodayCardEvent } from '../todayCardEvents';

const seen = (ref: string): TodayCardEvent => ({ ref, event: 'seen', source: 'feed' });
let query: jest.SpyInstance;

beforeEach(() => {
  mockEnsure.mockReset().mockResolvedValue(undefined);
  query = jest.spyOn(sequelize, 'query').mockResolvedValue([[], 0] as never);
});
afterEach(() => query.mockRestore());

it('writes one multi-row insert that keeps only the first occurrence', async () => {
  const n = await recordTodayCardEvents('enr-1', [seen('card:a'), { ref: 'card:a', event: 'open', source: 'banner' }]);
  expect(n).toBe(2);
  expect(query).toHaveBeenCalledTimes(1);
  const [sql, opts] = query.mock.calls[0] as [string, { replacements: Record<string, string> }];
  expect(sql).toContain('INSERT INTO today_card_events (enrollment_id, ref, event, source)');
  expect(sql).toContain('ON CONFLICT (enrollment_id, ref, event, source) DO NOTHING');
  expect(opts.replacements).toMatchObject({ eid: 'enr-1', r0: 'card:a', e0: 'seen', s0: 'feed', r1: 'card:a', e1: 'open', s1: 'banner' });
});

it('collapses duplicates inside one call', async () => {
  await expect(recordTodayCardEvents('enr-1', [seen('card:a'), seen('card:a'), seen('card:b')])).resolves.toBe(2);
});

it('never writes more than the per-call bound', async () => {
  const many = Array.from({ length: MAX_EVENTS_PER_CALL + 10 }, (_, i) => seen(`card:${i}`));
  await expect(recordTodayCardEvents('enr-1', many)).resolves.toBe(MAX_EVENTS_PER_CALL);
});

it('does nothing for an empty batch', async () => {
  await expect(recordTodayCardEvents('enr-1', [])).resolves.toBe(0);
  expect(mockEnsure).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});

it('swallows and logs a database failure (classified), returning 0', async () => {
  query.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(recordTodayCardEvents('enr-1', [seen('card:a')])).resolves.toBe(0);
  const line = JSON.parse(String(err.mock.calls[0][0]));
  expect(line).toMatchObject({ event: 'today_card_events_record_failed', outcome: 'failure', error_class: 'SequelizeConnectionError' });
  err.mockRestore();
});

it('swallows a schema-creation failure too', async () => {
  mockEnsure.mockRejectedValueOnce(new Error('permission denied'));
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(recordTodayCardEvents('enr-1', [seen('card:a')])).resolves.toBe(0);
  expect(query).not.toHaveBeenCalled();
  err.mockRestore();
});
