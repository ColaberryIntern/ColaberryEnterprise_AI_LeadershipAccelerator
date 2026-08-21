import { Lead } from '../../models';
import { evaluateConsent } from '../consentService';
import { redactForLogs } from '../../utils/piiRedaction';
import type { ExplorerContactability } from '../../types/explorerGrowth';

/**
 * Explorer Growth OS — contactability resolver. Plan §7.5, EPIC 3 T003.
 *
 * Answers "may we contact this learner, on which channel, and if not why not".
 * NOT a score — a resolved object where every `false` carries a machine-readable
 * reason, because a bare false is unactionable downstream.
 *
 * FAILS CLOSED, without exception. Any error resolving a channel marks that
 * channel ineligible. The asymmetry is deliberate: wrongly withholding an email
 * costs one touch, wrongly sending one can cost a CAN-SPAM or TCPA violation.
 *
 * IT REFLECTS REALITY, NOT ASPIRATION (plan §35). Three things are true of this
 * repo today and this resolver must not pretend otherwise:
 *
 *   1. Consent enforcement runs in SHADOW mode in production — decisions are
 *      logged, not enforced. This resolver returns what consent SAYS; whether
 *      anything obeys it is EPIC 4's problem.
 *   2. There is NO per-lead timezone. So quiet hours cannot be resolved per
 *      learner, and `quiet_hours_active` reports `undefined` (unknown) rather
 *      than a comfortable `false`. A false here would read as "safe to send at
 *      3am", which is worse than admitting we do not know.
 *   3. Suppression is GLOBAL, not per channel. `processOptOut` stops everything,
 *      so a learner who opted out of SMS is also email-ineligible. That is
 *      over-suppression, which is the safe direction.
 *
 * EPIC 4 MUST RE-RESOLVE AT DECISION TIME. This object is stored on the profile
 * for inspection and for the admin surface, but a stored eligibility goes stale
 * the moment someone unsubscribes. Never send on the strength of a cached value.
 */

/** Lead statuses that stop all outbound, whatever the consent record says. */
const SUPPRESSED_LEAD_STATUSES = ['unsubscribed', 'dnd', 'bounced', 'complained'];

type ChannelVerdict = { eligible: boolean; reason?: string };

async function resolveChannel(
  channel: 'email' | 'sms' | 'voice',
  input: { leadId: number | null; email: string | null },
): Promise<ChannelVerdict> {
  try {
    const decision = await evaluateConsent({
      channel,
      leadId: input.leadId,
      email: input.email,
    });
    if (decision.verdict === 'allow') return { eligible: true };
    return { eligible: false, reason: decision.reason || 'consent_block' };
  } catch (err: any) {
    // Fail closed. An unreadable consent record is not permission.
    console.warn(
      redactForLogs(
        JSON.stringify({
          event: 'explorer.contactability_channel_failed',
          service: 'explorer-growth',
          level: 'warn',
          outcome: 'failure',
          error_class: err?.name || 'ConsentReadError',
          channel,
          lead_id: input.leadId,
        }),
      ),
    );
    return { eligible: false, reason: 'consent_lookup_failed' };
  }
}

/**
 * Resolve every channel for one learner.
 *
 * `in_app` is always eligible: it is a surface the learner chose to visit, not
 * an interruption we push at them, so no consent regime governs it. It is the
 * one channel that stays open when everything else is suppressed — which makes
 * it the right fallback for a learner we may not email.
 */
export async function resolveContactability(input: {
  enrollmentId: string;
  leadId: number | null;
  email: string | null;
}): Promise<ExplorerContactability> {
  // Suppression first: it overrides consent in the restrictive direction, and
  // checking it once avoids three consent lookups for a suppressed learner.
  let suppressedReason: string | null = null;
  if (input.leadId !== null) {
    try {
      const lead = await Lead.findByPk(input.leadId, { attributes: ['status'] });
      const status = (lead as any)?.status as string | undefined;
      if (status && SUPPRESSED_LEAD_STATUSES.includes(status)) {
        suppressedReason = `lead_status_${status}`;
      }
    } catch (err: any) {
      // Fail closed: if we cannot read suppression state, assume suppressed.
      console.warn(
        redactForLogs(
          JSON.stringify({
            event: 'explorer.contactability_lead_read_failed',
            service: 'explorer-growth',
            level: 'warn',
            outcome: 'failure',
            error_class: err?.name || 'LeadReadError',
            lead_id: input.leadId,
          }),
        ),
      );
      suppressedReason = 'suppression_lookup_failed';
    }
  }

  if (suppressedReason) {
    return {
      email: { eligible: false, reason: suppressedReason },
      sms: { eligible: false, reason: suppressedReason },
      voice: { eligible: false, reason: suppressedReason },
      in_app: { eligible: true },
      // Unknown, not false — see the header note. There is no per-lead timezone.
      quiet_hours_active: undefined,
      next_eligible_at: null,
    };
  }

  const [email, sms, voice] = await Promise.all([
    resolveChannel('email', input),
    resolveChannel('sms', input),
    resolveChannel('voice', input),
  ]);

  return {
    email,
    sms,
    voice,
    in_app: { eligible: true },
    quiet_hours_active: undefined,
    next_eligible_at: null,
  };
}
