/**
 * SMS Opt-Out Processor
 *
 * Detects STOP / UNSUBSCRIBE / QUIT keywords in inbound SMS messages.
 * When detected:
 *  1. Updates lead.status → 'dnd'
 *  2. Cancels all pending ScheduledEmail records for the lead
 *  3. Creates an UnsubscribeEvent record
 *  4. Logs via aiEventService
 */

import Lead from '../models/Lead';
import ScheduledEmail from '../models/ScheduledEmail';
import UnsubscribeEvent from '../models/UnsubscribeEvent';
import { logAiEvent } from './aiEventService';

const STOP_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'OPT OUT', 'OPTOUT', 'END', 'REMOVE'];

/**
 * Process an inbound SMS message for opt-out keywords.
 * @returns true if the lead opted out, false otherwise
 */
export async function processInboundSms(leadId: number, messageBody: string): Promise<boolean> {
  if (!messageBody) return false;

  const normalized = messageBody.trim().toUpperCase();
  const isOptOut = STOP_KEYWORDS.some(kw => normalized === kw || normalized.startsWith(kw + ' '));

  if (!isOptOut) return false;

  try {
    // 1. Update lead status to DND
    const [updatedCount] = await Lead.update(
      { status: 'dnd' },
      { where: { id: leadId } },
    );

    if (updatedCount === 0) {
      console.warn(`[SMSOptOut] Lead ${leadId} not found for opt-out`);
      return false;
    }

    // 2. Cancel all pending scheduled actions for this lead
    const [cancelledCount] = await ScheduledEmail.update(
      { status: 'cancelled' },
      { where: { lead_id: leadId, status: 'pending' } },
    );

    // 3. Create unsubscribe event
    await UnsubscribeEvent.create({
      lead_id: leadId,
      channel: 'sms',
      reason: `SMS opt-out keyword: "${normalized}"`,
    } as any);

    // 4. Log the event
    await logAiEvent('SMSOptOutProcessor', 'lead_opted_out', 'leads', String(leadId), {
      channel: 'sms',
      keyword: normalized,
      cancelled_actions: cancelledCount,
    });

    console.log(`[SMSOptOut] Lead ${leadId} opted out via SMS ("${normalized}"). Cancelled ${cancelledCount} pending actions.`);
    return true;
  } catch (err) {
    console.error(`[SMSOptOut] Error processing opt-out for lead ${leadId}:`, err);
    return false;
  }
}
