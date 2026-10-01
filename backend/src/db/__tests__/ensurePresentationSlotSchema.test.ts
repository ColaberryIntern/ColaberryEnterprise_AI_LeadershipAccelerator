/**
 * Static contract test for ensurePresentationSlotSchema — SQL as source text, no DB.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import {
  ensurePresentationSlotSchema,
  PRESENTATION_SLOT_STATEMENTS,
  PRESENTATION_SLOT_TABLES,
  PRESENTATION_SLOT_REQUIRED_CONSTRAINTS,
  PRESENTATION_SLOT_STATES,
} from '../ensurePresentationSlotSchema';
import { parseCreatedTables, parseAddedColumns } from './schemaParityHelpers';

const mockQuery = sequelize.query as unknown as jest.Mock;
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

beforeEach(() => { jest.clearAllMocks(); mockQuery.mockResolvedValue([]); });

describe('ensurePresentationSlotSchema', () => {
  it('creates the reservations table', async () => {
    await ensurePresentationSlotSchema();
    const issued = mockQuery.mock.calls.map((c) => flat(String(c[0])));
    expect(issued.some((s) => s.includes('CREATE TABLE IF NOT EXISTS presentation_slot_reservations ('))).toBe(true);
    expect(PRESENTATION_SLOT_TABLES).toHaveLength(1);
  });

  it('every CREATE column also has an explicit ALTER ... ADD COLUMN IF NOT EXISTS', () => {
    const created = parseCreatedTables(PRESENTATION_SLOT_STATEMENTS);
    const altered = new Set(parseAddedColumns(PRESENTATION_SLOT_STATEMENTS).map((a) => `${a.table}.${a.column}`));
    expect(created[0].columns.length).toBeGreaterThan(7);   // positive control
    const gaps = created[0].columns
      .filter((c) => c !== 'id')
      .filter((c) => !altered.has(`presentation_slot_reservations.${c}`));
    expect(gaps).toEqual([]);
  });

  it('THE exclusion constraint exists, is partial on held, and uses gist overlap', () => {
    // This is what makes capacity real rather than hopeful: it decides overlap in the
    // database, so two simultaneous clicks cannot both read "free" and both win.
    const stmt = PRESENTATION_SLOT_STATEMENTS.map(flat).find((s) => s.includes('presentation_slot_no_overlap'));
    expect(stmt).toBeDefined();
    expect(stmt).toMatch(/EXCLUDE USING gist \(slot WITH &&\)/);
    expect(stmt).toMatch(/WHERE \(state = 'held'\)/);
    expect(PRESENTATION_SLOT_REQUIRED_CONSTRAINTS).toContain('presentation_slot_no_overlap');
  });

  it('the constraint is added idempotently — ADD CONSTRAINT has no IF NOT EXISTS', () => {
    const stmt = PRESENTATION_SLOT_STATEMENTS.map(flat).find((s) => s.includes('presentation_slot_no_overlap'))!;
    // Guarded by a catalogue lookup so the module stays re-runnable like its siblings.
    expect(stmt).toMatch(/SELECT 1 FROM pg_constraint WHERE conname = 'presentation_slot_no_overlap'/);
    expect(stmt).toMatch(/IF NOT EXISTS/);
  });

  it('held is the blocking state; released keeps the row rather than deleting it', () => {
    expect(PRESENTATION_SLOT_STATES[0]).toBe('held');
    expect(PRESENTATION_SLOT_STATES).toContain('released');
    const issued = PRESENTATION_SLOT_STATEMENTS.map(flat).join(' | ');
    expect(issued).not.toMatch(/DELETE FROM/i);
    expect(issued).not.toMatch(/DROP TABLE/i);
  });

  it('every other statement is idempotent', () => {
    for (const stmt of PRESENTATION_SLOT_STATEMENTS) {
      const s = flat(stmt);
      if (/^CREATE TABLE/i.test(s)) expect(s).toMatch(/^CREATE TABLE IF NOT EXISTS/i);
      if (/^CREATE INDEX/i.test(s)) expect(s).toMatch(/^CREATE INDEX IF NOT EXISTS/i);
      if (/^ALTER TABLE/i.test(s) && !/ADD CONSTRAINT/i.test(s)) expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    }
  });

  it('failure path: one failing statement does not stop the rest', async () => {
    mockQuery.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValue([]);
    await expect(ensurePresentationSlotSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(PRESENTATION_SLOT_STATEMENTS.length);
  });
});
