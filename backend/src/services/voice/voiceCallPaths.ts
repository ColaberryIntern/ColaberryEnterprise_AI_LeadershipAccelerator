/**
 * voiceCallPaths - which call paths may dial at all (agent comms tool, 2026-11-22).
 *
 * `ENABLE_VOICE_CALLS` is one switch for the whole platform. About a dozen paths reach
 * `triggerVoiceCall` (Open House countdown calls, automation cold calls, alerts, callbacks,
 * internship, project discovery, the admissions agent...), so turning the switch on for one of
 * them used to turn it on for all of them. Ali, 2026-11-22, chose to turn calls back on ONLY for
 * agents granted the call tool and the Enterprise intake. This allowlist is how that is enforced,
 * at the one chokepoint every path goes through.
 *
 * Path key = the call's brandSlug, else its callType (e.g. 'enterprise-intake', 'agent-tool',
 * 'open_house'). `VOICE_CALL_PATHS` is a comma-separated list of keys.
 *
 * FAIL CLOSED: unset, empty or whitespace allows NOTHING. Flipping ENABLE_VOICE_CALLS on without
 * also naming paths dials no one, so the switch can never wake a path nobody chose.
 */
import { env } from '../../config/env';

export function voiceCallPathKey(p: { brandSlug?: string | null; callType?: string | null }): string {
  return String((p.brandSlug && p.brandSlug.trim()) || p.callType || '').trim().toLowerCase();
}

export function allowedVoicePaths(raw: string | undefined = env.voiceCallPaths): Set<string> {
  return new Set(String(raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function isVoicePathAllowed(key: string, raw: string | undefined = env.voiceCallPaths): boolean {
  const k = String(key || '').trim().toLowerCase();
  return Boolean(k) && allowedVoicePaths(raw).has(k);
}
