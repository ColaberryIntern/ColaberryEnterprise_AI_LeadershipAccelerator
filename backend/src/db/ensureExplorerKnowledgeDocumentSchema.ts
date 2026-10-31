import { sequelize } from '../config/database';

/**
 * Ingested documents and their chunks — the store behind Explorer knowledge ingestion.
 *
 * ## Why an uploaded document is safe to store before anyone has reviewed it
 *
 * `confidence` defaults to `'unstated'`, and `explorerKnowledgeQuote.decideKnowledgeQuote`
 * already REFUSES that state with `confidence_unstated`. So a document is unquotable the
 * moment it lands and stays unquotable until a human marks it `grounded`. That is the whole
 * safety argument for ingestion, and it needs no new policy and no change to the gate — the
 * tri-state the hub parser introduced for exactly this reason does the work.
 *
 * It also means an ingestion bug fails CLOSED. A chunker that produced nonsense, an
 * extractor that returned a PDF's binary preamble, a URL fetch that got an error page: all
 * of them land as `unstated` and none of them can reach a learner.
 *
 * ## Two tables, not one
 *
 * The document carries provenance and the approval; the chunk carries text. Denormalising
 * them would put the approval on every chunk, and approving a document would then be an
 * UPDATE over N rows that can half-succeed — a document that is partly approved is exactly
 * the state the quote gate cannot reason about.
 *
 * ## Content-addressed, so re-uploading the same file is a no-op
 *
 * The unique index is on `(sha256, brand)` rather than the filename: the same policy PDF
 * re-sent with a different name is the same document, and `gov_source_bundles` already
 * establishes sha256 dedupe as this repo's pattern for stored uploads. The brand is in the
 * key because two brands may legitimately hold the same source and approve it differently.
 *
 * `COALESCE` in the index expression because a NULL `brand_id` does not collide with itself
 * in Postgres — without it, an unscoped document could be ingested any number of times.
 *
 * ## No foreign key on brand_id, deliberately
 *
 * Same reasoning `ensureExplorerGrowthSchema` records for `explorer_content_assets`: this
 * DDL runs in the Explorer block, which boots BEFORE the multi-tenant modules are
 * guaranteed to have run, so `REFERENCES brands(id)` would be a boot error on a fresh
 * database rather than a no-op. A dangling id simply never matches the resolver predicate.
 * The column is carried from day one because retrofitting it later is the thing the plan
 * explicitly warned against.
 */
export const EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS explorer_knowledge_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID,
     brand_id UUID,
     title TEXT NOT NULL,
     source_kind VARCHAR(16) NOT NULL,
     source_ref TEXT NOT NULL,
     mime VARCHAR(100) NOT NULL DEFAULT '',
     byte_size INTEGER NOT NULL DEFAULT 0,
     sha256 VARCHAR(64) NOT NULL,
     chunk_count INTEGER NOT NULL DEFAULT 0,
     hard_cut_count INTEGER NOT NULL DEFAULT 0,
     confidence VARCHAR(16) NOT NULL DEFAULT 'unstated',
     ingested_by VARCHAR(255),
     reviewed_by VARCHAR(255),
     reviewed_at TIMESTAMPTZ,
     retired_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Content-addressed dedupe. The zero UUID stands in for "no brand" so an unscoped
  // document cannot be ingested twice — NULL never equals NULL in a unique index.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_knowledge_docs_sha
     ON explorer_knowledge_documents
     (sha256, COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))`,

  // The retrieval predicate leads on brand, mirroring `resolveContentAssets`.
  `CREATE INDEX IF NOT EXISTS idx_explorer_knowledge_docs_brand
     ON explorer_knowledge_documents (brand_id, confidence) WHERE retired_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS explorer_knowledge_chunks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     document_id UUID NOT NULL REFERENCES explorer_knowledge_documents(id) ON DELETE CASCADE,
     chunk_index INTEGER NOT NULL,
     text TEXT NOT NULL,
     keywords TEXT[] NOT NULL DEFAULT '{}',
     hard_cut BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // Re-ingesting a document replaces its chunks in place rather than duplicating them.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_knowledge_chunks_pos
     ON explorer_knowledge_chunks (document_id, chunk_index)`,

  // GIN over the keyword array, the shape the Explorer tables already use, so a candidate
  // set can be narrowed in SQL instead of loading the table into JavaScript the way Maya's
  // scorer has to.
  `CREATE INDEX IF NOT EXISTS idx_explorer_knowledge_chunks_keywords
     ON explorer_knowledge_chunks USING GIN (keywords)`,
];

/**
 * Create the ingestion tables. Idempotent: every statement is `IF NOT EXISTS`, each in its
 * own try/catch so a partial database self-heals and re-running boot is a no-op.
 */
export async function ensureExplorerKnowledgeDocumentSchema(): Promise<void> {
  for (const sql of EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] explorer_knowledge_documents schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Explorer knowledge document schema ensured');
}
