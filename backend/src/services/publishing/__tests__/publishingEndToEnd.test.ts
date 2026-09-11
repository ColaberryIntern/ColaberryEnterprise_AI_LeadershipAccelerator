/**
 * End to end, dry-run only: compose -> validate -> send for approval -> approve -> schedule
 * -> worker tick -> receipt. Every service on that path is REAL; only persistence is the
 * in-memory fake in ./fakeModels, and the only adapter is DryRunAdapter.
 *
 * Then the two properties the task exists to prove:
 *   - running the worker again publishes nothing twice (idempotent by construction);
 *   - an active kill switch prevents the queued external action - before any claim, and
 *     again if it trips between claiming a job and calling the adapter.
 */

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('./fakeModels');
  return makeFakeModelSet();
});
jest.mock('../../../models/BrandGovernanceRule', () => {
  const models = require('../../../models');
  return { __esModule: true, default: models.BrandGovernanceRule };
});
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn(async () => false) }));

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from './fakeModels';
import { generateItemVariants, validateItem } from '../../content/composerService';
import { schedule, sendForApproval } from '../../content/composerActionService';
import { decideApproval } from '../../content/contentApprovalService';
import { DryRunAdapter } from '../dryRunAdapter';
import { runDueJobs } from '../publishingWorker';
import type { ProviderKey } from '../providerCapabilities';

const models = mockedModels as unknown as FakeModelSet;

const T0 = new Date('2026-11-01T12:00:00Z');
const WHEN = new Date('2026-11-03T15:00:00Z');
const AFTER = new Date('2026-11-03T15:00:30Z');
const AUTHOR = { adminId: 'a-sohail', email: 'sohail@colaberry.com' };
const REVIEWER = { adminId: 'a-ali', email: 'ali@colaberry.com' };

function adapters() {
  const made = new Map<ProviderKey, DryRunAdapter>();
  const factory = (p: ProviderKey) => {
    let a = made.get(p);
    if (!a) { a = new DryRunAdapter(p, () => AFTER); made.set(p, a); }
    return a;
  };
  return { factory, made };
}

async function compose(): Promise<string> {
  const brand = await models.Brand.create({ tenant_id: 't-1', slug: 'colaberry', name: 'Colaberry', status: 'active', timezone: 'America/Chicago' });
  const campaign = await models.Campaign.create({ tenant_id: 't-1', brand_id: brand.id, name: 'Nov Open House', utm_campaign_slug: 'colaberry-awareness-2026-11' });
  const item = await models.ContentItem.create({
    tenant_id: 't-1', brand_id: brand.id, campaign_id: campaign.id, title: 'Free AI class',
    canonical_body: 'Join our free AI class this Thursday at 6pm CT.', content_type: 'text', status: 'draft', revision: 1,
  });
  await generateItemVariants(item.id, ['linkedin_organization', 'x']);
  const v = await validateItem(item.id);
  expect(v.ok).toBe(true);
  return item.id;
}

async function approveAndSchedule(itemId: string): Promise<void> {
  const sent = await sendForApproval(itemId, AUTHOR);
  expect(sent.item.status).toBe('ready_for_review');
  expect(sent.approvalRequestId).not.toBeNull();

  const decided = await decideApproval(itemId, 'approved', REVIEWER, 'Looks good.');
  expect(decided.item.status).toBe('approved');
  expect(decided.item.human_approved).toBe(true);
  expect(models.ContentApprovalEvent.rows.map((e) => e.event_type)).toEqual(['approved']);

  const scheduled = await schedule(itemId, WHEN, T0);
  expect(scheduled.item.status).toBe('scheduled');
  expect(scheduled.jobs.map((j) => j.provider)).toEqual(['linkedin_organization', 'x']);
  expect(scheduled.jobs.every((j) => j.created)).toBe(true);
}

beforeEach(() => { resetAll(models); });

describe('compose -> approval -> scheduled job -> receipt, dry-run adapter only', () => {
  it('produces one receipt per variant, an event trail, and a published item', async () => {
    const itemId = await compose();
    await approveAndSchedule(itemId);

    // Not due yet: a tick before publish_at does nothing at all.
    const early = await runDueJobs({ now: () => T0, killSwitch: async () => false, adapterFor: adapters().factory, workerId: 'w-1' });
    expect(early).toMatchObject({ halted: false, claimed: 0, published: 0 });
    expect(models.ExternalPublication.rows).toHaveLength(0);

    const { factory, made } = adapters();
    const result = await runDueJobs({ now: () => AFTER, killSwitch: async () => false, adapterFor: factory, workerId: 'w-1' });
    expect(result).toEqual({ halted: false, haltReason: null, claimed: 2, published: 2, failed: 0, retried: 0, deadLettered: 0, skipped: 0 });

    // The receipts.
    const pubs = models.ExternalPublication.rows;
    expect(pubs).toHaveLength(2);
    expect(pubs.map((p) => p.provider).sort()).toEqual(['linkedin_organization', 'x']);
    for (const p of pubs) {
      expect(p.external_id).toMatch(/^dryrun:/);
      expect(p.current_status).toBe('live');
      expect(p.metadata.mode).toBe('dry_run');
      expect(p.content_item_id).toBe(itemId);
    }

    // The adapter received exactly what the variants said, with the job's idempotency key.
    const li = made.get('linkedin_organization')!;
    expect(li.calls).toHaveLength(1);
    expect(li.calls[0].payload.text).toBe(models.ContentVariant.rows.find((v) => v.provider === 'linkedin_organization')!.body);
    expect(li.calls[0].idempotencyKey).toBe(models.PublishingJob.rows.find((j) => j.provider === 'linkedin_organization')!.idempotency_key);

    // Jobs and item settled.
    expect(models.PublishingJob.rows.map((j) => j.state)).toEqual(['published', 'published']);
    const item = await models.ContentItem.findByPk(itemId);
    expect(item!.status).toBe('published');
    expect(item!.published_at).toEqual(AFTER);

    // The trail: request + response per job, and nothing that looks like a token.
    const events = models.PlatformDeliveryEvent.rows;
    expect(events.filter((e) => e.event_type === 'publish_attempt')).toHaveLength(2);
    expect(events.filter((e) => e.event_type === 'publish_recorded')).toHaveLength(2);
    expect(JSON.stringify(events)).not.toMatch(/token|secret|authorization/i);
  });

  it('a second tick publishes nothing twice', async () => {
    const itemId = await compose();
    await approveAndSchedule(itemId);
    const { factory, made } = adapters();
    await runDueJobs({ now: () => AFTER, killSwitch: async () => false, adapterFor: factory, workerId: 'w-1' });
    const again = await runDueJobs({ now: () => new Date(AFTER.getTime() + 60_000), killSwitch: async () => false, adapterFor: factory, workerId: 'w-1' });
    expect(again).toMatchObject({ claimed: 0, published: 0 });
    expect(models.ExternalPublication.rows).toHaveLength(2);
    expect(made.get('x')!.calls).toHaveLength(1);
  });

  it('a re-run of a job that already produced its external id reconciles to the existing row', async () => {
    // Simulates the ambiguous-timeout case: the adapter DID publish, the job was never marked.
    const itemId = await compose();
    await approveAndSchedule(itemId);
    const { factory, made } = adapters();
    await runDueJobs({ now: () => AFTER, killSwitch: async () => false, adapterFor: factory, workerId: 'w-1' });
    const job = models.PublishingJob.rows[0];
    await job.update({ state: 'pending' }); // pretend the success write was lost
    const r = await runDueJobs({ now: () => AFTER, killSwitch: async () => false, adapterFor: factory, workerId: 'w-2' });
    expect(r.published).toBe(1);
    expect(models.ExternalPublication.rows).toHaveLength(2); // no third row
    expect(made.get(job.provider as ProviderKey)!.calls).toHaveLength(2); // asked twice, same id both times
    expect(models.PlatformDeliveryEvent.rows.some((e) => e.event_type === 'publish_reconciled_existing')).toBe(true);
  });
});

describe('an active kill switch prevents the queued external action', () => {
  it('before any claim: nothing is claimed, nothing is called, jobs stay pending', async () => {
    const itemId = await compose();
    await approveAndSchedule(itemId);
    const { factory, made } = adapters();
    const r = await runDueJobs({ now: () => AFTER, killSwitch: async () => true, adapterFor: factory, workerId: 'w-1' });
    expect(r).toMatchObject({ halted: true, haltReason: 'kill_switch_active', claimed: 0, published: 0 });
    expect(models.PublishingJob.rows.map((j) => j.state)).toEqual(['pending', 'pending']);
    expect(models.PublishingJob.rows.every((j) => j.attempts === 0 && j.claimed_by === null)).toBe(true);
    expect(made.size).toBe(0);
    expect(models.ExternalPublication.rows).toHaveLength(0);
    expect((await models.ContentItem.findByPk(itemId))!.status).toBe('scheduled');
  });

  it('tripped between the claim and the call: the claim is released and no adapter is invoked', async () => {
    const itemId = await compose();
    await approveAndSchedule(itemId);
    const { factory, made } = adapters();
    let checks = 0;
    const flipsAfterFirstCheck = async () => { checks += 1; return checks > 1; };
    const r = await runDueJobs({ now: () => AFTER, killSwitch: flipsAfterFirstCheck, adapterFor: factory, workerId: 'w-1' });
    expect(r.halted).toBe(true);
    expect(r.published).toBe(0);
    expect(models.PublishingJob.rows.map((j) => j.state)).toEqual(['pending', 'pending']);
    expect(models.PublishingJob.rows.every((j) => j.claimed_by === null && j.attempts === 0)).toBe(true);
    expect(made.size).toBe(0);
    // And a later tick with the switch off publishes them normally - a pause cost nothing.
    const later = await runDueJobs({ now: () => AFTER, killSwitch: async () => false, adapterFor: factory, workerId: 'w-1' });
    expect(later.published).toBe(2);
  });
});
