import { createHash } from 'crypto';

import { chunkDocument, chunkKeywords, type DocumentChunk } from './explorerDocumentChunker';
import {
  extractTextFromBufferDetailed,
  type ExtractResult,
} from '../fileExtractionService';

/**
 * Turns an uploaded file into stored, unquotable knowledge.
 *
 * ## It cannot make anything quotable, and that is the design
 *
 * Nothing here accepts a `confidence`. A stored document takes the column default,
 * `'unstated'`, which `decideKnowledgeQuote` already refuses. So no bug in this file — a
 * bad extraction, a chunker producing nonsense, a URL fetch that grabbed an error page —
 * can put text in front of a learner. The worst outcome is an unhelpful row waiting for a
 * reviewer who will not approve it.
 *
 * That property is worth more than any check this module could perform, because it holds
 * for the failures nobody predicted.
 *
 * ## Content-addressed, and the hash is over the BYTES
 *
 * Not over the extracted text. Extraction output depends on the parser version, so hashing
 * the text would make an `officeparser` upgrade look like every document changing at once,
 * and the whole corpus would re-ingest. The bytes are the document's stable identity.
 *
 * The dedupe check runs BEFORE extraction, so re-uploading a 200-page PDF costs a hash
 * rather than a parse. That is what makes the idempotency key do real work instead of
 * merely preventing a duplicate row after all the expensive steps have already run.
 *
 * ## Refusals are outcomes, not exceptions
 *
 * Every way this can decline returns a typed result. A scanned PDF with no text layer
 * extracts to nothing; storing that as a document with zero chunks would put a row in the
 * admin list that a reviewer could approve and that could never answer a question. It is
 * refused instead, with the reason said out loud.
 */

/** How the document reached us. */
export type IngestSourceKind = 'upload' | 'url';

/**
 * Bytes we will accept. Refused before anything is written to disk, so an oversized upload
 * cannot occupy the temp directory while being rejected.
 */
export const MAX_INGEST_BYTES = 20 * 1024 * 1024;

/**
 * Characters kept from one document, roughly a hundred pages.
 *
 * Far above `fileExtractionService`'s 50,000-character default, which exists for resumes.
 * Still bounded: a single document that dominated the corpus would dominate retrieval, and
 * an unbounded limit turns one bad upload into an unbounded number of chunk rows. When the
 * cut happens it is REPORTED, never silent.
 */
export const MAX_INGEST_CHARS = 400_000;

export type IngestRefusalReason =
  /** Zero bytes. */
  | 'empty_source'
  /** Over {@link MAX_INGEST_BYTES}. */
  | 'too_large'
  /** The parser could not read the file at all. */
  | 'extraction_failed'
  /** Read fine, contained no text — typically a scan with no text layer. */
  | 'no_text';

export interface IngestRequest {
  /** What a reviewer will see in the list. */
  title: string;
  sourceKind: IngestSourceKind;
  /** The original filename, or the URL. */
  sourceRef: string;
  mime: string;
  bytes: Buffer;
  brandId: string | null;
  tenantId: string | null;
  /**
   * The actor's EMAIL.
   *
   * Deliberately not a uuid: a uuid passes this repo's non-human denylist unconditionally,
   * which makes the guard decorative. The same rule the gov actor-identity work settled on.
   */
  ingestedBy: string;
}

/** One chunk as it will be stored. */
export interface IngestChunkRow {
  chunkIndex: number;
  text: string;
  keywords: string[];
  hardCut: boolean;
}

/** The document row, minus the id the store assigns. */
export interface IngestDocumentRow {
  tenantId: string | null;
  brandId: string | null;
  title: string;
  sourceKind: IngestSourceKind;
  sourceRef: string;
  mime: string;
  byteSize: number;
  sha256: string;
  chunkCount: number;
  hardCutCount: number;
  ingestedBy: string;
}

export type IngestResult =
  | {
      status: 'stored';
      documentId: string;
      sha256: string;
      chunkCount: number;
      /** Chunks cut without a sentence or paragraph boundary — a table dump or a bad parse. */
      hardCutCount: number;
      /** True when the document ran past {@link MAX_INGEST_CHARS} and the rest was dropped. */
      truncated: boolean;
      extractedChars: number;
    }
  | {
      status: 'duplicate';
      documentId: string;
      sha256: string;
      chunkCount: number;
    }
  | {
      status: 'refused';
      reason: IngestRefusalReason;
      detail: string;
    };

/**
 * What the ingest path needs from storage.
 *
 * `persist` writes the document AND its chunks, or neither. Atomicity belongs here rather
 * than in the service because a half-written document — a row with a chunk count it does
 * not have — is precisely what the retrieval path cannot detect.
 */
export interface IngestStore {
  findBySha(sha256: string, brandId: string | null): Promise<{ id: string; chunkCount: number } | null>;
  persist(document: IngestDocumentRow, chunks: readonly IngestChunkRow[]): Promise<string>;
}

export interface IngestDeps {
  store: IngestStore;
  /** Injected so the whole path is testable without a parser or a filesystem. */
  extract?: (bytes: Buffer, fileName: string, maxLength: number) => Promise<ExtractResult>;
  chunk?: (text: string) => DocumentChunk[];
}

/** sha256 of the raw bytes, hex. */
export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const defaultExtract = (bytes: Buffer, fileName: string, maxLength: number) =>
  extractTextFromBufferDetailed(bytes, fileName, { maxLength });

/**
 * Ingest one document: hash, dedupe, extract, chunk, store.
 *
 * Idempotent by content. Running it twice with the same bytes under the same brand stores
 * once and reports `duplicate` the second time — it does not error, because a reviewer
 * re-uploading a file they already sent has not done anything wrong.
 */
export async function ingestKnowledgeDocument(
  request: IngestRequest,
  deps: IngestDeps,
): Promise<IngestResult> {
  const extract = deps.extract ?? defaultExtract;
  const chunk = deps.chunk ?? ((text: string) => chunkDocument(text));

  if (request.bytes.length === 0) {
    return { status: 'refused', reason: 'empty_source', detail: 'the uploaded file is empty.' };
  }

  if (request.bytes.length > MAX_INGEST_BYTES) {
    return {
      status: 'refused',
      reason: 'too_large',
      detail:
        `the file is ${request.bytes.length} bytes, over the ${MAX_INGEST_BYTES}-byte limit. ` +
        'Split it, or upload the section that answers questions.',
    };
  }

  // BEFORE extraction, so a re-upload costs a hash rather than a parse.
  const sha256 = hashBytes(request.bytes);
  const existing = await deps.store.findBySha(sha256, request.brandId);
  if (existing) {
    return {
      status: 'duplicate',
      documentId: existing.id,
      sha256,
      chunkCount: existing.chunkCount,
    };
  }

  let extracted: ExtractResult;
  try {
    extracted = await extract(request.bytes, request.sourceRef, MAX_INGEST_CHARS);
  } catch (err: any) {
    // The message, not the stack: it names the file type the parser refused, which is the
    // one thing the person who uploaded it can act on.
    return {
      status: 'refused',
      reason: 'extraction_failed',
      detail: `the file could not be read: ${err?.message ?? 'unknown error'}`,
    };
  }

  const chunks = chunk(extracted.text);
  if (chunks.length === 0) {
    // Read fine, nothing in it. Storing this would put a row in the reviewer's list that
    // can be approved and can never answer anything.
    return {
      status: 'refused',
      reason: 'no_text',
      detail:
        'the file was read but contains no text. A scanned document needs OCR before it ' +
        'can be used as a knowledge source.',
    };
  }

  const chunkRows: IngestChunkRow[] = chunks.map((c) => ({
    chunkIndex: c.index,
    text: c.text,
    keywords: chunkKeywords(c.text),
    hardCut: c.hardCut,
  }));

  const hardCutCount = chunkRows.filter((c) => c.hardCut).length;

  const documentId = await deps.store.persist(
    {
      tenantId: request.tenantId,
      brandId: request.brandId,
      title: request.title,
      sourceKind: request.sourceKind,
      sourceRef: request.sourceRef,
      mime: request.mime,
      byteSize: request.bytes.length,
      sha256,
      chunkCount: chunkRows.length,
      hardCutCount,
      ingestedBy: request.ingestedBy,
    },
    chunkRows,
  );

  return {
    status: 'stored',
    documentId,
    sha256,
    chunkCount: chunkRows.length,
    hardCutCount,
    truncated: extracted.truncated,
    extractedChars: extracted.extractedChars,
  };
}
