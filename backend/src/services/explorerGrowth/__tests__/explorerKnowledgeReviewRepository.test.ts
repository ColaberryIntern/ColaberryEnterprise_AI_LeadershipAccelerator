const fakeTransaction = { id: 'tx' };

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

import { sequelize } from '../../../config/database';
import {
  decideDocument,
  getDocument,
  listDocuments,
  listPassages,
  retireDocument,
  type ReviewDocument,
} from '../explorerKnowledgeReviewRepository';

/**
 * The storage half of knowledge review.
 *
 * ## What a mocked `query` can and cannot prove
 *
 * Stated up front because it decides what is worth asserting here. `sequelize.query` is a
 * mock, so nothing in this file proves the SQL is valid Postgres or that it returns what
 * the schema holds — only an integration run against a real database proves that. What it
 * CAN prove is the part that is pure decision-making and that a database test would make
 * slow and awkward to drive: which branch runs, in what order, under which row state.
 *
 * So the assertions split in two. Behaviour is driven through the real functions. The two
 * SQL fragments that are load-bearing rather than incidental — `FOR UPDATE`, and
 * `retired_at IS NULL` in the retire predicate — are pinned as text, the way
 * `schedulerConcurrency.test.ts` pins `FOR UPDATE SKIP LOCKED`. Those two are pinned
 * because deleting either leaves every test here passing while the concurrency guarantee
 * and the idempotency guarantee quietly disappear.
 *
 * ## The defects this exists to catch
 *
 *  - A decision applied to a RETIRED document. Approving withdrawn text is the exact
 *    failure the review surface exists to prevent, and it is one forgotten `if` away.
 *  - Retire rewriting `retired_at` on a second call. That turns a retry into a history
 *    edit, and a retry is indistinguishable from a double-click.
 *  - The page total coming from a second query. `COUNT(*) OVER()` is a deliberate choice;
 *    a total that disagrees with its own page renders "showing 20 of 21" with no row 21.
 */

const query = sequelize.query as jest.Mock;
const transaction = sequelize.transaction as jest.Mock;

function doc(over: Partial<ReviewDocument> = {}): ReviewDocument {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Admissions policy',
    confidence: 'unstated',
    source_kind: 'upload',
    source_ref: 'policy.pdf',
    mime: 'application/pdf',
    byte_size: 1024,
    chunk_count: 3,
    hard_cut_count: 0,
    brand_id: null,
    ingested_by: 'staff@colaberry.com',
    reviewed_by: null,
    reviewed_at: null,
    retired_at: null,
    created_at: '2026-10-31T00:00:00.000Z',
    ...over,
  };
}

/** The last SQL string handed to `sequelize.query`, whitespace-collapsed for matching. */
function sqlAt(call: number): string {
  return String(query.mock.calls[call][0]).replace(/\s+/g, ' ');
}

beforeEach(() => {
  query.mockReset();
  transaction.mockReset();
  // Run the callback inline with a stand-in transaction, so the real control flow executes.
  transaction.mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(fakeTransaction));
});

describe('listDocuments', () => {
  it('reads the total from the same row as the page, not a second query', async () => {
    query.mockResolvedValueOnce([
      { ...doc(), total_count: '7' },
      { ...doc({ id: '22222222-2222-4222-8222-222222222222' }), total_count: '7' },
    ]);

    const result = await listDocuments({ limit: 20, offset: 0 });

    // One statement. A second round trip could return a total that no longer describes
    // the page it is paired with.
    expect(query).toHaveBeenCalledTimes(1);
    expect(sqlAt(0)).toContain('COUNT(*) OVER() AS total_count');
    expect(result.total).toBe(7);
    expect(result.documents).toHaveLength(2);
  });

  it('strips the window-function column out of every document it returns', async () => {
    query.mockResolvedValueOnce([{ ...doc(), total_count: '1' }]);

    const { documents } = await listDocuments({ limit: 20, offset: 0 });

    // `total_count` is a transport detail of the count trick. Leaking it would put a
    // pagination artifact on every document object the API hands out.
    expect(documents[0]).not.toHaveProperty('total_count');
    expect(documents[0].title).toBe('Admissions policy');
  });

  it('reports zero rather than undefined for an empty result', async () => {
    query.mockResolvedValueOnce([]);

    const result = await listDocuments({ limit: 20, offset: 0 });

    // An absent total renders as "showing 0 of undefined".
    expect(result).toEqual({ documents: [], total: 0 });
  });

  it('hides retired documents unless they are asked for', async () => {
    query.mockResolvedValue([]);

    await listDocuments({ limit: 20, offset: 0 });
    expect(query.mock.calls[0][1].replacements.includeRetired).toBe(false);

    await listDocuments({ limit: 20, offset: 0, includeRetired: true });
    expect(query.mock.calls[1][1].replacements.includeRetired).toBe(true);
  });

  it('passes an absent filter as NULL so the predicate matches everything', async () => {
    query.mockResolvedValueOnce([]);

    await listDocuments({ limit: 20, offset: 0 });

    // The SQL reads `CAST(:confidence AS text) IS NULL OR ...`. Passing the string
    // "undefined" here would filter to a confidence nothing carries and show an empty queue.
    expect(query.mock.calls[0][1].replacements.confidence).toBeNull();
    expect(query.mock.calls[0][1].replacements.brandId).toBeNull();
  });
});

describe('listPassages', () => {
  it('returns the page and its total together', async () => {
    query.mockResolvedValueOnce([
      { chunk_index: 0, text: 'first', keywords: ['refund'], hard_cut: false, total_count: '330' },
    ]);

    const result = await listPassages('11111111-1111-4111-8111-111111111111', { limit: 20, offset: 0 });

    expect(result.total).toBe(330);
    expect(result.passages).toEqual([
      { chunk_index: 0, text: 'first', keywords: ['refund'], hard_cut: false },
    ]);
  });

  it('turns a NULL keyword array into an empty one', async () => {
    query.mockResolvedValueOnce([
      { chunk_index: 0, text: 't', keywords: null, hard_cut: false, total_count: '1' },
    ]);

    const { passages } = await listPassages('11111111-1111-4111-8111-111111111111', { limit: 20, offset: 0 });

    // A null here reaches the UI as `keywords.map is not a function`.
    expect(passages[0].keywords).toEqual([]);
  });
});

describe('getDocument', () => {
  it('returns null for an id that does not exist', async () => {
    query.mockResolvedValueOnce([]);
    expect(await getDocument('11111111-1111-4111-8111-111111111111')).toBeNull();
  });
});

describe('decideDocument', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('locks the row before deciding', async () => {
    query.mockResolvedValueOnce([doc()]);
    query.mockResolvedValueOnce([doc({ confidence: 'grounded', reviewed_by: 'r@x.com' })]);

    await decideDocument(ID, 'grounded', 'r@x.com');

    // Pinned as text: without FOR UPDATE two reviewers can interleave read-then-write and
    // leave `confidence` and `reviewed_by` describing different decisions. Every other
    // assertion in this file still passes if it is deleted.
    expect(sqlAt(0)).toContain('FOR UPDATE');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('records the verdict, the reviewer and the time', async () => {
    query.mockResolvedValueOnce([doc()]);
    query.mockResolvedValueOnce([doc({ confidence: 'grounded', reviewed_by: 'r@x.com' })]);

    const out = await decideDocument(ID, 'grounded', 'r@x.com');

    expect(out.status).toBe('decided');
    expect(query.mock.calls[1][1].replacements).toMatchObject({
      id: ID,
      verdict: 'grounded',
      reviewer: 'r@x.com',
    });
    expect(sqlAt(1)).toContain('reviewed_at = NOW()');
  });

  it('REFUSES a retired document and writes nothing', async () => {
    query.mockResolvedValueOnce([doc({ retired_at: '2026-10-30T00:00:00.000Z' })]);

    const out = await decideDocument(ID, 'grounded', 'r@x.com');

    // Approving withdrawn text is the failure this whole surface exists to prevent.
    expect(out).toEqual({ status: 'retired', retiredAt: '2026-10-30T00:00:00.000Z' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports not_found without attempting an update', async () => {
    query.mockResolvedValueOnce([]);

    expect(await decideDocument(ID, 'grounded', 'r@x.com')).toEqual({ status: 'not_found' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: the same verdict twice leaves the same end state', async () => {
    query.mockResolvedValueOnce([doc({ confidence: 'grounded', reviewed_by: 'r@x.com' })]);
    query.mockResolvedValueOnce([doc({ confidence: 'grounded', reviewed_by: 'r@x.com' })]);

    const again = await decideDocument(ID, 'grounded', 'r@x.com');

    expect(again.status).toBe('decided');
    expect((again as { document: ReviewDocument }).document.confidence).toBe('grounded');
  });

  it('allows a DOWNGRADE, because a second read is a legitimate review', async () => {
    query.mockResolvedValueOnce([doc({ confidence: 'grounded' })]);
    query.mockResolvedValueOnce([doc({ confidence: 'drafted-verify', reviewed_by: 'r@x.com' })]);

    const out = await decideDocument(ID, 'drafted-verify', 'r@x.com');

    // A one-way gate would trap a reviewer who approved something and then spotted a
    // problem — the exact moment the surface most needs to work.
    expect((out as { document: ReviewDocument }).document.confidence).toBe('drafted-verify');
  });

  it('throws rather than inventing an answer if the locked row vanishes', async () => {
    query.mockResolvedValueOnce([doc()]);
    query.mockResolvedValueOnce([]);

    await expect(decideDocument(ID, 'grounded', 'r@x.com')).rejects.toThrow(/vanished/);
  });
});

describe('retireDocument', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('withdraws a live document', async () => {
    query.mockResolvedValueOnce([doc()]);
    query.mockResolvedValueOnce([doc({ retired_at: '2026-10-31T10:00:00.000Z' })]);

    const out = await retireDocument(ID, 'r@x.com');

    expect(out.status).toBe('retired');
    expect(out.document?.retired_at).toBe('2026-10-31T10:00:00.000Z');
  });

  it('guards the UPDATE with retired_at IS NULL so a retry cannot rewrite the timestamp', async () => {
    query.mockResolvedValueOnce([doc()]);
    query.mockResolvedValueOnce([doc({ retired_at: '2026-10-31T10:00:00.000Z' })]);

    await retireDocument(ID, 'r@x.com');

    // Pinned as text. Without it, a double-click moves the retirement time to the second
    // click and the record of when the document was actually withdrawn is gone.
    expect(sqlAt(1)).toContain('retired_at IS NULL');
  });

  it('is idempotent: retiring an already-retired document writes nothing', async () => {
    const already = doc({ retired_at: '2026-10-30T00:00:00.000Z' });
    query.mockResolvedValueOnce([already]);

    const out = await retireDocument(ID, 'r@x.com');

    expect(out.status).toBe('retired');
    expect(out.document?.retired_at).toBe('2026-10-30T00:00:00.000Z');
    // The second call never reaches an UPDATE, so the first timestamp stands.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports not_found for an unknown id', async () => {
    query.mockResolvedValueOnce([]);
    expect(await retireDocument(ID, 'r@x.com')).toEqual({ status: 'not_found' });
  });
});
