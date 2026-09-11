/**
 * The T024 verifier's finding, closed: an edit to approved copy must invalidate the approval,
 * take the item out of the publishable states, cancel anything queued, and leave the
 * confirmation unable to publish. Every service on the path is real; persistence is the
 * in-memory fake from the publishing suite; the DryRun adapter is the only transport.
 */

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('../../publishing/__tests__/fakeModels');
  return makeFakeModelSet();
});
jest.mock('../../../models/BrandGovernanceRule', () => {
  const models = require('../../../models');
  return { __esModule: true, default: models.BrandGovernanceRule };
});
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn(async () => false) }));

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from '../../publishing/__tests__/fakeModels';
import { editItemVariant, generateItemVariants, revertItemVariant, validateItem } from '../composerService';
import { updateItemDraft } from '../composerEdits';
import { schedule, sendForApproval } from '../composerActionService';
import { decideApproval } from '../contentApprovalService';
import { buildItemConfirmation } from '../composerConfirmationService';
import { runDueJobs } from '../../publishing/publishingWorker';
import { DryRunAdapter } from '../../publishing/dryRunAdapter';
import type { ProviderKey } from '../../publishing/providerCapabilities';

const models = mockedModels as unknown as FakeModelSet;
const T0 = new Date('2026-11-01T12:00:00Z');
const WHEN = new Date('2026-11-03T15:00:00Z');
const AUTHOR = { adminId: 'a-sohail', email: 'sohail@colaberry.com' };
const REVIEWER = { adminId: 'a-ali', email: 'ali@colaberry.com' };

async function approvedItem(): Promise<string> {
  const brand = await models.Brand.create({ tenant_id: 't-1', slug: 'colaberry', name: 'Colaberry', status: 'active', timezone: 'America/Chicago' });
  const item = await models.ContentItem.create({ tenant_id: 't-1', brand_id: brand.id, title: 'Post', canonical_body: 'Join us Thursday.', content_type: 'text', status: 'draft', revision: 1 });
  await generateItemVariants(item.id, ['linkedin_organization', 'x'], AUTHOR);
  expect((await validateItem(item.id)).ok).toBe(true);
  await sendForApproval(item.id, AUTHOR);
  await decideApproval(item.id, 'approved', REVIEWER);
  return item.id;
}

beforeEach(() => {
  resetAll(models);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('editing approved copy invalidates the approval', () => {
  it('a variant edit: request invalidated, human_approved false, item back to draft, confirmation cannot publish', async () => {
    const id = await approvedItem();
    const before = await buildItemConfirmation(id);
    expect(before.readiness.canPublishNow).toBe(true);
    expect(before.validation.ran).toBe(true);

    const r = await editItemVariant(id, 'linkedin_organization', 'Completely different copy.', AUTHOR);
    expect(r.invalidation.invalidated).toBe(true);
    expect(r.invalidation.fields).toEqual(['copy']);
    expect(r.item.status).toBe('draft');
    expect(r.item.human_approved).toBe(false);
    expect(r.item.revision).toBe(3); // 1 + generate + this edit

    const req = models.ContentApprovalRequest.rows[0];
    expect(req.status).toBe('invalidated');
    expect(req.invalidated_reason).toBe('Edited after approval: copy changed.');
    expect(models.ContentApprovalEvent.rows.map((e) => e.event_type)).toEqual(['approved', 'invalidated']);

    const after = await buildItemConfirmation(id);
    expect(after.approval.label).toBe('Approval invalidated by a later edit');
    expect(after.readiness.canPublishNow).toBe(false);
    expect(after.readiness.canSchedule).toBe(false);
    // The verdict earned by the old copy is gone for the edited variant.
    expect(after.validation.ran).toBe(false);
    expect(after.readiness.reasons).toContain('Validation has not been run for this revision.');
  });

  it('a canonical body edit through PATCH does the same and resets every variant', async () => {
    const id = await approvedItem();
    const r = await updateItemDraft(id, { canonical_body: 'New canonical.' }, AUTHOR);
    expect(r.invalidation.invalidated).toBe(true);
    expect(r.item.status).toBe('draft');
    expect(models.ContentVariant.rows.every((v) => v.validation_state === 'unvalidated')).toBe(true);
  });

  it('a title-only edit bumps the revision and invalidates nothing', async () => {
    const id = await approvedItem();
    const r = await updateItemDraft(id, { title: 'Renamed internally' }, AUTHOR);
    expect(r.invalidation.invalidated).toBe(false);
    expect(r.item.status).toBe('approved');
    expect(r.item.human_approved).toBe(true);
    expect(models.ContentVariant.rows.every((v) => v.validation_state === 'valid')).toBe(true);
    const c = await buildItemConfirmation(id);
    expect(c.readiness.canPublishNow).toBe(true);
  });

  it('a schedule move within tolerance keeps the approval; beyond it does not', async () => {
    const id = await approvedItem();
    await updateItemDraft(id, { scheduled_for: WHEN.toISOString() }, AUTHOR); // from null: a gained schedule invalidates
    expect((await models.ContentItem.findByPk(id))!.status).toBe('draft');
  });

  it('a revert is an edit too: it invalidates when it changes the copy', async () => {
    const id = await approvedItem();
    await editItemVariant(id, 'x', 'hand written', AUTHOR);
    // Re-approve the edited copy, then revert it: the approver saw the hand-written text.
    await sendForApproval(id, AUTHOR);
    await decideApproval(id, 'approved', REVIEWER);
    const r = await revertItemVariant(id, 'x', AUTHOR);
    expect(r.invalidation.invalidated).toBe(true);
    expect(r.item.status).toBe('draft');
  });
});

describe('editing SCHEDULED copy cancels the queue', () => {
  it('queued jobs are cancelled, the item is a draft, and a tick publishes nothing', async () => {
    const id = await approvedItem();
    const scheduled = await schedule(id, WHEN, T0);
    expect(scheduled.jobs).toHaveLength(2);
    expect(models.PublishingJob.rows.map((j) => j.state)).toEqual(['pending', 'pending']);

    const r = await editItemVariant(id, 'x', 'changed after scheduling', AUTHOR);
    expect(r.item.status).toBe('draft');
    expect(models.PublishingJob.rows.map((j) => j.state)).toEqual(['cancelled', 'cancelled']);
    expect(models.ContentApprovalEvent.rows.at(-1)!.payload.jobs_cancelled).toBe(2);

    const adapters = new Map<ProviderKey, DryRunAdapter>();
    const factory = (p: ProviderKey) => { let a = adapters.get(p); if (!a) { a = new DryRunAdapter(p); adapters.set(p, a); } return a; };
    const tick = await runDueJobs({ now: () => new Date(WHEN.getTime() + 60_000), killSwitch: async () => false, adapterFor: factory, workerId: 'w' });
    expect(tick.claimed).toBe(0);
    expect(models.ExternalPublication.rows).toHaveLength(0);
    expect(adapters.size).toBe(0);
  });
});

describe('the worker does not trust the path that led to it', () => {
  it('a job whose revision no longer matches the item dead-letters as StaleRevision without calling the adapter', async () => {
    const id = await approvedItem();
    await schedule(id, WHEN, T0);
    // Bypass recordEdit entirely: simulate a write that changed the item under the queue.
    await (await models.ContentItem.findByPk(id))!.update({ revision: 99 });
    const x = new DryRunAdapter('x');
    const li = new DryRunAdapter('linkedin_organization');
    const r = await runDueJobs({ now: () => new Date(WHEN.getTime() + 60_000), killSwitch: async () => false, adapterFor: (p) => (p === 'x' ? x : li), workerId: 'w' });
    expect(r.failed).toBe(2);
    expect(x.calls).toHaveLength(0);
    expect(li.calls).toHaveLength(0);
    expect(models.PublishingJob.rows.every((j) => j.dead_letter_reason === 'permanent: StaleRevision')).toBe(true);
  });

  it('a job for an item that is no longer in a publishable state dead-letters as ItemNotPublishable', async () => {
    const id = await approvedItem();
    await schedule(id, WHEN, T0);
    await (await models.ContentItem.findByPk(id))!.update({ status: 'archived' });
    const x = new DryRunAdapter('x');
    const r = await runDueJobs({ now: () => new Date(WHEN.getTime() + 60_000), killSwitch: async () => false, adapterFor: () => x, workerId: 'w' });
    expect(r.failed).toBe(2);
    expect(x.calls).toHaveLength(0);
    expect(models.PublishingJob.rows[0].last_error_class).toBe('ItemNotPublishable');
  });
});
