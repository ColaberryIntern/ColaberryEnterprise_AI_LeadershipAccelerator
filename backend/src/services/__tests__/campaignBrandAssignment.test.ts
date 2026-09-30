/**
 * Contract tests for brand assignment on campaign create/update.
 *
 * Models are mocked: CI runs with no DATABASE_URL, and a suite that touched
 * Sequelize would fail environmentally and end up excluded from the gate.
 */

jest.mock('../../models/Brand', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../../models/SenderProfile', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import Brand from '../../models/Brand';
import SenderProfile from '../../models/SenderProfile';
import {
  InvalidBrandError,
  listAssignableBrands,
  resolveCampaignBrand,
} from '../campaignBrandAssignment';

const brandFindOne = (Brand as any).findOne as jest.Mock;
const brandFindAll = (Brand as any).findAll as jest.Mock;
const senderFindOne = (SenderProfile as any).findOne as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  brandFindOne.mockResolvedValue(null);
  brandFindAll.mockResolvedValue([]);
  senderFindOne.mockResolvedValue(null);
});

describe('resolveCampaignBrand — precedence', () => {
  it('uses an explicit brand and carries its tenant', async () => {
    brandFindOne.mockResolvedValue({ id: 'b1', tenant_id: 't1', status: 'active' });
    const out = await resolveCampaignBrand({ brandId: 'b1' });
    expect(out).toEqual({ brand_id: 'b1', tenant_id: 't1', resolved_from: 'explicit' });
    // An explicit choice is not second-guessed against the sender profile.
    expect(senderFindOne).not.toHaveBeenCalled();
  });

  it('falls back to the brand the campaign will send as', async () => {
    senderFindOne.mockResolvedValue({ id: 'sp1', brand_id: 'b2', tenant_id: 't2' });
    const out = await resolveCampaignBrand({ senderProfileId: 'sp1' });
    expect(out).toEqual({ brand_id: 'b2', tenant_id: 't2', resolved_from: 'sender_profile' });
  });

  it('returns NULL rather than guessing when nothing identifies a brand', async () => {
    const out = await resolveCampaignBrand({});
    expect(out).toEqual({ brand_id: null, tenant_id: null, resolved_from: 'none' });
  });

  it('treats blank and whitespace ids as absent', async () => {
    expect((await resolveCampaignBrand({ brandId: '   ' })).resolved_from).toBe('none');
    expect((await resolveCampaignBrand({ brandId: null })).resolved_from).toBe('none');
  });
});

describe('resolveCampaignBrand — validation', () => {
  it('rejects a brand id that names nothing', async () => {
    brandFindOne.mockResolvedValue(null);
    await expect(resolveCampaignBrand({ brandId: 'ghost' })).rejects.toBeInstanceOf(InvalidBrandError);
  });

  it('rejects an inactive brand', async () => {
    // Starting new outreach under a retired identity is exactly what this stops.
    brandFindOne.mockResolvedValue({ id: 'b9', tenant_id: 't1', status: 'inactive' });
    await expect(resolveCampaignBrand({ brandId: 'b9' })).rejects.toBeInstanceOf(InvalidBrandError);
  });

  it('names the offending id so the 400 is actionable', async () => {
    brandFindOne.mockResolvedValue(null);
    await expect(resolveCampaignBrand({ brandId: 'ghost' })).rejects.toThrow(/ghost/);
  });

  it('tags the error for structured logging', async () => {
    brandFindOne.mockResolvedValue(null);
    const err = await resolveCampaignBrand({ brandId: 'ghost' }).catch((e) => e);
    expect(err.error_class).toBe('ValidationError');
  });

  it('does NOT validate the sender-profile brand into an error', async () => {
    // An explicit id is the caller's claim and must be right. A sender profile is
    // inference, so failing to resolve it means "no brand", not "bad request".
    senderFindOne.mockResolvedValue({ id: 'sp1', brand_id: null, tenant_id: 't1' });
    await expect(resolveCampaignBrand({ senderProfileId: 'sp1' })).resolves.toMatchObject({
      brand_id: null,
      resolved_from: 'none',
    });
  });
});

describe('resolveCampaignBrand — failure posture', () => {
  it('still creates an unattributed campaign when the sender lookup fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    senderFindOne.mockRejectedValue(Object.assign(new Error('down'), { name: 'TimeoutError' }));

    const out = await resolveCampaignBrand({ senderProfileId: 'sp1' });
    expect(out.brand_id).toBeNull();
    // Logged, not swallowed — with the error class, so the failure is traceable.
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('TimeoutError');
    warn.mockRestore();
  });

  it('lets an explicit-brand lookup failure surface rather than silently unattributing', async () => {
    // If the caller named a brand and we cannot check it, writing NULL would
    // quietly ignore what they asked for.
    brandFindOne.mockRejectedValue(new Error('db down'));
    await expect(resolveCampaignBrand({ brandId: 'b1' })).rejects.toThrow('db down');
  });
});

describe('listAssignableBrands', () => {
  it('offers active brands only, ordered by name', async () => {
    brandFindAll.mockResolvedValue([
      { id: 'b1', slug: 'ai-flotation', name: 'AI Flotation', tenant_id: 't2' },
      { id: 'b2', slug: 'colaberry-enterprise', name: 'Colaberry Enterprise', tenant_id: 't1' },
    ]);
    const out = await listAssignableBrands();
    expect(out).toHaveLength(2);
    expect(brandFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'active' },
        order: [['name', 'ASC']],
      }),
    );
  });

  it('returns an empty list rather than throwing when there are no brands', async () => {
    brandFindAll.mockResolvedValue([]);
    await expect(listAssignableBrands()).resolves.toEqual([]);
  });
});
