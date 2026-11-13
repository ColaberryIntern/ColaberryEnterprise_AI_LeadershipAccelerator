import api from '../utils/api';

/**
 * The media library's API client.
 *
 * `rightsStatus` is COMPUTED BY THE SERVER and sent with every asset. The screen never works it
 * out from `rightsExpiresAt`: two implementations of "is this expiring" drift, and the one in the
 * browser would be the one nobody tests. The field is read, not derived.
 */

export type LibraryKind = 'file' | 'link';
export type RightsStatus = 'ok' | 'expiring' | 'expired' | 'unknown';

export interface LibraryAsset {
  id: string;
  kind: LibraryKind;
  /** The URL, for a link. Null for a file. */
  sourceUrl: string | null;
  /** Present for a file; never rendered directly, the server signs it into `url` where needed. */
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

export interface LibraryPage {
  assets: LibraryAsset[];
  total: number;
  limit: number;
  offset: number;
}

export interface LibraryFilters {
  brandId?: string;
  kind?: LibraryKind;
  mimeFamily?: string;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export async function listLibrary(filters: LibraryFilters = {}): Promise<LibraryPage> {
  const params: Record<string, string | number> = {};
  if (filters.brandId) params.brand_id = filters.brandId;
  if (filters.kind) params.kind = filters.kind;
  if (filters.mimeFamily) params.mime_family = filters.mimeFamily;
  if (filters.tag) params.tag = filters.tag;
  if (filters.q) params.q = filters.q;
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.offset !== undefined) params.offset = filters.offset;
  if (filters.includeArchived) params.include_archived = 'true';
  return (await api.get('/api/admin/marketing/library', { params })).data;
}

export interface SaveLinkInput {
  brandId: string | null;
  url: string;
  altText: string;
  tags?: string[];
  rightsHolder?: string | null;
  rightsExpiresAt?: string | null;
}

export async function saveLink(input: SaveLinkInput): Promise<LibraryAsset> {
  const body: Record<string, unknown> = {
    url: input.url,
    alt_text: input.altText,
  };
  if (input.brandId !== undefined) body.brand_id = input.brandId;
  if (input.tags) body.tags = input.tags;
  if (input.rightsHolder !== undefined) body.rights_holder = input.rightsHolder;
  if (input.rightsExpiresAt !== undefined) body.rights_expires_at = input.rightsExpiresAt;
  return (await api.post('/api/admin/marketing/library/link', body)).data.asset;
}

/**
 * Upload a file into the library.
 *
 * Returns `reused: true` when those exact bytes were already there - the server answers 200
 * rather than 201 and hands back the existing asset. Dragging the same ad in twice is a success,
 * and the screen says so rather than appearing to do nothing.
 */
export async function uploadLibraryFile(input: {
  brandId: string;
  file: File;
  altText: string;
  tags?: string[];
  rightsHolder?: string | null;
  rightsExpiresAt?: string | null;
}): Promise<{ asset: LibraryAsset; reused: boolean }> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('brand_id', input.brandId);
  form.append('alt_text', input.altText);
  // multipart carries strings only, so the array is JSON-encoded; the route decodes it.
  if (input.tags) form.append('tags', JSON.stringify(input.tags));
  if (input.rightsHolder) form.append('rights_holder', input.rightsHolder);
  if (input.rightsExpiresAt) form.append('rights_expires_at', input.rightsExpiresAt);
  const res = await api.post('/api/admin/marketing/library/file', form);
  return { asset: res.data.asset, reused: Boolean(res.data.reused) };
}

export interface EditAssetInput {
  altText?: string;
  tags?: string[];
  rightsHolder?: string | null;
  rightsExpiresAt?: string | null;
}

export async function editAsset(id: string, input: EditAssetInput): Promise<LibraryAsset> {
  const body: Record<string, unknown> = {};
  if (input.altText !== undefined) body.alt_text = input.altText;
  if (input.tags !== undefined) body.tags = input.tags;
  if (input.rightsHolder !== undefined) body.rights_holder = input.rightsHolder;
  if (input.rightsExpiresAt !== undefined) body.rights_expires_at = input.rightsExpiresAt;
  return (await api.patch(`/api/admin/marketing/library/${id}`, body)).data.asset;
}

/** Archive, never delete: posts that already went out still reference these rows. */
export async function archiveAsset(id: string): Promise<LibraryAsset> {
  return (await api.post(`/api/admin/marketing/library/${id}/archive`, {})).data.asset;
}

/** Attach something already in the library to a post. Creates a join row and no new asset. */
export async function attachExistingAsset(contentItemId: string, mediaAssetId: string): Promise<{
  mediaAssetId: string; position: number; alreadyAttached: boolean;
}> {
  const res = await api.post(`/api/admin/content/${contentItemId}/media/existing`, { media_asset_id: mediaAssetId });
  return res.data.media;
}

/** The rights chip's words, in one place, so the library and the picker cannot disagree. */
export function rightsLabel(status: RightsStatus): { text: string; className: string } {
  switch (status) {
    case 'expired': return { text: 'Rights expired', className: 'bg-danger' };
    case 'expiring': return { text: 'Rights expiring', className: 'bg-warning text-dark' };
    case 'ok': return { text: 'Rights ok', className: 'bg-success' };
    // NOT green. Nobody recorded anything, which is different from "fine" and has to look it.
    default: return { text: 'No rights recorded', className: 'bg-secondary' };
  }
}

/** 12.3 MB, or nothing at all for a link. */
export function readableSize(bytes: number | null): string | null {
  if (bytes === null || Number.isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
