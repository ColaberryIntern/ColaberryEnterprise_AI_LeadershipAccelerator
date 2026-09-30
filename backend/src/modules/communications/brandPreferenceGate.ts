import { Campaign, CommunicationPreference, LeadTenantContext } from '../../models';

/**
 * Per-brand communication permission (master plan §16, DEC-05).
 *
 * A single global marketing opt-out cannot express the real state of an ecosystem
 * contact. Someone can genuinely want CPN scholar updates, not want CPN fundraising
 * mail, want Colaberry Training course announcements, and have no relationship with AI
 * Flotation at all. One boolean flattens all four into a wrong answer.
 *
 * THE RESOLUTION ORDER, which is fixed and not negotiable per-caller:
 *
 *     global suppression  >  brand preference  >  brand relationship  >  no relationship
 *
 * Global suppression is NOT re-checked here. `checkLeadSendable` already ran and is the
 * authority on hard bounces, complaints and unsubscribes — those are facts about the
 * ADDRESS, and no brand-level preference may override them. This gate only ever narrows
 * what that check already allowed; it can never widen it.
 *
 * WHY THIS CANNOT BREAK TODAY'S MAIL. The gate applies only to campaigns that carry a
 * `brand_id`. Every existing campaign was backfilled to Colaberry Enterprise but none
 * were authored against a brand, and the check short-circuits for anything without one.
 * So the blast radius today is zero, and every future CPN or AI Flotation campaign is
 * enforced from its first send rather than from whenever someone remembers to switch it
 * on.
 */

export type PreferenceDecision =
  | { allowed: true; reason: 'no_brand_scope' | 'preference_allows' | 'relationship_consent' }
  | { allowed: false; reason: 'preference_denies' | 'no_consent' | 'no_relationship' };

export interface BrandPreferenceInput {
  leadId: number;
  campaignId?: string | null;
  channel: 'email' | 'sms' | 'voice';
  /** Defaults to 'marketing'. A campaign may name a narrower category in its settings. */
  category?: string;
}

function channelAllowed(pref: CommunicationPreference, channel: string): boolean {
  if (channel === 'sms') return pref.sms_allowed;
  if (channel === 'voice') return pref.voice_allowed;
  return pref.email_allowed;
}

/**
 * Decide whether this brand may contact this person on this channel.
 *
 * Fails OPEN on an internal error, deliberately and narrowly: this gate exists to
 * express brand preference, not to be a second suppression system. If it cannot reach
 * the database, `checkLeadSendable` and the global suppression tables have already had
 * their say, and turning a lookup fault into a mail outage would be the worse failure.
 * The error is logged so a persistent fault is visible rather than silently permissive.
 */
export async function checkBrandPreference(
  input: BrandPreferenceInput,
): Promise<PreferenceDecision> {
  // Transactional and webhook sends carry no campaign. They are not brand marketing and
  // are not gated here.
  if (!input.campaignId) return { allowed: true, reason: 'no_brand_scope' };

  try {
    const campaign = await Campaign.findByPk(input.campaignId, {
      attributes: ['id', 'tenant_id', 'brand_id', 'settings'],
    });
    const tenantId = (campaign as any)?.tenant_id as string | null;
    const brandId = (campaign as any)?.brand_id as string | null;

    // No brand on the campaign: legacy send, behaves exactly as it did before.
    if (!campaign || !tenantId || !brandId) return { allowed: true, reason: 'no_brand_scope' };

    const category =
      input.category || (campaign as any)?.settings?.communication_category || 'marketing';

    // 1. An explicit per-brand, per-category preference is the most specific answer and
    //    wins outright, in both directions.
    const pref = await CommunicationPreference.findOne({
      where: { lead_id: input.leadId, tenant_id: tenantId, brand_id: brandId, category },
    });
    if (pref) {
      return channelAllowed(pref, input.channel)
        ? { allowed: true, reason: 'preference_allows' }
        : { allowed: false, reason: 'preference_denies' };
    }

    // 2. No stated preference: fall back to the consent captured when this person formed
    //    a relationship with THIS brand. Consent is per brand and is never inherited
    //    from another one.
    const context = await LeadTenantContext.findOne({
      where: { lead_id: input.leadId, tenant_id: tenantId, brand_id: brandId },
      attributes: ['id', 'consent_contact'],
    });

    // 3. No relationship with this brand at all. This is the case that matters most:
    //    it stops a CPN campaign mailing someone who only ever dealt with Colaberry.
    //    "Exists in the leads table" is not permission for every brand to contact them.
    if (!context) return { allowed: false, reason: 'no_relationship' };

    return context.consent_contact
      ? { allowed: true, reason: 'relationship_consent' }
      : { allowed: false, reason: 'no_consent' };
  } catch (err) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'communications',
        event: 'brand_preference_check_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: {
          lead_id: input.leadId,
          campaign_id: input.campaignId,
          message: err instanceof Error ? err.message : String(err),
        },
      }),
    );
    // Fails open. See the note above: global suppression has already been enforced.
    return { allowed: true, reason: 'no_brand_scope' };
  }
}

/**
 * Record a person's preference for one brand and category.
 *
 * Upsert on the natural key so re-submitting a preference centre form is idempotent
 * rather than accumulating rows.
 */
export async function setBrandPreference(input: {
  leadId: number;
  tenantId: string;
  brandId: string;
  category: string;
  emailAllowed?: boolean;
  smsAllowed?: boolean;
  voiceAllowed?: boolean;
  source?: string;
}): Promise<{ created: boolean }> {
  const where = {
    lead_id: input.leadId,
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    category: input.category,
  };
  const existing = await CommunicationPreference.findOne({ where });

  const values = {
    email_allowed: input.emailAllowed ?? false,
    sms_allowed: input.smsAllowed ?? false,
    voice_allowed: input.voiceAllowed ?? false,
    source: input.source ?? null,
  };

  if (existing) {
    await existing.update(values as any);
    return { created: false };
  }
  await CommunicationPreference.create({ ...where, ...values } as any);
  return { created: true };
}
