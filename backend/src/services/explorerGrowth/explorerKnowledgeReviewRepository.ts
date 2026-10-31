import { QueryTypes, type Transaction } from 'sequelize';

import { sequelize } from '../../config/database';
import type { KnowledgeConfidence } from './explorerKnowledgeSource';

/**
 * Reading and deciding ingested knowledge documents — the store behind the review surface.
 *
 * ## What a decision here actually changes
 *
 * Ingestion stores every document at `confidence: 'unstated'`, and
 * `decideKnowledgeQuote` refuses both `unstated` AND `drafted-verify`. So `grounded` is the
 * ONLY state that makes a document quotable, and this module is the only place that state
 * can be reached. That is why the write is transactional and row-locked rather than a bare
 * UPDATE: it is the step that puts text in front of a learner.
 *
 * ## `unstated` is not a decision a reviewer can make
 *
 * The vocabulary is a tri-state, but only two of the three are REVIEWER verdicts.
 * `unstated` means "nobody ever said anything" — it is the absence of review, not a verdict
 * of "unreviewed". Once a human has looked, that absence is gone and cannot be restored by
 * writing the word back into the column. Allowing it would also hand anyone with the
 * endpoint a way to launder a reviewed document back into the queue with no record that it
 * was ever seen. The accepted set is therefore `grounded | drafted-verify`, enforced in the
 * controller's Zod enum and relied on here.
 *
 * ## Re-deciding is allowed; re-deciding a RETIRED document is not
 *
 * A reviewer who marks a document `grounded` and then, on a second read, downgrades it to
 * `drafted-verify` is doing the job correctly, so this is deliberately not a one-way gate
 * and deciding the same value twice is a no-op that reports the same end state. The one
 * refusal is a retired document: retirement is a withdrawal, and quietly re-approving
 * withdrawn text is the failure this surface exists to prevent. That is the 409.
 *
 * ## The row lock is load-bearing, not decoration
 *
 * Two reviewers opening the same document and clicking opposite verdicts a second apart
 * would otherwise interleave read-then-write and leave `confidence` and `reviewed_by`
 * describing different decisions — a document marked grounded with the downgrader's name
 * on it. `SELECT ... FOR UPDATE` inside the transaction serialises them, so the second
 * decision reads the first one's result and the pair always lands consistent.
 */

/** A reviewer verdict. `unstated` is deliberately absent — see the header. */
export type ReviewVerdict = Extract<KnowledgeConfidence, 'grounded' | 'drafted-verify'>;

/** Why a decision could not be applied, carried as a status rather than thrown. */
export type DecisionOutcome =
  | { status: 'decided'; document: ReviewDocument }
  | { status: 'not_found' }
  | { status: 'retired'; retiredAt: string };

export interface ReviewDocument {
  id: string;
  title: string;
  confidence: string;
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
}

export interface ReviewPassage {
  chunk_index: number;
  text: string;
  keywords: string[];
  hard_cut: boolean;
}

export interface ListOptions {
  confidence?: ReviewVerdict | 'unstated';
  brandId?: string | null;
  includeRetired?: boolean;
  limit: number;
  offset: number;
}

/** Every column the review surface reads. Text lives on the chunks, never here. */
const DOCUMENT_COLUMNS = `
  d.id::text AS id, d.title, d.confidence, d.source_kind, d.source_ref, d.mime,
  d.byte_size, d.chunk_count, d.hard_cut_count, d.brand_id::text AS brand_id,
  d.ingested_by, d.reviewed_by, d.reviewed_at, d.retired_at, d.created_at`;

/**
 * One page of documents, newest first, plus the total that matched.
 *
 * ## The total comes from a window function, not a second query
 *
 * `COUNT(*) OVER()` is computed over the same filtered set in the same statement, so the
 * count and the rows cannot disagree. Two round trips could: a document ingested between
 * them changes the total while the page stays as it was, and the UI then renders "showing
 * 20 of 21" with no twenty-first row to click.
 *
 * ## Retired documents are hidden by default
 *
 * A reviewer's queue is work outstanding, and a withdrawn document is not work. They remain
 * reachable with `includeRetired` so retirement is auditable rather than a disappearance.
 */
export async function listDocuments(
  options: ListOptions,
): Promise<{ documents: ReviewDocument[]; total: number }> {
  const rows = await sequelize.query<ReviewDocument & { total_count: string }>(
    `SELECT ${DOCUMENT_COLUMNS}, COUNT(*) OVER() AS total_count
       FROM explorer_knowledge_documents d
      WHERE (:includeRetired OR d.retired_at IS NULL)
        AND (CAST(:confidence AS text) IS NULL OR d.confidence = :confidence)
        AND (CAST(:brandId AS uuid) IS NULL OR d.brand_id = CAST(:brandId AS uuid))
      ORDER BY d.created_at DESC, d.id
      LIMIT :limit OFFSET :offset`,
    {
      replacements: {
        includeRetired: options.includeRetired ?? false,
        confidence: options.confidence ?? null,
        brandId: options.brandId ?? null,
        limit: options.limit,
        offset: options.offset,
      },
      type: QueryTypes.SELECT,
    },
  );

  // No rows means no matches, not an error. The total is 0 rather than undefined, because
  // an absent total renders as "showing 3 of undefined".
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const documents = rows.map(({ total_count: _ignored, ...doc }) => doc);
  return { documents, total };
}

/** One document's metadata, retired or not. Null when no such id exists. */
export async function getDocument(id: string): Promise<ReviewDocument | null> {
  const rows = await sequelize.query<ReviewDocument>(
    `SELECT ${DOCUMENT_COLUMNS} FROM explorer_knowledge_documents d WHERE d.id = CAST(:id AS uuid)`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * One page of a document's passages, in document order.
 *
 * Paginated because a 400,000-character source is ~330 chunks, and a reviewer reading a
 * document one screen at a time has no use for all of them in a single response — while a
 * proxy log that captured it would hold the whole document.
 */
export async function listPassages(
  documentId: string,
  page: { limit: number; offset: number },
): Promise<{ passages: ReviewPassage[]; total: number }> {
  const rows = await sequelize.query<ReviewPassage & { total_count: string }>(
    `SELECT c.chunk_index, c.text, c.keywords, c.hard_cut, COUNT(*) OVER() AS total_count
       FROM explorer_knowledge_chunks c
      WHERE c.document_id = CAST(:documentId AS uuid)
      ORDER BY c.chunk_index
      LIMIT :limit OFFSET :offset`,
    {
      replacements: { documentId, limit: page.limit, offset: page.offset },
      type: QueryTypes.SELECT,
    },
  );

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const passages = rows.map(({ total_count: _ignored, ...p }) => ({
    ...p,
    keywords: p.keywords ?? [],
  }));
  return { passages, total };
}

/** Locks the row for the rest of the transaction. See the header on why. */
async function lockDocument(id: string, t: Transaction): Promise<ReviewDocument | null> {
  const rows = await sequelize.query<ReviewDocument>(
    `SELECT ${DOCUMENT_COLUMNS}
       FROM explorer_knowledge_documents d
      WHERE d.id = CAST(:id AS uuid)
      FOR UPDATE`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction: t },
  );
  return rows[0] ?? null;
}

/**
 * Record a reviewer's verdict.
 *
 * Idempotent by construction: the end state is a function of the inputs alone, so applying
 * the same verdict twice leaves the same row and reports the same answer. `reviewed_at`
 * does move on a repeat, which is intended — it records when the document was last looked
 * at, and a reviewer re-confirming an old approval has genuinely looked at it again.
 */
export async function decideDocument(
  id: string,
  verdict: ReviewVerdict,
  reviewer: string,
): Promise<DecisionOutcome> {
  return sequelize.transaction(async (t) => {
    const existing = await lockDocument(id, t);
    if (!existing) return { status: 'not_found' as const };

    if (existing.retired_at) {
      // Withdrawn text must not be able to become quotable again through this endpoint.
      // Un-retiring is a separate, deliberate act, not a side effect of approving.
      return { status: 'retired' as const, retiredAt: String(existing.retired_at) };
    }

    const rows = await sequelize.query<ReviewDocument>(
      `UPDATE explorer_knowledge_documents AS d
          SET confidence = :verdict,
              reviewed_by = :reviewer,
              reviewed_at = NOW(),
              updated_at = NOW()
        WHERE d.id = CAST(:id AS uuid)
      RETURNING ${DOCUMENT_COLUMNS}`,
      {
        replacements: { id, verdict, reviewer },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );

    const updated = rows[0];
    if (!updated) {
      // The row was locked a statement ago, so this cannot happen without the table being
      // changed underneath us. Guessing an answer would report a decision that was not made.
      throw new Error('knowledge document vanished between lock and update');
    }

    return { status: 'decided' as const, document: updated };
  });
}

/**
 * Withdraw a document from retrieval.
 *
 * Idempotent: `retired_at IS NULL` in the predicate means a second retire leaves the FIRST
 * timestamp in place rather than rewriting history to the latest click. The caller gets the
 * same document either way, so a retry cannot be told apart from the original — which is
 * the point.
 */
export async function retireDocument(
  id: string,
  reviewer: string,
): Promise<{ status: 'retired' | 'not_found'; document?: ReviewDocument }> {
  return sequelize.transaction(async (t) => {
    const existing = await lockDocument(id, t);
    if (!existing) return { status: 'not_found' as const };
    if (existing.retired_at) return { status: 'retired' as const, document: existing };

    const rows = await sequelize.query<ReviewDocument>(
      `UPDATE explorer_knowledge_documents AS d
          SET retired_at = NOW(),
              reviewed_by = :reviewer,
              updated_at = NOW()
        WHERE d.id = CAST(:id AS uuid)
          AND d.retired_at IS NULL
      RETURNING ${DOCUMENT_COLUMNS}`,
      { replacements: { id, reviewer }, type: QueryTypes.SELECT, transaction: t },
    );

    return { status: 'retired' as const, document: rows[0] ?? existing };
  });
}
