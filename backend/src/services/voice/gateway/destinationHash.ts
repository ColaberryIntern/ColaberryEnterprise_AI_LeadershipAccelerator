/**
 * Keyed hash of a destination number (VS1.5), so dial caps can be counted per destination without
 * storing the number. A plain SHA-256 of a 10-digit number is reversible by brute force in minutes;
 * an HMAC with a server-side key is not.
 *
 * Key: VOICE_DESTINATION_HASH_KEY, else a value derived from JWT_SECRET (which env.ts already
 * refuses to leave unset in production). Rotating the key only resets the 24-hour cap window.
 */
import { createHmac } from 'crypto';
import { env } from '../../../config/env';
import { loadVoiceConfig } from '../voiceConfig';

/** From the VALIDATED voice config (VS1.7): a too-short or otherwise invalid key falls back to the derived one. */
export function destinationHashKey(): string {
  return loadVoiceConfig().VOICE_DESTINATION_HASH_KEY || `voice-destination:${env.jwtSecret}`;
}

/** HMAC-SHA256 hex of an already-normalized E.164 number. */
export function hashDestination(e164: string, key: string = destinationHashKey()): string {
  return createHmac('sha256', key).update(e164).digest('hex');
}
