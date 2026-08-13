import { sequelize } from '../../config/database';
import { ensurePageEventLeadId } from '../ensurePageEventLeadId';
import PageEvent from '../../models/PageEvent';

let queryMock: jest.SpyInstance;

async function runAndCapture(): Promise<string[]> {
  queryMock.mockClear();
  await ensurePageEventLeadId();
  return queryMock.mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  queryMock = jest.spyOn(sequelize, 'query').mockResolvedValue([[], {}] as never);
});

afterEach(() => {
  queryMock.mockRestore();
});

describe('ensurePageEventLeadId — safety on a high-write production table', () => {
  it('adds the column with ADD COLUMN IF NOT EXISTS', async () => {
    const stmts = await runAndCapture();
    const alter = stmts.find((s) => /ALTER TABLE page_events/i.test(s));
    expect(alter).toMatch(/ADD COLUMN IF NOT EXISTS lead_id INTEGER/i);
  });

  it('adds a NULLABLE column — page_events has millions of rows with no lead', async () => {
    // A NOT NULL add would fail outright on existing rows, and a NOT NULL DEFAULT
    // would rewrite the whole table under a lock. Either would be an outage.
    const stmts = await runAndCapture();
    const alter = stmts.find((s) => /ALTER TABLE page_events/i.test(s)) as string;
    expect(alter).not.toMatch(/NOT NULL/i);
    expect(alter).not.toMatch(/DEFAULT/i);
  });

  it('declares no foreign key — an FK would force a validate-scan under lock', async () => {
    const stmts = await runAndCapture();
    for (const sql of stmts) {
      expect(sql).not.toMatch(/REFERENCES/i);
      expect(sql).not.toMatch(/FOREIGN KEY/i);
    }
  });

  it('contains no destructive verb', async () => {
    const stmts = await runAndCapture();
    for (const sql of stmts) {
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\b/i);
      expect(sql).not.toMatch(/\bUPDATE\b/i);
    }
  });

  it('creates its indexes with IF NOT EXISTS so re-boot is a no-op', async () => {
    const stmts = await runAndCapture();
    const indexes = stmts.filter((s) => /CREATE INDEX/i.test(s));
    expect(indexes.length).toBeGreaterThanOrEqual(2);
    for (const sql of indexes) {
      expect(sql).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('indexes (lead_id, event_type) to serve the contextGraphService query', async () => {
    // contextGraphService.ts:135-139 filters on lead_id AND event_type IN (...).
    const stmts = await runAndCapture();
    expect(
      stmts.some((s) => /CREATE INDEX/i.test(s) && /lead_id, ?event_type/i.test(s)),
    ).toBe(true);
  });

  it('continues after a failing statement and never rejects', async () => {
    queryMock.mockReset();
    queryMock
      .mockRejectedValueOnce(new Error('column already exists'))
      .mockResolvedValue([[], {}] as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(ensurePageEventLeadId()).resolves.toBeUndefined();

    // The two index statements must still have been attempted.
    expect(queryMock.mock.calls.length).toBe(3);
    expect(warn).toHaveBeenCalledWith('[DB] page_events.lead_id stmt skipped:', 'column already exists');
    warn.mockRestore();
  });
});

describe('PageEvent model — the column must exist in all three places', () => {
  // backend/CLAUDE.md: "update the model file's attribute interface AND the
  // Sequelize column definition AND the declare line. All three or the model is
  // broken." The interface and declare line are compile-time only, so this test
  // can verify the runtime one and rely on tsc for the others.
  it('exposes lead_id as a nullable attribute', () => {
    const attrs = PageEvent.getAttributes() as Record<string, { allowNull?: boolean }>;
    expect(attrs).toHaveProperty('lead_id');
    expect(attrs.lead_id.allowNull).toBe(true);
  });

  it('declares lead_id as INTEGER, matching leads.id', () => {
    // leads.id is INTEGER, not UUID — getting this wrong would make every
    // comparison silently fail to match rather than error.
    const def = PageEvent.getAttributes().lead_id as { type: unknown };
    expect(String(def.type)).toMatch(/INTEGER/i);
  });

  it('keeps the pre-existing columns intact', () => {
    const keys = Object.keys(PageEvent.getAttributes()).sort();
    expect(keys).toEqual(
      [
        'created_at',
        'event_data',
        'event_type',
        'id',
        'lead_id',
        'page_category',
        'page_path',
        'page_title',
        'page_url',
        'session_id',
        'timestamp',
        'visitor_id',
      ].sort(),
    );
  });
});
