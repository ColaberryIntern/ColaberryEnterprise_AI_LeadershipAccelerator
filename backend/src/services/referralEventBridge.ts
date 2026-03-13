import { AlumniReferral, ReferralActivityEvent, ReferralCommission, AlumniReferralProfile } from '../models';
import type { ReferralEventType } from '../models/ReferralActivityEvent';
import type { ReferralStatus } from '../models/AlumniReferral';

// Map InteractionOutcome types to referral event types
const OUTCOME_TO_EVENT: Record<string, ReferralEventType> = {
  sent: 'email_sent',
  opened: 'email_opened',
  clicked: 'link_clicked',
  replied: 'email_opened', // treat reply as engagement
  booked_meeting: 'meeting_scheduled',
  converted: 'enrollment_completed',
};

// Outcomes that trigger a referral status update
const STATUS_MAP: Record<string, ReferralStatus> = {
  sent: 'in_progress',
  booked_meeting: 'meeting_scheduled',
  converted: 'enrolled',
};

/**
 * Bridge InteractionOutcome events to referral activity tracking.
 * Called fire-and-forget after every InteractionOutcome is recorded.
 * If the lead is not a referral lead, this returns immediately.
 */
export async function bridgeInteractionToReferral(
  leadId: number,
  outcome: string,
  campaignId?: string,
): Promise<void> {
  try {
    // Find referral for this lead
    const where: any = { lead_id: leadId };
    if (campaignId) where.campaign_id = campaignId;

    const referral = await AlumniReferral.findOne({ where });
    if (!referral) return; // Not a referral lead

    // Map outcome to referral event type
    const eventType = OUTCOME_TO_EVENT[outcome];
    if (!eventType) return; // Outcome type not tracked for referrals

    // Create referral activity event
    await ReferralActivityEvent.create({
      referral_id: referral.id,
      event_type: eventType,
      metadata: { outcome, campaign_id: campaignId, lead_id: leadId },
    });

    // Update referral status on milestones
    const newStatus = STATUS_MAP[outcome];
    if (newStatus) {
      await referral.update({ status: newStatus, updated_at: new Date() });
    }

    // Handle conversion → create commission
    if (outcome === 'converted') {
      // Check if commission already exists
      const existingCommission = await ReferralCommission.findOne({
        where: { referral_id: referral.id },
      });

      if (!existingCommission) {
        await ReferralCommission.create({
          referral_id: referral.id,
          profile_id: referral.profile_id,
          commission_amount: 250.00,
          payment_status: 'pending',
        });

        await ReferralActivityEvent.create({
          referral_id: referral.id,
          event_type: 'commission_earned',
          metadata: { commission_amount: 250, outcome },
        });

        // Update profile total_earnings
        const profile = await AlumniReferralProfile.findByPk(referral.profile_id);
        if (profile) {
          await profile.update({
            total_earnings: Number(profile.total_earnings || 0) + 250,
            updated_at: new Date(),
          });
        }
      }
    }
  } catch (err: any) {
    // Non-blocking — never fail the parent tracking flow
    console.error(`[ReferralBridge] Error bridging outcome for lead ${leadId}:`, err.message);
  }
}
