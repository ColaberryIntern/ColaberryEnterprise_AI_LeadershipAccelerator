import type {
  KnowledgeBase,
  KnowledgeConfidence,
  KnowledgeEntry,
} from './explorerKnowledgeSource';

/**
 * Presents a stored document chunk as a knowledge entry.
 *
 * ## Why a mapping rather than a second retrieval path
 *
 * `rankQuotableEntries` scores entries and `decideKnowledgeQuote` refuses them. Both already
 * exist, both are tested, and both are the subject of a governance argument that took real
 * thought — governance partitions BEFORE relevance, so the gate's verdict does not depend on
 * the search query. Building a parallel scorer for documents would mean two code paths
 * deciding what may be said to a learner, and they would drift. One of them would drift
 * towards permissive, because that is the direction a retrieval path drifts when someone is
 * debugging why an answer came back empty.
 *
 * So a chunk becomes a `KnowledgeEntry` and the existing machinery handles it unchanged.
 * `groundDraft` needs no modification at all: `withDocumentEntries` hands it a base whose
 * entries include the documents.
 *
 * ## Confidence comes from the DOCUMENT
 *
 * Approval is per document - that is why the store has two tables. Every chunk of an
 * unapproved document is therefore refused as a set, and a document cannot be half-approved.
 * A chunk carrying its own confidence would make that possible, which is the exact state
 * the quote gate has no way to reason about.
 *
 * ## The id is stable, unlike the hub's
 *
 * The hub derives ids positionally, so inserting one entry renumbers every later entry in
 * that domain. A chunk id is the document's uuid plus the chunk's own position, which
 * nothing renumbers. That matters because the id is what a refusal is keyed on, and a
 * refusal attributed to the wrong chunk is worse than no refusal record at all.
 */

/** Marks an entry as coming from an ingested document rather than the hub. */
export const DOCUMENT_ENTRY_PREFIX = 'doc:';

/** The category every document entry carries, so a reviewer can see where a quote came from. */
export const DOCUMENT_ENTRY_CATEGORY = 'uploaded document';

/** One chunk as the store returns it, with its document's identity attached. */
export interface StoredChunk {
  documentId: string;
  documentTitle: string;
  /** The DOCUMENT's confidence. See the header. */
  confidence: KnowledgeConfidence;
  chunkIndex: number;
  text: string;
  keywords: string[];
  /** Where a reviewer can open the source. May be empty. */
  reference?: string;
}

/** `doc:<documentId>:<chunkIndex>`. Stable across re-ingestion of other documents. */
export function documentEntryId(documentId: string, chunkIndex: number): string {
  return `${DOCUMENT_ENTRY_PREFIX}${documentId}:${chunkIndex}`;
}

/** Whether an entry id came from this bridge. */
export function isDocumentEntryId(id: string): boolean {
  return id.startsWith(DOCUMENT_ENTRY_PREFIX);
}

/**
 * One chunk as a knowledge entry.
 *
 * `question` is `<title> — part N` rather than empty. A chunk has no question, but the
 * citation's whole purpose is to be a handle a human can check, and "part 3 of the
 * admissions policy" is checkable where an empty string is not. It also means a query
 * matching the document title earns the question bonus, which is the behaviour anyone would
 * expect when they search for the document by name.
 *
 * `detail` stays empty: `scoreEntry` reads `answer` and `detail` as ONE body, so splitting
 * the chunk across both would earn nothing and only risk double-counting later.
 */
export function chunkToEntry(chunk: StoredChunk): KnowledgeEntry {
  return {
    id: documentEntryId(chunk.documentId, chunk.chunkIndex),
    domain: chunk.documentTitle,
    category: DOCUMENT_ENTRY_CATEGORY,
    question: `${chunk.documentTitle} — part ${chunk.chunkIndex + 1}`,
    answer: chunk.text,
    detail: '',
    // The chunker's keywords stand in for the tags a hub entry carries by hand. This is the
    // whole reason chunks are keyworded at ingest: it lets one scorer rank both kinds.
    tags: chunk.keywords,
    reference: chunk.reference ?? '',
    referenceLabel: chunk.documentTitle,
    confidence: chunk.confidence,
  };
}

/**
 * The hub's base with document chunks added to its entries.
 *
 * The envelope - schema, version, description, coreFacts, generatedAt - is carried through
 * untouched. Those fields describe the hub export and would be a lie if a document rewrote
 * them.
 *
 * ORDERING IS NOT A QUALITY JUDGEMENT. Document entries are appended, and
 * `rankQuotableEntries` breaks a score tie by comparing ids alphabetically. So at identical
 * scores a `doc:` entry beats `sales-8` and loses to `admissions-2`, which is arbitrary
 * rather than intended. It is left alphabetical because the alternative is encoding a
 * preference in an id prefix, and a policy hidden in a string is worse than one that is
 * visibly absent. Scores rarely tie; when they do, nobody should read the order as meaning
 * anything.
 */
export function withDocumentEntries(
  base: KnowledgeBase,
  chunks: readonly StoredChunk[],
): KnowledgeBase {
  if (chunks.length === 0) return base;

  return {
    ...base,
    entries: [...base.entries, ...chunks.map(chunkToEntry)],
  };
}

/** Splits a selection's ids into the two sources, for reporting to a reviewer. */
export function partitionBySource(ids: readonly string[]): {
  fromHub: string[];
  fromDocuments: string[];
} {
  const fromHub: string[] = [];
  const fromDocuments: string[] = [];
  for (const id of ids) {
    (isDocumentEntryId(id) ? fromDocuments : fromHub).push(id);
  }
  return { fromHub, fromDocuments };
}
