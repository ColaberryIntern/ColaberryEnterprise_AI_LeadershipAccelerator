import { logOutboundOutcome } from './toolContext';

/**
 * The consent chokepoint for Maya's phone-channel tools (MR1, defect 4).
 *
 * MR1's success metric: *"every outbound-capable site tool either calls `evaluateSend` or no
 * longer exists"*. `send_document` got that in the first half of MR1. `send_sms_summary` and
 * `initiate_voice_call` had **no** consent check of any kind: not `evaluateSend`, not
 * `checkLeadSendable`, not `assertConsentForSend`, not `isSuppressedForChannel`, and - for SMS -
 * not even the platform kill switch.
 *
 * ── THE GATE ALREADY KNEW ABOUT THESE CHANNELS ──────────────────────────────
 *
 * Nothing had to be built. `SendChannel` is `'email' | 'sms' | 'voice'`
 * (`communicationSafetyService.ts:25`), `SendRequest` already carries `toPhone`, and
 * `consentService.ts:193-198` already holds the TCPA rule: for `voice` or `sms`, an express
 * basis is required and anything else is a **block**, not a warning. These two tools simply
 * walked around all of it.
 *
 * It is not theoretical in this database either. Measured 2026-11-12: `consent_records` holds
 * **297 phone rows across 150 subjects**, and `consent_enforcement` is `'enforce'`.
 *
 * ── WHY THE REASON NEVER REACHES THE VISITOR ────────────────────────────────
 *
 * A blocked reason is a fact about somebody's record - that they unsubscribed, bounced,
 * complained, or sit outside a brand's permission. Reading it back to whoever is in the chat
 * would disclose it to a person who may not be its subject, since the phone number on a voice
 * call is whatever the visitor typed. So the reason goes to the structured log and the audit
 * row, and the model is told only that the channel is unavailable and what to offer instead.
 *
 * ── AND WHY A THROW IS NOT A LICENCE ────────────────────────────────────────
 *
 * If the gate cannot be evaluated, the answer is no. `agentEmailTool` states the same rule for
 * email: a gate that cannot be read is not permission. The alternative is contacting somebody
 * whose opt-out we were unable to look up.
 */

export interface OutboundConsentAnswer {
  allowed: boolean;
  /** Present when refused. For the log and the audit row - never for the visitor. */
  reason?: string;
  /** Test-mode redirect. Honoured, because ignoring it dials a real person in test mode. */
  redirectPhone?: string;
}

/**
 * Ask the gate whether this lead may be reached on this phone channel.
 *
 * `communicationSafetyService` is imported dynamically on purpose: it pulls the campaign,
 * consent and suppression graph, and a static import would drag all of it into every module
 * that touches a site-chat tool - including the DB-free test suites.
 */
export async function checkPhoneConsent(
  leadId: number,
  channel: 'sms' | 'voice',
  toPhone: string,
  logContext: Record<string, unknown>,
): Promise<OutboundConsentAnswer> {
  try {
    const { evaluateSend } = await import('../communicationSafetyService');
    const decision = await evaluateSend({ leadId, channel, toPhone, source: 'agent' });
    if (!decision.allowed) {
      const reason = decision.blockedReason ?? 'send_not_allowed';
      logOutboundOutcome({
        event: `maya_${channel}_blocked_by_consent`,
        outcome: 'failure',
        errorClass: 'SendNotAllowed',
        context: { ...logContext, lead_id: leadId, reason },
      });
      return { allowed: false, reason };
    }
    return { allowed: true, redirectPhone: decision.redirect?.phone };
  } catch (err: unknown) {
    logOutboundOutcome({
      event: `maya_${channel}_consent_unreadable`,
      outcome: 'failure',
      errorClass: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { ...logContext, lead_id: leadId },
    });
    return { allowed: false, reason: 'consent_unreadable' };
  }
}

/** What the model is told when a channel is closed for this person. Never the reason. */
export const CONSENT_REFUSED_SUMMARY: Readonly<Record<'sms' | 'voice', string>> = Object.freeze({
  sms: 'Texting is not available for this person, so nothing was sent and do not say it was. '
    + 'Offer to go over the recap here in the chat, or to email it.',
  voice: 'Calling is not available for this person, so no call was placed and do not say one is '
    + 'coming. Offer the booking calendar instead.',
});
