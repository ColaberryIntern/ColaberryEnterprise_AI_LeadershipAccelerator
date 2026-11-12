/**
 * What the model is told when a voice call did not happen (MR1, defect 4).
 *
 * These strings are read by the model, not spoken to the visitor verbatim - that is the house
 * style for every tool summary on the site belt ("No phone number on file. Ask for their phone
 * first."). Three rules each one obeys:
 *
 *  1. **It never implies a call is coming.** The prompt used to script "I'm placing a call to you
 *     now" BEFORE the tool's answer was known, which is how two real visitors on 2026-10-24 and
 *     2026-11-06 were told to expect a call that could not arrive.
 *  2. **It names the alternative that actually works**, because an honest refusal with no route
 *     forward is a worse visit than the lie it replaces. `schedule_callback` writes a real
 *     `callback_requests` row; it is the live path while voice is off.
 *  3. **It routes to the alternative that fits the reason.** A bad number needs a correct number,
 *     not a callback to the same bad number. A platform-wide stop needs no outbound route at all.
 *
 * ── THERE ARE SEVEN SKIP REASONS, NOT SIX ───────────────────────────────────
 *
 * An earlier version of this table named six and a reviewer found the seventh: `invalid_phone`
 * (`synthflowService.ts:222`), raised after the number is normalised. The generic guard in the
 * handler is keyed on `data.skipped === true` rather than on this table, so the seventh reason
 * always refused correctly even while it was unlisted - but it fell through to the fallback,
 * which tells the model to offer a callback when "ask for a number that works" is the right
 * answer. That is the kind of gap a list-shaped constant invites, so the handler's correctness
 * does not depend on this table being complete and `voiceSkipSummary` always answers.
 */

/** Every reason `triggerVoiceCall` declines to dial while still returning `success: true`. */
export const VOICE_SKIP_REASONS = [
  'kill_switch_active',
  'feature_disabled',
  'no_phone',
  'invalid_phone',
  'no_api_key',
  'no_agent_id',
  'no_prompt',
] as const;

export type VoiceSkipReason = typeof VOICE_SKIP_REASONS[number];

const SUMMARIES: Readonly<Record<VoiceSkipReason, string>> = Object.freeze({
  feature_disabled:
    'Voice calling is switched off, so no call was placed and none will arrive. Do not say a call '
    + 'is coming. Offer to arrange a callback with schedule_callback, or the booking calendar.',
  kill_switch_active:
    'Outbound calling is stopped platform-wide, so no call was placed. Do not offer a call at '
    + 'all. Offer the booking calendar instead.',
  no_api_key:
    'The calling system is not configured, so no call was placed. Do not say a call is coming. '
    + 'Offer to arrange a callback with schedule_callback.',
  no_agent_id:
    'The calling system is not configured, so no call was placed. Do not say a call is coming. '
    + 'Offer to arrange a callback with schedule_callback.',
  no_prompt:
    'The call could not be set up safely, so no call was placed. Offer to arrange a callback '
    + 'with schedule_callback.',
  no_phone:
    'No phone number reached the calling system, so no call was placed. Ask for their phone '
    + 'number before trying again.',
  invalid_phone:
    'That phone number is not one we can dial, so no call was placed. Ask them to confirm the '
    + 'number, including the country or area code, and do not offer a callback to the same number.',
});

/** The fallback, for a skip reason this file has not seen. Still never promises a call. */
export const VOICE_SKIP_SUMMARY_FALLBACK =
  'No call was placed. Do not say a call is coming. Offer to arrange a callback with '
  + 'schedule_callback instead.';

/** Always answers. An unknown reason gets the fallback rather than an empty string. */
export function voiceSkipSummary(reason: string | null | undefined): string {
  if (!reason) return VOICE_SKIP_SUMMARY_FALLBACK;
  return (SUMMARIES as Readonly<Record<string, string>>)[reason] ?? VOICE_SKIP_SUMMARY_FALLBACK;
}
