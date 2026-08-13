import { sequelize } from '../../config/database';
import { ensureExplorerGrowthSchema } from '../ensureExplorerGrowthSchema';
import ExplorerJourneyProfile from '../../models/ExplorerJourneyProfile';
import ExplorerJourneyDecision from '../../models/ExplorerJourneyDecision';
import ExplorerScoreSnapshot from '../../models/ExplorerScoreSnapshot';
import ExplorerExperimentAssignment from '../../models/ExplorerExperimentAssignment';
import ExplorerContentAsset from '../../models/ExplorerContentAsset';

/**
 * Spy on the REAL sequelize instance's query() rather than mocking the whole
 * config/database module: the model files call Model.init({ sequelize }) at
 * import time, so a stubbed module leaves them unable to initialise. The real
 * instance is constructed lazily and never connects here — no I/O occurs.
 */
let queryMock: jest.SpyInstance;

/** Every SQL string the module issued, in order. */
async function runAndCapture(): Promise<string[]> {
  queryMock.mockClear();
  await ensureExplorerGrowthSchema();
  return queryMock.mock.calls.map((c) => String(c[0]));
}

/** Pull the column names out of a `CREATE TABLE x ( ... )` statement. */
function columnsOf(createStmt: string): string[] {
  const body = createStmt.slice(createStmt.indexOf('(') + 1, createStmt.lastIndexOf(')'));
  const cols: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols
    .map((c) => c.trim().split(/\s+/)[0])
    .filter((c) => c && !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)$/i.test(c));
}

const TABLES: Array<{ table: string; model: { getAttributes: () => object } }> = [
  { table: 'explorer_journey_profiles', model: ExplorerJourneyProfile },
  { table: 'explorer_journey_decisions', model: ExplorerJourneyDecision },
  { table: 'explorer_score_snapshots', model: ExplorerScoreSnapshot },
  { table: 'explorer_experiment_assignments', model: ExplorerExperimentAssignment },
  { table: 'explorer_content_assets', model: ExplorerContentAsset },
];

beforeEach(() => {
  queryMock = jest.spyOn(sequelize, 'query').mockResolvedValue([[], {}] as never);
});

afterEach(() => {
  queryMock.mockRestore();
});

describe('ensureExplorerGrowthSchema — idempotency and safety', () => {
  it('issues every statement with IF NOT EXISTS', async () => {
    const stmts = await runAndCapture();
    expect(stmts.length).toBeGreaterThan(0);
    for (const sql of stmts) {
      expect(sql).toMatch(/IF NOT EXISTS/i);
    }
  });

  // Additive-only is the whole safety story for a boot-time DDL path: this runs
  // on EVERY production start, so a single destructive verb here would mean data
  // loss on deploy. Asserted as an explicit denylist rather than trusted to review.
  it('contains no destructive verb', async () => {
    const stmts = await runAndCapture();
    for (const sql of stmts) {
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(sql).not.toMatch(/ALTER\s+TABLE[\s\S]*\bDROP\b/i);
    }
  });

  it('creates exactly the five documented tables', async () => {
    const stmts = await runAndCapture();
    const created = stmts
      .filter((s) => /CREATE TABLE/i.test(s))
      .map((s) => s.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1]);
    expect(created.sort()).toEqual(TABLES.map((t) => t.table).sort());
  });

  it('creates the UNIQUE (enrollment_id, decision_date) index — the idempotency guarantee', async () => {
    const stmts = await runAndCapture();
    const unique = stmts.find(
      (s) =>
        /CREATE UNIQUE INDEX/i.test(s) &&
        /explorer_journey_decisions/i.test(s) &&
        /enrollment_id/.test(s) &&
        /decision_date/.test(s),
    );
    expect(unique).toBeDefined();
  });

  it('creates the UNIQUE (enrollment_id, as_of_date) snapshot index', async () => {
    const stmts = await runAndCapture();
    expect(
      stmts.some(
        (s) =>
          /CREATE UNIQUE INDEX/i.test(s) &&
          /explorer_score_snapshots/i.test(s) &&
          /as_of_date/.test(s),
      ),
    ).toBe(true);
  });

  it('scopes the content-asset unique index to rows that have a source_id', async () => {
    // Human-seeded rows have a null source_id; without the partial predicate a
    // second manual row would collide on (source_system, NULL) in some engines
    // and, more importantly, the intent would be wrong.
    const stmts = await runAndCapture();
    const idx = stmts.find(
      (s) => /CREATE UNIQUE INDEX/i.test(s) && /explorer_content_assets/i.test(s),
    );
    expect(idx).toMatch(/WHERE source_id IS NOT NULL/i);
  });
});

describe('ensureExplorerGrowthSchema — partial-DB self-heal', () => {
  it('continues after a failing statement so a half-created DB repairs itself', async () => {
    queryMock.mockReset();
    // Fail the very first statement; every later one must still be attempted.
    queryMock
      .mockRejectedValueOnce(new Error('relation already exists, different shape'))
      .mockResolvedValue([[], {}]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(ensureExplorerGrowthSchema()).resolves.toBeUndefined();

    expect(queryMock.mock.calls.length).toBeGreaterThan(10);
    expect(warn).toHaveBeenCalledWith(
      '[DB] explorer growth schema stmt skipped:',
      'relation already exists, different shape',
    );
    warn.mockRestore();
  });

  it('never rejects even when every statement fails', async () => {
    queryMock.mockReset().mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // A boot-time schema step must not take the whole API down.
    await expect(ensureExplorerGrowthSchema()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('ensureExplorerGrowthSchema — anti-drift vs the Sequelize models', () => {
  // The DDL and the models are two independent descriptions of the same tables
  // (prod does not run sequelize.sync), and nothing in the type system keeps
  // them together. This is the test that does.
  it.each(TABLES)('$table columns match its model exactly', async ({ table, model }) => {
    const stmts = await runAndCapture();
    const create = stmts.find((s) =>
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(s),
    );
    expect(create).toBeDefined();
    expect(columnsOf(create as string).sort()).toEqual(
      Object.keys(model.getAttributes()).sort(),
    );
  });
});
