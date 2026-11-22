/**
 * CH10.1 WhatsApp configuration, read from the environment only (W2). Lives outside whatsapp/ and
 * imports NOTHING, so drafting and approvals can ask "is WhatsApp switched on?" without any import
 * path to a sender (draftingImportPath.test.ts treats everything under whatsapp/ as one). WhatsApp is OFF unless
 * COMMS_HUB_WHATSAPP_ENABLED is "true" AND a WHAPI_TOKEN is set AND the base URL is allowed.
 *
 * The base URL rule is what keeps the token from ever being sent to another host:
 *   - production: only https://gate.whapi.cloud (the default) is accepted;
 *   - elsewhere: https, or http on localhost/127.0.0.1 (the local fakeWhapi).
 * A refused URL makes the channel read "not configured" with the reason; no request is made.
 */
export const DEFAULT_WHAPI_BASE_URL = 'https://gate.whapi.cloud';
export const DEFAULT_DAILY_CAP = 40;

export type NotConfiguredReason = 'switched_off' | 'no_token' | 'base_url_not_allowed';

export interface WhatsAppConfig {
  enabled: boolean;
  /** Present only when every condition holds; callers never read the env themselves. */
  token: string | null;
  baseUrl: string;
  dailyCap: number;
  notConfigured: NotConfiguredReason | null;
  /**
   * TEST SEAM (CH10.6): skip the 8 AM to 8 PM Central window, so the local end-to-end run can send at
   * any hour. Read from COMMS_HUB_WHATSAPP_ALWAYS_OPEN=true and IGNORED when NODE_ENV is production.
   */
  windowAlwaysOpen: boolean;
}

function cleanUrl(raw: string): string { return raw.trim().replace(/\/+$/, ''); }

export function baseUrlAllowed(url: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv === 'production') return url === DEFAULT_WHAPI_BASE_URL;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol === 'https:') return true;
  return parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
}

export function readWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const enabled = (env.COMMS_HUB_WHATSAPP_ENABLED ?? '').trim().toLowerCase() === 'true';
  const token = (env.WHAPI_TOKEN ?? '').trim();
  const baseUrl = cleanUrl(env.WHAPI_BASE_URL || DEFAULT_WHAPI_BASE_URL);
  const capRaw = Number.parseInt(env.COMMS_HUB_WHATSAPP_DAILY_CAP ?? '', 10);
  const dailyCap = Number.isFinite(capRaw) && capRaw > 0 && capRaw <= 500 ? capRaw : DEFAULT_DAILY_CAP;
  let notConfigured: NotConfiguredReason | null = null;
  if (!enabled) notConfigured = 'switched_off';
  else if (!token) notConfigured = 'no_token';
  else if (!baseUrlAllowed(baseUrl, env.NODE_ENV)) notConfigured = 'base_url_not_allowed';
  const windowAlwaysOpen = env.NODE_ENV !== 'production' && (env.COMMS_HUB_WHATSAPP_ALWAYS_OPEN ?? '').trim().toLowerCase() === 'true';
  return { enabled, token: notConfigured ? null : token, baseUrl, dailyCap, notConfigured, windowAlwaysOpen };
}

export const NOT_CONFIGURED_TEXT: Record<NotConfiguredReason, string> = {
  switched_off: 'WhatsApp is switched off for the hub.',
  no_token: 'No WhatsApp connection token is set.',
  base_url_not_allowed: 'The WhatsApp service address is not allowed, so nothing is sent.',
};
