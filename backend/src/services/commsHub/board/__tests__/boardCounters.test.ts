/** CH7.4 the Today tiles messages and settings own: each is its own count, and the pause is the stored one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize where objects are keyed by Op symbols.
const counts: Array<Record<string | symbol, any>> = [];
let paused: boolean | null = true;
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { count: jest.fn(async (o: Record<string, any>) => { counts.push(o.where); return counts.length; }) } }));
jest.mock('../../../../models/CommsHubSettings', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => (paused === null ? null : { sending_paused: paused })) } }));

import { Op } from 'sequelize';
import { getSummary } from '../../commsHubSummary';
import '../boardCounters';

it('approval, next 7 days, needs attention and the pause come from their own queries', async () => {
  const s = await getSummary(new Date('2026-11-20T16:00:00Z'));
  expect(s.sending_paused).toBe(true);
  const byStatus = (w: Record<string, any>): unknown => (typeof w.status === 'string' ? w.status : w.status[Op.in]);
  expect(counts.map(byStatus)).toEqual(['needs_approval', ['approved', 'scheduled', 'sending'], ['partially_failed', 'failed']]);
  expect((counts[1] as any)[Op.or][1].send_at[Op.lte].toISOString()).toBe('2026-11-27T16:00:00.000Z');
  expect([s.awaiting_approval, s.scheduled_next_7_days, s.needs_attention]).toEqual([1, 2, 3]);
  paused = null;
  expect((await getSummary()).sending_paused).toBe(false);
});
