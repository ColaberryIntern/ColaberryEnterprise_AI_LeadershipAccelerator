/**
 * Twilio request signature validation (VS2.1).
 *
 * Algorithm (https://www.twilio.com/docs/usage/security, read 2026-11-24): take the full public URL
 * Twilio called (protocol through query string), append every POST parameter as name+value with no
 * delimiter in case-sensitive sorted order, HMAC-SHA1 with the account Auth Token, base64. The unit
 * test pins the page's own worked example (expected L/OH5YylLD5NRKLltdqwSvS0BnU=).
 *
 * Behind nginx and a TLS terminator, the URL the backend sees is not the URL Twilio signed. We never
 * rebuild it from Host or X-Forwarded-* headers (both attacker-controlled); the public origin comes
 * from the validated VOICE_PUBLIC_BASE_URL and only the path + query comes from the request.
 *
 * Failure modes handled: missing/garbled header, wrong length, wrong token, a tampered parameter or
 * query string, a missing auth token (fails closed: nothing validates). Not handled here: replay of a
 * correctly signed request (Twilio signs no timestamp); see correlationToken.ts and the event store.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type TwilioParams = Record<string, string | string[] | undefined>;

/** The exact string Twilio signs. Repeated keys contribute each value in received order. */
export function signaturePayload(url: string, params: TwilioParams): string {
  let s = url;
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) s += key + one;
  }
  return s;
}

export function computeTwilioSignature(authToken: string, url: string, params: TwilioParams): string {
  return createHmac('sha1', authToken).update(Buffer.from(signaturePayload(url, params), 'utf-8')).digest('base64');
}

/** Constant-time compare. False for any missing input: no token means nothing is ever trusted. */
export function isValidTwilioSignature(authToken: string | undefined, url: string, params: TwilioParams, signature: string | undefined): boolean {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The URL Twilio called, from our configured public origin plus the request's own path and query
 * (kept byte-for-byte: re-encoding breaks the signature). Twilio drops the port for HTTPS voice
 * callbacks, so a port in the base URL is removed too.
 */
export function canonicalWebhookUrl(publicBaseUrl: string, originalUrl: string): string {
  const base = new URL(publicBaseUrl);
  const origin = `${base.protocol}//${base.hostname}`;
  return origin + (originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`);
}
