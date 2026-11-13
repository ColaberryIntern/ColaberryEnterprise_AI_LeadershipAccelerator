import { Op, type WhereOptions } from 'sequelize';
import { MediaAsset } from '../../models';
import { WorkflowError } from '../content/contentWorkflowService';

/**
 * The media library: the logic behind the library screen and the composer's picker.
 *
 * Everything here is deliberately decidable without a database except `searchLibrary`, so the
 * rules that matter - what counts as expiring, what counts as a safe URL - are unit-testable
 * without a fixture.
 *
 * NO PROVIDER PARSING LIVES HERE. The backend stores `source_url` and nothing derived from it:
 * no YouTube id, no thumbnail URL, no oEmbed call. The frontend already owns that
 * (`frontend/src/utils/videoEmbed.ts` -> `parseVideoUrl`), and a second implementation would
 * drift from it. Storing a derived id would also be a cache with no invalidation: a URL the
 * provider later changes the meaning of would keep rendering the old thing.
 */

export type RightsStatus = 'ok' | 'expiring' | 'expired' | 'unknown';

/** A licence inside this window is "expiring": long enough to act, short enough to mean it. */
export const RIGHTS_EXPIRING_WITHIN_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Where an asset stands on its licence.
 *
 * 'unknown' is NOT 'ok'. An asset nobody recorded rights for is the most dangerous kind, because
 * it looks fine and nobody ever decided anything about it. The two are reported separately so the
 * screen can show a grey "no rights recorded" chip rather than a green one, and so a future
 * report can count them.
 *
 * NOTHING HERE BLOCKS. Ali, 2026-11-13: rights are recorded and warned on, never hard-blocked.
 * Publishing an expired asset is a judgement call with context this system does not have - a
 * renewed licence that nobody typed in yet is far more likely than wilful infringement.
 */
export function rightsStatus(
  asset: { rights_expires_at?: Date | string | null },
  now: Date = new Date(),
): RightsStatus {
  const raw = asset.rights_expires_at;
  if (raw === null || raw === undefined) return 'unknown';
  const expires = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(expires.getTime())) return 'unknown';
  const remainingMs = expires.getTime() - now.getTime();
  if (remainingMs < 0) return 'expired';
  return remainingMs <= RIGHTS_EXPIRING_WITHIN_DAYS * DAY_MS ? 'expiring' : 'ok';
}

/**
 * Accept a link we are willing to store, and refuse one we are not.
 *
 * HTTP AND HTTPS ONLY. This mirrors `checkVideoLink` in
 * `frontend/src/pages/admin/marketing/composer/videoSource.ts`, which is the source of truth for
 * the rule and records why: `javascript:` and `data:` parse perfectly well as URLs, so
 * `z.string().url()` accepts both. A Zod schema on the route is therefore NOT sufficient on its
 * own, and this is the stricter half rather than a duplicate of it.
 *
 * The frontend check is a courtesy to the person typing. This one is the enforcement: a link can
 * reach the library through the API without ever passing through that screen.
 */
export function assertSafeAssetUrl(raw: string): string {
  const value = String(raw ?? '').trim();
  if (value === '') {
    throw new WorkflowError('Paste the link first.', 400, 'LinkRequired');
  }
  if (value.length > 2048) {
    // Postgres would take it; every browser and provider has a lower practical ceiling, and a
    // URL this long is far more likely to be a paste accident than an address.
    throw new WorkflowError('That link is too long to store (2048 characters maximum).', 400, 'LinkTooLong');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WorkflowError(
      'That is not a web address. Paste the full link, starting with https://',
      400,
      'LinkMalformed',
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WorkflowError('Only http and https links can be saved to the library.', 400, 'LinkScheme');
  }
  return value;
}

export interface LibraryQuery {
  tenantId: string;
  brandId?: string | null;
  kind?: 'file' | 'link';
  /** 'image' | 'video' | 'application' ... matched as the part before the slash. */
  mimeFamily?: string;
  tag?: string;
  /** Free text over the filename and the alt text. */
  q?: string;
  limit?: number;
  offset?: number;
  /** Archived assets are hidden unless asked for; nothing is ever hard-deleted. */
  includeArchived?: boolean;
}

export interface LibraryAssetView {
  id: string;
  kind: 'file' | 'link';
  sourceUrl: string | null;
  storageKey: string | null;
  mimeType: string;
  originalFilename: string | null;
  altText: string | null;
  tags: string[];
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  rightsHolder: string | null;
  rightsExpiresAt: string | null;
  rightsStatus: RightsStatus;
  archivedAt: string | null;
  createdAt: string | null;
}

const MAX_LIMIT = 100;

/** Clamp rather than reject: a grid asking for 500 should get 100, not a 400. */
export function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 50;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_LIMIT);
}

/**
 * The WHERE clause, built separately so it can be unit-tested without a database.
 *
 * TENANT IS ALWAYS PRESENT AND NEVER OPTIONAL. Every other filter narrows; this one is the
 * boundary. A query builder that can produce a clause without it is one refactor away from
 * returning another tenant's library.
 */
export function buildLibraryWhere(query: LibraryQuery): WhereOptions {
  if (!query.tenantId) {
    throw new WorkflowError('A tenant is required to read the library.', 400, 'TenantRequired');
  }
  // Keyed by string OR symbol: Sequelize's Op.or is a symbol, and a Record<string, unknown>
  // would need a cast to hold it.
  const where: Record<string | symbol, unknown> = { tenant_id: query.tenantId };

  // brandId null is MEANINGFUL: it selects the tenant-level assets that belong to no brand.
  // `undefined` means "every brand", which is why this tests for the key rather than truthiness.
  if (query.brandId !== undefined) where.brand_id = query.brandId;
  if (query.kind) where.kind = query.kind;
  if (!query.includeArchived) where.archived_at = { [Op.is]: null };

  if (query.mimeFamily) {
    // 'image' matches image/png and image/jpeg, and cannot match 'text/image-ish'.
    where.mime_type = { [Op.like]: `${query.mimeFamily}/%` };
  }
  if (query.tag) {
    // text[] containment, which is what media_assets_tags_gin indexes.
    where.tags = { [Op.contains]: [query.tag] };
  }
  if (query.q && query.q.trim() !== '') {
    const term = `%${query.q.trim()}%`;
    where[Op.or] = [
      { original_filename: { [Op.iLike]: term } },
      { alt_text: { [Op.iLike]: term } },
    ];
  }
  return where as WhereOptions;
}

export function toLibraryView(asset: MediaAsset, now: Date = new Date()): LibraryAssetView {
  const a = asset as unknown as Record<string, any>;
  return {
    id: a.id,
    kind: a.kind === 'link' ? 'link' : 'file',
    sourceUrl: a.source_url ?? null,
    storageKey: a.storage_key ?? null,
    mimeType: a.mime_type,
    originalFilename: a.original_filename ?? null,
    altText: a.alt_text ?? null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    // BIGINT arrives from Postgres as a string; the contract says number.
    byteSize: a.byte_size == null ? null : Number(a.byte_size),
    width: a.width ?? null,
    height: a.height ?? null,
    durationMs: a.duration_ms ?? null,
    rightsHolder: a.rights_holder ?? null,
    rightsExpiresAt: a.rights_expires_at ? new Date(a.rights_expires_at).toISOString() : null,
    rightsStatus: rightsStatus({ rights_expires_at: a.rights_expires_at ?? null }, now),
    archivedAt: a.archived_at ? new Date(a.archived_at).toISOString() : null,
    createdAt: a.created_at ? new Date(a.created_at).toISOString() : null,
  };
}

export interface LibraryPage {
  assets: LibraryAssetView[];
  total: number;
  limit: number;
  offset: number;
}

export async function searchLibrary(query: LibraryQuery, now: Date = new Date()): Promise<LibraryPage> {
  const limit = clampLimit(query.limit);
  const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
  const { rows, count } = await MediaAsset.findAndCountAll({
    where: buildLibraryWhere(query),
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
  return {
    assets: rows.map((row) => toLibraryView(row, now)),
    total: count,
    limit,
    offset,
  };
}
