/**
 * campaignSlugService: the consumer `buildCampaignSlug` never had. Every case here is one the
 * T032 live pass hit or would have hit: no slug could be assigned at all (0/44 prod campaigns),
 * so the composer refused every tracked link.
 *
 * The models are stubbed at the module boundary; the taxonomy service is real, because the
 * slug format it produces is the thing a campaign's clicks will join on for good.
 */

const mockCampaignFindByPk = jest.fn();
const mockCampaignFindOne = jest.fn();
const mockBrandFindByPk = jest.fn();
const mockTrackedLinkFindOne = jest.fn();

jest.mock('../../../models', () => ({
  Campaign: { findByPk: (...a: unknown[]) => mockCampaignFindByPk(...a), findOne: (...a: unknown[]) => mockCampaignFindOne(...a) },
  Brand: { findByPk: (...a: unknown[]) => mockBrandFindByPk(...a) },
  TrackedLink: { findOne: (...a: unknown[]) => mockTrackedLinkFindOne(...a) },
}));

import { assignCampaignSlug, assignSlugIfPossible } from '../campaignSlugService';
import { WorkflowError } from '../../content/contentWorkflowService';

interface FakeCampaign {
  id: string;
  name: string;
  objective: string | null;
  brand_id: string | null;
  tenant_id: string | null;
  utm_campaign_slug: string | null;
  created_at: Date;
  update: jest.Mock;
}

function campaign(overrides: Partial<FakeCampaign> = {}): FakeCampaign {
  const c: FakeCampaign = {
    id: 'camp-1',
    name: 'Free AI Class',
    objective: 'awareness',
    brand_id: 'brand-1',
    tenant_id: 'tenant-1',
    utm_campaign_slug: null,
    created_at: new Date('2026-09-11T15:00:00Z'),
    update: jest.fn(),
    ...overrides,
  };
  c.update.mockImplementation(async (values: Partial<FakeCampaign>) => { Object.assign(c, values); return c; });
  return c;
}

beforeEach(() => {
  mockCampaignFindByPk.mockReset();
  mockCampaignFindOne.mockReset().mockResolvedValue(null);
  mockBrandFindByPk.mockReset().mockResolvedValue({ id: 'brand-1', slug: 'colaberry' });
  mockTrackedLinkFindOne.mockReset().mockResolvedValue(null);
});

describe('assignCampaignSlug', () => {
  it('writes the canonical brand-objective-offer-audience-quarter slug from the campaign itself', async () => {
    const c = campaign();
    mockCampaignFindByPk.mockResolvedValue(c);
    const r = await assignCampaignSlug('camp-1');
    expect(r.slug).toBe('colaberry-awareness-free-ai-class-all-2026q3');
    expect(r.unchanged).toBe(false);
    expect(c.update).toHaveBeenCalledWith({ utm_campaign_slug: 'colaberry-awareness-free-ai-class-all-2026q3' });
  });

  it('uses the operator-supplied offer and audience over the defaults', async () => {
    const c = campaign();
    mockCampaignFindByPk.mockResolvedValue(c);
    const r = await assignCampaignSlug('camp-1', { offer: 'Open House', audience: 'Alumni' });
    expect(r.slug).toBe('colaberry-awareness-open-house-alumni-2026q3');
  });

  it('is idempotent: the same call twice reports unchanged and writes nothing the second time', async () => {
    const c = campaign();
    mockCampaignFindByPk.mockResolvedValue(c);
    await assignCampaignSlug('camp-1');
    const again = await assignCampaignSlug('camp-1');
    expect(again.unchanged).toBe(true);
    expect(c.update).toHaveBeenCalledTimes(1);
  });

  it('refuses a campaign with no brand with a 409 the operator can act on', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ brand_id: null }));
    mockBrandFindByPk.mockResolvedValue(null);
    await expect(assignCampaignSlug('camp-1')).rejects.toMatchObject({ status: 409, errorClass: 'BrandRequired' });
  });

  it('404s an unknown campaign', async () => {
    mockCampaignFindByPk.mockResolvedValue(null);
    await expect(assignCampaignSlug('nope')).rejects.toMatchObject({ status: 404, errorClass: 'NotFound' });
  });

  it('turns an unsluggable segment into a 422 rather than a 500', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ name: '!!!' }));
    await expect(assignCampaignSlug('camp-1')).rejects.toMatchObject({ status: 422, errorClass: 'UNSLUGGABLE_SEGMENT' });
  });

  it('freezes the slug once a tracked link for the campaign has been published', async () => {
    const c = campaign({ utm_campaign_slug: 'colaberry-awareness-old-offer-all-2026q2' });
    mockCampaignFindByPk.mockResolvedValue(c);
    mockTrackedLinkFindOne.mockResolvedValue({ published_at: new Date('2026-09-01T00:00:00Z') });
    await expect(assignCampaignSlug('camp-1')).rejects.toMatchObject({ status: 409, errorClass: 'SlugFrozen' });
    expect(c.update).not.toHaveBeenCalled();
  });

  it('still allows a change while nothing is published', async () => {
    const c = campaign({ utm_campaign_slug: 'colaberry-awareness-old-offer-all-2026q2' });
    mockCampaignFindByPk.mockResolvedValue(c);
    const r = await assignCampaignSlug('camp-1');
    expect(r.slug).toBe('colaberry-awareness-free-ai-class-all-2026q3');
  });

  it('suffixes on a tenant collision instead of failing, and scopes the lookup to the tenant', async () => {
    const c = campaign();
    mockCampaignFindByPk.mockResolvedValue(c);
    mockCampaignFindOne
      .mockResolvedValueOnce({ id: 'other-1' }) // base taken
      .mockResolvedValueOnce({ id: 'other-2' }) // -2 taken
      .mockResolvedValueOnce(null);             // -3 free
    const r = await assignCampaignSlug('camp-1');
    expect(r.slug).toBe('colaberry-awareness-free-ai-class-all-2026q3-3');
    const where = mockCampaignFindOne.mock.calls[0][0].where;
    expect(where.tenant_id).toBe('tenant-1');
    expect(where.utm_campaign_slug).toBe('colaberry-awareness-free-ai-class-all-2026q3');
  });
});

describe('assignSlugIfPossible (creation hook)', () => {
  it('returns the slug when the campaign has what it needs', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign());
    await expect(assignSlugIfPossible('camp-1')).resolves.toBe('colaberry-awareness-free-ai-class-all-2026q3');
  });

  it('returns null, not an error, for a brandless campaign so creation still succeeds', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ brand_id: null }));
    mockBrandFindByPk.mockResolvedValue(null);
    await expect(assignSlugIfPossible('camp-1')).resolves.toBeNull();
  });

  it('returns null for an unsluggable name', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ name: '???' }));
    await expect(assignSlugIfPossible('camp-1')).resolves.toBeNull();
  });

  it('does NOT swallow a frozen-slug conflict: that is a real error, not a missing input', async () => {
    mockCampaignFindByPk.mockResolvedValue(campaign({ utm_campaign_slug: 'colaberry-awareness-old-all-2026q2' }));
    mockTrackedLinkFindOne.mockResolvedValue({ published_at: new Date() });
    await expect(assignSlugIfPossible('camp-1')).rejects.toBeInstanceOf(WorkflowError);
  });
});
