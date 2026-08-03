/**
 * pruneGeneratedContent — archives aged-out `_pipeline` timeline_cards and resets
 * the matching intel_items.card_id back to null, so a curated source with a
 * small FIXED item list (claude_code_technique, ai_tool_of_the_day,
 * ai_quote_of_the_day) can recycle its library instead of going permanently
 * quiet once every item has been carded exactly once. See the docstring in
 * generatedContentRetention.ts for the full bug writeup this test guards.
 *
 * Mocking convention matches src/__tests__/services/retentionEnforcementService.test.ts
 * (same "retention" domain): sequelize.query/transaction fully mocked, with the
 * mock's query implementation simulating the actual WHERE-clause predicates
 * (visibility='published', source ~ '_pipeline$', age vs :days, ANY(:ids) reset)
 * against an in-memory fixture, so tests exercise real branch behavior instead of
 * just asserting on SQL text.
 */
import { sequelize } from '../../../config/database';
import { pruneGeneratedContent } from '../generatedContentRetention';

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn((cb: (t: unknown) => Promise<unknown>) => cb({})),
  },
}));

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockTransaction = sequelize.transaction as unknown as jest.Mock;

type Card = {
  id: string;
  visibility: 'published' | 'archived';
  metadata: { source: string };
  created_at: Date;
};
type IntelItem = { id: string; card_id: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const PIPELINE_SOURCE_RE = /_pipeline$/; // mirrors the `~ '_pipeline$'` predicate in the real SQL

let cards: Card[];
let intelItems: IntelItem[];

/** Fake DB: replays the two UPDATE statements pruneGeneratedContent issues. */
function fakeQuery(sql: string, opts: any) {
  if (/UPDATE\s+timeline_cards/i.test(sql)) {
    const days = opts?.replacements?.days;
    const cutoff = new Date(Date.now() - days * DAY_MS);
    const matched = cards.filter(
      (c) => c.visibility === 'published' && PIPELINE_SOURCE_RE.test(c.metadata.source) && c.created_at < cutoff,
    );
    matched.forEach((c) => { c.visibility = 'archived'; });
    return Promise.resolve([matched.map((c) => ({ id: c.id })), { rowCount: matched.length }]);
  }
  if (/UPDATE\s+intel_items/i.test(sql)) {
    const ids: string[] = opts?.replacements?.ids ?? [];
    let count = 0;
    intelItems.forEach((it) => {
      if (it.card_id && ids.includes(it.card_id)) {
        it.card_id = null;
        count += 1;
      }
    });
    return Promise.resolve([undefined, count]);
  }
  return Promise.reject(new Error(`unexpected query in test: ${sql}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  cards = [];
  intelItems = [];
  mockQuery.mockImplementation(fakeQuery);
});

describe('pruneGeneratedContent', () => {
  it('archives an aged-out _pipeline card AND resets the linked intel_items.card_id to null', async () => {
    cards.push({
      id: 'card-old',
      visibility: 'published',
      metadata: { source: 'claude_code_technique_pipeline' },
      created_at: new Date(Date.now() - 40 * DAY_MS),
    });
    intelItems.push({ id: 'item-1', card_id: 'card-old' });

    const result = await pruneGeneratedContent(30);

    expect(result.archived).toBe(1);
    expect(cards[0].visibility).toBe('archived');
    expect(intelItems[0].card_id).toBeNull();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('leaves a _pipeline card still inside the retention window untouched: published, intel_items link intact', async () => {
    cards.push({
      id: 'card-fresh',
      visibility: 'published',
      metadata: { source: 'ai_tool_of_the_day_pipeline' },
      created_at: new Date(Date.now() - 5 * DAY_MS),
    });
    intelItems.push({ id: 'item-2', card_id: 'card-fresh' });

    const result = await pruneGeneratedContent(30);

    expect(result.archived).toBe(0);
    expect(cards[0].visibility).toBe('published');
    expect(intelItems[0].card_id).toBe('card-fresh');
    // no matched cards -> the intel_items reset query must never even run
    const intelItemsCalls = mockQuery.mock.calls.filter((c) => /UPDATE\s+intel_items/i.test(String(c[0])));
    expect(intelItemsCalls).toHaveLength(0);
  });

  it('never archives a hand-authored intel_sample_seed card, regardless of age', async () => {
    cards.push({
      id: 'card-sample',
      visibility: 'published',
      metadata: { source: 'intel_sample_seed' },
      created_at: new Date(Date.now() - 400 * DAY_MS),
    });
    intelItems.push({ id: 'item-3', card_id: 'card-sample' });

    const result = await pruneGeneratedContent(30);

    expect(result.archived).toBe(0);
    expect(cards[0].visibility).toBe('published');
    expect(intelItems[0].card_id).toBe('card-sample');
  });

  it('is idempotent: running twice in a row produces the same end state with no duplicate side effects or errors', async () => {
    cards.push({
      id: 'card-old',
      visibility: 'published',
      metadata: { source: 'ai_quote_of_the_day_pipeline' },
      created_at: new Date(Date.now() - 40 * DAY_MS),
    });
    intelItems.push({ id: 'item-4', card_id: 'card-old' });

    const first = await pruneGeneratedContent(30);
    const second = await pruneGeneratedContent(30);

    expect(first.archived).toBe(1);
    expect(second.archived).toBe(0); // already archived -> visibility='published' guard excludes it on re-run
    expect(cards[0].visibility).toBe('archived');
    expect(intelItems[0].card_id).toBeNull(); // reset once; second run finds nothing left to reset, no error
  });
});
