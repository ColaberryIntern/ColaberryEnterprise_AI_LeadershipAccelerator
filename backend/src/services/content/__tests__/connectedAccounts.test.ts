/**
 * A connected account, from the Brands page to the job. With LinkedIn switched ON for this
 * process (the env is set before the registry loads), a scheduled post must carry the brand's
 * account onto its job, the confirmation must name that account, and a brand with no account
 * must be told so at the moment it matters - before scheduling, with the fix.
 */

process.env.LIVE_CONNECTORS = 'linkedin_member';

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
import { generateItemVariants, validateItem } from '../composerService';
import { schedule, sendForApproval } from '../composerActionService';
import { decideApproval } from '../contentApprovalService';
import { buildItemConfirmation } from '../composerConfirmationService';
import { LIVE_CONNECTORS } from '../../publishing/providerCapabilities';
import { resolveAccountFor } from '../../marketing/channelAccountResolver';

const models = mockedModels as unknown as FakeModelSet;
const AUTHOR = { adminId: 'a-sohail', email: 'sohail@colaberry.com' };
const REVIEWER = { adminId: 'a-ali', email: 'ali@colaberry.com' };
const WHEN = new Date('2026-11-03T15:00:00Z');

async function approvedLinkedInPost(): Promise<{ itemId: string; brandId: string }> {
  const brand = await models.Brand.create({ tenant_id: 't-1', slug: 'colaberry', name: 'Colaberry', status: 'active', timezone: 'America/Chicago' });
  const item = await models.ContentItem.create({ tenant_id: 't-1', brand_id: brand.id, title: 'Post', canonical_body: 'Join us Thursday.', content_type: 'text', status: 'draft', revision: 1 });
  await generateItemVariants(item.id, ['linkedin_member', 'x'], AUTHOR);
  expect((await validateItem(item.id)).ok).toBe(true);
  await sendForApproval(item.id, AUTHOR);
  await decideApproval(item.id, 'approved', REVIEWER);
  return { itemId: item.id, brandId: brand.id };
}

function connect(brandId: string, over: Record<string, unknown> = {}) {
  return models.ChannelAccount.create({
    tenant_id: 't-1', brand_id: brandId, owner_member_id: null, provider: 'linkedin_member', provider_account_id: 'abc123',
    display_name: 'Sohail Khan', handle: null, status: 'connected', connected_at: new Date('2026-09-15T20:00:00Z'), ...over,
  });
}

beforeEach(() => {
  resetAll(models);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

it('this process has LinkedIn switched ON from the environment', () => {
  expect([...LIVE_CONNECTORS]).toEqual(['linkedin_member']);
});

describe('with an account connected', () => {
  it('the confirmation names it, and scheduling puts it on the LinkedIn job (X is handoff: no account, no complaint)', async () => {
    const { itemId, brandId } = await approvedLinkedInPost();
    const acct = await connect(brandId);

    const conf = await buildItemConfirmation(itemId);
    const li = conf.accounts.find((a) => a.provider === 'linkedin_member')!;
    expect(li.mode).toBe('direct');
    expect(li.account).toEqual({ id: acct.id, provider: 'linkedin_member', displayName: 'Sohail Khan', handle: null, status: 'connected' });
    expect(conf.accounts.find((a) => a.provider === 'x')!.account).toBeNull();
    expect(conf.readiness.canSchedule).toBe(false); // no time set yet
    expect(conf.readiness.reasons).not.toEqual(expect.arrayContaining([expect.stringMatching(/Connect a/)]));

    const r = await schedule(itemId, WHEN, new Date('2026-11-01T12:00:00Z'));
    const jobs = await models.PublishingJob.findAll({ where: { content_item_id: itemId } });
    expect(r.jobs).toHaveLength(2);
    expect(jobs.find((j) => j.provider === 'linkedin_member')!.channel_account_id).toBe(acct.id);
    expect(jobs.find((j) => j.provider === 'x')!.channel_account_id).toBeNull();
  });

  it('the newest connected account wins; revoked and needs_reconnect ones are skipped', async () => {
    const { brandId } = await approvedLinkedInPost();
    const older = await connect(brandId, { connected_at: new Date('2026-09-01T00:00:00Z'), display_name: 'Old' });
    await connect(brandId, { connected_at: new Date('2026-09-20T00:00:00Z'), display_name: 'Revoked', status: 'revoked', revoked_at: new Date() });
    await connect(brandId, { connected_at: new Date('2026-09-21T00:00:00Z'), display_name: 'Stale', status: 'needs_reconnect' });
    expect((await resolveAccountFor('t-1', brandId, 'linkedin_member'))!.id).toBe(older.id);
    const newer = await connect(brandId, { connected_at: new Date('2026-09-25T00:00:00Z'), display_name: 'New' });
    expect((await resolveAccountFor('t-1', brandId, 'linkedin_member'))!.id).toBe(newer.id);
  });
});

describe('with NO account connected', () => {
  it('the confirmation says so with the fix and will not offer to publish; scheduling is refused with the same fix and creates no job', async () => {
    const { itemId } = await approvedLinkedInPost();

    const conf = await buildItemConfirmation(itemId);
    expect(conf.accounts.find((a) => a.provider === 'linkedin_member')!.account).toBeNull();
    expect(conf.readiness.canPublishNow).toBe(false);
    expect(conf.readiness.reasons).toContain('Connect a LinkedIn (personal profile) account for this brand before publishing.');

    await expect(schedule(itemId, WHEN, new Date('2026-11-01T12:00:00Z'))).rejects.toMatchObject({
      status: 409, errorClass: 'NoConnectedAccount',
      message: expect.stringMatching(/LinkedIn \(personal profile\) publishes directly from a connected account, and this brand has none\. Connect one on the Brands page/),
    });
    expect(await models.PublishingJob.findAll({ where: { content_item_id: itemId } })).toHaveLength(0);
    // And the item is exactly as it was: still approved, no time set - not a half-scheduled post.
    const item = (await models.ContentItem.findByPk(itemId))!;
    expect(item.status).toBe('approved');
    expect(item.scheduled_for).toBeNull();
  });

  it('an account connected to a DIFFERENT brand does not count', async () => {
    const { itemId } = await approvedLinkedInPost();
    const other = await models.Brand.create({ tenant_id: 't-1', slug: 'other', name: 'Other', status: 'active', timezone: 'America/Chicago' });
    await connect(other.id);
    expect((await buildItemConfirmation(itemId)).accounts.find((a) => a.provider === 'linkedin_member')!.account).toBeNull();
  });
});
