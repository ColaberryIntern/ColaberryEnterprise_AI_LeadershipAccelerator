/**
 * Which GoHighLevel sub-account a lead belongs in.
 *
 * Background (Kes, 2026-08-25): open-house and training-site leads were not
 * reachable by Cora Voice or admissions. Two things were wrong. The sync was
 * never called on those paths, and - the reason wiring it up was not enough -
 * the one stored `ghl_api_key` is scoped to the **Agent Cory AI** sub-account,
 * not "Colaberry School of Data Analytics". GHL v1 keys are per sub-account, so
 * a single global key can only ever write to one place. `ghl_location_id` in
 * settings was written but read by nothing.
 *
 * This module makes the destination a per-source decision.
 *
 * THE IMPORTANT PROPERTY: a source that is routed to an account whose key is
 * not configured yet resolves to `null`, and callers MUST NOT sync. That is
 * deliberately different from "fall back to the default account". Falling back
 * would put those leads in Agent Cory AI, which is the wrong CRM and feeds an
 * outbound dialer - exactly the outcome the routing exists to prevent. Skipping
 * leaves them where they already are: visible in /admin/leads, absent from GHL.
 */
import { getSetting } from '../settingsService';
import { groupForSource } from './leadSourceGroups';

/** Marker for "use the historical single key" so routes can be explicit. */
export const DEFAULT_ACCOUNT = 'default';

export interface GhlAccount {
  /** The credential to authenticate with. Never logged. */
  apiKey: string;
  /** Stable identifier for logs and activity rows, e.g. 'default'. */
  accountKey: string;
}

export type GhlRouteOutcome =
  | { status: 'ready'; account: GhlAccount }
  /** Routed somewhere real, but that account has no key on file yet. Do not sync. */
  | { status: 'unconfigured'; accountKey: string; settingKey: string }
  /** No key at all, not even the default. Nothing can sync. */
  | { status: 'no_credentials' };

/**
 * Settings key holding the group-key to account-name map, e.g.
 * `{"open_house": "school_of_data_analytics"}`. A group absent from this map
 * uses the default account, which is what every source did before this existed.
 */
export const ROUTES_SETTING = 'ghl_account_routes';

/** An account's key lives in `ghl_api_key_<accountName>`. */
export function apiKeySettingFor(accountKey: string): string {
  return accountKey === DEFAULT_ACCOUNT ? 'ghl_api_key' : `ghl_api_key_${accountKey}`;
}

/** Tolerates the map arriving as an object or as a JSON string. */
export function parseRoutes(raw: unknown): Record<string, string> {
  if (!raw) return {};
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // A malformed map must not silently route everything to the default
      // account; treat it as "no routes" and let the caller's logging surface it.
      return {};
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {};

  const out: Record<string, string> = {};
  for (const [group, account] of Object.entries(value as Record<string, unknown>)) {
    if (typeof account === 'string' && account.trim()) out[group] = account.trim();
  }
  return out;
}

/**
 * Resolve the sub-account for a lead source.
 *
 * Callers must branch on `status` and sync only on `'ready'`.
 */
export async function resolveGhlAccountForSource(
  source: string | null | undefined
): Promise<GhlRouteOutcome> {
  const group = groupForSource(source);
  const routes = parseRoutes(await getSetting(ROUTES_SETTING));
  const accountKey = routes[group] || DEFAULT_ACCOUNT;
  const settingKey = apiKeySettingFor(accountKey);

  const apiKey = await getSetting(settingKey);
  if (typeof apiKey === 'string' && apiKey.trim()) {
    return { status: 'ready', account: { apiKey: apiKey.trim(), accountKey } };
  }

  // Explicitly routed elsewhere but not yet provisioned. Withhold the sync.
  if (accountKey !== DEFAULT_ACCOUNT) {
    return { status: 'unconfigured', accountKey, settingKey };
  }
  return { status: 'no_credentials' };
}
