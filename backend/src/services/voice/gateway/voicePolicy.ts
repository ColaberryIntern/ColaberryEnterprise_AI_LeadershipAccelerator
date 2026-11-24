/**
 * Voice Gateway policy (VS1.5): one pure verdict for EVERY outbound dial, whichever path asked.
 *
 * Today each caller guards itself differently and five paths skip the shared consent check
 * (INVENTORY.md F-02, F-05). The gateway replaces that with one ordered, fail-closed policy.
 *
 * Two modes, so migration changes nothing until a route is cut over:
 *  - legacy: exactly today's voiceDialGuard semantics (10:00-20:00 Central, staff numbers exempt
 *    from hours). Used by the synthflow_legacy facade (VS1.6).
 *  - direct: the new engines. Stricter: the recipient's LOCAL hours (09:00-20:00) AND the legacy
 *    Central window must both hold; an unknown recipient timezone FAILS CLOSED.
 *
 * Unknown is never "allow": an unreadable kill switch is ON, unknown suppression or consent blocks.
 * Staff exemptions cover hours and caps only; they never bypass the kill switch, the enable flag,
 * the path allowlist or suppression (directive section 5).
 */

export type PolicyMode = 'legacy' | 'direct';
export type Exemption = 'staff' | 'test' | null;
export type ConsentStatus = 'granted' | 'missing' | 'revoked' | 'expired' | 'unknown' | 'staff_internal';

export interface PolicyFacts {
  mode: PolicyMode;
  killSwitch: 'on' | 'off' | 'unreadable';
  voiceEnabled: boolean;
  pathAllowed: boolean;
  /** Normalized E.164, or null when the recipient has no dialable number. */
  destinationE164: string | null;
  exemption: Exemption;
  consent: ConsentStatus;
  /** true = suppressed / opted out, false = clear, null = could not be read. */
  suppressed: boolean | null;
  /** IANA zone of the recipient, or null when unknown. */
  recipientTimezone: string | null;
  now: Date;
}

export type BlockReason =
  | 'kill_switch_active' | 'kill_switch_unreadable' | 'feature_disabled' | 'path_not_allowed'
  | 'invalid_destination' | 'suppressed' | 'suppression_unknown' | 'consent_missing' | 'consent_revoked'
  | 'consent_expired' | 'consent_unknown' | 'outside_call_hours' | 'recipient_timezone_unknown'
  | 'outside_recipient_hours';

export type PolicyVerdict = { ok: true } | { ok: false; reason: BlockReason };

export const LEGACY_WINDOW = { tz: 'America/Chicago', startMinute: 10 * 60, endMinute: 20 * 60 };
export const RECIPIENT_WINDOW = { startMinute: 9 * 60, endMinute: 20 * 60 };

/** Minutes past local midnight in `tz`, or null when `tz` is not a valid IANA zone. */
export function minuteOfDayIn(now: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  } catch {
    return null;
  }
}

const inWindow = (m: number | null, w: { startMinute: number; endMinute: number }) => m != null && m >= w.startMinute && m < w.endMinute;

export function evaluateVoicePolicy(f: PolicyFacts): PolicyVerdict {
  if (f.killSwitch === 'on') return { ok: false, reason: 'kill_switch_active' };
  if (f.killSwitch === 'unreadable') return { ok: false, reason: 'kill_switch_unreadable' };
  if (!f.voiceEnabled) return { ok: false, reason: 'feature_disabled' };
  if (!f.pathAllowed) return { ok: false, reason: 'path_not_allowed' };
  if (!f.destinationE164 || !/^\+[1-9]\d{6,14}$/.test(f.destinationE164)) return { ok: false, reason: 'invalid_destination' };
  if (f.suppressed === null) return { ok: false, reason: 'suppression_unknown' };
  if (f.suppressed) return { ok: false, reason: 'suppressed' };

  if (f.exemption !== 'staff') {
    if (f.consent === 'missing' || f.consent === 'staff_internal') return { ok: false, reason: 'consent_missing' };
    if (f.consent === 'revoked') return { ok: false, reason: 'consent_revoked' };
    if (f.consent === 'expired') return { ok: false, reason: 'consent_expired' };
    if (f.consent === 'unknown') return { ok: false, reason: 'consent_unknown' };
  }

  if (f.exemption === 'staff') return { ok: true }; // hours exemption, as voiceDialGuard does today
  if (!inWindow(minuteOfDayIn(f.now, LEGACY_WINDOW.tz), LEGACY_WINDOW)) return { ok: false, reason: 'outside_call_hours' };
  if (f.mode === 'direct') {
    if (!f.recipientTimezone) return { ok: false, reason: 'recipient_timezone_unknown' };
    const local = minuteOfDayIn(f.now, f.recipientTimezone);
    if (local == null) return { ok: false, reason: 'recipient_timezone_unknown' };
    if (!inWindow(local, RECIPIENT_WINDOW)) return { ok: false, reason: 'outside_recipient_hours' };
  }
  return { ok: true };
}
