import api from '../utils/api';

/**
 * explorerKnowledgeApi — the knowledge ingestion and review client.
 *
 * Separate from `explorerGrowthApi` for the same reason the backend route is a separate
 * router: that file documents itself as the Command Center's read API, and its contract is
 * worth keeping legible. The ingestion write and the review calls live here instead.
 *
 * Types mirror `backend/src/controllers/explorerKnowledgeController.ts` and
 * `explorerKnowledgeReviewController.ts` BY HAND. There is no shared-types package;
 * `capeApi.ts` documents that as the standing convention.
 */

/** Why a file could not be used. Mirrors `IngestRefusalReason`. */
export type KnowledgeUploadRefusal =
  | 'empty_source'
  | 'too_large'
  | 'extraction_failed'
  | 'no_text';

export interface KnowledgeUploadStored {
  status: 'stored' | 'duplicate';
  document_id: string;
  sha256: string;
  chunk_count: number;
  /** Present on 'stored' only. */
  hard_cut_count?: number;
  truncated?: boolean;
  extracted_chars?: number;
  /** Always false. The server states it rather than leaving it to be assumed. */
  quotable: boolean;
  review_required: string;
}

export interface KnowledgeUploadRefused {
  status: 'refused';
  reason: KnowledgeUploadRefusal | 'unknown';
  message: string;
}

export type KnowledgeUploadResult = KnowledgeUploadStored | KnowledgeUploadRefused;

/** Bytes sent so far and the total, from the browser's own upload events. */
export type UploadProgress = (sent: number, total: number) => void;

export interface UploadOptions {
  title?: string;
  brandId?: string;
  onProgress?: UploadProgress;
}

/**
 * Upload one document as a knowledge source.
 *
 * ## A refusal is a RESULT, not a thrown error
 *
 * The server answers 422 when the request was fine and the file could not be used — a scan
 * with no text layer, a format the parser will not read. That is something the person who
 * chose the file can act on, so it comes back as a value with its reason intact rather than
 * as an exception the caller has to dig a status code out of. Genuine failures (401, 500,
 * the network) still throw.
 *
 * ## The content-type override is load-bearing
 *
 * The shared `api` instance defaults to `Content-Type: application/json`, and axios 1.x,
 * seeing FormData under a JSON content type, SERIALISES THE FORM TO JSON — the file arrives
 * as `{}` and multer sees no upload. Naming `multipart/form-data` makes axios drop the
 * header and let the browser set the boundary. The same trap `contentComposerApi` documents.
 */
export async function uploadKnowledgeDocument(
  file: File,
  options: UploadOptions = {},
): Promise<KnowledgeUploadResult> {
  const form = new FormData();
  if (options.title) form.append('title', options.title);
  if (options.brandId) form.append('brand_id', options.brandId);
  form.append('document', file, file.name);

  try {
    const res = await api.post('/api/admin/explorer-growth/knowledge/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => options.onProgress?.(e.loaded, e.total ?? file.size),
    });
    return res.data as KnowledgeUploadStored;
  } catch (err) {
    const response = (err as { response?: { status?: number; data?: Record<string, unknown> } })
      .response;

    if (response?.status === 422 || response?.status === 413) {
      return {
        status: 'refused',
        reason: (response.data?.reason as KnowledgeUploadRefusal) ?? 'unknown',
        message:
          (response.data?.error as string) ??
          'That file could not be used as a knowledge source.',
      };
    }

    throw err;
  }
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Review — reading the queue and deciding what a document may say.
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * A document's own statement about its provenance.
 *
 * Mirrors `KnowledgeConfidence`. Only `grounded` is quotable — the quote gate refuses
 * `drafted-verify` exactly as hard as `unstated`, which is why no component should try to
 * work quotability out from this value. The server sends `quotable` for that.
 */
export type KnowledgeConfidence = 'grounded' | 'drafted-verify' | 'unstated';

/** What a reviewer may record. `unstated` is absent because review cannot produce it. */
export type ReviewVerdict = 'grounded' | 'drafted-verify';

export interface KnowledgeDocument {
  id: string;
  title: string;
  confidence: KnowledgeConfidence;
  source_kind: string;
  source_ref: string;
  mime: string;
  byte_size: number;
  chunk_count: number;
  hard_cut_count: number;
  brand_id: string | null;
  ingested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  retired_at: string | null;
  created_at: string;
  /**
   * Whether this document's text can reach a learner right now.
   *
   * Sent by the server rather than derived here, deliberately. `confidence === 'grounded'`
   * is only half of it — a retired document is not quotable whatever its confidence says —
   * and a component that guessed would guess in the direction of showing unapproved text
   * as live.
   */
  quotable: boolean;
}

export interface KnowledgePassage {
  chunk_index: number;
  text: string;
  keywords: string[];
  hard_cut: boolean;
}

export interface KnowledgeDocumentPage {
  documents: KnowledgeDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface KnowledgeDocumentDetail {
  document: KnowledgeDocument;
  passages: KnowledgePassage[];
  passage_total: number;
  limit: number;
  offset: number;
}

export interface ListDocumentsOptions {
  confidence?: KnowledgeConfidence;
  brandId?: string;
  includeRetired?: boolean;
  limit?: number;
  offset?: number;
}

const REVIEW_BASE = '/api/admin/explorer-growth/knowledge/documents';

/** One page of the review queue. Retired documents are excluded unless asked for. */
export async function listKnowledgeDocuments(
  options: ListDocumentsOptions = {},
): Promise<KnowledgeDocumentPage> {
  const params: Record<string, string | number> = {
    limit: options.limit ?? 20,
    offset: options.offset ?? 0,
  };
  if (options.confidence) params.confidence = options.confidence;
  if (options.brandId) params.brand_id = options.brandId;
  // Only sent when true: the query schema is `.strict()` and accepts the string form, so
  // an `undefined` serialised as "undefined" would be a 400 rather than a default.
  if (options.includeRetired) params.include_retired = 'true';

  const res = await api.get(REVIEW_BASE, { params });
  return res.data as KnowledgeDocumentPage;
}

/** One document and a page of its passages — the only call that returns stored text. */
export async function getKnowledgeDocument(
  id: string,
  page: { limit?: number; offset?: number } = {},
): Promise<KnowledgeDocumentDetail> {
  const res = await api.get(`${REVIEW_BASE}/${id}`, {
    params: { limit: page.limit ?? 20, offset: page.offset ?? 0 },
  });
  return res.data as KnowledgeDocumentDetail;
}

/**
 * A decision that could not be applied, as a value rather than an exception.
 *
 * The same shape the upload uses for a 422, and for the same reason: a retired document is
 * something the reviewer can act on — restore it, or leave it withdrawn — not a fault for
 * them to dig a status code out of. Genuine failures still throw.
 */
export type DecisionResult =
  | { status: 'decided'; document: KnowledgeDocument }
  | { status: 'retired'; retiredAt: string | null; message: string };

/** Record a verdict. `grounded` is the step that makes the document's text quotable. */
export async function decideKnowledgeDocument(
  id: string,
  confidence: ReviewVerdict,
): Promise<DecisionResult> {
  try {
    const res = await api.post(`${REVIEW_BASE}/${id}/decision`, { confidence });
    return { status: 'decided', document: (res.data as { document: KnowledgeDocument }).document };
  } catch (err) {
    const response = (err as { response?: { status?: number; data?: Record<string, unknown> } })
      .response;

    if (response?.status === 409) {
      return {
        status: 'retired',
        retiredAt: (response.data?.retired_at as string) ?? null,
        message:
          (response.data?.error as string) ??
          'That document was retired and cannot be approved.',
      };
    }

    throw err;
  }
}

/** Withdraw a document from retrieval. Idempotent: a repeat returns the same end state. */
export async function retireKnowledgeDocument(id: string): Promise<KnowledgeDocument> {
  const res = await api.post(`${REVIEW_BASE}/${id}/retire`);
  return (res.data as { document: KnowledgeDocument }).document;
}
