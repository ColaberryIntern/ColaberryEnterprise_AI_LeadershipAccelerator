/**
 * Static contract test for ensureZoomRequestLedgerSchema — asserts properties of the
 * SQL as source text, with no live database, matching the convention in this directory.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import {
  ensureZoomRequestLedgerSchema,
  ZOOM_REQUEST_LEDGER_STATEMENTS,
  ZOOM_REQUEST_LEDGER_TABLES,
  ZOOM_REQUEST_LEDGER_REQUIRED_INDEXES,
  ZOOM_REQUEST_STATES,
} from '../ensureZoomRequestLedgerSchema';
import { parseCreatedTables, parseAddedColumns } from './schemaParityHelpers';

const mockQuery = sequelize.query as unknown as jest.Mock;
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

beforeEach(() => { jest.clearAllMocks(); mockQuery.mockResolvedValue([]); });

describe('ensureZoomRequestLedgerSchema', () => {
  it('creates the one ledger table', async () => {
    await ensureZoomRequestLedgerSchema();
    const issued = mockQuery.mock.calls.map((c) => flat(String(c[0])));
    expect(issued.some((s) => s.includes('CREATE TABLE IF NOT EXISTS zoom_meeting_requests ('))).toBe(true);
    expect(ZOOM_REQUEST_LEDGER_TABLES).toHaveLength(1);
  });

  it('every CREATE column also has an explicit ALTER ... ADD COLUMN IF NOT EXISTS', () => {
    // `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so a column added
    // later only to the CREATE body never reaches a database that already ran this.
    const created = parseCreatedTables(ZOOM_REQUEST_LEDGER_STATEMENTS);
    const altered = new Set(parseAddedColumns(ZOOM_REQUEST_LEDGER_STATEMENTS).map((a) => `${a.table}.${a.column}`));
    // Positive control: the parser must have actually found columns.
    expect(created[0].columns.length).toBeGreaterThan(8);
    const gaps = created[0].columns
      .filter((c) => c !== 'id')
      .filter((c) => !altered.has(`zoom_meeting_requests.${c}`));
    expect(gaps).toEqual([]);
  });

  it('the unique index on request_id exists — it is what makes the claim atomic', () => {
    // Without it, two workers racing the same booking both see "absent" and both call
    // Zoom, which is the duplicate-meeting bug this ledger exists to prevent.
    const issued = ZOOM_REQUEST_LEDGER_STATEMENTS.map(flat);
    const idx = issued.find((s) => s.includes('zoom_meeting_requests_unique_request'));
    expect(idx).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
    expect(idx).toMatch(/zoom_meeting_requests \(request_id\)/);
    expect(ZOOM_REQUEST_LEDGER_REQUIRED_INDEXES).toContain('zoom_meeting_requests_unique_request');
  });

  it('defaults to pending — never to a state that implies Zoom succeeded', () => {
    const issued = ZOOM_REQUEST_LEDGER_STATEMENTS.map(flat).join(' | ');
    expect(issued).toMatch(/state VARCHAR\(20\) NOT NULL DEFAULT 'pending'/);
    expect(ZOOM_REQUEST_STATES[0]).toBe('pending');
  });

  it('every statement is idempotent', () => {
    for (const stmt of ZOOM_REQUEST_LEDGER_STATEMENTS) {
      const s = flat(stmt);
      if (/^CREATE TABLE/i.test(s)) expect(s).toMatch(/^CREATE TABLE IF NOT EXISTS/i);
      if (/^CREATE (UNIQUE )?INDEX/i.test(s)) expect(s).toMatch(/^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i);
      if (/^ALTER TABLE/i.test(s)) expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    }
  });

  it('failure path: one failing statement does not stop the rest', async () => {
    mockQuery.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValue([]);
    await expect(ensureZoomRequestLedgerSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(ZOOM_REQUEST_LEDGER_STATEMENTS.length);
  });
});
