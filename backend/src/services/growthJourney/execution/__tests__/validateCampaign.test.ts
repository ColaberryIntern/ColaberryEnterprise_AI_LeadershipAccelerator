const campaignFindOne = jest.fn();
const sequenceFindByPk = jest.fn();
jest.mock('../../../../models', () => ({
  Campaign: { findOne: (...a: unknown[]) => campaignFindOne(...a) },
  FollowUpSequence: { findByPk: (...a: unknown[]) => sequenceFindByPk(...a) },
}));

import { APPROVED_STATUSES, validateCampaign } from '../validateCampaign';

/**
 * T505 — a decision may execute only into a campaign that is registered,
 * present, brand-scoped, approved and sequenced; and for LIMITED, active with an
 * active sequence. One test per refusal, and the two passes.
 */

const T = 't-col';
const B = 'b-trn';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', tenant_id: T, brand_id: B, status: 'active', approval_status: 'approved', sequence_id: 's-1', ...over,
});
const args = (over: Partial<Parameters<typeof validateCampaign>[0]> = {}) =>
  ({ campaignKey: 'explorer_next_lesson', tenantId: T, brandId: B, mode: 'review' as const, ...over });

beforeEach(() => {
  campaignFindOne.mockReset().mockResolvedValue(row());
  sequenceFindByPk.mockReset().mockResolvedValue({ id: 's-1', is_active: true });
});

describe('refusals, each by name', () => {
  it('campaign_not_registered - and the database is never asked', async () => {
    expect(await validateCampaign(args({ campaignKey: 'cold_outbound_q3' }))).toEqual({ ok: false, reason: 'campaign_not_registered' });
    expect(await validateCampaign(args({ campaignKey: null }))).toEqual({ ok: false, reason: 'campaign_not_registered' });
    expect(campaignFindOne).not.toHaveBeenCalled();
  });

  it('campaign_missing - found by settings.campaign_key, never by name', async () => {
    campaignFindOne.mockResolvedValue(null);
    expect(await validateCampaign(args())).toEqual({ ok: false, reason: 'campaign_missing' });
    expect(campaignFindOne).toHaveBeenCalledWith({ where: { settings: { campaign_key: 'explorer_next_lesson' } } });
  });

  it.each([
    ['a NULL tenant (the shipped state of all eight)', { tenant_id: null }],
    ['a NULL brand', { brand_id: null }],
    ['another tenant', { tenant_id: 't-other' }],
    ['another brand', { brand_id: 'b-other' }],
  ])('campaign_not_brand_scoped: %s', async (_label, over) => {
    campaignFindOne.mockResolvedValue(row(over));
    expect(await validateCampaign(args())).toEqual({ ok: false, reason: 'campaign_not_brand_scoped' });
  });

  it.each([['draft'], ['pending_approval'], ['paused'], ['completed'], [null]])('campaign_not_approved: approval_status %s', async (status) => {
    campaignFindOne.mockResolvedValue(row({ approval_status: status }));
    expect(await validateCampaign(args())).toEqual({ ok: false, reason: 'campaign_not_approved' });
    expect(APPROVED_STATUSES).toEqual(['approved', 'live']);
  });

  it('campaign_no_sequence', async () => {
    campaignFindOne.mockResolvedValue(row({ sequence_id: null }));
    expect(await validateCampaign(args())).toEqual({ ok: false, reason: 'campaign_no_sequence' });
  });

  it('LIMITED only: campaign_not_active when the campaign is draft or paused, even though approved', async () => {
    campaignFindOne.mockResolvedValue(row({ status: 'draft' }));
    expect(await validateCampaign(args({ mode: 'limited' }))).toEqual({ ok: false, reason: 'campaign_not_active' });
    campaignFindOne.mockResolvedValue(row({ status: 'paused' }));
    expect(await validateCampaign(args({ mode: 'limited' }))).toEqual({ ok: false, reason: 'campaign_not_active' });
  });

  it('LIMITED only: sequence_inactive - the one gate that actually stops a send today', async () => {
    sequenceFindByPk.mockResolvedValue({ id: 's-1', is_active: false });
    expect(await validateCampaign(args({ mode: 'limited' }))).toEqual({ ok: false, reason: 'sequence_inactive' });
    sequenceFindByPk.mockResolvedValue(null);
    expect(await validateCampaign(args({ mode: 'limited' }))).toEqual({ ok: false, reason: 'sequence_inactive' });
  });
});

describe('the passes', () => {
  it('REVIEW passes an approved, brand-scoped, sequenced campaign even while it is draft and its sequence inactive - a human will act on it', async () => {
    campaignFindOne.mockResolvedValue(row({ status: 'draft' }));
    sequenceFindByPk.mockResolvedValue({ id: 's-1', is_active: false });
    expect(await validateCampaign(args())).toEqual({
      ok: true,
      campaign: { id: 'c-1', campaign_key: 'explorer_next_lesson', sequence_id: 's-1', status: 'draft', approval_status: 'approved' },
    });
    expect(sequenceFindByPk).not.toHaveBeenCalled();
  });

  it('LIMITED passes only an ACTIVE campaign with an ACTIVE sequence, and `live` counts as approved', async () => {
    campaignFindOne.mockResolvedValue(row({ approval_status: 'live' }));
    expect(await validateCampaign(args({ mode: 'limited' }))).toMatchObject({ ok: true, campaign: { status: 'active', approval_status: 'live' } });
    expect(sequenceFindByPk).toHaveBeenCalledWith('s-1', { attributes: ['id', 'is_active'] });
  });

  it('the pass carries ids only - never a name, a body or a recipient', async () => {
    const r = await validateCampaign(args());
    expect(r.ok && Object.keys(r.campaign).sort()).toEqual(['approval_status', 'campaign_key', 'id', 'sequence_id', 'status']);
  });
});
