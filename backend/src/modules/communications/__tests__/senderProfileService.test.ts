const profileFindByPk = jest.fn();
const profileFindOne = jest.fn();
const domainFindByPk = jest.fn();

jest.mock('../../../models', () => ({
  SenderProfile: {
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
    findOne: (...a: unknown[]) => profileFindOne(...a),
    findAll: jest.fn(),
  },
  BrandDomain: {
    findByPk: (...a: unknown[]) => domainFindByPk(...a),
    findAll: jest.fn(),
  },
  Brand: { findByPk: jest.fn() },
}));

import {
  assertCanSendLive,
  buildProviderMetadata,
  preflightSender,
  resolveCampaignSender,
  SenderBrandMismatchError,
  SenderPreflightError,
} from '../senderProfileService';

const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CPN_TENANT = '11111111-1111-4111-8111-111111111111';
const CPN_BRAND = '22222222-2222-4222-8222-222222222222';
const FLOTATION_BRAND = '33333333-3333-4333-8333-333333333333';
const PROFILE_ID = '44444444-4444-4444-8444-444444444444';
const DOMAIN_ID = '55555555-5555-4555-8555-555555555555';

function cpnProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    tenant_id: CPN_TENANT,
    brand_id: CPN_BRAND,
    from_name: 'Career Pathways Network',
    from_email: 'scholars@cpn.org',
    reply_to_email: 'scholars@cpn.org',
    provider_subaccount: 'cpn',
    unsubscribe_url: 'https://cpn.org/unsubscribe',
    physical_mailing_address: '1 Example St, Dallas TX',
    sending_domain_id: DOMAIN_ID,
    status: 'active',
    ...overrides,
  };
}

function healthyDomain(overrides: Record<string, unknown> = {}) {
  return {
    id: DOMAIN_ID,
    verification_status: 'verified',
    spf_status: 'pass',
    dkim_status: 'pass',
    dmarc_status: 'pass',
    ...overrides,
  };
}

beforeEach(() => {
  [profileFindByPk, profileFindOne, domainFindByPk].forEach((m) => m.mockReset());
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

describe('resolveCampaignSender — resolution order', () => {
  it('prefers the campaign’s explicit sender profile', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile());

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
      settings: { sender_email: 'should-not-be-used@example.com' },
    });

    expect(sender.source).toBe('campaign_profile');
    expect(sender.fromEmail).toBe('scholars@cpn.org');
  });

  it('falls back to the brand default and logs the deprecation', async () => {
    profileFindOne.mockResolvedValue(cpnProfile());

    const sender = await resolveCampaignSender({ campaignId: CAMPAIGN, brandId: CPN_BRAND });

    expect(sender.source).toBe('brand_default');
    expect(console.warn).toHaveBeenCalled();
  });

  it('falls back to legacy JSONB settings — today’s campaigns keep working', async () => {
    profileFindOne.mockResolvedValue(null);

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      settings: { sender_email: 'legacy@colaberry.com', sender_name: 'Legacy Sender' },
    });

    expect(sender.source).toBe('legacy_settings');
    expect(sender.fromEmail).toBe('legacy@colaberry.com');
    expect(sender.profileId).toBeNull();
  });

  it('falls back to the platform default when nothing is configured', async () => {
    const sender = await resolveCampaignSender({ campaignId: CAMPAIGN });
    expect(sender.source).toBe('platform_default');
    expect(sender.fromEmail).toBe('ali@colaberry.com');
  });
});

describe('resolveCampaignSender — cross-brand rejection', () => {
  it('refuses a sender profile belonging to another brand, before any provider call', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile({ brand_id: FLOTATION_BRAND }));

    await expect(
      resolveCampaignSender({
        campaignId: CAMPAIGN,
        brandId: CPN_BRAND,
        senderProfileId: PROFILE_ID,
      }),
    ).rejects.toBeInstanceOf(SenderBrandMismatchError);
  });

  it('classifies the mismatch as a ContractViolation', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile({ brand_id: FLOTATION_BRAND }));
    try {
      await resolveCampaignSender({
        campaignId: CAMPAIGN,
        brandId: CPN_BRAND,
        senderProfileId: PROFILE_ID,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as SenderBrandMismatchError).errorClass).toBe('ContractViolation');
    }
  });
});

describe('preflightSender', () => {
  it('passes for an active profile on a fully healthy domain', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile());
    domainFindByPk.mockResolvedValue(healthyDomain());

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    const result = await preflightSender(sender);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('accepts a configured-but-not-passing DMARC (p=none is a valid rollout posture)', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile());
    domainFindByPk.mockResolvedValue(healthyDomain({ dmarc_status: 'fail' }));

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    expect((await preflightSender(sender)).checks.dmarc).toBe(true);
  });

  it('reports every failure at once, not just the first', async () => {
    profileFindByPk.mockResolvedValue(
      cpnProfile({ status: 'draft', unsubscribe_url: null, physical_mailing_address: null }),
    );
    domainFindByPk.mockResolvedValue(
      healthyDomain({ verification_status: 'pending', spf_status: 'fail', dmarc_status: 'unknown' }),
    );

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    const result = await preflightSender(sender);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'sender_profile_not_active',
        'sending_domain_not_verified',
        'spf_not_passing',
        'dmarc_not_configured',
        'unsubscribe_url_missing',
        'physical_address_missing',
      ]),
    );
  });

  it('fails a legacy-fallback sender — nothing about it has been verified', async () => {
    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      settings: { sender_email: 'legacy@colaberry.com' },
    });
    const result = await preflightSender(sender);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('sender_profile_not_active');
  });
});

describe('assertCanSendLive', () => {
  it('blocks a live send when preflight fails', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile({ status: 'draft' }));
    domainFindByPk.mockResolvedValue(healthyDomain({ verification_status: 'pending' }));

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    await expect(assertCanSendLive(sender)).rejects.toBeInstanceOf(SenderPreflightError);
  });

  it('permits a test-mode send and still reports the failures', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile({ status: 'draft' }));
    domainFindByPk.mockResolvedValue(healthyDomain({ verification_status: 'pending' }));

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    const result = await assertCanSendLive(sender, { testMode: true });
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('permits a live send when everything is healthy', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile());
    domainFindByPk.mockResolvedValue(healthyDomain());

    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    await expect(assertCanSendLive(sender)).resolves.toMatchObject({ ok: true });
  });
});

describe('buildProviderMetadata', () => {
  it('carries every identifier the webhook needs to restore context', async () => {
    profileFindByPk.mockResolvedValue(cpnProfile());
    const sender = await resolveCampaignSender({
      campaignId: CAMPAIGN,
      brandId: CPN_BRAND,
      senderProfileId: PROFILE_ID,
    });

    const metadata = buildProviderMetadata({
      sender,
      campaignId: CAMPAIGN,
      leadId: 4242,
      campaignLeadId: 'cl-1',
      tenantSlug: 'cpn',
      brandSlug: 'cpn',
    });

    expect(metadata).toEqual({
      campaign: CAMPAIGN,
      tenant: 'cpn',
      brand: 'cpn',
      lead: '4242',
      campaignLead: 'cl-1',
      senderProfile: PROFILE_ID,
    });
  });

  it('omits identifiers that are genuinely absent rather than emitting nulls', async () => {
    const sender = await resolveCampaignSender({ campaignId: CAMPAIGN });
    const metadata = buildProviderMetadata({ sender, campaignId: CAMPAIGN });
    expect(metadata).toEqual({ campaign: CAMPAIGN });
  });
});
