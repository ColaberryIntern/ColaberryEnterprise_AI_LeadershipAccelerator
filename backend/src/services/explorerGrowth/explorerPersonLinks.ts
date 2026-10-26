import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * The two links every learner row in Explorer Growth carries (Ali, 2026-10-26: "make sure all student links take you to 360" and "a
 * link to see the GHL record with one click"): the lead id (the 360 page resolves enrollment, lead or email itself, so the frontend's
 * personPath only needs the row) and the GHL contact URL in the RIGHT sub-account.
 *
 * The GHL URL comes from leads/ghlContactLink.ts, the same builder the 360 page uses: the location is read from the routed account's
 * key, so a school lead opens the school sub-account. A learner with no lead, no ghl_contact_id, or a source whose account has no key
 * gets NO link (never a guessed one).
 *
 * BEST EFFORT, like the 360's acquisition panel: ghlContactLink is imported lazily (a top-level import constructs Sequelize settings
 * at module load) and any failure leaves the links null and is logged with a class, so a CRM hiccup can never empty an admin table.
 * Rows are a page at a time (25 to 200), the same per-person lookup the 360 page makes.
 */
export interface PersonLinks { lead_id: number | null; ghl_url: string | null }

interface LinkRow { enrollment_id: string; lead_id: number | null; ghl_contact_id: string | null; source: string | null }

export async function personLinksFor(enrollmentIds: string[]): Promise<Map<string, PersonLinks>> {
  const out = new Map<string, PersonLinks>();
  const ids = Array.from(new Set(enrollmentIds.filter(Boolean)));
  if (!ids.length) return out;
  const rows = await sequelize.query<LinkRow>(
    `SELECT p.enrollment_id, l.id AS lead_id, l.ghl_contact_id, l.source
       FROM explorer_journey_profiles p LEFT JOIN leads l ON l.id = p.lead_id
      WHERE p.enrollment_id IN (:ids)`,
    { replacements: { ids }, type: QueryTypes.SELECT },
  );
  for (const r of rows) out.set(r.enrollment_id, { lead_id: r.lead_id === null ? null : Number(r.lead_id), ghl_url: null });
  try {
    const { ghlContactUrl } = await import('../leads/ghlContactLink');
    for (const r of rows) {
      if (r.ghl_contact_id) out.get(r.enrollment_id)!.ghl_url = await ghlContactUrl(r.source, r.ghl_contact_id);
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error', service: 'explorer-growth-command-center', event: 'ghl_contact_links_unavailable', outcome: 'partial',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    }));
  }
  return out;
}

/**
 * For queries that already joined the lead (`ghl_contact_id`, `lead_source`): build `ghl_url` without another query, and drop the two
 * raw columns from the row. Same best-effort rule: any failure leaves `ghl_url` null and is logged.
 */
export async function withGhlUrls<T extends { ghl_contact_id?: string | null; lead_source?: string | null }>(rows: T[]): Promise<(Omit<T, 'ghl_contact_id' | 'lead_source'> & { ghl_url: string | null })[]> {
  const urls: (string | null)[] = rows.map(() => null);
  try {
    if (rows.some((r) => r.ghl_contact_id)) {
      const { ghlContactUrl } = await import('../leads/ghlContactLink');
      for (let i = 0; i < rows.length; i += 1) if (rows[i].ghl_contact_id) urls[i] = await ghlContactUrl(rows[i].lead_source, rows[i].ghl_contact_id);
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error', service: 'explorer-growth-command-center', event: 'ghl_contact_links_unavailable', outcome: 'partial',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    }));
  }
  return rows.map((r, i) => {
    const { ghl_contact_id: _c, lead_source: _s, ...rest } = r;
    return { ...rest, ghl_url: urls[i] };
  });
}

/** Attach `lead_id` and `ghl_url` to rows that carry an `enrollment_id` (rows without a profile keep nulls). */
export async function withPersonLinks<T extends { enrollment_id: string }>(rows: T[]): Promise<(T & PersonLinks)[]> {
  const links = await personLinksFor(rows.map((r) => r.enrollment_id));
  return rows.map((r) => ({ ...r, ...(links.get(r.enrollment_id) ?? { lead_id: null, ghl_url: null }) }));
}
