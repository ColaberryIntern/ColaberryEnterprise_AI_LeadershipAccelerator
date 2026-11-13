/**
 * Attach hire.refactored.ai's traffic to the Refactored brand, and re-categorise the views
 * that were filed as `other` only because the brand was missing.
 *
 * WHY. Until 2026-11-13 the `hire-refactored` lead source had no tenant or brand, and
 * hire.refactored.ai had no `brand_domains` row, so every Hire page view resolved to no brand
 * and was categorised with Colaberry's map: 2,316 events, every profile, booking and
 * case-study view filed as `other`, every session's landing page `other`. The code fix makes
 * NEW traffic right; this script repairs what was already recorded.
 *
 * WHY NOT `backfillTenancy.ts`. That script also assigns every unowned campaign and
 * organisation to Colaberry. This one touches only Hire's own rows.
 *
 * WHAT IT WRITES, in ONE transaction:
 *   1. `brand_domains` (hire.refactored.ai, web), non-primary, if absent (same row seedEcosystem writes).
 *   2. `lead_sources.hire-refactored` gains the Refactored tenant and brand, if it has none.
 *   3. Its sessions, and their events ON hire.refactored.ai (a session can continue onto another
 *      site; those events are left alone), gain tenant/brand/source where they have none.
 *   4. Of those, only rows still `other` are re-categorised, by `categorizePagePath` itself,
 *      so the answer is the tracker's own, never a second copy of the rules in SQL. A row
 *      that already has a real category is never overwritten.
 *
 * IDEMPOTENT: every UPDATE is guarded (`tenant_id IS NULL`, `= 'other'`), so a second run
 * changes zero rows. FAILURE: any error rolls the whole transaction back; nothing is partial.
 * Refuses outright if the brand is missing or the source already belongs to another brand.
 *
 * Run (inside accelerator-backend):
 *   node dist/scripts/attachHireTrafficToRefactoredBrand.js            dry run: real counts, rolled back
 *   node dist/scripts/attachHireTrafficToRefactoredBrand.js --apply    commit
 */
import { QueryTypes, Transaction } from 'sequelize';
import { connectDatabase, sequelize } from '../config/database';
import { categorizePagePath } from '../services/visitorTrackingService';

export const HIRE_SOURCE_SLUG = 'hire-refactored';
export const HIRE_HOSTNAME = 'hire.refactored.ai';
export const BRAND_SLUG = 'refactored';

export interface PathCount { readonly path: string; readonly n: number }
export interface Recategorisation { readonly path: string; readonly to: string; readonly n: number }

/**
 * Which `other` paths now mean something, under the brand's map. Pure, so it is tested
 * without a database. A path that is still `other` is left out: there is nothing to write.
 */
export function planRecategorisation(rows: readonly PathCount[]): Recategorisation[] {
  return rows
    .map((r) => ({ path: r.path, to: categorizePagePath(r.path, BRAND_SLUG), n: r.n }))
    .filter((r) => r.to !== 'other');
}

const HIRE_SESSIONS = `SELECT id FROM visitor_sessions WHERE site_slug = :slug`;

async function count(sql: string, t: Transaction, replacements: Record<string, unknown>): Promise<number> {
  const [, meta] = await sequelize.query(sql, { transaction: t, replacements });
  return (meta as { rowCount?: number })?.rowCount ?? 0;
}

async function run(apply: boolean): Promise<void> {
  const t = await sequelize.transaction();
  try {
    await sequelize.query(`SET LOCAL statement_timeout = '60s'`, { transaction: t });
    const [brand] = await sequelize.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM brands WHERE slug = :b LIMIT 1`,
      { transaction: t, type: QueryTypes.SELECT, replacements: { b: BRAND_SLUG } },
    );
    if (!brand) throw new Error(`No '${BRAND_SLUG}' brand in this database; refusing to invent one.`);
    const [source] = await sequelize.query<{ id: string; brand_id: string | null }>(
      `SELECT id, brand_id FROM lead_sources WHERE slug = :slug LIMIT 1`,
      { transaction: t, type: QueryTypes.SELECT, replacements: { slug: HIRE_SOURCE_SLUG } },
    );
    if (!source) throw new Error(`No '${HIRE_SOURCE_SLUG}' lead source; run seedLeadSources first.`);
    if (source.brand_id && source.brand_id !== brand.id) {
      throw new Error(`'${HIRE_SOURCE_SLUG}' already belongs to another brand (${source.brand_id}); left unchanged.`);
    }
    const ids = { tenant: brand.tenant_id, brand: brand.id, source: source.id, slug: HIRE_SOURCE_SLUG, host: HIRE_HOSTNAME, hostPrefix: `https://${HIRE_HOSTNAME}/%` };

    const domain = await count(
      `INSERT INTO brand_domains (id, tenant_id, brand_id, hostname, purpose, is_primary, verification_status, activation_state, created_at, updated_at)
       SELECT gen_random_uuid(), :tenant, :brand, :host, 'web', false, 'pending', 'configured', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM brand_domains WHERE hostname = :host AND purpose = 'web')`, t, ids);
    const sourceRows = await count(
      `UPDATE lead_sources SET tenant_id = :tenant, brand_id = :brand, updated_at = now()
        WHERE id = :source AND tenant_id IS NULL`, t, ids);
    const sessions = await count(
      `UPDATE visitor_sessions SET tenant_id = :tenant, brand_id = :brand, source_id = :source
        WHERE site_slug = :slug AND tenant_id IS NULL`, t, ids);
    const events = await count(
      `UPDATE page_events SET tenant_id = :tenant, brand_id = :brand, source_id = :source
        WHERE session_id IN (${HIRE_SESSIONS}) AND page_url LIKE :hostPrefix AND tenant_id IS NULL`, t, ids);

    const eventPaths = await sequelize.query<PathCount>(
      `SELECT page_path AS path, count(*)::int AS n FROM page_events
        WHERE session_id IN (${HIRE_SESSIONS}) AND page_url LIKE :hostPrefix AND page_category = 'other' AND page_path IS NOT NULL
        GROUP BY page_path`,
      { transaction: t, type: QueryTypes.SELECT, replacements: ids },
    );
    let recategorised = 0;
    for (const r of planRecategorisation(eventPaths)) {
      // eslint-disable-next-line no-await-in-loop -- one statement per distinct path, a few hundred at most
      recategorised += await count(
        `UPDATE page_events SET page_category = :to
          WHERE session_id IN (${HIRE_SESSIONS}) AND page_url LIKE :hostPrefix AND page_category = 'other' AND page_path = :path`,
        t, { ...ids, to: r.to, path: r.path });
    }

    const entryPaths = await sequelize.query<PathCount>(
      `SELECT entry_page AS path, count(*)::int AS n FROM visitor_sessions
        WHERE site_slug = :slug AND landing_page_category = 'other' AND entry_page IS NOT NULL
        GROUP BY entry_page`,
      { transaction: t, type: QueryTypes.SELECT, replacements: ids },
    );
    let landings = 0;
    for (const r of planRecategorisation(entryPaths)) {
      // eslint-disable-next-line no-await-in-loop -- as above
      landings += await count(
        `UPDATE visitor_sessions SET landing_page_category = :to
          WHERE site_slug = :slug AND landing_page_category = 'other' AND entry_page = :path`,
        t, { ...ids, to: r.to, path: r.path });
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'backend',
      event: 'hire_traffic_attached', outcome: 'success', mode: apply ? 'apply' : 'dry-run',
      context: { domain_rows: domain, source_rows: sourceRows, sessions, events, events_recategorised: recategorised, landings_recategorised: landings },
    }));
    if (apply) await t.commit();
    else await t.rollback();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

if (require.main === module) {
  connectDatabase()
    .then(() => run(process.argv.includes('--apply')))
    .then(() => sequelize.close())
    .catch(async (err: Error) => {
      console.error(JSON.stringify({ level: 'error', event: 'hire_traffic_attach_failed', error_class: err.name, message: err.message }));
      await sequelize.close().catch(() => undefined);
      process.exit(1);
    });
}
