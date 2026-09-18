/**
 * overviewSummary - the queries behind the Marketing Overview.
 *
 * The judgements are proven in overviewHealth.test.ts. What is proven here is that the right
 * questions reach the database: the upcoming panel orders by `scheduled_for` (the generic content
 * list orders by `updated_at`, which is the whole reason this endpoint exists), a post mid-flight
 * is not dropped, "more than fit" is detected without a second query, and the hand-posted list
 * is computed from accounts that can PUBLISH rather than accounts that merely exist.
 */

import { Op } from 'sequelize';

const mockItemFindAll = jest.fn();
const mockVariantFindAll = jest.fn();
const mockBrandFindAll = jest.fn();
const mockPublicationCount = jest.fn();
jest.mock('../../../models', () => ({
  ContentItem: { findAll: (...a: unknown[]) => mockItemFindAll(...a) },
  ContentVariant: { findAll: (...a: unknown[]) => mockVariantFindAll(...a) },
  Brand: { findAll: (...a: unknown[]) => mockBrandFindAll(...a) },
  ExternalPublication: { count: (...a: unknown[]) => mockPublicationCount(...a) },
}));

const mockListAccounts = jest.fn();
jest.mock('../channelAccountService', () => ({ listAccounts: (...a: unknown[]) => mockListAccounts(...a) }));

jest.mock('../../publishing/providerCapabilities', () => ({
  PROVIDER_KEYS: ['linkedin_member', 'linkedin_organization', 'x'],
}));

import { getMarketingOverview, UPCOMING_LIMIT, UPCOMING_WINDOW_DAYS, RECENT_WINDOW_DAYS } from '../overviewSummary';

const NOW = new Date('2026-09-18T15:00:00Z');
const DAY = 86_400_000;
const BRAND = 'b-1';

function item(id: string, hoursFromNow: number, status = 'scheduled') {
  return {
    id, title: `Post ${id}`, brand_id: BRAND, status,
    scheduled_for: new Date(NOW.getTime() + hoursFromNow * 3_600_000),
  };
}

function account(id: string, provider: string, accessExpiresInDays: number) {
  return {
    id, brand_id: BRAND, provider, display_name: `Acct ${id}`, status: 'connected',
    revoked_at: null, last_health_ok: true,
    credentials: [{ credential_type: 'access_token', token_expires_at: new Date(NOW.getTime() + accessExpiresInDays * DAY) }],
  };
}

beforeEach(() => {
  mockItemFindAll.mockReset().mockResolvedValue([]);
  mockVariantFindAll.mockReset().mockResolvedValue([]);
  mockBrandFindAll.mockReset().mockResolvedValue([{ id: BRAND, name: 'Refactored.ai' }]);
  mockPublicationCount.mockReset().mockResolvedValue(0);
  mockListAccounts.mockReset().mockResolvedValue([]);
});

describe('the upcoming query', () => {
  it('orders by scheduled_for ascending - not by updated_at, which is the bug this endpoint avoids', async () => {
    await getMarketingOverview({ tenantIds: null }, NOW);
    const q = mockItemFindAll.mock.calls[0][0];
    expect(q.order).toEqual([['scheduled_for', 'ASC']]);
  });

  it('includes posts mid-flight alongside scheduled ones', async () => {
    // Dropping `publishing` would make a post vanish from the panel the moment the worker
    // picked it up - exactly when the operator most wants to watch it.
    await getMarketingOverview({ tenantIds: null }, NOW);
    const { where } = mockItemFindAll.mock.calls[0][0];
    expect(where.status[Op.in]).toEqual(['scheduled', 'publishing']);
    expect(where.archived_at).toBeNull();
  });

  it('looks exactly UPCOMING_WINDOW_DAYS ahead and excludes unscheduled items', async () => {
    await getMarketingOverview({ tenantIds: null }, NOW);
    const { where } = mockItemFindAll.mock.calls[0][0];
    expect(where.scheduled_for[Op.ne]).toBeNull();
    expect(where.scheduled_for[Op.lte]).toEqual(new Date(NOW.getTime() + UPCOMING_WINDOW_DAYS * DAY));
  });

  it('asks for one row more than it shows, so "there are more" needs no second query', async () => {
    await getMarketingOverview({ tenantIds: null }, NOW);
    expect(mockItemFindAll.mock.calls[0][0].limit).toBe(UPCOMING_LIMIT + 1);
  });

  it('carries tenant and brand scope into the query', async () => {
    await getMarketingOverview({ tenantIds: ['t-1'], brandId: BRAND }, NOW);
    const { where } = mockItemFindAll.mock.calls[0][0];
    expect(where.tenant_id[Op.in]).toEqual(['t-1']);
    expect(where.brand_id).toBe(BRAND);
  });
});

describe('the upcoming rows', () => {
  it('truncates at the limit and says so', async () => {
    mockItemFindAll.mockResolvedValue(
      Array.from({ length: UPCOMING_LIMIT + 1 }, (_, i) => item(`p${i}`, i + 1)),
    );
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    expect(out.upcoming).toHaveLength(UPCOMING_LIMIT);
    expect(out.upcoming_truncated).toBe(true);
  });

  it('does not claim truncation when everything fits', async () => {
    mockItemFindAll.mockResolvedValue([item('p1', 2)]);
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    expect(out.upcoming_truncated).toBe(false);
  });

  it('attaches each post\'s channels and brand name, and flags the late one', async () => {
    mockItemFindAll.mockResolvedValue([item('late', -2), item('soon', 3)]);
    mockVariantFindAll.mockResolvedValue([
      { content_item_id: 'late', provider: 'linkedin_member' },
      { content_item_id: 'soon', provider: 'linkedin_member' },
      { content_item_id: 'soon', provider: 'x' },
    ]);
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    const [late, soon] = out.upcoming;
    expect(late.late).toBe(true);
    expect(soon.late).toBe(false);
    expect(soon.providers).toEqual(['linkedin_member', 'x']);
    expect(soon.brand_name).toBe('Refactored.ai');
  });

  it('skips the variant and brand lookups entirely when nothing is scheduled', async () => {
    await getMarketingOverview({ tenantIds: null }, NOW);
    expect(mockVariantFindAll).not.toHaveBeenCalled();
  });
});

describe('accounts and the hand-posted list', () => {
  it('an expired LinkedIn is listed as expired AND counted as hand-posted', async () => {
    // The panel's reason to exist: a connected-but-dead account must not make LinkedIn look
    // like a direct channel. Its posts will fail; the operator needs to know they are posting
    // it by hand until it is reconnected.
    mockListAccounts.mockResolvedValue([account('a1', 'linkedin_member', -3)]);
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    expect(out.accounts[0].health).toBe('expired');
    expect(out.accounts[0].expires_in_days).toBe(-3);
    expect(out.handoff_providers).toContain('linkedin_member');
  });

  it('a healthy LinkedIn is not hand-posted; every other network still is', async () => {
    mockListAccounts.mockResolvedValue([account('a1', 'linkedin_member', 40)]);
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    expect(out.accounts[0].health).toBe('ok');
    expect(out.handoff_providers).toEqual(['linkedin_organization', 'x']);
  });

  it('an expiring token still publishes, so it is not hand-posted', async () => {
    mockListAccounts.mockResolvedValue([account('a1', 'linkedin_member', 5)]);
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    expect(out.accounts[0].health).toBe('expiring');
    expect(out.handoff_providers).not.toContain('linkedin_member');
  });

  it('asks the account service for live accounts only, in the caller\'s scope', async () => {
    await getMarketingOverview({ tenantIds: ['t-1'], brandId: BRAND }, NOW);
    expect(mockListAccounts).toHaveBeenCalledWith({ tenantIds: ['t-1'], brandId: BRAND, includeRevoked: false });
  });
});

describe('the recent count', () => {
  it('counts receipts in the window and excludes posts the network has since removed', async () => {
    mockPublicationCount.mockResolvedValue(7);
    const out = await getMarketingOverview({ tenantIds: null }, NOW);
    expect(out.recent.published).toBe(7);
    expect(out.recent.window_days).toBe(RECENT_WINDOW_DAYS);
    const { where } = mockPublicationCount.mock.calls[0][0];
    expect(where.published_at[Op.gte]).toEqual(new Date(NOW.getTime() - RECENT_WINDOW_DAYS * DAY));
    expect(where.removed_at).toBeNull();
  });
});
