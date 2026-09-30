const campaignFindByPk = jest.fn();
const prefFindOne = jest.fn();
const prefCreate = jest.fn();
const contextFindOne = jest.fn();

jest.mock('../../../models', () => ({
  Campaign: { findByPk: (...a: unknown[]) => campaignFindByPk(...a) },
  CommunicationPreference: {
    findOne: (...a: unknown[]) => prefFindOne(...a),
    create: (...a: unknown[]) => prefCreate(...a),
  },
  LeadTenantContext: { findOne: (...a: unknown[]) => contextFindOne(...a) },
}));

import { checkBrandPreference, setBrandPreference } from '../brandPreferenceGate';

const LEAD = 4242;
const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CPN_TENANT = '11111111-1111-4111-8111-111111111111';
const CPN_BRAND = '22222222-2222-4222-8222-222222222222';

const brandedCampaign = {
  id: CAMPAIGN,
  tenant_id: CPN_TENANT,
  brand_id: CPN_BRAND,
  settings: {},
};

beforeEach(() => {
  [campaignFindByPk, prefFindOne, prefCreate, contextFindOne].forEach((m) => m.mockReset());
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

/**
 * The claim that most needs proving is the negative one: this gate must not touch a
 * single email that sends today. Everything else is future behaviour.
 */
describe('today’s mail is untouched', () => {
  it('a send with no campaign is not gated (transactional, webhook replies)', async () => {
    const d = await checkBrandPreference({ leadId: LEAD, campaignId: null, channel: 'email' });
    expect(d).toEqual({ allowed: true, reason: 'no_brand_scope' });
    expect(campaignFindByPk).not.toHaveBeenCalled();
  });

  it('a campaign with no brand_id is not gated — this is every campaign today', async () => {
    campaignFindByPk.mockResolvedValue({ id: CAMPAIGN, tenant_id: null, brand_id: null, settings: {} });
    const d = await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' });
    expect(d).toEqual({ allowed: true, reason: 'no_brand_scope' });
    // Never reaches the preference or relationship lookups.
    expect(prefFindOne).not.toHaveBeenCalled();
    expect(contextFindOne).not.toHaveBeenCalled();
  });

  it('a missing campaign is not gated', async () => {
    campaignFindByPk.mockResolvedValue(null);
    expect(await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' }))
      .toEqual({ allowed: true, reason: 'no_brand_scope' });
  });
});

describe('an explicit preference wins outright, both ways', () => {
  beforeEach(() => campaignFindByPk.mockResolvedValue(brandedCampaign));

  it('allows when the person said yes for this brand and channel', async () => {
    prefFindOne.mockResolvedValue({ email_allowed: true, sms_allowed: false, voice_allowed: false });
    expect(await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' }))
      .toEqual({ allowed: true, reason: 'preference_allows' });
  });

  it('blocks when they said no, even though a relationship exists', async () => {
    prefFindOne.mockResolvedValue({ email_allowed: false, sms_allowed: false, voice_allowed: false });
    contextFindOne.mockResolvedValue({ consent_contact: true });

    expect(await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' }))
      .toEqual({ allowed: false, reason: 'preference_denies' });
  });

  it('is per channel — email yes does not mean SMS yes', async () => {
    prefFindOne.mockResolvedValue({ email_allowed: true, sms_allowed: false, voice_allowed: false });
    expect((await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'sms' })).allowed).toBe(false);
    expect((await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'voice' })).allowed).toBe(false);
  });
});

describe('with no stated preference, the brand relationship decides', () => {
  beforeEach(() => {
    campaignFindByPk.mockResolvedValue(brandedCampaign);
    prefFindOne.mockResolvedValue(null);
  });

  it('allows when they consented to this brand', async () => {
    contextFindOne.mockResolvedValue({ consent_contact: true });
    expect(await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' }))
      .toEqual({ allowed: true, reason: 'relationship_consent' });
  });

  it('blocks when the relationship exists but consent was never given', async () => {
    contextFindOne.mockResolvedValue({ consent_contact: false });
    expect(await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' }))
      .toEqual({ allowed: false, reason: 'no_consent' });
  });

  it('BLOCKS when the person has no relationship with this brand at all', async () => {
    // The case that matters most. Existing in the leads table is not permission for
    // every brand to contact you: this stops a CPN campaign mailing someone who only
    // ever dealt with Colaberry.
    contextFindOne.mockResolvedValue(null);
    expect(await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' }))
      .toEqual({ allowed: false, reason: 'no_relationship' });
  });
});

describe('category', () => {
  beforeEach(() => {
    campaignFindByPk.mockResolvedValue(brandedCampaign);
    prefFindOne.mockResolvedValue(null);
    contextFindOne.mockResolvedValue({ consent_contact: true });
  });

  it('defaults to marketing', async () => {
    await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' });
    expect(prefFindOne.mock.calls[0][0].where.category).toBe('marketing');
  });

  it('honours a campaign-declared category, so fundraising is separable from updates', async () => {
    campaignFindByPk.mockResolvedValue({
      ...brandedCampaign,
      settings: { communication_category: 'fundraising' },
    });
    await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' });
    expect(prefFindOne.mock.calls[0][0].where.category).toBe('fundraising');
  });

  it('an explicit category argument overrides the campaign default', async () => {
    await checkBrandPreference({
      leadId: LEAD, campaignId: CAMPAIGN, channel: 'email', category: 'scholar_updates',
    });
    expect(prefFindOne.mock.calls[0][0].where.category).toBe('scholar_updates');
  });
});

describe('failure mode', () => {
  it('fails OPEN and logs, because global suppression already ran', async () => {
    campaignFindByPk.mockRejectedValue(new Error('db down'));
    const d = await checkBrandPreference({ leadId: LEAD, campaignId: CAMPAIGN, channel: 'email' });

    // This gate expresses brand preference; it is not a second suppression system.
    // Turning a lookup fault into a mail outage would be the worse failure.
    expect(d.allowed).toBe(true);
    const logged = JSON.parse((console.error as jest.Mock).mock.calls[0][0]);
    expect(logged.event).toBe('brand_preference_check_failed');
  });
});

describe('setBrandPreference', () => {
  const base = { leadId: LEAD, tenantId: CPN_TENANT, brandId: CPN_BRAND, category: 'fundraising' };

  it('creates when absent', async () => {
    prefFindOne.mockResolvedValue(null);
    expect(await setBrandPreference({ ...base, emailAllowed: true })).toEqual({ created: true });
    expect(prefCreate.mock.calls[0][0]).toMatchObject({ category: 'fundraising', email_allowed: true });
  });

  it('updates in place, so resubmitting a preference form is idempotent', async () => {
    const update = jest.fn();
    prefFindOne.mockResolvedValue({ update });
    expect(await setBrandPreference({ ...base, emailAllowed: false })).toEqual({ created: false });
    expect(prefCreate).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0]).toMatchObject({ email_allowed: false });
  });

  it('defaults every channel to false, never true', async () => {
    prefFindOne.mockResolvedValue(null);
    await setBrandPreference(base);
    expect(prefCreate.mock.calls[0][0]).toMatchObject({
      email_allowed: false, sms_allowed: false, voice_allowed: false,
    });
  });
});
