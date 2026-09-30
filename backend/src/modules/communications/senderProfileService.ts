import { Brand, BrandDomain, SenderProfile } from '../../models';

/**
 * Sender profile resolution and preflight — the fail-closed gate on outbound mail.
 *
 * Today the entire per-campaign sender story is `campaign.settings.sender_email`, an
 * untyped JSONB value read at send time with no verification. That is survivable with
 * one brand on one domain. Once CPN, AI Flotation and Refactored send from their own
 * domains it is not: nothing would stop a CPN scholarship email leaving over the AI
 * Flotation envelope, and the recipient — plus every spam filter in the path — would be
 * right to treat that as a forgery.
 *
 * RESOLUTION ORDER (master plan §51 compatibility ramp, deliberately not a flag day):
 *   1. campaign.sender_profile_id           → the target state
 *   2. brand default sender profile         → logged as deprecated
 *   3. legacy campaign.settings.sender_*    → logged as deprecated
 *   4. platform default                     → logged as deprecated
 *
 * Steps 2-4 keep every campaign that exists today sending exactly as it does now. They
 * are instrumented so the removal project has usage data instead of a guess.
 *
 * PREFLIGHT is fail-closed for live sends and advisory for test-mode sends. That split
 * is what lets a brand be wired up and exercised end to end before its DNS is live,
 * without ever putting an unverified sender one click away from a real send.
 */

export type SenderResolutionSource =
  | 'campaign_profile'
  | 'brand_default'
  | 'legacy_settings'
  | 'platform_default';

export interface ResolvedSender {
  profileId: string | null;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  providerSubaccount: string | null;
  unsubscribeUrl: string | null;
  physicalMailingAddress: string | null;
  tenantId: string | null;
  brandId: string | null;
  source: SenderResolutionSource;
}

export interface CampaignSenderInput {
  campaignId: string;
  tenantId?: string | null;
  brandId?: string | null;
  senderProfileId?: string | null;
  /** The legacy `campaign.settings` blob. Read only as a fallback. */
  settings?: Record<string, any> | null;
}

/** The platform default, matching what the scheduler falls back to today. */
const PLATFORM_DEFAULT = {
  fromName: 'Colaberry AI',
  fromEmail: 'ali@colaberry.com',
};

function logDeprecatedFallback(campaignId: string, source: SenderResolutionSource): void {
  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'communications',
      event: 'sender_profile_fallback_used',
      outcome: 'partial',
      context: { campaign_id: campaignId, fallback: source },
    }),
  );
}

function toResolved(profile: SenderProfile, source: SenderResolutionSource): ResolvedSender {
  return {
    profileId: profile.id,
    fromName: profile.from_name,
    fromEmail: profile.from_email,
    replyToEmail: profile.reply_to_email,
    providerSubaccount: profile.provider_subaccount,
    unsubscribeUrl: profile.unsubscribe_url,
    physicalMailingAddress: profile.physical_mailing_address,
    tenantId: profile.tenant_id,
    brandId: profile.brand_id,
    source,
  };
}

/** Raised when a campaign names a sender profile belonging to a different brand. */
export class SenderBrandMismatchError extends Error {
  public readonly errorClass = 'ContractViolation';

  constructor(
    public readonly campaignId: string,
    public readonly campaignBrandId: string,
    public readonly profileBrandId: string,
  ) {
    super(
      `Sender profile belongs to brand ${profileBrandId} but campaign ${campaignId} belongs to brand ${campaignBrandId}`,
    );
    this.name = 'SenderBrandMismatchError';
  }
}

/**
 * Resolve the sender for a campaign.
 *
 * Throws `SenderBrandMismatchError` when a campaign explicitly names a profile from
 * another brand. This is the cross-brand negative case from master plan §39, and it
 * must fail HERE — before any provider call — not at Mandrill and not silently.
 */
export async function resolveCampaignSender(input: CampaignSenderInput): Promise<ResolvedSender> {
  // 1. Explicit profile on the campaign.
  if (input.senderProfileId) {
    const profile = await SenderProfile.findByPk(input.senderProfileId);
    if (profile) {
      if (input.brandId && profile.brand_id !== input.brandId) {
        throw new SenderBrandMismatchError(input.campaignId, input.brandId, profile.brand_id);
      }
      return toResolved(profile, 'campaign_profile');
    }
  }

  // 2. The brand's default profile.
  if (input.brandId) {
    const profile = await SenderProfile.findOne({
      where: { brand_id: input.brandId, is_default: true },
    });
    if (profile) {
      logDeprecatedFallback(input.campaignId, 'brand_default');
      return toResolved(profile, 'brand_default');
    }
  }

  // 3. Legacy JSONB settings — what every campaign uses today.
  const settings = input.settings ?? {};
  if (settings.sender_email) {
    logDeprecatedFallback(input.campaignId, 'legacy_settings');
    return {
      profileId: null,
      fromName: settings.sender_name || PLATFORM_DEFAULT.fromName,
      fromEmail: settings.sender_email,
      replyToEmail: settings.reply_to || null,
      providerSubaccount: null,
      unsubscribeUrl: null,
      physicalMailingAddress: null,
      tenantId: input.tenantId ?? null,
      brandId: input.brandId ?? null,
      source: 'legacy_settings',
    };
  }

  // 4. Platform default.
  logDeprecatedFallback(input.campaignId, 'platform_default');
  return {
    profileId: null,
    fromName: PLATFORM_DEFAULT.fromName,
    fromEmail: PLATFORM_DEFAULT.fromEmail,
    replyToEmail: null,
    providerSubaccount: null,
    unsubscribeUrl: null,
    physicalMailingAddress: null,
    tenantId: input.tenantId ?? null,
    brandId: input.brandId ?? null,
    source: 'platform_default',
  };
}

export interface PreflightResult {
  ok: boolean;
  /** Machine-readable reasons, one per failed check. */
  failures: string[];
  checks: {
    profileActive: boolean;
    domainVerified: boolean;
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
    unsubscribeUrl: boolean;
    physicalAddress: boolean;
  };
}

/**
 * Check whether a resolved sender is fit to send LIVE mail.
 *
 * Every check is reported, not just the first failure, so the admin health view can
 * show the whole picture rather than making an operator fix one thing at a time.
 *
 * A legacy-fallback sender (no profile row) is reported as failing the profile and
 * domain checks. That is honest — nothing about it has been verified — and it is why
 * `assertCanSendLive` is applied to new brand sends rather than retro-applied to the
 * existing Colaberry pipeline, which would stop today's mail dead.
 */
export async function preflightSender(sender: ResolvedSender): Promise<PreflightResult> {
  const checks = {
    profileActive: false,
    domainVerified: false,
    spf: false,
    dkim: false,
    dmarc: false,
    unsubscribeUrl: Boolean(sender.unsubscribeUrl),
    physicalAddress: Boolean(sender.physicalMailingAddress),
  };

  if (sender.profileId) {
    const profile = await SenderProfile.findByPk(sender.profileId);
    checks.profileActive = profile?.status === 'active';

    if (profile?.sending_domain_id) {
      const domain = await BrandDomain.findByPk(profile.sending_domain_id);
      if (domain) {
        checks.domainVerified = domain.verification_status === 'verified';
        checks.spf = domain.spf_status === 'pass';
        checks.dkim = domain.dkim_status === 'pass';
        // DMARC only needs to be CONFIGURED, not passing: a p=none policy is a valid
        // deliberate posture during rollout, whereas a failing SPF or DKIM is not.
        checks.dmarc = domain.dmarc_status !== 'unknown';
      }
    }
  }

  const failures: string[] = [];
  if (!checks.profileActive) failures.push('sender_profile_not_active');
  if (!checks.domainVerified) failures.push('sending_domain_not_verified');
  if (!checks.spf) failures.push('spf_not_passing');
  if (!checks.dkim) failures.push('dkim_not_passing');
  if (!checks.dmarc) failures.push('dmarc_not_configured');
  if (!checks.unsubscribeUrl) failures.push('unsubscribe_url_missing');
  if (!checks.physicalAddress) failures.push('physical_address_missing');

  return { ok: failures.length === 0, failures, checks };
}

/** Raised when a live send is attempted with a sender that failed preflight. */
export class SenderPreflightError extends Error {
  public readonly errorClass = 'ContractViolation';

  constructor(public readonly failures: string[]) {
    super(`Sender preflight failed: ${failures.join(', ')}`);
    this.name = 'SenderPreflightError';
  }
}

/**
 * Gate a send. Live sends fail closed; test-mode sends record the result and proceed.
 *
 * The test-mode carve-out is what makes plan §37's test campaigns possible: a brand can
 * be exercised end to end before DNS exists, without the preflight becoming something
 * people learn to route around.
 */
export async function assertCanSendLive(
  sender: ResolvedSender,
  options: { testMode?: boolean } = {},
): Promise<PreflightResult> {
  const result = await preflightSender(sender);
  if (options.testMode) return result;
  if (!result.ok) throw new SenderPreflightError(result.failures);
  return result;
}

/**
 * Provider metadata attached to every send so webhook events can be mapped back to the
 * ecosystem. Without this, a Mandrill open event is a message id and nothing else.
 */
export function buildProviderMetadata(input: {
  sender: ResolvedSender;
  campaignId: string;
  leadId?: number | null;
  campaignLeadId?: string | null;
  tenantSlug?: string | null;
  brandSlug?: string | null;
}): Record<string, string> {
  const metadata: Record<string, string> = { campaign: input.campaignId };
  if (input.tenantSlug) metadata.tenant = input.tenantSlug;
  if (input.brandSlug) metadata.brand = input.brandSlug;
  if (input.leadId != null) metadata.lead = String(input.leadId);
  if (input.campaignLeadId) metadata.campaignLead = input.campaignLeadId;
  if (input.sender.profileId) metadata.senderProfile = input.sender.profileId;
  return metadata;
}

/** Sender profiles for a brand, for the admin health view. */
export async function listBrandSenderProfiles(brandId: string): Promise<SenderProfile[]> {
  return SenderProfile.findAll({ where: { brand_id: brandId }, order: [['name', 'ASC']] });
}

/** Brand + domain readiness summary for the admin ecosystem page. */
export async function brandSendReadiness(brandId: string): Promise<{
  brand: Brand | null;
  domains: BrandDomain[];
  profiles: Array<{ profile: SenderProfile; preflight: PreflightResult }>;
}> {
  const brand = await Brand.findByPk(brandId);
  const domains = await BrandDomain.findAll({ where: { brand_id: brandId } });
  const profiles = await listBrandSenderProfiles(brandId);

  const withPreflight = [];
  for (const profile of profiles) {
    const preflight = await preflightSender(toResolved(profile, 'campaign_profile'));
    withPreflight.push({ profile, preflight });
  }

  return { brand, domains, profiles: withPreflight };
}
