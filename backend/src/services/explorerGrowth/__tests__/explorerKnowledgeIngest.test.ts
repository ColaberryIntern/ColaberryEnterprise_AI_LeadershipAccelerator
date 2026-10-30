import {
  hashBytes,
  ingestKnowledgeDocument,
  MAX_INGEST_BYTES,
  MAX_INGEST_CHARS,
  type IngestChunkRow,
  type IngestDeps,
  type IngestDocumentRow,
  type IngestRequest,
  type IngestStore,
} from '../explorerKnowledgeIngest';
import type { ExtractResult } from '../../fileExtractionService';

/**
 * The ingest path, driven on the failures that would put bad text in a reviewer's list.
 *
 * The property the whole design rests on is NEGATIVE: nothing here can make a document
 * quotable, because nothing here sets `confidence`. That is asserted directly — the row
 * handed to the store is checked for the absence of the field — because a future change
 * adding one would pass every other test in this file.
 *
 * Everything is injected, so no test here parses a PDF or touches a database. The parser
 * is `officeparser`'s problem and the transaction is the store's; what is tested is the
 * decision sequence, which is the part that was not written yet.
 */

/** A store that records what it was asked to write. */
function makeStore(existing: { id: string; chunkCount: number } | null = null) {
  const findBySha = jest.fn().mockResolvedValue(existing);
  const persist = jest.fn().mockResolvedValue('doc-1');
  const store: IngestStore = { findBySha, persist };
  return { store, findBySha, persist };
}

function extractorFor(text: string, over: Partial<ExtractResult> = {}) {
  return jest.fn().mockResolvedValue({
    text,
    truncated: false,
    extractedChars: text.length,
    ...over,
  } satisfies ExtractResult);
}

function requestFor(bytes: Buffer, over: Partial<IngestRequest> = {}): IngestRequest {
  return {
    title: 'Admissions policy',
    sourceKind: 'upload',
    sourceRef: 'admissions.pdf',
    mime: 'application/pdf',
    bytes,
    brandId: null,
    tenantId: null,
    ingestedBy: 'ali@colaberry.com',
    ...over,
  };
}

/** The document row as the store received it. */
function persistedDocument(persist: jest.Mock): IngestDocumentRow {
  return persist.mock.calls[0][0] as IngestDocumentRow;
}

/** The chunk rows as the store received them. */
function persistedChunks(persist: jest.Mock): IngestChunkRow[] {
  return persist.mock.calls[0][1] as IngestChunkRow[];
}

const PROSE =
  'The cohort begins on 3 November and runs for twelve weeks. Seats are capped at twenty. ';

describe('ingestKnowledgeDocument — the happy path', () => {
  it('hashes, extracts, chunks and stores, reporting what it wrote', async () => {
    const { store, persist } = makeStore();
    const deps: IngestDeps = { store, extract: extractorFor(PROSE.repeat(40)) };

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('pdf bytes')), deps);

    expect(result.status).toBe('stored');
    if (result.status !== 'stored') throw new Error('unreachable');
    expect(result.documentId).toBe('doc-1');
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(result.sha256).toBe(hashBytes(Buffer.from('pdf bytes')));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('writes the document and its chunks in ONE call, so neither can land without the other', async () => {
    const { store, persist } = makeStore();

    await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), {
      store,
      extract: extractorFor(PROSE.repeat(40)),
    });

    // Two calls would be two transactions, and a document whose chunks failed is a row
    // claiming a chunk count it does not have — which retrieval cannot detect.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persistedChunks(persist).length).toBe(persistedDocument(persist).chunkCount);
  });

  it('gives every chunk keywords, so document text and hub entries reach ONE scorer', async () => {
    const { store, persist } = makeStore();

    await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), {
      store,
      extract: extractorFor(PROSE.repeat(40)),
    });

    for (const chunk of persistedChunks(persist)) {
      expect(chunk.keywords.length).toBeGreaterThan(0);
    }
  });

  it('numbers chunks from zero, in order', async () => {
    const { store, persist } = makeStore();

    await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), {
      store,
      extract: extractorFor(PROSE.repeat(40)),
    });

    const chunks = persistedChunks(persist);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it('counts hard cuts, so a reviewer knows they are approving a table dump', async () => {
    const { store, persist } = makeStore();
    // One unbroken run with no boundary anywhere: a minified blob or a table.
    const deps: IngestDeps = { store, extract: extractorFor('x'.repeat(6000)) };

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), deps);

    if (result.status !== 'stored') throw new Error('unreachable');
    expect(result.hardCutCount).toBeGreaterThan(0);
    expect(persistedDocument(persist).hardCutCount).toBe(result.hardCutCount);
  });

  it('reports a truncated document rather than letting the dropped half go unnoticed', async () => {
    const { store } = makeStore();
    const deps: IngestDeps = {
      store,
      extract: extractorFor(PROSE.repeat(40), { truncated: true, extractedChars: 999_999 }),
    };

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), deps);

    if (result.status !== 'stored') throw new Error('unreachable');
    expect(result.truncated).toBe(true);
    expect(result.extractedChars).toBe(999_999);
  });

  it('asks the extractor for the ingest limit, not the 50,000-character resume default', async () => {
    const { store } = makeStore();
    const extract = extractorFor(PROSE.repeat(40));

    await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), { store, extract });

    expect(extract).toHaveBeenCalledWith(expect.any(Buffer), 'admissions.pdf', MAX_INGEST_CHARS);
  });
});

describe('nothing here can make a document quotable', () => {
  it('sets no confidence on the stored row, so it takes the refused column default', async () => {
    const { store, persist } = makeStore();

    await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), {
      store,
      extract: extractorFor(PROSE.repeat(40)),
    });

    // THE LOAD-BEARING NEGATIVE. The column defaults to 'unstated', which the quote gate
    // refuses; a `confidence` arriving here at any value would route around that, and would
    // pass every other assertion in this file.
    expect(persistedDocument(persist)).not.toHaveProperty('confidence');
  });

  it('takes no confidence from the caller either', async () => {
    const { store, persist } = makeStore();
    const sneaky = { ...requestFor(Buffer.from('bytes')), confidence: 'grounded' } as IngestRequest;

    await ingestKnowledgeDocument(sneaky, { store, extract: extractorFor(PROSE.repeat(40)) });

    expect(persistedDocument(persist)).not.toHaveProperty('confidence');
  });
});

describe('idempotency by content', () => {
  it('reports a duplicate instead of storing a second copy', async () => {
    const { store, persist } = makeStore({ id: 'doc-existing', chunkCount: 7 });

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('same bytes')), {
      store,
      extract: extractorFor(PROSE),
    });

    expect(result.status).toBe('duplicate');
    if (result.status !== 'duplicate') throw new Error('unreachable');
    expect(result.documentId).toBe('doc-existing');
    expect(result.chunkCount).toBe(7);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not EXTRACT a document it already holds', async () => {
    const { store } = makeStore({ id: 'doc-existing', chunkCount: 7 });
    const extract = extractorFor(PROSE);

    await ingestKnowledgeDocument(requestFor(Buffer.from('same bytes')), { store, extract });

    // The dedupe check runs first, so a re-uploaded 200-page PDF costs a hash rather than a
    // parse. Checking after extraction would prevent the duplicate row and waste the work.
    expect(extract).not.toHaveBeenCalled();
  });

  it('hashes the BYTES, so a rename is the same document', async () => {
    const { store, findBySha } = makeStore();
    const bytes = Buffer.from('identical content');

    await ingestKnowledgeDocument(requestFor(bytes, { sourceRef: 'first-name.pdf' }), {
      store,
      extract: extractorFor(PROSE),
    });
    await ingestKnowledgeDocument(requestFor(bytes, { sourceRef: 'renamed.pdf' }), {
      store,
      extract: extractorFor(PROSE),
    });

    expect(findBySha.mock.calls[0][0]).toBe(findBySha.mock.calls[1][0]);
  });

  it('scopes the lookup by brand, because two brands may approve the same source differently', async () => {
    const { store, findBySha } = makeStore();

    await ingestKnowledgeDocument(
      requestFor(Buffer.from('bytes'), { brandId: 'brand-a' }),
      { store, extract: extractorFor(PROSE) },
    );

    expect(findBySha).toHaveBeenCalledWith(expect.any(String), 'brand-a');
  });

  it('hashes content, not the filename, so two different files do not collide', async () => {
    expect(hashBytes(Buffer.from('one'))).not.toBe(hashBytes(Buffer.from('two')));
    expect(hashBytes(Buffer.from('one'))).toBe(hashBytes(Buffer.from('one')));
  });
});

describe('refusals are outcomes, not exceptions', () => {
  it('refuses an empty file', async () => {
    const { store, findBySha } = makeStore();

    const result = await ingestKnowledgeDocument(requestFor(Buffer.alloc(0)), {
      store,
      extract: extractorFor(''),
    });

    expect(result).toMatchObject({ status: 'refused', reason: 'empty_source' });
    expect(findBySha).not.toHaveBeenCalled();
  });

  it('refuses an oversized file BEFORE hashing or writing anything', async () => {
    const { store, findBySha } = makeStore();
    const extract = extractorFor(PROSE);

    const result = await ingestKnowledgeDocument(
      requestFor(Buffer.alloc(MAX_INGEST_BYTES + 1)),
      { store, extract },
    );

    expect(result).toMatchObject({ status: 'refused', reason: 'too_large' });
    expect(findBySha).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the limit', async () => {
    // Off-by-one: `>` not `>=`, or the stated limit is one byte smaller than advertised.
    const { store } = makeStore();

    const result = await ingestKnowledgeDocument(requestFor(Buffer.alloc(MAX_INGEST_BYTES)), {
      store,
      extract: extractorFor(PROSE.repeat(40)),
    });

    expect(result.status).toBe('stored');
  });

  it('turns an extractor throw into a refusal that names what the parser said', async () => {
    const { store, persist } = makeStore();
    const extract = jest.fn().mockRejectedValue(new Error('supports docx, pdf only'));

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('bytes')), {
      store,
      extract,
    });

    expect(result.status).toBe('refused');
    if (result.status !== 'refused') throw new Error('unreachable');
    expect(result.reason).toBe('extraction_failed');
    // The person who uploaded it can act on the file type; they cannot act on a stack.
    expect(result.detail).toContain('supports docx, pdf only');
    expect(persist).not.toHaveBeenCalled();
  });

  it('refuses a document that read fine but has no text, instead of storing an empty one', async () => {
    const { store, persist } = makeStore();

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('scan bytes')), {
      store,
      extract: extractorFor('   \n\n  '),
    });

    // A scan with no text layer. Stored, it would be a row a reviewer can approve and that
    // can never answer anything.
    expect(result).toMatchObject({ status: 'refused', reason: 'no_text' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('says OCR in the refusal, because that is the action that fixes it', async () => {
    const { store } = makeStore();

    const result = await ingestKnowledgeDocument(requestFor(Buffer.from('scan')), {
      store,
      extract: extractorFor(''),
    });

    if (result.status !== 'refused') throw new Error('unreachable');
    expect(result.detail).toMatch(/OCR/);
  });
});

describe('provenance', () => {
  it('records the actor as an email, which is what the non-human guard can judge', async () => {
    const { store, persist } = makeStore();

    await ingestKnowledgeDocument(
      requestFor(Buffer.from('bytes'), { ingestedBy: 'ali@colaberry.com' }),
      { store, extract: extractorFor(PROSE.repeat(40)) },
    );

    // A uuid passes this repo's non-human denylist unconditionally, which makes the guard
    // decorative. The email is the identity that can actually be checked.
    expect(persistedDocument(persist).ingestedBy).toBe('ali@colaberry.com');
  });

  it('carries the source reference and byte size for the audit trail', async () => {
    const { store, persist } = makeStore();
    const bytes = Buffer.from('some bytes here');

    await ingestKnowledgeDocument(
      requestFor(bytes, { sourceKind: 'url', sourceRef: 'https://example.com/policy' }),
      { store, extract: extractorFor(PROSE.repeat(40)) },
    );

    const doc = persistedDocument(persist);
    expect(doc.sourceKind).toBe('url');
    expect(doc.sourceRef).toBe('https://example.com/policy');
    expect(doc.byteSize).toBe(bytes.length);
  });
});
