// /inbox-zero (CC-20260910-3q7x). ensureInboxCaseSchema's statement loop
// swallows failures with console.warn by design, which is also exactly how a
// column that never got added ships silently and 500s in production with
// `column does not exist`. These tests pin the post-condition that closes
// that hole: it must report every missing column against the catalog, and
// it must actually FIRE — an assertion nobody has watched fail is not an
// assertion. sequelize.query is mocked; no database is touched.

const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: any[]) => query(...a) } }));

import { assertInboxZeroCaseColumns, ensureInboxCaseSchema, INBOX_ZERO_REQUIRED_COLUMNS } from '../ensureInboxCaseSchema';

const ALL_COLUMNS = INBOX_ZERO_REQUIRED_COLUMNS.map((col) => ({ col }));

function catalogReturning(cols: Array<{ col: string }>) {
  // Every DDL statement resolves; the catalog SELECT returns the given rows.
  query.mockImplementation(async (sql: string) => (/information_schema\.columns/.test(sql) ? [cols] : [[]]));
}

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('assertInboxZeroCaseColumns', () => {
  it('passes when every required column is present in the catalog', async () => {
    catalogReturning(ALL_COLUMNS);
    expect(await assertInboxZeroCaseColumns()).toEqual({ ok: true, missing: [] });
  });

  it('FIRES and names each missing column against an un-migrated catalog', async () => {
    catalogReturning(ALL_COLUMNS.filter((c) => c.col !== 'inbox_cases.snoozed_until' && c.col !== 'inbox_case_actions.verification_attempt_count'));
    const r = await assertInboxZeroCaseColumns();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['inbox_cases.snoozed_until', 'inbox_case_actions.verification_attempt_count']);
  });

  it('T16: reports a missing liveness column on inbox_case_items, and the catalog query covers that table', async () => {
    catalogReturning(ALL_COLUMNS.filter((c) => c.col !== 'inbox_case_items.source_live'));
    const r = await assertInboxZeroCaseColumns();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['inbox_case_items.source_live']);
    expect(String(query.mock.calls[0][0])).toContain("'inbox_case_items'");
    expect(INBOX_ZERO_REQUIRED_COLUMNS).toEqual(expect.arrayContaining(['inbox_case_items.source_live', 'inbox_case_items.source_checked_at', 'inbox_case_items.source_gone_reason']));
  });

  it('treats a catalog read failure as a failed post-condition, never a pass', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    const r = await assertInboxZeroCaseColumns();
    expect(r.ok).toBe(false);
    expect(r.missing[0]).toMatch(/^catalog_query_failed:connection refused/);
  });
});

describe('ensureInboxCaseSchema', () => {
  it('runs the seven /inbox-zero ADD COLUMN IF NOT EXISTS statements and both new indexes', async () => {
    catalogReturning(ALL_COLUMNS);
    await ensureInboxCaseSchema();
    const sqls: string[] = query.mock.calls.map((c) => String(c[0]));
    for (const col of INBOX_ZERO_REQUIRED_COLUMNS) {
      const [table, name] = col.split('.');
      expect(sqls.some((s) => s.includes(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name}`))).toBe(true);
    }
    expect(sqls.some((s) => s.includes('idx_inbox_cases_updated_at'))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_inbox_case_items_liveness') && s.includes('NULLS FIRST') && s.includes('WHERE disposition IS NULL'))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_inbox_cases_state_snoozed'))).toBe(true);
  });

  it('is idempotent: a second run issues the same statements and still passes', async () => {
    catalogReturning(ALL_COLUMNS);
    await ensureInboxCaseSchema();
    const first = query.mock.calls.length;
    await ensureInboxCaseSchema();
    expect(query.mock.calls.length).toBe(first * 2);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs a structured SchemaPostconditionError when a column is missing after the loop', async () => {
    catalogReturning(ALL_COLUMNS.filter((c) => c.col !== 'inbox_cases.priority_band'));
    await ensureInboxCaseSchema();
    const errorCalls = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    const line = errorCalls.find((l) => l.includes('inbox_zero_schema_postcondition_failed'));
    expect(line).toBeTruthy();
    const parsed = JSON.parse(line!);
    expect(parsed.error_class).toBe('SchemaPostconditionError');
    expect(parsed.context.missing).toEqual(['inbox_cases.priority_band']);
  });

  it('a swallowed DDL failure still surfaces through the post-condition', async () => {
    // The ALTER for snooze_reason throws (swallowed by the loop), and the
    // catalog then genuinely lacks it: the loop stays quiet, the assertion does not.
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('ADD COLUMN IF NOT EXISTS snooze_reason')) throw new Error('permission denied');
      if (/information_schema\.columns/.test(sql)) return [ALL_COLUMNS.filter((c) => c.col !== 'inbox_cases.snooze_reason')];
      return [[]];
    });
    await ensureInboxCaseSchema();
    const errorCalls = (console.error as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(errorCalls.some((l) => l.includes('"inbox_cases.snooze_reason"'))).toBe(true);
  });
});
