/**
 * Twilio credentials for Voice AI Studio (VS2.1), validated once per read and never logged.
 *
 * REST calls use the API key pair (TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET) already in the prod
 * env. Webhook and WebSocket signature validation needs the account Auth Token: Twilio signs with
 * the primary Auth Token, not an API key secret. Until TWILIO_AUTH_TOKEN is set, every signed
 * request is refused (fail closed) and `health` says why by NAME, never by value.
 */
import { z } from 'zod';

const Schema = z.object({
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/i),
  TWILIO_API_KEY_SID: z.string().regex(/^SK[0-9a-f]{32}$/i),
  TWILIO_API_KEY_SECRET: z.string().min(16),
  TWILIO_AUTH_TOKEN: z.string().min(16).optional(),
});

export interface TwilioCredentials { accountSid: string; apiKeySid: string; apiKeySecret: string; authToken?: string }
export type CredentialsResult = { ok: true; creds: TwilioCredentials } | { ok: false; invalid: string[] };

export function loadTwilioCredentials(env: Record<string, string | undefined> = process.env): CredentialsResult {
  const picked = Object.fromEntries(Object.keys(Schema.shape).map((k) => [k, env[k] || undefined]));
  const r = Schema.safeParse(picked);
  if (!r.success) return { ok: false, invalid: [...new Set(r.error.issues.map((i) => String(i.path[0])))] };
  const v = r.data;
  return { ok: true, creds: { accountSid: v.TWILIO_ACCOUNT_SID, apiKeySid: v.TWILIO_API_KEY_SID, apiKeySecret: v.TWILIO_API_KEY_SECRET, authToken: v.TWILIO_AUTH_TOKEN } };
}

/** The auth token alone (for signature checks). Undefined = refuse every signed request. */
export function twilioAuthToken(env: Record<string, string | undefined> = process.env): string | undefined {
  const t = env.TWILIO_AUTH_TOKEN;
  return t && t.length >= 16 ? t : undefined;
}
