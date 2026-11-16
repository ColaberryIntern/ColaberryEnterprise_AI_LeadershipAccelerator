jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
// eslint-disable-next-line import/first
import {
  __resetBugReportSchemaForTests, BUG_REPORT_STATEMENTS, ensureBugReportSchema,
} from '../ensureBugReportSchema';

/**
 * BUG-5: one additive table so a bug report survives a failed send. The table is the deliverable;
 * these tests pin the properties that make it safe to ship to a live database.
 */
beforeEach(() => __resetBugReportSchemaForTests());

describe('ensureBugReportSchema', () => {
  it('creates the table and its indexes once per process', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await ensureBugReportSchema(run);
    await ensureBugReportSchema(run);
    expect(run).toHaveBeenCalledTimes(BUG_REPORT_STATEMENTS.length);
  });

  it('is additive only - never DROP, ALTER or TRUNCATE, always IF NOT EXISTS', () => {
    for (const s of BUG_REPORT_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    expect(BUG_REPORT_STATEMENTS.join(' ')).not.toMatch(/DROP|ALTER|TRUNCATE/i);
  });

  it('constrains delivery_status, so a typo cannot invent a fourth state', () => {
    const create = BUG_REPORT_STATEMENTS[0];
    expect(create).toMatch(/delivery_status TEXT NOT NULL DEFAULT 'pending'/);
    expect(create).toMatch(/CHECK \(delivery_status IN \('pending', 'delivered', 'failed'\)\)/);
  });

  it('records the content that is otherwise lost, not just a reference to it', () => {
    const create = BUG_REPORT_STATEMENTS[0];
    // The three fields that carry what the reporter actually said.
    for (const col of ['summary TEXT NOT NULL', 'what_happened TEXT NOT NULL', 'route_path TEXT NOT NULL']) {
      expect(create).toContain(col);
    }
    // And the evidence that made the report worth filing.
    for (const col of ['errors JSONB', 'failed_requests JSONB', 'screenshot BYTEA']) {
      expect(create).toContain(col);
    }
  });

  it('a failed run clears the memo so the next call retries', async () => {
    const run = jest.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(undefined);
    await expect(ensureBugReportSchema(run)).rejects.toThrow('connection reset');
    await ensureBugReportSchema(run);
    expect(run).toHaveBeenCalledTimes(1 + BUG_REPORT_STATEMENTS.length);
  });
});
