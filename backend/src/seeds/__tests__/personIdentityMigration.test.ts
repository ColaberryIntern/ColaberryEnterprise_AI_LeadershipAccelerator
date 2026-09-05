import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeEmail } from '../../services/adminOs/identityResolution';

/**
 * The migration and backfill cannot be integration-tested here — CI has no
 * database. So this suite checks the properties that would otherwise rest on
 * someone reading the SQL carefully: that it is additive, that it is idempotent,
 * and that its email normalisation matches the TypeScript matcher's.
 *
 * Those are exactly the properties that fail silently. A migration that drops a
 * column, or that is not safe to rerun, or that normalises differently from the
 * code reading the same column, all look fine until production.
 */
const MIGRATION = readFileSync(
  join(__dirname, '..', 'migrations', '20260905_add_person_identity.sql'),
  'utf8',
);

const BACKFILL = readFileSync(join(__dirname, '..', 'backfillPersonIdentity.ts'), 'utf8');

/** SQL with comment lines stripped, so prose never satisfies a check. */
const sql = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('person identity migration — idempotency', () => {
  it('guards every CREATE TABLE', () => {
    const creates = sql.match(/CREATE TABLE[^(]*/gi) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    for (const stmt of creates) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('guards every ADD COLUMN', () => {
    const adds = sql.match(/ADD COLUMN[^;]*/gi) ?? [];
    expect(adds.length).toBeGreaterThan(0);
    for (const stmt of adds) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('guards every CREATE INDEX', () => {
    const indexes = sql.match(/CREATE (UNIQUE )?INDEX[^(]*/gi) ?? [];
    expect(indexes.length).toBeGreaterThan(0);
    for (const stmt of indexes) {
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
  });

  it('adds every constraint behind an existence guard', () => {
    // ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so each
    // must sit inside a pg_constraint check or the second run errors.
    const constraints = sql.match(/ADD CONSTRAINT (\w+)/gi) ?? [];
    expect(constraints.length).toBeGreaterThan(0);
    for (const match of constraints) {
      const name = match.replace(/ADD CONSTRAINT /i, '').trim();
      expect(sql).toContain(`conname = '${name}'`);
    }
  });

  it('runs inside a transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql).toMatch(/COMMIT;\s*$/);
  });
});

describe('person identity migration — additive only', () => {
  it('drops nothing', () => {
    // The brief's constraint, enforced rather than trusted.
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)\b/i);
  });

  it('does not alter or retype an existing column', () => {
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    expect(sql).not.toMatch(/\bTYPE\s+\w+\s+USING\b/i);
  });

  it('adds no NOT NULL column to an existing table', () => {
    // A NOT NULL added to leads/enrollments/visitors would reject existing rows.
    // NOT NULL inside the new CREATE TABLE statements is fine — there are no
    // rows yet — so only the ALTER path is checked.
    const alters = sql.match(/ALTER TABLE\s+(leads|enrollments|visitors)[^;]*/gi) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    for (const stmt of alters) {
      expect(stmt).not.toMatch(/NOT NULL/i);
    }
  });

  it('orphans the link rather than cascading a delete', () => {
    // ON DELETE CASCADE from persons would delete the ENROLMENT — the record of
    // something that actually happened — when a person row is removed.
    const fks = sql.match(/REFERENCES persons[^;]*/gi) ?? [];
    expect(fks.length).toBe(3);
    for (const fk of fks) {
      expect(fk).toMatch(/ON DELETE SET NULL/i);
      expect(fk).not.toMatch(/CASCADE/i);
    }
  });

  it('keeps the queue from growing without bound on re-runs', () => {
    // Without a partial unique index on open items, every re-run would enqueue
    // the same unresolved record again — the classic way a "safe to rerun"
    // script turns out not to be.
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_person_queue_open_source/i);
    expect(sql).toMatch(/WHERE status = 'pending'/i);
  });

  it('makes one person per normalised email enforceable', () => {
    // This unique index is what makes the backfill's ON CONFLICT work at all.
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_primary_email/i);
  });
});

describe('backfill script — safety', () => {
  it('defaults to a dry run', () => {
    expect(BACKFILL).toContain("process.argv.includes('--apply')");
    expect(BACKFILL).toMatch(/tx\.rollback\(\)/);
  });

  it('only ever links rows that are not already linked', () => {
    // The property that makes it both idempotent and resumable. Every UPDATE
    // must be gated on person_id IS NULL.
    const updates = BACKFILL.match(/UPDATE \w+ \w+ SET person_id[\s\S]*?`/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const stmt of updates) {
      expect(stmt).toMatch(/person_id IS NULL/);
    }
  });

  it('inserts persons without erroring on a re-run', () => {
    expect(BACKFILL).toMatch(/ON CONFLICT \(primary_email\) DO NOTHING/);
  });

  it('refuses to run before the migration is applied', () => {
    // A backfill that reports "0 created" against a database with no persons
    // table looks like a clean no-op. It must fail loudly instead.
    expect(BACKFILL).toContain("to_regclass('public.persons')");
    expect(BACKFILL).toMatch(/throw new Error\(\s*'persons table not found/);
  });

  it('reports a null coverage rate for an empty table, never zero', () => {
    expect(BACKFILL).toMatch(/total === 0 \? null :/);
  });

  it('measures coverage as traced-to-a-lead, NOT as has-a-person_id', () => {
    // The regression this guards. Step 1 mints a person from the enrolment's own
    // email when no lead exists, so COUNT(person_id) is 517 of 517 and reports
    // 100% coverage while 86 students have no acquisition history at all.
    // Verified against a full copy of production: the honest figure is 431/517.
    //
    // Caught by rehearsing the backfill on real data, not by reading it.
    expect(BACKFILL).toMatch(/EXISTS \(SELECT 1 FROM leads l WHERE l\.person_id = e\.person_id\)/);
    expect(BACKFILL).toContain('traced_to_a_lead');
    // The naive measure must not be what the rate is computed from.
    expect(BACKFILL).not.toMatch(/COUNT\(person_id\)::text AS linked/);
  });

  it('names the coverage fields so the wrong reading is not inviting', () => {
    // 'linked' invited exactly the misreading that made the wrong number look
    // right; 'traced_to_a_lead' and 'no_acquisition_record' say what they mean.
    expect(BACKFILL).toContain('no_acquisition_record');
    expect(BACKFILL).toContain('enrolment_acquisition_coverage');
  });

  it('does not queue the unresolvable', () => {
    // 86 rows a reviewer can do nothing about is a backlog, not a queue.
    expect(BACKFILL).not.toMatch(/'no_candidate'.*INSERT INTO person_resolution_queue/s);
  });
});

describe('SQL and TypeScript normalisation agree', () => {
  it('both lower-case and trim, and nothing more', () => {
    // If the SQL normalised differently from normalizeEmail(), the backfill and
    // the live matcher would disagree about who is who — and the disagreement
    // would be invisible, because both would look internally consistent.
    expect(BACKFILL).toContain('lower(btrim(');

    expect(normalizeEmail('  Ali@Colaberry.COM ')).toBe('ali@colaberry.com');
    // Neither side strips dots or plus-addressing.
    expect(normalizeEmail('a.b+x@example.com')).toBe('a.b+x@example.com');
    expect(BACKFILL).not.toMatch(/replace\([^)]*'\.'/);
  });

  it('both require an @ before treating a value as an identity key', () => {
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(BACKFILL).toContain("position('@' in");
  });

  it('both treat blank and whitespace-only as unusable', () => {
    expect(normalizeEmail('   ')).toBeNull();
    expect(BACKFILL).toMatch(/btrim\(\$\{col\}\) <> ''/);
  });
});
