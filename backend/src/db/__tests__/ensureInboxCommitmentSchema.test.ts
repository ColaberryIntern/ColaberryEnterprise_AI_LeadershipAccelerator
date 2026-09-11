// /inbox-zero T8 (CC-20260910-3q7x). Same shape as ensureInboxCaseSchema.inboxZero.test.ts:
// the ensure loop swallows DDL failures by design, so the post-condition is
// what makes a missing table or a non-unique index visible. It must FIRE.

const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: any[]) => query(...a) } }));

import { assertInboxCommitmentSchema, ensureInboxCommitmentSchema, INBOX_COMMITMENT_REQUIRED_COLUMNS } from '../ensureInboxCommitmentSchema';

const ALL = INBOX_COMMITMENT_REQUIRED_COLUMNS.map((col) => ({ col }));

function catalog(cols: Array<{ col: string }>, unique = true) {
  query.mockImplementation(async (sql: string) => {
    if (/information_schema\.columns/.test(sql)) return [cols];
    if (/pg_index/.test(sql)) return [unique ? [{ is_unique: true }] : []];
    return [[]];
  });
}

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('assertInboxCommitmentSchema', () => {
  it('passes when every column exists and the (case_id, statement_hash) index is genuinely unique', async () => {
    catalog(ALL);
    expect(await assertInboxCommitmentSchema()).toEqual({ ok: true, missing: [] });
  });
  it('FIRES when a column is missing', async () => {
    catalog(ALL.filter((c) => c.col !== 'inbox_commitments.due_at'));
    expect(await assertInboxCommitmentSchema()).toEqual({ ok: false, missing: ['inbox_commitments.due_at'] });
  });
  it('FIRES when the index exists but is not unique (a CREATE ran, but Postgres will not refuse the duplicate row)', async () => {
    catalog(ALL, false);
    const r = await assertInboxCommitmentSchema();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['unique_index:uq_inbox_commitments_case_statement']);
  });
  it('treats a catalog failure as a failed post-condition', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    expect((await assertInboxCommitmentSchema()).ok).toBe(false);
  });
});

describe('ensureInboxCommitmentSchema', () => {
  it('creates the table, both CHECKs and the unique index, and is idempotent', async () => {
    catalog(ALL);
    await ensureInboxCommitmentSchema();
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS inbox_commitments'))).toBe(true);
    expect(sqls.some((s) => s.includes('ck_inbox_commitments_status'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_commitments_case_statement'))).toBe(true);
    const n = query.mock.calls.length;
    await ensureInboxCommitmentSchema();
    expect(query.mock.calls.length).toBe(n * 2);
    expect(console.error).not.toHaveBeenCalled();
  });
  it('logs a structured SchemaPostconditionError when the post-condition fails', async () => {
    catalog(ALL.filter((c) => c.col !== 'inbox_commitments.statement_hash'));
    await ensureInboxCommitmentSchema();
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('inbox_commitment_schema_postcondition_failed'));
    expect(line).toBeTruthy();
    expect(JSON.parse(line!).context.missing).toEqual(['inbox_commitments.statement_hash']);
  });
});
