import { Campaign, Lead } from '../models';
import type Enrollment from '../models/Enrollment';
import { redactForLogs } from '../utils/piiRedaction';

/**
 * Readiness campaign membership for an enrollment — the Payment Readiness campaign for
 * people who have not paid, the Class Readiness campaign for people who have.
 *
 * WHY THIS IS ITS OWN MODULE. Extracted from `enrollmentService.ts` in Phase 2 T206, which
 * had grown to 547 lines — past CLAUDE.md's 500-line hard ceiling, whose rule is that the
 * next change to an oversize file splits it before adding new code. T205 added to that file
 * without splitting and logged the deviation; T206 opens it again, so this is the change
 * that pays the debt down. Approved by the owner before doing it.
 *
 * The seam was already here: this block was fenced off under its own banner comment, it
 * shares no state with the enrolment logic above it, and it talks only to `Campaign`,
 * `Lead` and `campaignService`. Nothing about enrolment had to move with it.
 *
 * Campaign enrolment is **membership, not a send**. These functions add or remove a lead
 * from a campaign; whether that campaign ever contacts anyone is the campaign engine's
 * decision and `GROWTH_JOURNEY_EXECUTION_ENABLED` remains the owner's switch. `campaignService`
 * is imported dynamically, matching the convention the extracted code already used: a
 * top-level import pulls `settingsService → SystemSetting → config/database` and constructs
 * Sequelize at module load, which breaks consumers that have no `DATABASE_URL`.
 */

const PAYMENT_READINESS_CAMPAIGN_NAME = 'Payment Readiness Campaign';
const CLASS_READINESS_CAMPAIGN_NAME = 'Class Readiness Campaign';

/** The lead row these campaigns enrol, found or created by normalized email. */
async function findOrCreateCampaignLead(enrollment: Enrollment) {
  const [lead] = await Lead.findOrCreate({
    where: { email: enrollment.email.toLowerCase().trim() },
    defaults: {
      name: enrollment.full_name,
      email: enrollment.email.toLowerCase().trim(),
      company: enrollment.company || '',
      title: enrollment.title || '',
      phone: enrollment.phone || '',
      source: 'enrollment',
      status: 'engaged',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
    } as any,
  });
  return lead;
}

/** Add an UNPAID enrollment's lead to the Payment Readiness campaign. */
export async function enrollInPaymentCampaignIfUnpaid(enrollment: Enrollment): Promise<void> {
  if (enrollment.payment_status === 'paid') return;

  const campaign = await Campaign.findOne({
    where: { name: PAYMENT_READINESS_CAMPAIGN_NAME, status: 'active' },
  });
  if (!campaign) {
    console.log('[Payment Campaign] No active payment readiness campaign found — skipping');
    return;
  }

  const lead = await findOrCreateCampaignLead(enrollment);
  const { enrollLeadsInCampaign } = await import('./campaignService');
  const results = await enrollLeadsInCampaign(campaign.id, [lead.id]);
  console.log(`[Payment Campaign] Enrolled lead ${lead.id} (${redactForLogs(enrollment.email)}):`, results);
}

/** Add a PAID enrollment's lead to the Class Readiness campaign. */
export async function enrollInClassReadinessCampaign(enrollment: Enrollment): Promise<void> {
  if (enrollment.payment_status !== 'paid') return;

  const campaign = await Campaign.findOne({
    where: { name: CLASS_READINESS_CAMPAIGN_NAME, status: 'active' },
  });
  if (!campaign) {
    console.log('[Class Readiness] No active campaign found — skipping');
    return;
  }

  const lead = await findOrCreateCampaignLead(enrollment);
  const { enrollLeadsInCampaign } = await import('./campaignService');
  const results = await enrollLeadsInCampaign(campaign.id, [lead.id]);
  console.log(`[Class Readiness] Enrolled lead ${lead.id} (${redactForLogs(enrollment.email)}):`, results);
}

/** Remove a lead from the Payment Readiness campaign once payment lands. */
export async function exitPaymentCampaign(email: string): Promise<void> {
  const campaign = await Campaign.findOne({
    where: { name: PAYMENT_READINESS_CAMPAIGN_NAME },
  });
  if (!campaign) return;

  const lead = await Lead.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!lead) return;

  try {
    const { removeLeadFromCampaign } = await import('./campaignService');
    await removeLeadFromCampaign(campaign.id, lead.id);
    // THE ONE DELIBERATE BEHAVIOUR CHANGE IN THIS EXTRACTION, called out rather than
    // slipped in: the original logged the RAW email here, while the two functions above
    // it redact. Same leak class as `enrollmentService.ts:419`, and this phase's standing
    // bar is no PII and no `@` in any log. `redactForLogs` was already imported and
    // already used for exactly this two functions up, so the fix is the call that was
    // missing rather than a new mechanism. Re-committing a known PII leak while moving
    // the line that contains it would have been the worse choice.
    console.log(`[Payment Campaign] Exited lead ${lead.id} (${redactForLogs(email)}) — payment confirmed`);
  } catch (err: any) {
    // Lead may not be enrolled (e.g. an admin-created enrollment that was always paid).
    if (err.message?.includes('not enrolled')) return;
    throw err;
  }
}
