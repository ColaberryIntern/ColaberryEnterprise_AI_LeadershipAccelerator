import { QueryTypes, type Transaction } from 'sequelize';

import { sequelize } from '../../config/database';
import type {
  IngestChunkRow,
  IngestDocumentRow,
  IngestStore,
} from './explorerKnowledgeIngest';

/**
 * Postgres behind {@link IngestStore}.
 *
 * ## The lookup mirrors the unique index, exactly
 *
 * The index is on `(sha256, COALESCE(brand_id, <zero uuid>))`, so the lookup uses the same
 * expression. Writing the obvious `brand_id = :brandId` instead would be a live bug rather
 * than a style difference: `NULL = NULL` is false in SQL, so an unscoped document would
 * never match itself, `findBySha` would report "new", and the INSERT would then violate the
 * very constraint the lookup existed to avoid. The dedupe would appear to work right up
 * until the first unscoped re-upload.
 *
 * ## The race is handled in SQL, not by checking first
 *
 * `findBySha` narrows the common case; it does not make the write safe. Two uploads of the
 * same file landing together both see "new". So the insert carries `ON CONFLICT DO NOTHING`
 * and, when it returns no row, re-reads the winner's id. The loser stores nothing and
 * reports the winner's document — which is the same answer a sequential duplicate gets.
 *
 * ## Chunks go in as arrays, not as one bind parameter per column per row
 *
 * A 400,000-character document is ~330 chunks; at five parameters each that is well inside
 * Postgres's 65,535 limit today and is the kind of headroom that quietly disappears. Four
 * array parameters and an `unnest` do not grow with the document.
 *
 * Keywords travel as comma-joined strings because `unnest` cannot walk a 2-D array row by
 * row. That is safe here and NOT a general-purpose encoding: `chunkKeywords` strips
 * everything outside `[a-z0-9+#.-]`, so a comma cannot occur inside a keyword. There is a
 * test pinning that, because the day the keyword charset widens is the day this silently
 * splits one keyword into two.
 */

/** Stands in for "no brand" in the dedupe key, matching the unique index expression. */
export const NO_BRAND_SENTINEL = '00000000-0000-0000-0000-000000000000';

/** Separator for the keyword array. See the header: safe only because of the charset. */
export const KEYWORD_SEPARATOR = ',';

interface DocumentIdRow {
  id: string;
  chunk_count: number;
}

/**
 * The existing document for these bytes under this brand, or null.
 *
 * `retired_at` is deliberately NOT filtered: a retired document still occupies the unique
 * key, so reporting it as absent would send the caller into an insert that cannot succeed.
 */
export async function findBySha(
  sha256: string,
  brandId: string | null,
): Promise<{ id: string; chunkCount: number } | null> {
  const rows = await sequelize.query<DocumentIdRow>(
    `SELECT id::text AS id, chunk_count
       FROM explorer_knowledge_documents
      WHERE sha256 = :sha256
        AND COALESCE(brand_id, CAST(:sentinel AS uuid))
            = COALESCE(CAST(:brandId AS uuid), CAST(:sentinel AS uuid))
      LIMIT 1`,
    {
      replacements: { sha256, brandId, sentinel: NO_BRAND_SENTINEL },
      type: QueryTypes.SELECT,
    },
  );

  const row = rows[0];
  return row ? { id: row.id, chunkCount: Number(row.chunk_count) } : null;
}

/** Insert the document, or find the row that won the race. Returns the id either way. */
async function insertDocument(
  document: IngestDocumentRow,
  t: Transaction,
): Promise<{ id: string; inserted: boolean }> {
  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO explorer_knowledge_documents
       (tenant_id, brand_id, title, source_kind, source_ref, mime, byte_size,
        sha256, chunk_count, hard_cut_count, ingested_by)
     VALUES
       (CAST(:tenantId AS uuid), CAST(:brandId AS uuid), :title, :sourceKind, :sourceRef,
        :mime, :byteSize, :sha256, :chunkCount, :hardCutCount, :ingestedBy)
     ON CONFLICT DO NOTHING
     RETURNING id::text AS id`,
    {
      replacements: {
        tenantId: document.tenantId,
        brandId: document.brandId,
        title: document.title.slice(0, 500),
        sourceKind: document.sourceKind,
        sourceRef: document.sourceRef,
        mime: document.mime,
        byteSize: document.byteSize,
        sha256: document.sha256,
        chunkCount: document.chunkCount,
        hardCutCount: document.hardCutCount,
        ingestedBy: document.ingestedBy,
      },
      type: QueryTypes.SELECT,
      transaction: t,
    },
  );

  const id = rows[0]?.id;
  if (id) return { id, inserted: true };

  // Lost the race. The winner's row is already complete, chunks included.
  const existing = await sequelize.query<{ id: string }>(
    `SELECT id::text AS id
       FROM explorer_knowledge_documents
      WHERE sha256 = :sha256
        AND COALESCE(brand_id, CAST(:sentinel AS uuid))
            = COALESCE(CAST(:brandId AS uuid), CAST(:sentinel AS uuid))
      LIMIT 1`,
    {
      replacements: {
        sha256: document.sha256,
        brandId: document.brandId,
        sentinel: NO_BRAND_SENTINEL,
      },
      type: QueryTypes.SELECT,
      transaction: t,
    },
  );

  const winner = existing[0]?.id;
  if (!winner) {
    // ON CONFLICT fired but nothing matches the key. That is a different constraint than
    // the one this code reasons about, and guessing would store a document under an id
    // nobody can find.
    throw new Error('knowledge document insert conflicted on an unexpected constraint');
  }

  return { id: winner, inserted: false };
}

/** Insert every chunk in one statement. */
async function insertChunks(
  documentId: string,
  chunks: readonly IngestChunkRow[],
  t: Transaction,
): Promise<void> {
  if (chunks.length === 0) return;

  await sequelize.query(
    `INSERT INTO explorer_knowledge_chunks
       (document_id, chunk_index, text, keywords, hard_cut)
     SELECT CAST(:documentId AS uuid), idx, txt,
            CASE WHEN kw = '' THEN ARRAY[]::text[] ELSE string_to_array(kw, :separator) END,
            hc
       FROM unnest(
              CAST(:indexes AS int[]),
              CAST(:texts AS text[]),
              CAST(:keywords AS text[]),
              CAST(:hardCuts AS boolean[])
            ) AS t(idx, txt, kw, hc)
     ON CONFLICT (document_id, chunk_index) DO NOTHING`,
    {
      replacements: {
        documentId,
        separator: KEYWORD_SEPARATOR,
        indexes: chunks.map((c) => c.chunkIndex),
        texts: chunks.map((c) => c.text),
        keywords: chunks.map((c) => c.keywords.join(KEYWORD_SEPARATOR)),
        hardCuts: chunks.map((c) => c.hardCut),
      },
      type: QueryTypes.INSERT,
      transaction: t,
    },
  );
}

/**
 * Write the document and its chunks, or neither.
 *
 * One transaction, so a document can never claim a chunk count it does not have — the one
 * inconsistency the retrieval path has no way to notice.
 */
export async function persist(
  document: IngestDocumentRow,
  chunks: readonly IngestChunkRow[],
): Promise<string> {
  return sequelize.transaction(async (t) => {
    const { id, inserted } = await insertDocument(document, t);

    // Only the winner writes chunks. The loser's would collide row for row, and re-inserting
    // over a document someone may already have approved is a change nobody asked for.
    if (inserted) await insertChunks(id, chunks, t);

    return id;
  });
}

/** The repository as the ingest path consumes it. */
export const explorerKnowledgeDocumentStore: IngestStore = { findBySha, persist };
