import { Op, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { MediaAsset } from '../../models';
import { WorkflowError } from '../content/contentWorkflowService';
import { findOrCreateLibraryAsset, ingestFileBytes } from './mediaAssetService';
import { signedUrl } from './mediaStore';
import { mediaPublicBaseUrl } from '../publishing/adapterRegistry';

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
  /**
   * A signed, time-limited URL for a FILE, so the screen can show and play it. Null for a link
   * (whose playable address is `sourceUrl`) and null when signing is unavailable.
   *
   * `storage_key` is never sent to the browser - it is a path on the uploads volume, and a
   * client that knew it could ask for any asset. The signature is what makes one row readable
   * without making all of them readable.
   */
  url: string | null;
}

/** Sign, or null. `signedUrl` throws without JWT_SECRET or on a key it does not recognise, and a
 *  signing failure must degrade to "no preview" rather than taking the whole grid down. */
function safeSignedUrl(storageKey: string, base: string): string | null {
  try {
    return signedUrl(storageKey, base).url;
  } catch {
    return null;
  }
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

export function toLibraryView(asset: MediaAsset, now: Date = new Date(), base?: string | null): LibraryAssetView {
  const a = asset as unknown as Record<string, any>;
  // Only a file has bytes to sign. The base is passed in so a caller listing 100 rows resolves it
  // once rather than per row, and so a test can hand in a fixed one.
  const signBase = base === undefined ? mediaPublicBaseUrl() : base;
  const url = a.kind !== 'link' && a.storage_key && signBase
    ? safeSignedUrl(a.storage_key, signBase)
    : null;
  return {
    url,
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


export interface CreateLinkInput {
  tenantId: string;
  brandId: string | null;
  url: string;
  altText: string;
  tags?: string[];
  rightsHolder?: string | null;
  rightsExpiresAt?: Date | null;
  uploadedBy?: string | null;
}

/**
 * Save a link to the library.
 *
 * `mime_type` is 'text/uri-list' and `storage_key` stays null, which is the shape the database
 * CHECK (media_assets_kind_shape) requires of a link. Nothing is fetched from the URL: no HEAD
 * request to see what is there, no oEmbed, no thumbnail. Saving a link must not make an outbound
 * request on the operator's behalf to a host they pasted.
 *
 * The duplicate is a 409 with a sentence, not a 500 with a constraint name. Pasting a URL that is
 * already in the library is an ordinary thing to do by accident, and
 * `media_assets_link_unique` is what makes it harmless.
 */
export async function createLinkAsset(input: CreateLinkInput): Promise<MediaAsset> {
  const url = assertSafeAssetUrl(input.url);
  const altText = assertLibraryAltText(input.altText);
  const tags = normaliseTags(input.tags);
  try {
    return await MediaAsset.create({
      tenant_id: input.tenantId,
      brand_id: input.brandId,
      kind: 'link',
      source_url: url,
      storage_key: null,
      mime_type: 'text/uri-list',
      original_filename: null,
      alt_text: altText,
      tags,
      rights_holder: input.rightsHolder ?? null,
      rights_expires_at: input.rightsExpiresAt ?? null,
      uploaded_by: input.uploadedBy ?? null,
      metadata: {},
    } as any);
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw new WorkflowError('That link is already in this library.', 409, 'LinkAlreadySaved');
    }
    throw err;
  }
}

/**
 * Put a FILE in the library that belongs to no post yet.
 *
 * This is the reason T1 split the ingest out of `attachMedia`: the same gate, normalise, probe
 * and store, with a brand instead of a content item. Re-uploading bytes that are already in the
 * library REUSES the row - `findOrCreateLibraryAsset` looks up (brand, checksum) first - so
 * Sohail dragging the same ad in twice is a no-op rather than a 500 from the unique index.
 */
export async function uploadLibraryFile(input: {
  tenantId: string;
  brandId: string;
  bytes: Buffer;
  claimedMimeType: string;
  originalFilename: string | null;
  altText: string;
  tags?: string[];
  rightsHolder?: string | null;
  rightsExpiresAt?: Date | null;
  uploadedBy?: string | null;
}): Promise<{ asset: MediaAsset; reused: boolean }> {
  const altText = assertLibraryAltText(input.altText);
  const tags = normaliseTags(input.tags);
  const ingest = await ingestFileBytes(input.brandId, input.bytes, input.claimedMimeType);
  const { asset, reused } = await findOrCreateLibraryAsset({
    tenantId: input.tenantId,
    brandId: input.brandId,
    ingest,
    originalFilename: input.originalFilename,
    altText,
    uploadedBy: input.uploadedBy ?? null,
  });
  // Library-only fields are applied after the shared find-or-create, which knows nothing about
  // them. On a reused row these are an EDIT, which is the correct reading of "upload it again
  // with different tags".
  const patch: Record<string, unknown> = {};
  if (tags.length) patch.tags = tags;
  if (input.rightsHolder !== undefined) patch.rights_holder = input.rightsHolder;
  if (input.rightsExpiresAt !== undefined) patch.rights_expires_at = input.rightsExpiresAt;
  if (Object.keys(patch).length) await asset.update(patch);
  return { asset, reused };
}

export interface UpdateAssetInput {
  altText?: string;
  tags?: string[];
  rightsHolder?: string | null;
  rightsExpiresAt?: Date | null;
}

/** Edit the fields an operator owns. Never the bytes, the URL, the checksum or the kind. */
export async function updateLibraryAsset(asset: MediaAsset, input: UpdateAssetInput): Promise<MediaAsset> {
  const patch: Record<string, unknown> = {};
  if (input.altText !== undefined) patch.alt_text = assertLibraryAltText(input.altText);
  if (input.tags !== undefined) patch.tags = normaliseTags(input.tags);
  if (input.rightsHolder !== undefined) patch.rights_holder = input.rightsHolder;
  if (input.rightsExpiresAt !== undefined) patch.rights_expires_at = input.rightsExpiresAt;
  if (Object.keys(patch).length === 0) return asset;
  await asset.update(patch);
  return asset;
}

/**
 * Archive, never delete.
 *
 * `content_item_media` references these rows, and posts that already went out reference them
 * through that join. A hard delete would either break the FK or rewrite the record of what was
 * published. Archiving hides it from the library and frees the link URL for re-adding
 * (media_assets_link_unique excludes archived rows) without touching history.
 */
export async function archiveLibraryAsset(asset: MediaAsset): Promise<MediaAsset> {
  if (asset.archived_at) return asset;
  await asset.update({ archived_at: new Date() });
  return asset;
}

/** Alt text rules for the library. Same floor as the composer's, and the same reason. */
export function assertLibraryAltText(raw: string): string {
  const altText = String(raw ?? '').trim();
  if (altText.length < 3) {
    throw new WorkflowError('Describe this for people who cannot see it (a short description is required).', 400, 'AltTextRequired');
  }
  if (altText.length > 300) {
    throw new WorkflowError('That description is limited to 300 characters.', 400, 'AltTextTooLong');
  }
  return altText;
}

/**
 * Tags are trimmed, lowercased, de-duplicated and capped.
 *
 * Lowercased so "Q4" and "q4" are one tag rather than two that look identical in a filter list.
 * De-duplicated because the UI lets someone type the same tag twice. Capped because the column
 * is unbounded and a paste accident should not put a novel in a text[].
 */
export function normaliseTags(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const tag of raw) {
    const value = String(tag ?? '').trim().toLowerCase();
    if (value === '') continue;
    if (value.length > 40) {
      throw new WorkflowError('A tag is limited to 40 characters.', 400, 'TagTooLong');
    }
    seen.add(value);
    if (seen.size > 25) {
      throw new WorkflowError('An asset can carry at most 25 tags.', 400, 'TooManyTags');
    }
  }
  return [...seen];
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
  // Resolved once for the whole page rather than per row.
  const base = mediaPublicBaseUrl();
  return {
    assets: rows.map((row) => toLibraryView(row, now, base)),
    total: count,
    limit,
    offset,
  };
}
