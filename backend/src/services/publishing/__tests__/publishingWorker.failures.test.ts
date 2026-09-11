/**
 * The BREAK list for the worker, each with the HARDEN it landed with:
 *
 *   - a permanent provider error (validation / permission) is NOT retried: it dead-letters
 *     on the first attempt with its reason;
 *   - a transient error backs off with jitter and dead-letters only after max_attempts;
 *   - one variant failing while another succeeds leaves the item partially_published;
 *   - a handoff provider yields a handoff_pending publication that only a person can
 *     complete, and completing it replaces the placeholder id and refuses a duplicate;
 *   - manual retry returns a dead-lettered job to the queue; manual cancel is terminal.
 */

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('./fakeModels');
  return makeFakeModelSet();
});
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn(async () => false) }));

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from './fakeModels';
import { DryRunAdapter } from '../dryRunAdapter';
import { HandoffAdapter } from '../handoffAdapter';
import { makeAdapterFactory, NoLiveAdapterError } from '../adapterRegistry';
import { runDueJobs } from '../publishingWorker';
import { cancelJob, completeHandoff, retryJob } from '../publishingReceiptService';
import { ProviderPublishError, type SocialProviderAdapter } from '../socialProviderAdapter';
import type { ProviderKey } from '../providerCapabilities';

const models = mockedModels as unknown as FakeModelSet;
const NOW = new Date('2026-11-03T15:00:30Z');
const OCC = '2026-11-03T15:00:00.000Z';
const ACTOR = { adminId: 'a-ali', email: 'ali@colaberry.com' };

let logSpy: jest.SpyInstance;
beforeEach(() => {
  resetAll(models);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

async function seedScheduled(providers: ProviderKey[]): Promise<string> {
  const item = await models.ContentItem.create({ tenant_id: 't-1', brand_id: 'b-1', title: 'Post', canonical_body: 'Hello world', content_type: 'text', status: 'scheduled', revision: 1, scheduled_for: new Date(OCC) });
  for (const p of providers) {
    const v = await models.ContentVariant.create({ content_item_id: item.id, provider: p, body: `Hello from ${p}` });
    await models.PublishingJob.create({
      tenant_id: 't-1', brand_id: 'b-1', content_item_id: item.id, content_variant_id: v.id, provider: p,
      publish_at: new Date(OCC), scheduled_occurrence: OCC, content_revision: 1, idempotency_key: `${item.id}:${v.id}:1:${OCC}`,
    });
  }
  return item.id;
}

function factoryOf(map: Partial<Record<ProviderKey, SocialProviderAdapter>>) {
  return (p: ProviderKey) => {
    const a = map[p];
    if (!a) throw new NoLiveAdapterError(p);
    return a;
  };
}

const tick = (adapterFor: (p: ProviderKey) => SocialProviderAdapter, now: Date = NOW, random = () => 0.5) =>
  runDueJobs({ now: () => now, killSwitch: async () => false, adapterFor, workerId: 'w', random });

describe('permanent failures are not retried', () => {
  it('a permanent ProviderPublishError dead-letters on the first attempt with its reason', async () => {
    const itemId = await seedScheduled(['x']);
    const x = new DryRunAdapter('x', () => NOW);
    x.failNextPublishWith(new ProviderPublishError('Insufficient permissions for this page.', true, 'permission_denied', 403));
    const r = await tick(factoryOf({ x }));
    expect(r).toMatchObject({ failed: 1, retried: 0, published: 0 });
    const job = models.PublishingJob.rows[0];
    expect(job.state).toBe('failed');
    expect(job.attempts).toBe(1);
    expect(job.dead_lettered_at).toEqual(NOW);
    expect(job.dead_letter_reason).toBe('permanent: permission_denied');
    expect(job.last_error).toBe('Insufficient permissions for this page.');
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('publish_failed');
    // A later tick does not touch it: it is dead-lettered, not due.
    const again = await tick(factoryOf({ x }), new Date(NOW.getTime() + 3_600_000));
    expect(again.claimed).toBe(0);
  });

  it('a permanent VALIDATION verdict from the adapter does the same, without calling publish', async () => {
    await seedScheduled(['x']);
    const x = new DryRunAdapter('x', () => NOW);
    await models.ContentVariant.rows[0].update({ body: 'a'.repeat(281) });
    const r = await tick(factoryOf({ x }));
    expect(r.failed).toBe(1);
    expect(x.calls).toHaveLength(0);
    expect(models.PublishingJob.rows[0].last_error_class).toBe('ProviderValidationError');
    expect(models.PlatformDeliveryEvent.rows.map((e) => e.event_type)).toEqual(['publish_attempt', 'publish_failed_permanent']);
  });

  it('a provider with no live adapter is a permanent failure with a reason a human can act on', async () => {
    await seedScheduled(['x']);
    const r = await tick(factoryOf({}));
    expect(r.failed).toBe(1);
    expect(models.PublishingJob.rows[0].dead_letter_reason).toBe('permanent: no_live_adapter');
  });
});

describe('transient failures back off, then dead-letter', () => {
  it('first transient failure: retrying, next_retry_at in the future with jitter applied, attempt counted', async () => {
    await seedScheduled(['x']);
    const x = new DryRunAdapter('x', () => NOW);
    x.failNextPublishWith(new ProviderPublishError('502 Bad Gateway', false, 'upstream', 502));
    const r = await tick(factoryOf({ x }), NOW, () => 0); // jitter floor -> exactly 50% of 60s
    expect(r.retried).toBe(1);
    const job = models.PublishingJob.rows[0];
    expect(job.state).toBe('retrying');
    expect(job.attempts).toBe(1);
    expect(job.next_retry_at).toEqual(new Date(NOW.getTime() + 30_000));
    expect(job.dead_lettered_at).toBeNull();
  });

  it('is not picked up again before next_retry_at, and IS after it', async () => {
    await seedScheduled(['x']);
    const x = new DryRunAdapter('x', () => NOW);
    x.failNextPublishWith(new Error('socket hang up'));
    await tick(factoryOf({ x }), NOW, () => 0);
    const tooSoon = await tick(factoryOf({ x }), new Date(NOW.getTime() + 10_000));
    expect(tooSoon.claimed).toBe(0);
    const inTime = await tick(factoryOf({ x }), new Date(NOW.getTime() + 31_000));
    expect(inTime.published).toBe(1);
    expect(models.PublishingJob.rows[0].attempts).toBe(1); // a success does not add an attempt
  });

  it('dead-letters after max_attempts transient failures, with the exhausted count in the reason', async () => {
    await seedScheduled(['x']);
    const x = new DryRunAdapter('x', () => NOW);
    let t = NOW;
    for (let i = 0; i < 3; i += 1) {
      x.failNextPublishWith(new Error('timeout'));
      await tick(factoryOf({ x }), t, () => 0);
      t = new Date(t.getTime() + 6 * 3_600_000 + 1000);
    }
    const job = models.PublishingJob.rows[0];
    expect(job.state).toBe('dead_lettered');
    expect(job.attempts).toBe(3);
    expect(job.dead_letter_reason).toBe('exhausted 3 attempts: Error');
  });
});

describe('an item with mixed outcomes', () => {
  it('is partially_published when one variant lands and another dead-letters', async () => {
    const itemId = await seedScheduled(['linkedin_organization', 'x']);
    const li = new DryRunAdapter('linkedin_organization', () => NOW);
    const x = new DryRunAdapter('x', () => NOW);
    x.failNextPublishWith(new ProviderPublishError('Duplicate content.', true, 'duplicate'));
    const r = await tick(factoryOf({ linkedin_organization: li, x }));
    expect(r).toMatchObject({ published: 1, failed: 1 });
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('partially_published');
  });

  it('stays publishing while a sibling is still retrying, then settles', async () => {
    const itemId = await seedScheduled(['linkedin_organization', 'x']);
    const li = new DryRunAdapter('linkedin_organization', () => NOW);
    const x = new DryRunAdapter('x', () => NOW);
    x.failNextPublishWith(new Error('503'));
    await tick(factoryOf({ linkedin_organization: li, x }), NOW, () => 0);
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('publishing');
    await tick(factoryOf({ linkedin_organization: li, x }), new Date(NOW.getTime() + 60_000));
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('published');
  });
});

describe('handoff: a receipt a person completes', () => {
  it('the live transport resolves every provider to Handoff today, and a job yields handoff_pending', async () => {
    const itemId = await seedScheduled(['meta_instagram']);
    const factory = makeAdapterFactory('live', () => NOW);
    expect(factory('meta_instagram')).toBeInstanceOf(HandoffAdapter);
    const r = await tick(factory);
    expect(r.published).toBe(1);
    const pub = models.ExternalPublication.rows[0];
    expect(pub.current_status).toBe('handoff_pending');
    expect(pub.external_id).toMatch(/^handoff:meta_instagram:/);
    expect(pub.published_at).toBeNull();
    expect(pub.metadata.handoff.text).toBe('Hello from meta_instagram');
    expect(pub.metadata.handoff.instructions).toMatch(/Paste the text exactly/);
    expect(pub.metadata.handoff.reasons.length).toBeGreaterThan(0);
    // The job is done but the post is not live: the item stays publishing until a person
    // completes the handoff.
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('publishing');
  });

  it('completing the handoff replaces the placeholder id and goes live; the placeholder is refused as an id', async () => {
    const itemId = await seedScheduled(['meta_instagram']);
    await tick(makeAdapterFactory('live', () => NOW));
    const pub = models.ExternalPublication.rows[0];
    await expect(completeHandoff(pub.id, { externalId: pub.external_id, permalink: null }, ACTOR)).rejects.toMatchObject({ errorClass: 'ValidationError' });
    const done = await completeHandoff(pub.id, { externalId: '17895695668004550', permalink: 'https://www.instagram.com/p/abc/' }, ACTOR);
    expect(done.current_status).toBe('live');
    expect(done.external_id).toBe('17895695668004550');
    expect(done.metadata.placeholder_external_id).toMatch(/^handoff:/);
    expect(done.metadata.handoff_completed_by).toBe('ali@colaberry.com');
    expect(models.PlatformDeliveryEvent.rows.some((e) => e.event_type === 'handoff_completed')).toBe(true);
    // And only now is the item published.
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('published');
    await expect(completeHandoff(pub.id, { externalId: 'again', permalink: null }, ACTOR)).rejects.toMatchObject({ errorClass: 'NotHandoffPending' });
  });

  it('two handoffs cannot be completed with the same real id', async () => {
    await seedScheduled(['meta_instagram']);
    await seedScheduled(['meta_instagram']);
    await tick(makeAdapterFactory('live', () => NOW));
    const [a, b] = models.ExternalPublication.rows;
    await completeHandoff(a.id, { externalId: 'real-1', permalink: null }, ACTOR);
    await expect(completeHandoff(b.id, { externalId: 'real-1', permalink: null }, ACTOR)).rejects.toMatchObject({ errorClass: 'DuplicateExternalId' });
  });
});

describe('manual retry and cancel', () => {
  it('retry returns a dead-lettered job to pending with one more attempt allowed', async () => {
    await seedScheduled(['x']);
    const x = new DryRunAdapter('x', () => NOW);
    x.failNextPublishWith(new ProviderPublishError('nope', true, 'permission_denied'));
    await tick(factoryOf({ x }));
    const job = await retryJob(models.PublishingJob.rows[0].id, ACTOR);
    expect(job.state).toBe('pending');
    expect(job.dead_lettered_at).toBeNull();
    expect(job.max_attempts).toBe(3);
    const r = await tick(factoryOf({ x }));
    expect(r.published).toBe(1);
  });

  it('retry refuses a job that is not failed or dead-lettered; cancel refuses a published one', async () => {
    await seedScheduled(['x']);
    const id = models.PublishingJob.rows[0].id;
    await expect(retryJob(id, ACTOR)).rejects.toMatchObject({ errorClass: 'NotRetryable' });
    const cancelled = await cancelJob(id, ACTOR, 'wrong week');
    expect(cancelled.state).toBe('cancelled');
    expect(models.PlatformDeliveryEvent.rows.at(-1)!.message).toBe('Cancelled by ali@colaberry.com: wrong week.');
    await expect(cancelJob(id, ACTOR, null)).rejects.toMatchObject({ errorClass: 'NotCancellable' });
  });
});

describe('logging', () => {
  it('every worker log line is JSON with a correlation id when a job is involved', async () => {
    await seedScheduled(['x']);
    await tick(factoryOf({ x: new DryRunAdapter('x', () => NOW) }));
    const lines = logSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.service).toBe('publishing-worker');
      expect(typeof l.event).toBe('string');
    }
    expect(lines.some((l) => l.event === 'job_published' && l.correlation_id === models.PublishingJob.rows[0].id)).toBe(true);
  });
});
