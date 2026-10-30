import api from '../utils/api';

/**
 * explorerKnowledgeApi — the knowledge ingestion client.
 *
 * Separate from `explorerGrowthApi` for the same reason the backend route is a separate
 * router: that file documents itself as the Command Center's read API, and its contract is
 * worth keeping legible. One write lives here instead.
 *
 * Types mirror `backend/src/controllers/explorerKnowledgeController.ts` BY HAND. There is no
 * shared-types package; `capeApi.ts` documents that as the standing convention.
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
