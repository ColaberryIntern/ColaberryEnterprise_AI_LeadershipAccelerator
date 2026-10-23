import { END_REASON_STATEMENTS } from '../ensureBroadcastEndReasonSchema';
import { END_REASONS } from '../../services/broadcast/broadcastStateMachine';

/**
 * L7.4 — the column that answers "why did this class end".
 *
 * This one ALTERs an existing table, which the rest of the broadcast schema never does, so the
 * safety properties are different from its neighbours: it must not drop anything, must not
 * rewrite existing rows, and must be safe to run twice on a live database. A rerun that failed
 * because a constraint already existed would take the whole boot sequence's error log with it.
 *
 * The CHECK constraint and the TypeScript union are two spellings of the same fact, so the
 * most valuable assertion here is that they still agree.
 */

const sql = END_REASON_STATEMENTS.join('\n');

describe('it is additive and rerunnable', () => {
  it('adds, never drops or rewrites', () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    // An UPDATE here would be a back-fill, and back-filling 'producer' onto occurrences that
    // ended before this column existed would invent a fact nobody recorded.
    expect(sql).not.toMatch(/\bUPDATE\s+broadcast_occurrences\b/i);
  });

  it('only ever touches broadcast_occurrences', () => {
    const tables = Array.from(sql.matchAll(/ALTER TABLE\s+(\w+)/gi)).map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    expect(Array.from(new Set(tables))).toEqual(['broadcast_occurrences']);
  });

  it('is safe to run twice', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS end_reason/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/);
    // The constraint cannot use IF NOT EXISTS, so it is guarded by a catalog lookup instead.
    expect(sql).toMatch(/SELECT 1 FROM pg_constraint WHERE conname = 'chk_broadcast_occ_end_reason'/);
  });

  it('leaves the column NULLABLE with no default', () => {
    // Null means "ended before we recorded why", which is true and is exactly what a default
    // would destroy.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS end_reason TEXT(?!\s+NOT NULL)/);
    expect(sql).not.toMatch(/end_reason TEXT[^\n]*DEFAULT/i);
  });
});

describe('the constraint and the type agree', () => {
  it('the CHECK allows exactly the reasons the state machine can write', () => {
    // Two spellings of one fact. If they drift, the state machine writes a value the database
    // rejects, and the first time anyone finds out is a failed end on a live broadcast.
    const listed = (sql.match(/end_reason IN \(([^)]+)\)/) || [])[1];
    expect(listed).toBeDefined();
    const fromSql = listed.split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    expect(fromSql).toEqual([...END_REASONS].sort());
  });

  it('the CHECK permits null, or every pre-existing row would violate it', () => {
    expect(sql).toMatch(/end_reason IS NULL OR end_reason IN/);
  });

  it('CONTROL: a reason that is not in the union is not in the constraint either', () => {
    expect(sql).not.toMatch(/'cancelled_by_admin'/);
  });
});
