/**
 * leadViewPreferenceService — a rep's saved lead-list settings.
 *
 * Ali, 2026-08-20: reps should be able to choose which websites they filter by
 * and "lock their settings so everytime they can have the same settings."
 *
 * Resolution order when the Leads page opens, most specific first:
 *   1. an explicit ?website= on the request      (this visit only)
 *   2. the identity's saved+locked preference    (leadViewPreferences)
 *   3. the role default                          (sales -> enterprise sources)
 *   4. no filter at all                          (admins see everything)
 *
 * Saving without locking is deliberately allowed: it remembers the choice
 * without forcing it, so a rep can experiment and then commit to it.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  LEAD_SOURCE_GROUPS,
  UNGROUPED_KEY,
  defaultWebsiteKeysForRole,
} from './leadSourceGroups';

export interface LeadViewPreference {
  websites: string[];
  locked: boolean;
}

/** Group keys that actually exist, so a stale saved key cannot filter to nothing. */
function validKeys(): Set<string> {
  const keys = LEAD_SOURCE_GROUPS.map((g) => g.key);
  keys.push(UNGROUPED_KEY);
  return new Set(keys);
}

/**
 * Drop anything that is no longer a real group. A rep who saved a filter before
 * a group was renamed should get a narrower-but-working view, never an empty
 * one caused by a key we stopped recognising.
 */
export function sanitizeWebsiteKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const known = validKeys();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (typeof k !== 'string') continue;
    const trimmed = k.trim();
    if (!trimmed || !known.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** The saved row for an identity, or null when they have never saved one. */
export async function getLeadViewPreference(adminUserId: string): Promise<LeadViewPreference | null> {
  const rows = await sequelize.query<{ websites: string[] | null; locked: boolean }>(
    `SELECT websites, locked FROM lead_view_preferences WHERE admin_user_id = :id`,
    { replacements: { id: adminUserId }, type: QueryTypes.SELECT }
  );
  if (!rows.length) return null;
  return {
    websites: sanitizeWebsiteKeys(rows[0].websites ?? []),
    locked: !!rows[0].locked,
  };
}

/**
 * Create or replace the identity's settings. Idempotent by the unique index on
 * admin_user_id, so saving twice leaves exactly one row.
 */
export async function saveLeadViewPreference(
  adminUserId: string,
  websites: string[],
  locked: boolean
): Promise<LeadViewPreference> {
  const clean = sanitizeWebsiteKeys(websites);
  // Passed as JSON and unpacked in SQL rather than ARRAY[:websites], which
  // cannot express an empty array without a placeholder element.
  await sequelize.query(
    `INSERT INTO lead_view_preferences (admin_user_id, websites, locked, created_at, updated_at)
     VALUES (
       :id,
       ARRAY(SELECT jsonb_array_elements_text(CAST(:websites AS jsonb))),
       :locked, NOW(), NOW()
     )
     ON CONFLICT (admin_user_id)
     DO UPDATE SET websites = EXCLUDED.websites, locked = EXCLUDED.locked, updated_at = NOW()`,
    { replacements: { id: adminUserId, websites: JSON.stringify(clean), locked } }
  );
  return { websites: clean, locked };
}

/** Forget the saved settings entirely. */
export async function clearLeadViewPreference(adminUserId: string): Promise<void> {
  await sequelize.query(`DELETE FROM lead_view_preferences WHERE admin_user_id = :id`, {
    replacements: { id: adminUserId },
  });
}

/**
 * Which websites this request should actually filter on.
 *
 * Returns null for "no filter", which is what an admin with no saved settings
 * gets. An explicit request parameter always wins, so a rep can look outside
 * their locked view without losing it.
 */
export async function resolveWebsiteFilter(
  adminUserId: string | undefined,
  role: string | undefined,
  requested: string | undefined
): Promise<string[] | null> {
  if (requested && requested.trim()) {
    return requested.split(',').map((k) => k.trim()).filter(Boolean);
  }
  if (adminUserId) {
    const saved = await getLeadViewPreference(adminUserId);
    if (saved && saved.locked && saved.websites.length) return saved.websites;
  }
  return defaultWebsiteKeysForRole(role);
}
