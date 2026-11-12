import { syncLeadToGhl, sendSmsViaGhl } from '../ghlService';
import {
  generateConversationSummary,
  buildSmsSummaryContent,
} from '../mayaConversationSummaryService';
import type { MayaActionResult } from '../mayaActionService';
import { resolveLeadForVisitor, logAction, logOutboundOutcome } from './toolContext';

/**
 * `send_sms_summary` - text the visitor a recap of the conversation.
 *
 * Moved out of `mayaToolsService.ts` by MR1: that file was 1,047 lines against a 500-line hard
 * ceiling, and CLAUDE.md says the next change to an oversize file must split it before adding
 * code. `mayaToolsService` re-exports this, so no caller and no test mock changed.
 *
 * ── THE DEFECT THIS FILE WAS SPLIT OUT TO FIX ───────────────────────────────
 *
 * The provider call's return value was DISCARDED (`await sendSmsViaGhl(contactId, smsContent);`
 * with no binding). `sendSmsViaGhl` -> `ghlFetch` returns `{ success: false, error }` **without
 * throwing** on any GoHighLevel failure, so the `catch` never fired, the action was logged
 * `completed`, and the tool returned `"SMS summary sent to <phone>"`. Maya told the visitor she
 * had texted them.
 *
 * Blast radius, measured in production 2026-11-12: the silent branch is reachable for any lead
 * that already carries a `ghl_contact_id`, because such a lead skips the sync guard above it.
 * **8,123 leads carry one, and 2,458 of those also have a phone number.** The path had never
 * fired (zero `sms_summary_sent` rows), so unlike the voice defect this was still latent.
 *
 * `ghl_enabled` is `true` and `ghl_api_key` is present in production, so the trigger is not a
 * missing key - it is any 4xx, 5xx or timeout from GoHighLevel.
 *
 * ── WHAT IS STILL MISSING, STATED RATHER THAN IMPLIED ───────────────────────
 *
 * This tool has no idempotency key. N tool calls produce N field writes and therefore N GHL
 * workflow fires, and the model calling a tool twice in one turn is ordinary. The email path
 * has `sendOnce` and an `email_send_ledger`; there is no SMS equivalent, and inventing one is a
 * schema change outside MR1's scope. It is recorded as a rung in the release-gate runbook.
 *
 * Note also that `sendSmsViaGhl` does not itself send an SMS: it PUTs a `cory_sms_composed`
 * custom field and a GoHighLevel workflow we do not own does the delivery. So "accepted" here
 * means GHL took the field write, not that a message reached a handset.
 */

export async function sendSmsSummary(
  _args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const lead = await resolveLeadForVisitor(visitorId);
  if (!lead) {
    return { success: false, summary: 'No lead record found. Capture contact details first.' };
  }
  if (!lead.phone) {
    return { success: false, summary: 'No phone number on file. Ask for their phone first.' };
  }

  // Ensure GHL contact exists
  let contactId = (lead as any).ghl_contact_id;
  if (!contactId) {
    try {
      const syncResult = await syncLeadToGhl(lead);
      if (syncResult.contactId && !syncResult.isTestMode) {
        await lead.update({ ghl_contact_id: syncResult.contactId });
        contactId = syncResult.contactId;
      } else if (syncResult.contactId) {
        contactId = syncResult.contactId; // test mode — still send
      }
    } catch {
      return { success: false, summary: 'Unable to sync with messaging system' };
    }
  }

  if (!contactId) {
    return { success: false, summary: 'Unable to establish SMS contact. Team will follow up.' };
  }

  // Generate summary and send
  try {
    const { summary } = await generateConversationSummary(conversationId);
    const leadName = lead.getDataValue('name') || 'there';
    const smsContent = buildSmsSummaryContent({
      summary,
      visitorName: leadName.split(' ')[0],
    });

    await sendSmsViaGhl(contactId, smsContent);

    await logAction(visitorId, conversationId, 'sms_summary_sent', 'completed', {
      lead_id: lead.id,
      phone: lead.phone,
      summary_length: smsContent.length,
    });

    return {
      success: true,
      summary: `SMS summary sent to ${lead.phone}`,
      details: { phone: lead.phone },
    };
  } catch (err: any) {
    await logAction(visitorId, conversationId, 'sms_summary_sent', 'failed', {
      error: err.message,
    });
    return { success: false, summary: `Failed to send SMS: ${err.message}` };
  }
}
