const fakeTransaction = { id: 'tx' };

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

import { sequelize } from '../../../config/database';
import {
  findBySha,
  findChunksByKeywords,
  persist,
  explorerKnowledgeDocumentStore,
  KEYWORD_SEPARATOR,
  NO_BRAND_SENTINEL,
} from '../explorerKnowledgeDocumentRepository';
import { chunkKeywords } from '../explorerDocumentChunker';
import type { IngestChunkRow, IngestDocumentRow } from '../explorerKnowledgeIngest';

/**
 * The storage half of ingestion.
 *
 * Two defects are the reason this file exists, and both are invisible in a passing
 * happy-path test:
 *
 *  - A lookup written as `brand_id = :brandId` works for every branded document and fails
 *    for every unscoped one, because `NULL = NULL` is false. Dedupe would report "new",
 *    the insert would violate the unique index, and it would do so only on the first
 *    re-upload of an unscoped file.
 *  - Keywords travel as a comma-joined string. That is safe only while no keyword can
 *    contain a comma, which is a property of `chunkKeywords`, in another module. So the
 *    real function is driven against comma-heavy prose here rather than trusted.
 */

const query = sequelize.query as jest.Mock;
const transaction = sequelize.transaction as jest.Mock;

function document(over: Partial<IngestDocumentRow> = {}): IngestDocumentRow {
  return {
    tenantId: null,
    brandId: null,
    title: 'Admissions policy',
    sourceKind: 'upload',
    sourceRef: 'admissions.pdf',
    mime: 'application/pdf',
    byteSize: 1024,
    sha256: 'a'.repeat(64),
    chunkCount: 2,
    hardCutCount: 0,
    ingestedBy: 'ali@colaberry.com',
    ...over,
  };
}

const CHUNKS: IngestChunkRow[] = [
  { chunkIndex: 0, text: 'The cohort begins in November.', keywords: ['cohort', 'begins'], hardCut: false },
  { chunkIndex: 1, text: 'Seats are capped at twenty.', keywords: ['seats', 'capped'], hardCut: true },
];

/** The SQL of the nth query call. */
function sqlAt(n: number): string {
  return query.mock.calls[n][0] as string;
}

/** The options of the nth query call. */
function optsAt(n: number): any {
  return query.mock.calls[n][1];
}

beforeEach(() => {
  query.mockReset();
  transaction.mockReset();
  transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(fakeTransaction));
});

describe('findBySha — the lookup must mirror the unique index', () => {
  it('compares brand through COALESCE on BOTH sides', async () => {
    query.mockResolvedValueOnce([]);

    await findBySha('a'.repeat(64), null);

    const sql = sqlAt(0);
    // `brand_id = :brandId` would never match an unscoped document against itself, so the
    // insert would then hit the unique index this lookup exists to avoid.
    expect(sql).toContain('COALESCE(brand_id');
    expect(sql).toContain('COALESCE(CAST(:brandId AS uuid)');
    expect(sql).not.toMatch(/WHERE[\s\S]*brand_id\s*=\s*:brandId/);
    expect(optsAt(0).replacements.sentinel).toBe(NO_BRAND_SENTINEL);
  });

  it('returns the existing document with its chunk count', async () => {
    query.mockResolvedValueOnce([{ id: 'doc-7', chunk_count: '12' }]);

    await expect(findBySha('a'.repeat(64), 'brand-a')).resolves.toEqual({
      id: 'doc-7',
      chunkCount: 12,
    });
  });

  it('returns null when nothing matches', async () => {
    query.mockResolvedValueOnce([]);

    await expect(findBySha('b'.repeat(64), null)).resolves.toBeNull();
  });

  it('does NOT hide a retired document', async () => {
    query.mockResolvedValueOnce([]);

    await findBySha('a'.repeat(64), null);

    // A retired row still occupies the unique key. Reporting it absent would send the
    // caller into an insert that cannot succeed.
    expect(sqlAt(0)).not.toContain('retired_at');
  });
});

describe('persist — one transaction, and the race handled in SQL', () => {
  it('writes the document and its chunks inside the same transaction', async () => {
    query
      .mockResolvedValueOnce([{ id: 'doc-new' }]) // insert document
      .mockResolvedValueOnce(undefined); // insert chunks

    await expect(persist(document(), CHUNKS)).resolves.toBe('doc-new');

    expect(transaction).toHaveBeenCalledTimes(1);
    // A chunk write outside the document's transaction is a document that can claim a
    // chunk count it does not have — the one inconsistency retrieval cannot notice.
    for (const call of query.mock.calls) {
      expect(call[1].transaction).toBe(fakeTransaction);
    }
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('carries ON CONFLICT DO NOTHING, so two simultaneous uploads do not both insert', async () => {
    query.mockResolvedValueOnce([{ id: 'doc-new' }]).mockResolvedValueOnce(undefined);

    await persist(document(), CHUNKS);

    expect(sqlAt(0)).toContain('ON CONFLICT DO NOTHING');
  });

  it('returns the winner id and writes NO chunks when it loses the race', async () => {
    query
      .mockResolvedValueOnce([]) // insert conflicted, returned nothing
      .mockResolvedValueOnce([{ id: 'doc-winner' }]); // re-read the winner

    await expect(persist(document(), CHUNKS)).resolves.toBe('doc-winner');

    // The winner's row is already complete. Re-inserting over a document someone may have
    // approved is a change nobody asked for.
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every((c) => !String(c[0]).includes('explorer_knowledge_chunks'))).toBe(true);
  });

  it('throws rather than guessing when the conflict was a DIFFERENT constraint', async () => {
    query
      .mockResolvedValueOnce([]) // conflicted
      .mockResolvedValueOnce([]); // and nothing matches the sha key

    // Storing under an invented id would put a document somewhere nobody can find it.
    await expect(persist(document(), CHUNKS)).rejects.toThrow(/unexpected constraint/);
  });

  it('skips the chunk statement entirely for a document with no chunks', async () => {
    query.mockResolvedValueOnce([{ id: 'doc-new' }]);

    await persist(document({ chunkCount: 0 }), []);

    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('persist — chunks travel as arrays', () => {
  beforeEach(() => {
    query.mockResolvedValueOnce([{ id: 'doc-new' }]).mockResolvedValueOnce(undefined);
  });

  it('sends one array per column rather than one parameter per cell', async () => {
    await persist(document(), CHUNKS);

    const reps = optsAt(1).replacements;
    // Four arrays and an unnest do not grow with the document; five parameters per row
    // walk toward Postgres's 65,535-parameter limit as documents get longer.
    expect(reps.indexes).toEqual([0, 1]);
    expect(reps.texts).toEqual([CHUNKS[0].text, CHUNKS[1].text]);
    expect(reps.hardCuts).toEqual([false, true]);
    expect(sqlAt(1)).toContain('unnest(');
  });

  it('keeps every array the same length, so unnest cannot silently drop a row', async () => {
    await persist(document(), CHUNKS);

    const reps = optsAt(1).replacements;
    const lengths = [reps.indexes, reps.texts, reps.keywords, reps.hardCuts].map((a: unknown[]) => a.length);
    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]).toBe(CHUNKS.length);
  });

  it('joins keywords with the separator and splits them back in SQL', async () => {
    await persist(document(), CHUNKS);

    expect(optsAt(1).replacements.keywords).toEqual([
      `cohort${KEYWORD_SEPARATOR}begins`,
      `seats${KEYWORD_SEPARATOR}capped`,
    ]);
    expect(sqlAt(1)).toContain('string_to_array(kw, :separator)');
  });

  it('is retry-safe on the chunk insert', async () => {
    await persist(document(), CHUNKS);

    expect(sqlAt(1)).toContain('ON CONFLICT (document_id, chunk_index) DO NOTHING');
  });
});

describe('the empty-keyword branch', () => {
  it('guards against string_to_array turning an empty string into one blank keyword', async () => {
    query.mockResolvedValueOnce([{ id: 'doc-new' }]).mockResolvedValueOnce(undefined);

    await persist(document(), [{ chunkIndex: 0, text: 'a', keywords: [], hardCut: false }]);

    expect(optsAt(1).replacements.keywords).toEqual(['']);
    // `string_to_array('', ',')` yields `{''}` — one empty keyword that matches nothing and
    // sits in the GIN index forever. The CASE in the statement is what prevents it.
    expect(sqlAt(1)).toContain("CASE WHEN kw = '' THEN ARRAY[]::text[]");
  });
});

describe('the comma separator is safe only because of the keyword charset', () => {
  it('chunkKeywords never emits a keyword containing the separator', () => {
    // Driven against the REAL function, with prose full of commas. The day the keyword
    // charset widens, this fails here rather than silently splitting one keyword into two
    // rows of the GIN index.
    const commaHeavy =
      'Enrollment, admissions, and scholarships, plus cohort-start, pricing, 1,200 seats, ' +
      'and the november,december intake window.';

    const words = chunkKeywords(commaHeavy, 20);

    expect(words.length).toBeGreaterThan(0);
    for (const word of words) {
      expect(word).not.toContain(KEYWORD_SEPARATOR);
    }
  });
});

describe('findChunksByKeywords — retrieval reads NULL brand differently from dedupe', () => {
  it('treats an unscoped document as applying to EVERY brand', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort'], { brandId: 'brand-a' });

    // The dedupe key puts a NULL brand in its OWN bucket; retrieval treats it as global.
    // Copying either predicate into the other's place is wrong in a way that looks right.
    expect(sqlAt(0)).toContain('d.brand_id IS NULL OR d.brand_id = CAST(:brandId AS uuid)');
    expect(sqlAt(0)).not.toContain('COALESCE(d.brand_id');
  });

  it('does NOT filter on confidence, so the gate can report what it refused', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort']);

    // Filtering here would turn "four passages matched and none are approved" into silence,
    // which reads identically to "nothing matched".
    //
    // Scoped to the WHERE clause on purpose: `confidence` DOES appear in the ORDER BY, and
    // a whole-statement match would be satisfied by that and prove nothing.
    const sql = sqlAt(0);
    const whereClause = sql.slice(sql.indexOf('WHERE'), sql.indexOf('ORDER BY'));
    expect(whereClause.length).toBeGreaterThan(0);
    expect(whereClause).not.toContain('confidence');
  });

  it('orders approved documents first, so they cannot be starved out of the limit', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort']);

    expect(sqlAt(0)).toContain("ORDER BY (d.confidence = 'grounded') DESC");
  });

  it('hides retired documents', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort']);

    expect(sqlAt(0)).toContain('d.retired_at IS NULL');
  });

  it('matches on keyword overlap through the GIN index', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort', 'seats']);

    expect(sqlAt(0)).toContain('c.keywords && CAST(:tokens AS text[])');
    expect(optsAt(0).replacements.tokens).toEqual(['cohort', 'seats']);
  });

  it('bounds the candidate set', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort'], { limit: 5 });

    expect(optsAt(0).replacements.limit).toBe(5);
    expect(sqlAt(0)).toContain('LIMIT :limit');
  });

  it('never issues a query for an empty token list', async () => {
    // `keywords && '{}'` matches nothing, so the round trip is pure cost — and an empty
    // query is the normal case for a message with no searchable goal.
    await expect(findChunksByKeywords([])).resolves.toEqual([]);

    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a limit of zero rather than silently returning nothing', async () => {
    query.mockResolvedValueOnce([]);

    await findChunksByKeywords(['cohort'], { limit: 0 });

    expect(optsAt(0).replacements.limit).toBe(1);
  });
});

describe('the exported store', () => {
  it('satisfies the shape the ingest path consumes', () => {
    expect(typeof explorerKnowledgeDocumentStore.findBySha).toBe('function');
    expect(typeof explorerKnowledgeDocumentStore.persist).toBe('function');
  });
});
