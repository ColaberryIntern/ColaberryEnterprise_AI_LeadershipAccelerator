/**
 * Explorer Growth OS — AI voice eligibility. Plan §16.2; EPIC 9/10.
 *
 * §16: "Ships disabled. EXPLORER_AUTO_DIAL_ENABLED=false. Not enabled without
 * the §35 compliance decisions."
 *
 * THE STRICTEST GATE IN THE SYSTEM, AND THE ONLY ONE WITH LEGAL EXPOSURE
 * ATTACHED. Every other channel's worst case is an unwanted email. This one's
 * worst case is an unconsented automated call, which is a TCPA claim per call
 * and a real intrusion into someone's day.
 *
 * So all fourteen §16.2 conditions must hold, each is checked independently,
 * and every one of them fails CLOSED — an unreadable input is a refusal, never
 * a pass. There is no combination of missing data that produces `eligible:
 * true`, and the tests assert that per condition rather than in aggregate.
 *
 * IT REPORTS EVERY FAILING GATE, not the first. When a compliance question is
 * asked later — "why did this learner get a call" or, more likely, "why did
 * this one not" — the answer needs to be the complete set of reasons, not
 * whichever check happened to run first.
 *
 * PURE. Every input is supplied, so "would we have called this person" is
 * answerable without a database, and the whole gate is testable without any
 * possibility of placing a call.
 */
import { mayCallNow, type TimezoneInputs } from './explorerTimezoneService';

/** §16.2: stricter than email's F < 25. */
export const MAX_F_SCORE_VOICE = 15;

/** §16.2: HIGH_INTENT alone is not enough — voice needs the top tier. */
export const MIN_SIGNAL_TIER_VOICE = 4;

export const MAX_ATTEMPTS_LIFETIME = 3;
export const MIN_DAYS_BETWEEN_ATTEMPTS = 14;
export const MIN_HOURS_SINCE_ANY_CONTACT = 72;

/**
 * The only consent bases §16.2 accepts for voice.
 *
 * Not "any granted record". TCPA requires prior express written consent, and an
 * implied or legitimate-interest basis that satisfies email does not satisfy a
 * robocall.
 */
export const ACCEPTABLE_VOICE_CONSENT_BASES = ['express_written', 'double_opt_in'] as const;

export type VoiceConsentBasis = (typeof ACCEPTABLE_VOICE_CONSENT_BASES)[number];

export interface VoiceEligibilityContext {
  /** EXPLORER_AUTO_DIAL_ENABLED, read via isExplorerFeatureEnabled. */
  autoDialEnabled: boolean;
  /** env.enableVoiceCalls — the platform-wide voice switch. */
  voiceCallsEnabled: boolean;
  /** The operational kill switch. True means STOP. */
  killSwitchEngaged: boolean;

  overlays: readonly string[];
  highestSignalTier: number;
  fScore: number;
  isConverted: boolean;

  /** Must already be E.164. This gate validates, it does not normalise. */
  phoneE164: string | null;

  /** Current consent record for the VOICE channel, if any. */
  voiceConsent: { status: string; basis: string } | null;
  isUnsubscribedOrDnc: boolean;

  /** For the learner-local call window. */
  timezone: TimezoneInputs;
  now: Date;

  attemptsLifetime: number;
  daysSinceLastAttempt: number | null;
  hoursSinceAnyContact: number | null;

  hasOpenSupportCase: boolean;
  hasUnresolvedFriction: boolean;
}

export interface VoiceEligibilityVerdict {
  eligible: boolean;
  reasons: string[];
}

/** E.164: a leading +, a non-zero country digit, then up to 14 more. */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && E164.test(phone.trim());
}

/**
 * Evaluate the full §16.2 gate. All fourteen conditions must hold.
 */
export function evaluateVoiceEligibility(ctx: VoiceEligibilityContext): VoiceEligibilityVerdict {
  const reasons: string[] = [];

  // 1-3. The switches. Three of them, and all must be on: a feature flag, the
  // platform switch, and an operational kill switch that a human can throw
  // without a deploy.
  if (!ctx.autoDialEnabled) reasons.push('EXPLORER_AUTO_DIAL_ENABLED is off');
  if (!ctx.voiceCallsEnabled) reasons.push('platform voice calls are disabled');
  if (ctx.killSwitchEngaged) reasons.push('voice kill switch is engaged');

  // 4. Intent, at the top tier only.
  if (!ctx.overlays.includes('HIGH_INTENT')) reasons.push('no HIGH_INTENT overlay');
  if (!(ctx.highestSignalTier >= MIN_SIGNAL_TIER_VOICE)) {
    reasons.push(`highest signal tier ${ctx.highestSignalTier} < ${MIN_SIGNAL_TIER_VOICE}`);
  }

  // 5. Friction, stricter than email.
  if (!(ctx.fScore < MAX_F_SCORE_VOICE)) {
    reasons.push(`F score ${ctx.fScore} >= ${MAX_F_SCORE_VOICE}`);
  }
  if (!Number.isFinite(ctx.fScore)) reasons.push('F score is not finite');

  // 6.
  if (ctx.isConverted) reasons.push('already converted');

  // 7.
  if (!isValidE164(ctx.phoneE164)) reasons.push('no valid E.164 phone number');

  // 8. Consent, on the narrow bases only.
  if (!ctx.voiceConsent) {
    reasons.push('no voice consent record');
  } else {
    if (ctx.voiceConsent.status !== 'granted') {
      reasons.push(`voice consent status is "${ctx.voiceConsent.status}", not granted`);
    }
    if (!(ACCEPTABLE_VOICE_CONSENT_BASES as readonly string[]).includes(ctx.voiceConsent.basis)) {
      // An implied or legitimate-interest basis satisfies email and does not
      // satisfy a robocall.
      reasons.push(
        `voice consent basis "${ctx.voiceConsent.basis}" is not ${ACCEPTABLE_VOICE_CONSENT_BASES.join(' or ')}`,
      );
    }
  }

  // 9.
  if (ctx.isUnsubscribedOrDnc) reasons.push('unsubscribed or on DNC');

  // 10. Learner-LOCAL hours. Refuses outright when the zone is unknown (§35 D-3).
  const window = mayCallNow(ctx.timezone, ctx.now);
  if (!window.allowed) reasons.push(window.reason);

  // 11. Attempt caps.
  if (ctx.attemptsLifetime >= MAX_ATTEMPTS_LIFETIME) {
    reasons.push(`${ctx.attemptsLifetime} lifetime attempts (max ${MAX_ATTEMPTS_LIFETIME})`);
  }
  if (ctx.daysSinceLastAttempt !== null && ctx.daysSinceLastAttempt < MIN_DAYS_BETWEEN_ATTEMPTS) {
    reasons.push(
      `last attempt ${ctx.daysSinceLastAttempt}d ago (min ${MIN_DAYS_BETWEEN_ATTEMPTS}d)`,
    );
  }

  // 12. Quiet period after ANY contact, not just voice. Being emailed in the
  // morning and called in the afternoon is the experience this prevents.
  if (ctx.hoursSinceAnyContact === null) {
    reasons.push('contact recency unknown');
  } else if (ctx.hoursSinceAnyContact < MIN_HOURS_SINCE_ANY_CONTACT) {
    reasons.push(
      `contacted ${ctx.hoursSinceAnyContact}h ago (min ${MIN_HOURS_SINCE_ANY_CONTACT}h)`,
    );
  }

  // 13-14. Someone with an open problem gets help, not a sales call.
  if (ctx.hasOpenSupportCase) reasons.push('open support case');
  if (ctx.hasUnresolvedFriction) reasons.push('unresolved friction');

  return { eligible: reasons.length === 0, reasons };
}
