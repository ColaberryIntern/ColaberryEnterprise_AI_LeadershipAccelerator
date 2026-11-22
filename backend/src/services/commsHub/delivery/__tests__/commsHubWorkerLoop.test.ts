/**
 * CH7.2 wiring: the server starts the worker; a tick never overlaps another; a failing step (live
 * repair, plan drafting) does not stop sending; the CH5.2 and CH6.4 carry-forwards run every tick.
 */
import fs from 'fs';
import path from 'path';

const mockSync = jest.fn(async () => 0);
const mockPlans = jest.fn(async () => 0);
const mockTick = jest.fn(async () => ({ paused: false, started: 0, attempted: 0, sent: 0, finished: {} }));
jest.mock('../../live/livePanel', () => ({ syncLiveEvents: (...a: unknown[]) => mockSync(...(a as [])) }));
jest.mock('../../messages/promotionPlan', () => ({ ensurePlansForUpcoming: (...a: unknown[]) => mockPlans(...(a as [])) }));
jest.mock('../deliveryRepo', () => ({ deliveryRepo: {} }));
const mockAlerts = jest.fn(async () => ({ queued: 0, sent: 0, retried: 0, failed: 0 }));
jest.mock('../../alerts/alertRepo', () => ({ alertRepo: {} }));
jest.mock('../../alerts/failureAlerts', () => ({ runFailureAlerts: (...a: unknown[]) => mockAlerts(...(a as [])), defaultAlertSenders: {} }));
jest.mock('../deliveryWorker', () => ({ runDeliveryTick: (...a: unknown[]) => mockTick(...(a as [])), defaultConnector: jest.fn() }));
const mockEbSync = jest.fn(async () => null);
jest.mock('../../eventbrite/adoption', () => ({ syncAdoptedEventsIfDue: (...a: unknown[]) => mockEbSync(...(a as [])) }));
const mockSchedule = jest.fn(() => ({ stop: jest.fn() }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (...a: unknown[]) => mockSchedule(...(a as [])) } }));

import { __stopCommsHubWorker, COMMS_HUB_WORKER_CRON, runCommsHubTick, startCommsHubWorker } from '../commsHubWorkerLoop';
import { WORKER_ACTOR } from '../../activityLog';

const logs: string[] = [];
const deps = { repo: {} as never, connector: jest.fn(), log: (_l: string, event: string) => { logs.push(event); } };
const NOW = new Date('2026-11-20T16:00:00Z');

beforeEach(() => { jest.clearAllMocks(); logs.length = 0; __stopCommsHubWorker(); });

it('server.ts starts the worker (a tested unit nothing calls is the failure this guards)', () => {
  const server = fs.readFileSync(path.join(__dirname, '../../../../server.ts'), 'utf8');
  expect(server).toMatch(/import \{ startCommsHubWorker \} from '\.\/services\/commsHub\/delivery\/commsHubWorkerLoop'/);
  expect(server).toMatch(/startCommsHubWorker\(\);/);
});

it('start is idempotent: one schedule, every minute', () => {
  expect(startCommsHubWorker()).toBe(true);
  expect(startCommsHubWorker()).toBe(false);
  expect(mockSchedule).toHaveBeenCalledTimes(1);
  expect((mockSchedule.mock.calls[0] as unknown[])[0]).toBe(COMMS_HUB_WORKER_CRON);
  expect(COMMS_HUB_WORKER_CRON).toBe('* * * * *');
});

it('each tick repairs live events, drafts plan messages as the worker, sends, then alerts on failures (CH7.5)', async () => {
  const order: string[] = [];
  mockTick.mockImplementationOnce(async () => { order.push('send'); return { paused: false, started: 0, attempted: 0, sent: 0, finished: {} }; });
  mockAlerts.mockImplementationOnce(async () => { order.push('alerts'); return { queued: 0, sent: 0, retried: 0, failed: 0 }; });
  expect(await runCommsHubTick(deps, NOW)).toBe('ran');
  expect(order).toEqual(['send', 'alerts']);
  expect(mockAlerts).toHaveBeenCalledWith(expect.objectContaining({ repo: {} }), NOW);
  expect(mockSync).toHaveBeenCalledWith(NOW.getTime());
  expect(mockPlans).toHaveBeenCalledWith(WORKER_ACTOR, NOW);
  expect(mockTick).toHaveBeenCalledWith(deps, NOW);
  // CH9.5: the Eventbrite sync runs before the send, so a moved date voids approvals first.
  expect(mockEbSync).toHaveBeenCalledWith(NOW);
  expect(mockEbSync.mock.invocationCallOrder[0]).toBeLessThan(mockTick.mock.invocationCallOrder[0]);
});

it('CH9.5 a failing Eventbrite sync is logged and sending still runs', async () => {
  mockEbSync.mockRejectedValueOnce(new Error('ccpp down'));
  expect(await runCommsHubTick(deps, NOW)).toBe('ran');
  expect(logs).toContain('comms_hub_eventbrite_sync_failed');
  expect(mockTick).toHaveBeenCalledTimes(1);
});

it('a tick still running is not stacked: the next minute is skipped and says so', async () => {
  let finish!: () => void;
  mockTick.mockImplementationOnce(() => new Promise((r) => { finish = () => r({ paused: false, started: 0, attempted: 0, sent: 0, finished: {} }); }));
  const first = runCommsHubTick(deps, NOW);
  await new Promise((r) => setImmediate(r));
  expect(await runCommsHubTick(deps, NOW)).toBe('skipped_overlap');
  expect(logs).toContain('comms_hub_tick_overlap');
  finish();
  expect(await first).toBe('ran');
  expect(await runCommsHubTick(deps, NOW)).toBe('ran');
});

it('a failing step is logged and the others still run', async () => {
  mockSync.mockRejectedValueOnce(new Error('stream api down'));
  mockPlans.mockRejectedValueOnce(new Error('model down'));
  mockTick.mockRejectedValueOnce(new Error('pg down'));
  expect(await runCommsHubTick(deps, NOW)).toBe('ran');
  expect(logs).toEqual(expect.arrayContaining(['comms_hub_live_sync_failed', 'comms_hub_plan_sync_failed', 'comms_hub_send_tick_failed']));
  expect(mockTick).toHaveBeenCalledTimes(1);
  // A failed send tick still alerts on failures already recorded.
  expect(mockAlerts).toHaveBeenCalledTimes(1);
});
