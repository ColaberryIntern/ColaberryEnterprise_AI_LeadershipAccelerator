import { Brand, ContentItem, ContentVariant, ExternalPublication } from '../../models';
import { sequelize } from '../../config/database';
import type { ImportException, MappedPost } from './loomlyImport';

/**
 * loomlyImportService — spec 18 Stage B, the persisting half.
 *
 * Persistence is a PORT (`LoomlyImportStore`) so the import decisions - which rows land,
 * which are skipped as existing, what each becomes - are tested without a database, the same
 * way T007 injected `isTaken`. `sequelizeLoomlyStore()` is the production implementation.
 *
 * WHAT EACH KIND BECOMES
 *   history         -> a content_items row in `published` with `metadata.provenance =
 *                      'loomly_import'` and `metadata.readOnly = true`, one variant for its
 *                      channel, and an external_publications row (`metadata.mode = 'imported'`)
 *                      carrying the permalink / external id if the export had one. The
 *                      original timestamps are preserved. The workflow refuses every
 *                      transition and edit on a read-only item (assertWritable).
 *   scheduled_draft -> a `draft` with `metadata.needsVerification = true` and the original
 *                      scheduled time kept in metadata, NOT in `scheduled_for`: an imported
 *                      schedule must be re-confirmed by a person before anything queues.
 *   draft           -> a plain draft with provenance.
 *
 * IDEMPOTENT ON THE DEDUP KEY. Every row this writes carries `metadata.loomlyKey`; a re-run
 * of the same file finds them and records `duplicate_existing` instead of inserting.
 *
 * ATOMIC PER POST. A history post is three rows (item, variant, publication) written in one
 * transaction. Without it, a failure after the first create would leave an item carrying
 * the loomlyKey with no variant or publication, and every re-run would then skip it as
 * `duplicate_existing` and never repair it - the verifier's finding.
 */

export const PROVENANCE = 'loomly_import';

export interface HistoryRecord {
  tenantId: string;
  brandId: string;
  post: MappedPost;
}

export interface LoomlyImportStore {
  brandForCalendar(calendar: string): Promise<{ id: string; tenant_id: string } | null>;
  existsByKey(key: string): Promise<boolean>;
  insertHistory(rec: HistoryRecord): Promise<void>;
  insertDraft(rec: HistoryRecord): Promise<void>;
}

export interface ImportOutcome {
  imported: { history: number; scheduledDraft: number; draft: number };
  skipped: number;
  exceptions: ImportException[];
}

export async function importLoomlyPosts(
  posts: readonly MappedPost[],
  store: LoomlyImportStore,
  opts: { execute: boolean; calendarToBrandSlug?: Record<string, string> },
): Promise<ImportOutcome> {
  const out: ImportOutcome = { imported: { history: 0, scheduledDraft: 0, draft: 0 }, skipped: 0, exceptions: [] };
  const brandCache = new Map<string, { id: string; tenant_id: string } | null>();

  for (const post of posts) {
    const calendar = opts.calendarToBrandSlug?.[post.calendar] ?? post.calendar;
    let brand = brandCache.get(calendar);
    if (brand === undefined) { brand = await store.brandForCalendar(calendar); brandCache.set(calendar, brand); }
    if (!brand) {
      out.skipped += 1;
      out.exceptions.push({ row: post.row, code: 'unknown_calendar', detail: `Calendar "${post.calendar}" matches no brand slug or name. Map it with --calendar "${post.calendar}=<brand-slug>".` });
      continue;
    }
    if (await store.existsByKey(post.key)) {
      out.skipped += 1;
      out.exceptions.push({ row: post.row, code: 'duplicate_existing', detail: `Already imported (key ${post.key}).` });
      continue;
    }
    if (opts.execute) {
      const rec = { tenantId: brand.tenant_id, brandId: brand.id, post };
      if (post.kind === 'history') await store.insertHistory(rec); else await store.insertDraft(rec);
    }
    if (post.kind === 'history') out.imported.history += 1;
    else if (post.kind === 'scheduled_draft') out.imported.scheduledDraft += 1;
    else out.imported.draft += 1;
  }
  return out;
}

/** Production store. Every write is keyed on metadata.loomlyKey so a re-run is a no-op. */
export function sequelizeLoomlyStore(): LoomlyImportStore {
  return {
    async brandForCalendar(calendar) {
      const bySlug = await Brand.findOne({ where: { slug: calendar } });
      const b = bySlug ?? (await Brand.findOne({ where: { name: calendar } }));
      return b ? { id: b.id, tenant_id: b.tenant_id } : null;
    },
    async existsByKey(key) {
      // JSONB containment: metadata @> {"loomlyKey": key}. Sequelize's JSON path where.
      const hit = await ContentItem.findOne({ where: { 'metadata.loomlyKey': key } as any });
      return hit !== null;
    },
    async insertHistory({ tenantId, brandId, post }) {
      await sequelize.transaction(async (t) => {
        const item = await ContentItem.create({
          tenant_id: tenantId,
          brand_id: brandId,
          campaign_id: null,
          title: `[Loomly] ${post.text.slice(0, 80) || post.provider}`,
          canonical_body: post.text,
          content_type: post.mediaUrls.length > 0 ? 'image' : 'text',
          status: 'published',
          created_by: post.author,
          scheduled_for: post.scheduledFor ? new Date(post.scheduledFor) : null,
          published_at: post.publishedAt ? new Date(post.publishedAt) : null,
          human_approved: true,
          metadata: {
            provenance: PROVENANCE, readOnly: true, loomlyKey: post.key, keyStrength: post.keyStrength,
            loomlyStatus: post.loomlyStatus, loomlyCalendar: post.calendar, labels: post.labels, mediaUrls: post.mediaUrls, importedAt: new Date().toISOString(),
          },
        // Sequelize's creation-attributes type predates the models' `declare` fields; the casts
        // on create() below are the repo's idiom, not a loosening of the row's contract.
        } as any, { transaction: t });
        await ContentVariant.create({
          content_item_id: item.id, provider: post.provider, body: post.text, link_url: post.permalink,
          validation_state: 'valid', metadata: { provenance: PROVENANCE, account: post.account },
        } as any, { transaction: t });
        await ExternalPublication.create({
          publishing_job_id: null,
          tenant_id: tenantId,
          brand_id: brandId,
          content_item_id: item.id,
          provider: post.provider,
          external_id: post.externalId ?? post.permalink ?? `loomly:${post.key}`,
          permalink: post.permalink,
          published_at: post.publishedAt ? new Date(post.publishedAt) : null,
          current_status: 'live',
          metadata: { mode: 'imported', provenance: PROVENANCE, loomlyKey: post.key, account: post.account, keyStrength: post.keyStrength },
        } as any, { transaction: t });
      });
    },
    async insertDraft({ tenantId, brandId, post }) {
      await sequelize.transaction(async (t) => {
        const item = await ContentItem.create({
          tenant_id: tenantId,
          brand_id: brandId,
          campaign_id: null,
          title: `[Loomly] ${post.text.slice(0, 80) || post.provider}`,
          canonical_body: post.text,
          content_type: post.mediaUrls.length > 0 ? 'image' : 'text',
          status: 'draft',
          created_by: post.author,
          // Deliberately NOT scheduled_for: an imported schedule is a claim to verify, not a queue entry.
          scheduled_for: null,
          metadata: {
            provenance: PROVENANCE, readOnly: false, needsVerification: post.kind === 'scheduled_draft', loomlyKey: post.key,
            loomlyScheduledFor: post.scheduledFor, loomlyStatus: post.loomlyStatus, loomlyCalendar: post.calendar, labels: post.labels, mediaUrls: post.mediaUrls,
            importedAt: new Date().toISOString(),
          },
        } as any, { transaction: t });
        await ContentVariant.create({
          content_item_id: item.id, provider: post.provider, body: post.text, metadata: { provenance: PROVENANCE, account: post.account },
        } as any, { transaction: t });
      });
    },
  };
}
