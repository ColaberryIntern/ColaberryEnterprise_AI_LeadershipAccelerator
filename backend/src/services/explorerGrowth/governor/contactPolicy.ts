import type { Candidate, GovernorContext } from './types';

/**
 * Explorer Growth OS — contact policy. Plan §9.3; EPIC 4 T002.
 *
 * Decides whether a chosen candidate may actually be delivered. Every rejection
 * carries a machine-readable reason — a bare `false` is unactionable when
 * someone asks why a learner heard nothing.
 *
 * THE POINT OF THIS FILE, and the mistake it exists to avoid.
 *
 * The consent and safety helpers in this repo FAIL OPEN. That is correct for
 * their real job — they guard a send path, and locking a paying member out of
 * content over a transient database hiccup is worse than one extra email:
 *
 *   - `consentService.assertConsentForSend` — "SWALLOW-SAFE and FAILS OPEN …
 *     degrades to allow". It never throws.
 *   - `communicationSafetyService.evaluateSend` — "Fail open for pause check".
 *   - `evaluateConsent` — returns ALLOW / `can_spam_opt_out` for anyone with no
 *     consent record at all, which is most Explorers.
 *
 * Used as a GATE, "allow" from these means "we could not tell". EPIC 3 already
 * shipped exactly this bug in a different place: `resolveContentPageAccess`
 * returns `true` on error, was used as a conversion predicate, and marked all
 * 153 production learners CONVERTED — permanently unmailable — while a
 * `try/catch` labelled "fails closed" sat around it doing nothing, because the
 * function never threw.
 *
 * So this policy distinguishes THREE outcomes, not two:
 *
 *   allowed_with_record  — a real consent record permits it
 *   allowed_no_evidence  — the helper said yes but has nothing to back it
 *   rejected             — a reason to stop
 *
 * `allowed_no_evidence` is surfaced onto the decision row rather than silently
 * treated as consent, so a human can see exactly which learners we have no
 * evidence for before anything is enabled.
 */

export type ContactVerdict =
  | { allowed: true; basis: 'record'; }
  | { allowed: true; basis: 'no_evidence'; note: string }
  | { allowed: false; reason: string };

/** What the policy needs. Resolved FRESH at decision time, never from the profile. */
export interface ContactPolicyInput {
  /** Live contactability, re-resolved now. */
  channelEligible: boolean;
  channelReason?: string;
  /** The consent engine's verdict, plus whether it rested on a real record. */
  consent: { verdict: 'allow' | 'block'; reason: string; hasRecord: boolean };
  /** Sends to this learner inside the frequency window. */
  recentContactCount: number;
  /** Hours since the last contact, or null if never contacted. */
  hoursSinceLastContact: number | null;
}

/** §9.3 defaults. Conservative: the population has never been messaged at all. */
export const MAX_CONTACTS_PER_WINDOW = 3;
export const CONTACT_WINDOW_DAYS = 7;
export const MIN_HOURS_BETWEEN_CONTACTS = 48;

/**
 * May this candidate be delivered?
 *
 * Ordered cheapest-and-most-decisive first, so the reason recorded is the most
 * informative one rather than whichever check happened to run first.
 */
export function evaluateContact(
  candidate: Candidate,
  input: ContactPolicyInput,
): ContactVerdict {
  // An action needing no channel (a human task) bypasses channel checks — there
  // is nobody to protect from a task in a queue.
  if (candidate.channel === 'none') return { allowed: true, basis: 'record' };

  if (!input) return { allowed: false, reason: 'policy_input_missing' };

  if (input.channelEligible !== true) {
    return { allowed: false, reason: input.channelReason || 'channel_ineligible' };
  }

  if (input.consent?.verdict === 'block') {
    return { allowed: false, reason: input.consent.reason || 'consent_block' };
  }

  if (input.recentContactCount >= MAX_CONTACTS_PER_WINDOW) {
    return {
      allowed: false,
      reason: `frequency_cap (${input.recentContactCount} in ${CONTACT_WINDOW_DAYS}d)`,
    };
  }

  if (
    input.hoursSinceLastContact !== null &&
    input.hoursSinceLastContact < MIN_HOURS_BETWEEN_CONTACTS
  ) {
    return {
      allowed: false,
      reason: `cooldown (${Math.floor(input.hoursSinceLastContact)}h < ${MIN_HOURS_BETWEEN_CONTACTS}h)`,
    };
  }

  // Allowed — but say WHICH kind of allowed.
  if (input.consent?.hasRecord !== true) {
    return {
      allowed: true,
      basis: 'no_evidence',
      note: input.consent?.reason || 'no consent record; permitted by default rule only',
    };
  }

  return { allowed: true, basis: 'record' };
}

/**
 * Wraps a consent lookup so a THROWN error becomes a block rather than
 * propagating.
 *
 * Both shapes must be handled, and testing only one is how this goes wrong in
 * both directions. `assertConsentForSend` genuinely never throws — but
 * `evaluateConsent` has no try/catch at all and `evaluateSend` guards only its
 * pause check, so both DO throw on a database error. An earlier draft of this
 * plan asserted the fail-open shape and forbade testing the throw; that was the
 * previous blind spot's mirror image.
 */
export async function safeConsent(
  lookup: () => Promise<{ verdict: 'allow' | 'block'; reason: string; hasRecord: boolean }>,
): Promise<{ verdict: 'allow' | 'block'; reason: string; hasRecord: boolean }> {
  try {
    const r = await lookup();
    if (!r || (r.verdict !== 'allow' && r.verdict !== 'block')) {
      return { verdict: 'block', reason: 'consent_unreadable', hasRecord: false };
    }
    return r;
  } catch {
    // Fail CLOSED here, precisely because the underlying helpers fail open.
    return { verdict: 'block', reason: 'consent_lookup_threw', hasRecord: false };
  }
}
