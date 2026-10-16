/**
 * M21 - the explorer_entered_at backfill.
 *
 * The write itself is one column on rows whose membership is already settled,
 * so the risk is not in the SQL. It is in three places this repo has been
 * caught before, and each has a test here:
 *
 *   1. A dry run that writes anyway.
 *   2. A commit that overwrites a row which changed under it.
 *   3. A ledger read off disk, which is operator-supplied input on a path that
 *      writes to production.
 *
 * The date semantic itself is not a judgement this suite makes: the live
 * registration path already defines the column as the moment of registration,
 * so the backfill uses created_at to match it. That reasoning lives in the
 * script's header where a reader will meet it first.
 */

const query = jest.fn();
const close = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query, close } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const {
  runForward, runInverse, planEntries, parseEntryLedger,
} = require('../backfillExplorerEnteredAt');

const COUNTS = { coherent: '67', entered_null: '56', entered_set: '11' };
const ROWS = [
  { id: 'enr-a', created_at: new Date('2026-07-15T10:00:00.000Z') },
  { id: 'enr-b', created_at: new Date('2026-10-12T18:30:00.000Z') },
];

beforeEach(() => {
  query.mockReset();
  close.mockReset();
  query.mockImplementation((sql: string) => {
    if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([[], { rowCount: 1 }]);
    if (sql.includes('FILTER (WHERE explorer_entered_at IS NULL)')) return Promise.resolve([COUNTS]);
    return Promise.resolve(ROWS);
  });
});

const updates = (): string[] => query.mock.calls
  .map((c) => String(c[0])).filter((s) => /^\s*UPDATE/i.test(s));

describe('M21 - the dry run is the default and it writes nothing', () => {
  it('issues no UPDATE at all unless confirmed', async () => {
    await runForward(false);
    expect(updates()).toHaveLength(0);
  });

  it('the control: it DOES update when confirmed', async () => {
    await runForward(true);
    expect(updates()).toHaveLength(ROWS.length);
  });
});

describe('M21 - the write is pinned, so a row that changed is left alone', () => {
  it('every UPDATE carries explorer_entered_at IS NULL', async () => {
    await runForward(true);
    for (const sql of updates()) {
      // Without this, a row that gained a date between the plan and the commit
      // would be overwritten with a value decided about a different state.
      expect(sql).toContain('explorer_entered_at IS NULL');
    }
  });

  it('passes the row id and its created_at, nothing else', async () => {
    await runForward(true);
    const reps = query.mock.calls
      .filter((c) => /^\s*UPDATE/i.test(String(c[0])))
      .map((c) => (c[1] as { replacements: Record<string, unknown> }).replacements);
    expect(reps).toEqual([
      { id: 'enr-a', to: '2026-07-15T10:00:00.000Z' },
      { id: 'enr-b', to: '2026-10-12T18:30:00.000Z' },
    ]);
  });
});

describe('M21 - planEntries maps created_at to the entry date, and nothing else', () => {
  it('carries the id and the ISO date, with from always null', () => {
    expect(planEntries(ROWS)).toEqual([
      { id: 'enr-a', from: null, to: '2026-07-15T10:00:00.000Z' },
      { id: 'enr-b', from: null, to: '2026-10-12T18:30:00.000Z' },
    ]);
  });

  it('accepts a string timestamp as the driver may return one', () => {
    expect(planEntries([{ id: 'x', created_at: '2026-01-01T00:00:00.000Z' }]))
      .toEqual([{ id: 'x', from: null, to: '2026-01-01T00:00:00.000Z' }]);
  });

  it('plans nothing when there is nothing to fill - the control', () => {
    expect(planEntries([])).toEqual([]);
  });
});

describe('M21 - the ledger is untrusted input on a path that writes to production', () => {
  it('rejects a non-array', () => {
    expect(() => parseEntryLedger('{}')).toThrow(/must be a JSON array/);
  });

  it('rejects an entry with no id, naming the index', () => {
    expect(() => parseEntryLedger(JSON.stringify([{ to: '2026-01-01' }])))
      .toThrow(/ledger\[0\]: id must be a non-empty string/);
  });

  it('rejects an entry with no target date', () => {
    expect(() => parseEntryLedger(JSON.stringify([{ id: 'x' }])))
      .toThrow(/ledger\[0\]: to must be a non-empty string/);
  });

  it('accepts exactly what the forward run emits - the control', () => {
    const good = [{ id: 'enr-a', from: null, to: '2026-07-15T10:00:00.000Z' }];
    expect(parseEntryLedger(JSON.stringify(good))).toEqual(good);
  });
});

describe('M21 - the inverse puts back exactly what the ledger wrote', () => {
  const LEDGER = JSON.stringify([{ id: 'enr-a', from: null, to: '2026-07-15T10:00:00.000Z' }]);
  const fs = require('fs');

  beforeEach(() => jest.spyOn(fs, 'readFileSync').mockReturnValue(LEDGER));
  afterEach(() => jest.restoreAllMocks());

  it('writes nothing on a dry run', async () => {
    await runInverse('/tmp/x.json', false);
    expect(updates()).toHaveLength(0);
  });

  it('sets the column back to NULL, pinned to the value it wrote', async () => {
    await runInverse('/tmp/x.json', true);
    const sent = updates();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('explorer_entered_at = NULL');
    // Pinned: a row somebody has since changed to a different date is not
    // silently blanked by this rollback.
    expect(sent[0]).toContain('explorer_entered_at = :to');
  });
});
