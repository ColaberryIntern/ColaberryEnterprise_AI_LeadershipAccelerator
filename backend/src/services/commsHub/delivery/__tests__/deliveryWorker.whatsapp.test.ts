/**
 * CH10.4 the worker with a WhatsApp delivery: a hold from the connector gives the try back (ten holds
 * in a row spend nothing), another channel in the same tick still sends, a plan message whose event
 * has started is skipped rather than sent late, and the banner reaches the WhatsApp connector.
 */
jest.mock('../../connectors', () => {
  const types = jest.requireActual('../../connectors/types');
  return { ...types, connectorFor: jest.fn() };
});

import { ConnectorHoldError, type Connector, type ConnectorDelivery } from '../../connectors/types';
import { runDeliveryTick, type WorkerDeps } from '../deliveryWorker';
import { FakeRepo } from './fakeRepo';

const T0 = new Date('2026-11-20T16:00:00Z'); // 10:00 AM CST
const at = (ms: number): Date => new Date(T0.getTime() + ms);

function setup() {
  const repo = new FakeRepo();
  repo.messages.set('m1', { id: 'm1', status: 'scheduled', send_at: null, approvalMatches: true });
  repo.destinations.push({ id: 'dw', message_id: 'm1', channel: 'whatsapp', target_type: 'whatsapp_group', target_id: 'g1', allowed: true });
  repo.destinations.push({ id: 'di', message_id: 'm1', channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members', allowed: true });
  repo.drafts.set('m1:whatsapp', { title: null, body: 'Demo Tuesday, Tuesday, December 1 at 6:00 PM CST.' });
  repo.drafts.set('m1:in_app', { title: 'Demo Tuesday', body: '6:00 PM CST' });
  const calls: Record<string, ConnectorDelivery[]> = { whatsapp: [], in_app: [] };
  let waHold: Date | null = at(48 * 3600_000);
  const wa: Connector = {
    channel: 'whatsapp',
    async send(d) { calls.whatsapp.push(d); if (waHold) throw new ConnectorHoldError(waHold, 'whatsapp_paused_by_whatsapp'); return { provider_message_id: 'wa-1', reached: 1, already_done: false }; },
  };
  const inApp: Connector = { channel: 'in_app', async send(d) { calls.in_app.push(d); return { provider_message_id: d.messageId, reached: 3, already_done: false }; } };
  const deps: WorkerDeps = { repo, connector: (c) => (c === 'whatsapp' ? wa : inApp), log: () => undefined };
  return { repo, deps, calls, release: () => { waHold = null; } };
}
const row = (repo: FakeRepo, dest: string) => repo.deliveries.find((d) => d.destination_id === dest)!;

it('a WhatsApp hold (the breaker) waits without spending the try; in-app in the same tick is sent', async () => {
  const s = setup();
  await runDeliveryTick(s.deps, T0);
  expect(row(s.repo, 'di').status).toBe('sent');
  const w = row(s.repo, 'dw');
  expect([w.status, w.attempt_count, w.next_attempt_at, w.error]).toEqual(['pending', 0, at(48 * 3600_000), 'held: whatsapp_paused_by_whatsapp']);
  expect(s.repo.messages.get('m1')!.status).toBe('sending');
});

it('ten holds in a row cost no tries; once WhatsApp allows it, it sends on its first real try', async () => {
  const s = setup();
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await runDeliveryTick(s.deps, at(i * 49 * 3600_000));
    expect(row(s.repo, 'dw').attempt_count).toBe(0);
  }
  s.release();
  await runDeliveryTick(s.deps, at(10 * 49 * 3600_000));
  expect([row(s.repo, 'dw').status, row(s.repo, 'dw').attempt_count]).toEqual(['sent', 1]);
  expect(s.calls.whatsapp).toHaveLength(11);
  expect(s.repo.messages.get('m1')!.status).toBe('sent');
});

it('a WhatsApp delivery for an event that has already started is skipped, never sent late', async () => {
  const s = setup();
  s.release();
  s.repo.destinations.find((d) => d.id === 'dw')!.eventStarted = true;
  await runDeliveryTick(s.deps, T0);
  expect([row(s.repo, 'dw').status, row(s.repo, 'dw').error]).toEqual(['skipped', 'event_already_started']);
  expect(s.calls.whatsapp).toHaveLength(0);
});

it('the WhatsApp connector is handed the media the context carries (the banner)', async () => {
  const s = setup();
  s.release();
  const orig = s.repo.withSendLock.bind(s.repo);
  s.repo.withSendLock = (d, now, decide) => orig(d, now, (ctx) => decide({ ...ctx, media_urls: d.channel === 'whatsapp' ? ['https://enterprise.example/banner.png'] : ctx.media_urls }));
  await runDeliveryTick(s.deps, T0);
  expect(s.calls.whatsapp[0].media_urls).toEqual(['https://enterprise.example/banner.png']);
  expect(s.calls.in_app[0].media_urls).toBeUndefined();
});
