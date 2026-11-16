jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../db/ensureBugReportSchema', () => ({ ensureBugReportSchema: jest.fn() }));
// eslint-disable-next-line import/first
import {
  markBugReportDelivered, markBugReportFailed, recordBugReport, type BugReportInput,
} from '../bugReportStore';

/**
 * BUG-5: the report is written down BEFORE the send, so a failed send loses nothing.
 *
 * The cases that matter are the unhappy ones. A store that only works when the database is
 * healthy would make bug reporting LESS reliable than the version that stored nothing, because
 * it adds a second thing that can fail in front of the send.
 */

const INPUT: BugReportInput = {
  summary: 'Cannot connect the Facebook page',
  whatHappened: 'Clicked connect, three attempts, no callback arrived.',
  pageUrl: 'https://enterprise.colaberry.ai/admin/marketing/brands',
  routePath: '/admin/marketing/brands',
  reportedAtCentral: '2026-11-15 11:15 CST',
  browser: 'Chrome 140',
  viewport: '1512x860',
  hasScreenshot: true,
  reporterEmail: 'sohail@colaberry.com',
  recipients: ['ali@colaberry.com', 'claude@colaberry.com'],
};

const ensure = () => Promise.resolve();
const silent = () => undefined;

describe('recordBugReport', () => {
  it('writes the report and returns its id', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'abc-123' }]);
    const id = await recordBugReport(INPUT, { query, ensure, log: silent });
    expect(id).toBe('abc-123');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, repl] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO marketing_bug_reports/);
    expect(repl.summary).toBe(INPUT.summary);
    expect(repl.whatHappened).toBe(INPUT.whatHappened);
    // Recipients travel as JSON, because a bound empty array renders as the invalid `ARRAY[]`.
    expect(repl.recipientsJson).toBe(JSON.stringify(INPUT.recipients));
  });

  it('reads the id when the driver returns ARRAY rows instead of objects', async () => {
    // Not hypothetical: this database returns array-shaped rows for some queries, which was
    // observed on production. Reading row.id alone would silently yield undefined here and the
    // insert would look like it did nothing.
    const query = jest.fn().mockResolvedValue([['row-as-array']]);
    await expect(recordBugReport(INPUT, { query, ensure, log: silent })).resolves.toBe('row-as-array');
  });

  it('is idempotent inside the window: a double submit writes one row and reuses its id', async () => {
    // The guarded INSERT ... WHERE NOT EXISTS returns nothing, so the store looks the row up.
    const query = jest.fn()
      .mockResolvedValueOnce([])                     // insert suppressed
      .mockResolvedValueOnce([{ id: 'first-row' }]); // the row it collided with
    const id = await recordBugReport(INPUT, { query, ensure, log: silent });
    expect(id).toBe('first-row');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toMatch(/WHERE NOT EXISTS/);
    expect(query.mock.calls[0][0]).toMatch(/INTERVAL '5 minutes'/);
  });

  it('the duplicate guard keys on reporter, summary and body together', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'x' }]);
    await recordBugReport(INPUT, { query, ensure, log: silent });
    const sql = query.mock.calls[0][0];
    const guard = sql.slice(sql.indexOf('WHERE NOT EXISTS'));
    for (const col of ['reporter_email', 'summary', 'what_happened']) expect(guard).toContain(col);
  });

  it('returns null WITHOUT THROWING when the insert fails, so the send still happens', async () => {
    const query = jest.fn().mockRejectedValue(new Error('deadlock detected'));
    const log = jest.fn();
    await expect(recordBugReport(INPUT, { query, ensure, log })).resolves.toBeNull();
    const line = JSON.parse(log.mock.calls[0][0]);
    expect(line.event).toBe('bug_report_persist_failed');
    expect(line.outcome).toBe('failure');
    expect(line.context.error_class).toBe('BugReportPersistFailed');
  });

  it('returns null without throwing when the table cannot be created', async () => {
    const query = jest.fn();
    const failing = () => Promise.reject(new Error('permission denied for schema public'));
    await expect(recordBugReport(INPUT, { query, ensure: failing, log: silent })).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts a report with no optional fields and no recipients', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'bare' }]);
    const bare: BugReportInput = { ...INPUT, recipients: [], errors: undefined, failedRequests: undefined };
    await expect(recordBugReport(bare, { query, ensure, log: silent })).resolves.toBe('bare');
    const repl = query.mock.calls[0][1];
    expect(repl.recipientsJson).toBe('[]');
    expect(repl.errors).toBe('[]');
    expect(repl.failedRequests).toBe('[]');
    expect(repl.whatExpected).toBeNull();
  });
});

describe('recording the outcome', () => {
  it('marks a delivered report and clears any stale detail', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await markBugReportDelivered('abc-123', { query, log: silent });
    const [sql, repl] = query.mock.calls[0];
    expect(sql).toMatch(/delivery_status = 'delivered'/);
    expect(sql).toMatch(/delivery_detail = NULL/);
    expect(repl.id).toBe('abc-123');
  });

  it('keeps the screenshot when delivery fails, so the report can be replayed', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const shot = { buffer: Buffer.from('png-bytes'), filename: 'screenshot.png' };
    await markBugReportFailed('abc-123', 'relay refused', shot, { query, log: silent });
    const [sql, repl] = query.mock.calls[0];
    expect(sql).toMatch(/delivery_status = 'failed'/);
    expect(repl.reason).toBe('relay refused');
    expect(repl.screenshot).toBe(shot.buffer);
    expect(repl.filename).toBe('screenshot.png');
    // COALESCE so a later update without a screenshot cannot erase the stored one.
    expect(sql).toMatch(/screenshot = COALESCE\(:screenshot, screenshot\)/);
  });

  it('clamps a runaway failure reason rather than storing all of it', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await markBugReportFailed('abc-123', 'x'.repeat(5000), null, { query, log: silent });
    expect(query.mock.calls[0][1].reason).toHaveLength(1000);
  });

  it('does nothing at all when there is no row - persistence having failed is not a second failure', async () => {
    const query = jest.fn();
    await markBugReportDelivered(null, { query, log: silent });
    await markBugReportFailed(null, 'whatever', null, { query, log: silent });
    expect(query).not.toHaveBeenCalled();
  });

  it('swallows and logs an outcome-write failure, because the mail already went', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection reset'));
    const log = jest.fn();
    await expect(markBugReportDelivered('abc-123', { query, log })).resolves.toBeUndefined();
    expect(JSON.parse(log.mock.calls[0][0]).event).toBe('bug_report_outcome_write_failed');
  });
});
