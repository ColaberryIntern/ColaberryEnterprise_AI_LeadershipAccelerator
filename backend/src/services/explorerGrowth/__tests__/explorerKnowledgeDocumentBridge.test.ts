import {
  chunkToEntry,
  documentEntryId,
  isDocumentEntryId,
  partitionBySource,
  withDocumentEntries,
  DOCUMENT_ENTRY_CATEGORY,
  type StoredChunk,
} from '../explorerKnowledgeDocumentBridge';
import { groundDraft, rankQuotableEntries, scoreEntry, queryTokens } from '../explorerKnowledgeGrounding';
import type { KnowledgeBase } from '../explorerKnowledgeSource';

/**
 * The bridge exists so there is ONE scorer and ONE gate, not two.
 *
 * So the tests that matter here drive the REAL `groundDraft` over a base that mixes hub
 * entries and document chunks, rather than asserting on the mapping in isolation. A mapping
 * that looks right and does not survive the gate would pass a shape test and fail in
 * production, where the symptom is a composer that quietly says nothing specific.
 */

function base(over: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    schema: 'colaberry.kb/v1',
    version: '1.1',
    description: 'the hub export',
    coreFacts: 'Core facts text.',
    generatedAt: '2026-10-30T00:00:00.000Z',
    entries: [],
    ...over,
  };
}

function hubEntry(id: string, over: Partial<KnowledgeBase['entries'][number]> = {}) {
  return {
    id,
    domain: 'admissions',
    category: 'program basics',
    question: 'When does the cohort start?',
    answer: 'The cohort starts in November.',
    detail: '',
    tags: ['cohort'],
    reference: 'admissions/index.html#cat-basics',
    referenceLabel: 'Admissions',
    confidence: 'grounded' as const,
    ...over,
  };
}

function chunk(over: Partial<StoredChunk> = {}): StoredChunk {
  return {
    documentId: '11111111-2222-3333-4444-555555555555',
    documentTitle: 'Admissions policy',
    confidence: 'grounded',
    chunkIndex: 0,
    text: 'Applicants submit a portfolio before the interview stage.',
    keywords: ['applicants', 'portfolio', 'interview'],
    ...over,
  };
}

describe('the entry id is stable, which the hub ids are not', () => {
  it('keys on the document uuid and the chunk position', () => {
    expect(documentEntryId('abc', 4)).toBe('doc:abc:4');
    expect(isDocumentEntryId('doc:abc:4')).toBe(true);
    expect(isDocumentEntryId('sales-8')).toBe(false);
  });

  it('does not change when another document is ingested', () => {
    // The hub renumbers positionally, so inserting one entry moves every later id in that
    // domain. A refusal keyed on a moved id is attributed to the wrong entry.
    const first = chunkToEntry(chunk({ chunkIndex: 2 }));
    const afterOtherWork = chunkToEntry(chunk({ chunkIndex: 2 }));

    expect(first.id).toBe(afterOtherWork.id);
  });

  it('separates the two sources for reporting', () => {
    expect(partitionBySource(['sales-8', 'doc:x:0', 'admissions-2', 'doc:y:3'])).toEqual({
      fromHub: ['sales-8', 'admissions-2'],
      fromDocuments: ['doc:x:0', 'doc:y:3'],
    });
  });
});

describe('the mapping', () => {
  it('carries the chunk text as the answer and the keywords as tags', () => {
    const entry = chunkToEntry(chunk());

    expect(entry.answer).toBe('Applicants submit a portfolio before the interview stage.');
    // The whole reason chunks are keyworded at ingest: it lets ONE scorer rank hub entries
    // and document text without a second code path deciding what a document is "about".
    expect(entry.tags).toEqual(['applicants', 'portfolio', 'interview']);
    expect(entry.category).toBe(DOCUMENT_ENTRY_CATEGORY);
  });

  it('gives the citation a handle a human can check', () => {
    const entry = chunkToEntry(chunk({ chunkIndex: 2, documentTitle: 'Refund policy' }));

    // An empty question would make a citation nobody can verify. "part 3 of the refund
    // policy" is checkable.
    expect(entry.question).toBe('Refund policy — part 3');
    expect(entry.referenceLabel).toBe('Refund policy');
  });

  it('leaves detail empty, because answer and detail score as ONE body', () => {
    expect(chunkToEntry(chunk()).detail).toBe('');
  });

  it('takes confidence from the DOCUMENT, so a document cannot be half-approved', () => {
    expect(chunkToEntry(chunk({ confidence: 'unstated' })).confidence).toBe('unstated');
    expect(chunkToEntry(chunk({ confidence: 'grounded' })).confidence).toBe('grounded');
  });
});

describe('withDocumentEntries', () => {
  it('appends to the hub entries without touching the envelope', () => {
    const hub = base({ entries: [hubEntry('admissions-1')] });

    const merged = withDocumentEntries(hub, [chunk()]);

    expect(merged.entries).toHaveLength(2);
    expect(merged.entries[0].id).toBe('admissions-1');
    // The envelope describes the HUB export. A document rewriting it would be a lie.
    expect(merged.schema).toBe(hub.schema);
    expect(merged.version).toBe(hub.version);
    expect(merged.coreFacts).toBe(hub.coreFacts);
    expect(merged.generatedAt).toBe(hub.generatedAt);
  });

  it('returns the base untouched when there are no chunks', () => {
    const hub = base({ entries: [hubEntry('admissions-1')] });

    expect(withDocumentEntries(hub, [])).toBe(hub);
  });

  it('does not mutate the base it was given', () => {
    const hub = base({ entries: [hubEntry('admissions-1')] });

    withDocumentEntries(hub, [chunk()]);

    expect(hub.entries).toHaveLength(1);
  });
});

describe('the real gate and scorer handle document chunks unchanged', () => {
  it('REFUSES an unapproved document chunk, the whole safety argument end to end', () => {
    const merged = withDocumentEntries(base(), [chunk({ confidence: 'unstated' })]);

    const result = groundDraft({ base: merged, query: 'portfolio interview applicants' });

    // The chunk matches the query strongly. It is still refused, because nobody approved
    // the document — no new policy, no change to the gate.
    expect(result.quotableCount).toBe(0);
    expect(result.block).toBe('');
    expect(result.citations).toEqual([]);
    expect(result.refusalCounts.confidence_unstated).toBe(1);
  });

  it('quotes an approved chunk and cites it', () => {
    const merged = withDocumentEntries(base(), [chunk({ confidence: 'grounded' })]);

    const result = groundDraft({ base: merged, query: 'portfolio interview applicants' });

    expect(result.quotableCount).toBe(1);
    expect(result.block).toContain('Applicants submit a portfolio');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].referenceLabel).toBe('Admissions policy');
  });

  it('ranks hub entries and document chunks against the same query', () => {
    const merged = withDocumentEntries(base({ entries: [hubEntry('admissions-1')] }), [
      chunk({ confidence: 'grounded' }),
    ]);

    const result = groundDraft({ base: merged, query: 'portfolio interview' });

    // The hub entry is about cohort start dates and matches nothing in this query, so it
    // does not appear. An irrelevant entry padding the prompt invites the model to use it.
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].domain).toBe('Admissions policy');
  });

  it('refuses a chunk whose text trips the forbidden-wording rule', () => {
    const merged = withDocumentEntries(base(), [
      chunk({ confidence: 'grounded', text: 'The introductory class is free to attend.' }),
    ]);

    const result = groundDraft({ base: merged, query: 'introductory class attend' });

    // An uploaded document is not exempt from the copy rules just because a human approved
    // its accuracy — approving a fact is not approving its wording.
    expect(result.quotableCount).toBe(0);
    expect(result.refusalCounts.banned_copy).toBeGreaterThan(0);
  });

  it('refuses a chunk stating a date the learner context does not support', () => {
    const merged = withDocumentEntries(base(), [
      chunk({ confidence: 'grounded', text: 'The next cohort begins on 3 November 2026.' }),
    ]);

    const result = groundDraft({ base: merged, query: 'cohort begins november' });

    expect(result.quotableCount).toBe(0);
    expect(result.refusalCounts.ungrounded_fact).toBeGreaterThan(0);
  });

  it('earns the tag bonus from the chunker keywords', () => {
    const tokens = queryTokens('portfolio');
    const withTags = scoreEntry(chunkToEntry(chunk()), tokens);
    const withoutTags = scoreEntry(chunkToEntry(chunk({ keywords: [] })), tokens);

    expect(withTags).toBeGreaterThan(withoutTags);
  });
});

describe('ordering at an exact score tie is alphabetical, NOT a quality judgement', () => {
  it('breaks a tie by id, which nobody should read as a preference', () => {
    // Pinned so the behaviour is predictable rather than surprising. At identical scores a
    // `doc:` entry beats `sales-*` and loses to `admissions-*`, which is arbitrary. It is
    // left that way because encoding a preference in an id prefix hides policy in a string.
    // Built to score identically: each matches the query in its question (+2) and its body
    // (+1), with no tags and no category bonus. The title is the chunk's question, which is
    // why it has to carry the token too.
    const docEntry = chunkToEntry(
      chunk({ confidence: 'grounded', documentTitle: 'cohort', text: 'cohort', keywords: [] }),
    );
    const sales = hubEntry('sales-8', { question: 'cohort', answer: 'cohort', tags: [], category: 'x' });

    const ranked = rankQuotableEntries([sales, docEntry], 'cohort');

    expect(ranked).toHaveLength(2);
    expect(ranked[0].score).toBe(ranked[1].score);
    expect(ranked[0].entry.id).toBe(docEntry.id);
    expect(ranked[1].entry.id).toBe('sales-8');
  });
});
