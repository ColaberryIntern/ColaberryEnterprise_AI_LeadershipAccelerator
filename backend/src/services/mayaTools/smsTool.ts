import { syncLeadToGhl, sendSmsViaGhl } from '../ghlService';
import {
  generateConversationSummary,
  buildSmsSummaryContent,
} from '../mayaConversationSummaryService';
import type { MayaActionResult } from '../mayaActionService';
import { resolveLeadForVisitor, logAction, logOutboundOutcome } from './toolContext';
import { checkPhoneConsent, CONSENT_REFUSED_SUMMARY } from './outboundConsent';

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

  // CONSENT, before the provider is touched (MR1 defect 4). This tool had no consent check of
  // any kind - not even the platform kill switch, which `evaluateSend` reads first. The gate
  // already understood `channel: 'sms'`; this path simply walked around it.
  const consent = await checkPhoneConsent(lead.id, 'sms', String(lead.phone), {
    visitor_id: visitorId, conversation_id: conversationId,
  });
  if (!consent.allowed) {
    await logAction(visitorId, conversationId, 'sms_summary_sent', 'denied', {
      lead_id: lead.id,
      error_class: 'SendNotAllowed',
      reason: consent.reason,
    });
    return { success: false, summary: CONSENT_REFUSED_SUMMARY.sms };
  }

  // A TEST-MODE REDIRECT CANNOT BE HONOURED ON THIS PATH, SO IT REFUSES INSTEAD.
  //
  // `sendSmsViaGhl` does not take a phone number. It PUTs a `cory_sms_composed` custom field on
  // a GoHighLevel CONTACT, and a workflow we do not own then texts whatever number that contact
  // holds. So there is nowhere to apply `redirect.phone`: proceeding would text the real person
  // while the platform believed it was in test mode, which is the single worst outcome
  // available here. Refusing is the only honest option until the GHL path can take a
  // destination.
  if (consent.redirectPhone) {
    logOutboundOutcome({
      event: 'maya_sms_redirect_unsupported',
      outcome: 'failure',
      errorClass: 'RedirectUnsupported',
      context: { visitor_id: visitorId, conversation_id: conversationId, lead_id: lead.id },
    });
    await logAction(visitorId, conversationId, 'sms_summary_sent', 'denied', {
      lead_id: lead.id,
      error_class: 'RedirectUnsupported',
      reason: 'test_mode_redirect_cannot_be_applied_to_ghl_contact',
    });
    return { success: false, summary: CONSENT_REFUSED_SUMMARY.sms };
  }

  // Generate summary and send
  try {
    const { summary } = await generateConversationSummary(conversationId);
    const leadName = lead.getDataValue('name') || 'there';
    const smsContent = buildSmsSummaryContent({
      summary,
      visitorName: leadName.split(' ')[0],
    });

    // THE RETURN VALUE IS THE WHOLE DEFECT. This line used to be a bare
    // `await sendSmsViaGhl(contactId, smsContent);` with nothing bound. `ghlFetch` returns
    // `{ success: false, error }` WITHOUT throwing on any GoHighLevel failure, so the `catch`
    // below never fired, the action was logged `completed`, and the tool told the visitor
    // "SMS summary sent to <phone>" when GoHighLevel had rejected the write.
    const sent = await sendSmsViaGhl(contactId, smsContent);

    if (!sent?.success) {
      // The provider's own error text is kept OUT of the summary the model relays: it can carry
      // a URL, a contact id or an upstream payload, and the visitor-facing reply is the wrong
      // place for any of them. It goes to the structured log and the audit row instead.
      logOutboundOutcome({
        event: 'maya_sms_not_sent',
        outcome: 'failure',
        errorClass: 'SmsProviderRejected',
        context: {
          visitor_id: visitorId,
          conversation_id: conversationId,
          provider_error: String(sent?.error ?? 'unknown'),
        },
      });
      await logAction(visitorId, conversationId, 'sms_summary_sent', 'failed', {
        lead_id: lead.id,
        error_class: 'SmsProviderRejected',
        provider_error: String(sent?.error ?? 'unknown'),
      });
      return {
        success: false,
        summary: 'The text could not be sent, so do not tell them it went. Offer to go over the '
          + 'recap here in the chat instead, or to email it.',
      };
    }

    logOutboundOutcome({
      event: 'maya_sms_sent',
      outcome: 'success',
      context: {
        visitor_id: visitorId,
        conversation_id: conversationId,
        summary_length: smsContent.length,
      },
    });
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
    logOutboundOutcome({
      event: 'maya_sms_threw',
      outcome: 'failure',
      errorClass: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { visitor_id: visitorId, conversation_id: conversationId },
    });
    await logAction(visitorId, conversationId, 'sms_summary_sent', 'failed', {
      lead_id: lead.id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      error: err?.message,
    });
    // Same rule as above: no provider text in the model-facing summary.
    return {
      success: false,
      summary: 'The text could not be sent, so do not tell them it went. Offer to go over the '
        + 'recap here in the chat instead, or to email it.',
    };
  }
}
