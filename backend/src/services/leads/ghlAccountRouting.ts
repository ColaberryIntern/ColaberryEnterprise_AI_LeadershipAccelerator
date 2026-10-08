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
  | { status: 'no_credentials' }
  /**
   * T214: the routes setting EXISTS but cannot be read, so we do not know where
   * this lead belongs. Do not sync. See `parseRoutes`.
   */
  | { status: 'routes_unreadable'; settingKey: string };

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

/**
 * Tolerates the map arriving as an object or as a JSON string.
 *
 * Returns `{}` for an ABSENT setting — no routes configured is the legitimate
 * pre-existing state, and every source then uses the default account.
 *
 * Returns **`null`** for a setting that is PRESENT but unreadable, and that
 * distinction is the whole T214 fix. This function used to return `{}` for both,
 * after which `resolveGhlAccountForSource`'s `routes[group] || DEFAULT_ACCOUNT`
 * sent every lead to the default — Agent Cory AI, the wrong CRM, in front of an
 * outbound dialer. The comment that stood here claimed "a malformed map must not
 * silently route everything to the default account" while the code did exactly
 * that, and a passing test pinned the behaviour as intended.
 *
 * The old test's argument was that a broken map must not withhold every lead.
 * That has force, but a corrupt map means we do not KNOW where a lead belongs,
 * and choosing the dialer account on no evidence is not a safe default. The
 * withholding is logged per lead and writes a `status: 'withheld'` activity row,
 * so it is observable rather than silent — which is what makes failing closed
 * the better trade, and it is what this module's own header already demanded.
 */
export function parseRoutes(raw: unknown): Record<string, string> | null {
  if (!raw) return {};
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;

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
  // Present but unreadable: we do not know this lead's destination, so we do not
  // pick one. Checked BEFORE the key lookup, because having a usable default key
  // is exactly what made this fail open.
  if (routes === null) return { status: 'routes_unreadable', settingKey: ROUTES_SETTING };
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
