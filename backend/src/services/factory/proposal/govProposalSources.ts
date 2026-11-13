import { sequelize } from '../../../config/database';
import { intelligenceProxy } from '../../intelligenceProxyService';
import { extractTextFromBufferDetailed } from '../../fileExtractionService';
import { chunkText, type SourceChunk } from './sourceChunker';
import GovProposalSourceDocument, { type GovProposalSourceStatus } from '../../../models/GovProposalSourceDocument';

/**
 * govProposalSources — ingest, manage, and retrieve from a gov project's proposal SOURCE library (P-SRC).
 *
 * A human uploads a reference document; it is extracted, chunked ({@link chunkText}), embedded via the platform's
 * intelligence proxy, and stored in pgvector. Retrieval returns the most relevant chunks for a section's text, filtered
 * to APPROVED documents only, so the proposal grounder can cite the right parts of a long source rather than the whole
 * file. Vector INSERT and search go through raw SQL (the `::vector` cast and `<=>` operator), mirroring vectorMemory.
 *
 * The embedding proxy is best-effort: when it is down, a chunk is stored with a NULL embedding (the document's status
 * becomes `embedding_pending`) and simply does not participate in retrieval until re-embedded. Nothing here grounds a
 * proposal; approval + the grounder wiring (P2) do.
 */

/** Cap for extraction so a whole source document is ingested, not the 50k resume default. */
const MAX_EXTRACT_CHARS = 2_000_000;
/** Dimension of the pgvector column; must match the embedding proxy and intelligence_memory. */
const EMBED_DIM = 1536;

async function embed(text: string): Promise<number[] | null> {
  try {
    const r = await intelligenceProxy.embedText(text);
    const e = (r as any)?.data?.embedding;
    return Array.isArray(e) && e.length === EMBED_DIM ? (e as number[]) : null;
  } catch {
    return null;
  }
}

async function insertChunk(documentId: string, projectId: string, tenantId: string, c: SourceChunk, emb: number[] | null): Promise<void> {
  const base = { document_id: documentId, project_id: projectId, tenant_id: tenantId, chunk_index: c.index, text: c.text, token_estimate: c.tokenEstimate };
  if (emb) {
    await sequelize.query(
      `INSERT INTO gov_proposal_source_chunks (document_id, project_id, tenant_id, chunk_index, text, token_estimate, embedding)
       VALUES (:document_id, :project_id, :tenant_id, :chunk_index, :text, :token_estimate, :embedding::vector)`,
      { replacements: { ...base, embedding: `[${emb.join(',')}]` }, type: 'INSERT' as any },
    );
  } else {
    await sequelize.query(
      `INSERT INTO gov_proposal_source_chunks (document_id, project_id, tenant_id, chunk_index, text, token_estimate, embedding)
       VALUES (:document_id, :project_id, :tenant_id, :chunk_index, :text, :token_estimate, NULL)`,
      { replacements: base, type: 'INSERT' as any },
    );
  }
}

export interface IngestSourceInput { name: string; mimeType?: string | null; buffer: Buffer; source?: string | null; }
export interface IngestSourceResult { documentId: string; chunkCount: number; embeddedCount: number; truncated: boolean; status: GovProposalSourceStatus; }

/**
 * Ingest (or re-ingest) a source document for a project. Idempotent on (project_id, name): a prior document with the
 * same name is replaced (its chunks cascade-delete), so re-uploading never duplicates.
 */
export async function ingestSourceDocument(
  projectId: string, tenantId: string, input: IngestSourceInput, identityId: string | null,
): Promise<IngestSourceResult> {
  const prior = await GovProposalSourceDocument.findAll({ where: { project_id: projectId, name: input.name } });
  for (const d of prior) await d.destroy();

  const extracted = await extractTextFromBufferDetailed(input.buffer, input.name, { maxLength: MAX_EXTRACT_CHARS });
  const chunks = chunkText(extracted.text);

  const doc = await GovProposalSourceDocument.create({
    project_id: projectId, tenant_id: tenantId, name: input.name, mime_type: input.mimeType ?? null,
    source: input.source ?? null, status: 'ready', approved: false, uploaded_by_identity_id: identityId,
    extracted_chars: extracted.extractedChars, truncated: extracted.truncated, chunk_count: chunks.length, embedded_count: 0,
  });

  let embedded = 0;
  for (const c of chunks) {
    const emb = await embed(c.text);
    if (emb) embedded++;
    await insertChunk(doc.id, projectId, tenantId, c, emb);
  }

  const status: GovProposalSourceStatus = chunks.length > 0 && embedded === 0 ? 'embedding_pending' : 'ready';
  await doc.update({ embedded_count: embedded, status, updated_at: new Date() });
  return { documentId: doc.id, chunkCount: chunks.length, embeddedCount: embedded, truncated: extracted.truncated, status };
}

export async function listSourceDocuments(projectId: string): Promise<GovProposalSourceDocument[]> {
  return GovProposalSourceDocument.findAll({ where: { project_id: projectId }, order: [['created_at', 'DESC']] });
}

export async function approveSourceDocument(documentId: string, identityId: string | null, approved = true): Promise<GovProposalSourceDocument | null> {
  const doc = await GovProposalSourceDocument.findByPk(documentId);
  if (!doc) return null;
  await doc.update({ approved, approved_by_identity_id: approved ? identityId : null, updated_at: new Date() });
  return doc;
}

export async function deleteSourceDocument(documentId: string): Promise<boolean> {
  const n = await GovProposalSourceDocument.destroy({ where: { id: documentId } }); // chunks cascade via FK
  return n > 0;
}

export interface RetrievedExcerpt { documentId: string; documentName: string; chunkIndex: number; text: string; similarity: number; }

/**
 * Retrieve the top-k most relevant chunks for a section's text, from APPROVED documents in this project only.
 * Returns [] when the embedding proxy is unavailable (the caller then grounds without source excerpts).
 */
export async function retrieveRelevantChunks(projectId: string, queryText: string, topK = 6): Promise<RetrievedExcerpt[]> {
  const emb = await embed(queryText);
  if (!emb) return [];
  const rows: any[] = await sequelize.query(
    `SELECT c.document_id, d.name AS document_name, c.chunk_index, c.text,
            1 - (c.embedding <=> :q::vector) AS similarity
       FROM gov_proposal_source_chunks c
       JOIN gov_proposal_source_documents d ON d.id = c.document_id
      WHERE c.project_id = :pid AND c.embedding IS NOT NULL AND d.approved = TRUE
      ORDER BY c.embedding <=> :q::vector
      LIMIT :k`,
    { replacements: { q: `[${emb.join(',')}]`, pid: projectId, k: topK }, type: 'SELECT' as any },
  );
  return rows.map((r) => ({
    documentId: r.document_id, documentName: r.document_name, chunkIndex: r.chunk_index,
    text: r.text, similarity: parseFloat(r.similarity) || 0,
  }));
}
