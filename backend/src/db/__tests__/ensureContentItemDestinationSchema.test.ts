/**
 * Static + behavioural contract test for ensureContentItemDestinationSchema.
 *
 * This file exists to migrate databases that already have `content_items`, and to own the edge
 * to `landing_pages`. The things worth pinning are the ones that were got wrong on the first
 * attempt: that the columns are plain (the foreign key is separate, because of boot order), that
 * the key RESTRICTs rather than CASCADEs, and that the post-condition notices a missing key as
 * well as a missing column.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import {
  ensureContentItemDestinationSchema,
  CONTENT_ITEM_DESTINATION_STATEMENTS,
} from '../ensureContentItemDestinationSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;
const sql = CONTENT_ITEM_DESTINATION_STATEMENTS.join('\n');

const COLUMNS = ['landing_page_id', 'destination_url'];
const FK = 'content_items_landing_page_fk';

/** Describe a database: which of the columns exist, and whether the foreign key is there. */
function databaseWith({ columns, fk }: { columns: string[]; fk: boolean }) {
  mockQuery.mockImplementation(async (statement: string) => {
    if (/information_schema\.columns/.test(statement)) {
      return [columns.map((column_name) => ({ column_name }))];
    }
    if (/pg_constraint/.test(statement)) return [fk ? [{ conname: FK }] : []];
    return [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  databaseWith({ columns: COLUMNS, fk: true });
});

describe('the columns', () => {
  it.each(COLUMNS)('%s is added additively', (col) => {
    expect(sql).toMatch(new RegExp(`ALTER TABLE content_items ADD COLUMN IF NOT EXISTS ${col}\\b`));
  });

  it('adds nothing destructively - this runs at every boot against live campaign data', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('every statement can run twice', () => {
    const notIdempotent = CONTENT_ITEM_DESTINATION_STATEMENTS.filter(
      (s) => !/IF NOT EXISTS/i.test(s) && !/EXCEPTION/i.test(s),
    );
    expect(notIdempotent).toEqual([]);
  });

  it('declares landing_page_id WITHOUT an inline foreign key', () => {
    // The whole reason this file exists. ensureContentOsSchema runs first, so a REFERENCES on
    // the column would point at a table that does not exist yet on a fresh database: the
    // statement fails, the warn-only loop swallows it, and the column is missing in CI while
    // working in production. The key is a separate, guarded statement below.
    const add = CONTENT_ITEM_DESTINATION_STATEMENTS.find((s) => s.includes('ADD COLUMN IF NOT EXISTS landing_page_id'))!;
    expect(add).not.toMatch(/REFERENCES/);
  });

  it('keeps destination_url for the destinations that are not ours to build', () => {
    expect(sql).toMatch(/destination_url VARCHAR\(2048\)/);
  });
});

describe('the foreign key', () => {
  const fk = CONTENT_ITEM_DESTINATION_STATEMENTS.find((s) => s.includes(FK))!;

  it('points content_items.landing_page_id at landing_pages', () => {
    expect(fk).toMatch(/FOREIGN KEY \(landing_page_id\) REFERENCES landing_pages\(id\)/);
  });

  it('RESTRICTs, so deleting a page a post points at fails loudly', () => {
    // CASCADE would silently erase the destination of a post that may already have gone out.
    expect(fk).toMatch(/ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });

  it('skips quietly when either side is not there yet, rather than logging every boot', () => {
    expect(fk).toMatch(/WHEN duplicate_object THEN NULL/);
    expect(fk).toMatch(/WHEN undefined_table THEN NULL/);
    expect(fk).toMatch(/WHEN undefined_column THEN NULL/);
  });
});

describe('the index', () => {
  it('answers "which posts point at this page", partially', () => {
    const idx = CONTENT_ITEM_DESTINATION_STATEMENTS.find((s) => s.includes('idx_content_items_landing_page'))!;
    expect(idx).toMatch(/CREATE INDEX IF NOT EXISTS/);
    // Nearly every row has no landing page; a full index would be mostly nulls.
    expect(idx).toMatch(/WHERE landing_page_id IS NOT NULL/);
  });
});

describe('running it', () => {
  it('issues every statement', async () => {
    await ensureContentItemDestinationSchema();
    const issued = mockQuery.mock.calls.map((c) => String(c[0]));
    for (const s of CONTENT_ITEM_DESTINATION_STATEMENTS) expect(issued).toContain(s);
  });

  it('reports ok when both columns and the key are present', async () => {
    const r = await ensureContentItemDestinationSchema();
    expect(r).toEqual({ ok: true, verified: true, missing: [], foreignKey: true });
  });

  it('keeps going after one statement throws', async () => {
    let seen = 0;
    mockQuery.mockImplementation(async (statement: string) => {
      if (/information_schema\.columns/.test(statement)) return [COLUMNS.map((column_name) => ({ column_name }))];
      if (/pg_constraint/.test(statement)) return [[{ conname: FK }]];
      seen += 1;
      if (seen === 1) throw new Error('lock timeout');
      return [];
    });
    const r = await ensureContentItemDestinationSchema();
    expect(seen).toBe(CONTENT_ITEM_DESTINATION_STATEMENTS.length);
    expect(r.ok).toBe(true);
  });
});

describe('the post-condition', () => {
  let error: jest.SpyInstance;
  beforeEach(() => { error = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { error.mockRestore(); });

  function emitted(event: string): any | null {
    const call = error.mock.calls.find((c) => String(c[0]).includes(event));
    return call ? JSON.parse(String(call[0])) : null;
  }

  it('names a missing column and says what breaks', async () => {
    databaseWith({ columns: ['destination_url'], fk: true });
    const r = await ensureContentItemDestinationSchema();

    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['content_items.landing_page_id']);
    expect(emitted('SchemaInvariantViolation').context.impact)
      .toMatch(/the destination is lost on reload/);
  });

  it('fails on a missing foreign key even when both columns landed', async () => {
    // Without the key a content item can point at a page that does not exist, and deleting a
    // page in use would not be refused. Both columns present is not the same as correct.
    databaseWith({ columns: COLUMNS, fk: false });
    const r = await ensureContentItemDestinationSchema();

    expect(r.ok).toBe(false);
    expect(r.foreignKey).toBe(false);
    const log = emitted('SchemaInvariantViolation');
    expect(log.context.missing_foreign_key).toBe(FK);
    expect(log.context.impact).toMatch(/deleting a page in use would not be refused/);
  });

  it('stays silent when everything is present, so the log means something', async () => {
    await ensureContentItemDestinationSchema();
    expect(emitted('SchemaInvariantViolation')).toBeNull();
  });

  it('an unverifiable check reads as not-ok, never as healthy', async () => {
    mockQuery.mockImplementation(async (statement: string) => {
      if (/information_schema\.columns/.test(statement)) throw new Error('connection terminated');
      return [];
    });

    const r = await ensureContentItemDestinationSchema();

    expect(r).toEqual({ ok: false, verified: false, missing: [], foreignKey: false });
    expect(emitted('SchemaVerificationUnavailable').context.reason).toBe('connection terminated');
  });
});
