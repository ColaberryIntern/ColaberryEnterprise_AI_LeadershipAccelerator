/**
 * The project-lifecycle schema is ADDITIVE-ONLY, with exactly one permitted exception, and
 * this file is the sweep that holds it to that.
 *
 * SPLIT out of `ensureProjectLifecycleSchema.test.ts` when that file reached 528 lines, over
 * CLAUDE.md's 500-line hard ceiling. The seam is real rather than arithmetic: every assertion
 * here is pure text over `PROJECT_LIFECYCLE_STATEMENTS`, so this half needs no database mock,
 * while the half left behind drives a mocked `sequelize.query` throughout.
 *
 * THE EXCEPTION, stated because an earlier version of this header denied it. That text read
 * "a future edit that sneaks in an ALTER of an existing table ... fails here", and the
 * statement list now contains
 * `ALTER TABLE operating_blueprint_manifests ADD COLUMN IF NOT EXISTS refs_sha256` BY DESIGN.
 * A verifier found four separate statements asserting the opposite of what shipped, one of
 * them a test NAME. An `ADD COLUMN IF NOT EXISTS` carrying no constraint is permitted; every
 * other ALTER is refused.
 *
 * Every assertion is paired with a POSITIVE CONTROL that feeds it a deliberately-bad input
 * and proves the assertion rejects it, and there is one test per OPERAND of the predicate so
 * a mutation names the clause that died rather than the predicate containing it.
 */
import { PROJECT_LIFECYCLE_STATEMENTS } from '../ensureProjectLifecycleSchema';
import { REQUIRED_TABLES } from '../projectLifecycleSchemaContract';

/** Tables that existed before this schema. A CREATE here would not be additive. */
const PRE_EXISTING = ['tenants', 'projects', 'delivery_projects'];

function isAdditive(sql: string): boolean {
  const s = sql.trim().toUpperCase().replace(/\s+/g, ' ');

  // ── APPLIED TO EVERY STATEMENT, ahead of both branches.
  //
  // An earlier version put the chained-statement clause on the ALTER branch ONLY, so
  // `CREATE TABLE IF NOT EXISTS zz (id UUID); ALTER TABLE t ALTER COLUMN c TYPE TEXT`
  // passed. The root cause was BRANCH ASYMMETRY, not a missing exclusion.
  //
  // TWO OPERANDS WERE REMOVED FROM THIS LIST after each survived deletion with the suite
  // fully green. `TRUNCATE` was unreachable as a sole refuser — a bare one fails the branch
  // match anyway and a chained one is caught by the semicolon clause below. `USING` was
  // worse than dead: it REFUSED `CREATE INDEX IF NOT EXISTS i ON t USING gin (c)`, which is
  // a legitimate additive statement, while every destructive `USING` also carries
  // `ALTER COLUMN` or `ADD CONSTRAINT` and was already refused. Both are pinned by controls
  // below — the permitted gin index, and the still-refused shapes.
  const destructiveAnywhere =
    /\bDROP\b/.test(s)
    || /\bALTER COLUMN\b/.test(s)
    || /\bRENAME\b/.test(s)
    || /\bSET UNLOGGED\b/.test(s)
    || /\bDISABLE TRIGGER\b/.test(s)
    || /\bADD CONSTRAINT\b/.test(s)
    || /\bGENERATED\b/.test(s)
    || /;/.test(s.replace(/;\s*$/, ''));  // a SECOND statement
  if (destructiveAnywhere) return false;

  const isCreate =
    s.startsWith('CREATE TABLE IF NOT EXISTS') ||
    s.startsWith('CREATE INDEX IF NOT EXISTS') ||
    s.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS');

  // ── ALTER BRANCH ONLY: hazardous when ADDED to a table that already holds rows, and
  // perfectly ordinary inside a CREATE. Moving them up into the global check would reject
  // every real CREATE TABLE in the list.
  //
  // The census that justifies the split is ASSERTED, not asserted-in-prose: see the test
  // "the token census over the statement list is what decides which bans can be global".
  // An earlier comment here published 7, 12, 12 and 53 as if measured over the statement
  // list; that was grep -c over this whole FILE, comments included.
  const isAddColumn = /^ALTER TABLE \S+ ADD COLUMN IF NOT EXISTS /.test(s)
    && !/\bUNIQUE\b/.test(s)
    && !/\bPRIMARY KEY\b/.test(s)
    && !/\bCHECK\s*\(/.test(s)
    && (!/\bNOT NULL\b/.test(s) || /\bDEFAULT\b/.test(s))
    // EVERY add in the statement must carry IF NOT EXISTS, not merely the first:
    // `ADD COLUMN IF NOT EXISTS c TEXT, ADD COLUMN d TEXT` is not idempotent on a re-run.
    && (s.match(/\bADD COLUMN\b/g) || []).length
       === (s.match(/\bADD COLUMN IF NOT EXISTS\b/g) || []).length;

  return isCreate || isAddColumn;
}

describe('the project-lifecycle DDL is additive-only, bar one permitted ALTER', () => {
  it('finds a non-trivial statement list, so the sweep cannot pass by scanning nothing', () => {
    expect(PROJECT_LIFECYCLE_STATEMENTS.length).toBeGreaterThanOrEqual(10);
    expect(REQUIRED_TABLES.length).toBeGreaterThanOrEqual(5);
  });

  // The NAME of this test used to read "(no ALTER, no DROP, no TRUNCATE)" while the list it
  // sweeps contained an ALTER. A test name is an assertion, and that one was false.
  it('every statement is either CREATE ... IF NOT EXISTS or the permitted ADD COLUMN', () => {
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      expect(isAdditive(sql)).toBe(true);
    }
  });

  it('the token census over the statement list is what decides which bans can be global', () => {
    // STANDING RULE 3: an apparatus number in prose needs a test behind it. These four are
    // the reason UNIQUE, PRIMARY KEY, CHECK and NOT NULL live on the ALTER branch instead of
    // the global check — they are ordinary inside a CREATE — and the zeros are the reason the
    // rest can be banned outright. Derived from PROJECT_LIFECYCLE_STATEMENTS, which is what
    // the predicate actually sweeps, NOT from the text of this file.
    const up = PROJECT_LIFECYCLE_STATEMENTS.map((s) => s.toUpperCase());
    const occurrences = (t: string) => up.reduce((n, s) => n + (s.split(t).length - 1), 0);

    expect(occurrences('PRIMARY KEY')).toBe(7);
    expect(occurrences('UNIQUE')).toBe(10);
    expect(occurrences('CHECK')).toBe(6);
    expect(occurrences('NOT NULL')).toBe(55);

    // Every token the global check bans appears ZERO times in the real list, which is what
    // makes banning it free. If one ever appears, this test is where that surfaces.
    for (const t of ['DROP', 'ALTER COLUMN', 'RENAME', 'SET UNLOGGED',
      'DISABLE TRIGGER', 'ADD CONSTRAINT', 'GENERATED']) {
      expect(occurrences(t)).toBe(0);
    }
    // And no statement smuggles in a second one.
    expect(up.filter((s) => s.trim().replace(/;\s*$/, '').includes(';'))).toHaveLength(0);
  });

  it('exactly one statement is an ALTER, and it is the refs_sha256 ADD COLUMN', () => {
    // Pins the exception so a SECOND ALTER cannot arrive unnoticed under a rule that now
    // permits the shape. The old blanket ban made this unnecessary; narrowing it made it the
    // only thing standing between "one audited exception" and "ALTERs are fine now".
    const alters = PROJECT_LIFECYCLE_STATEMENTS.filter(
      (s) => /^\s*ALTER TABLE/i.test(s.trim()),
    );
    expect(alters).toHaveLength(1);
    expect(alters[0]).toMatch(/operating_blueprint_manifests/i);
    expect(alters[0]).toMatch(/ADD COLUMN IF NOT EXISTS refs_sha256/i);
  });

  // ── ONE TEST PER OPERAND. A single combined control detected every mutation of this
  // predicate but reported the same test name for several of them, which says something
  // broke without saying what. These names are the attribution.

  it('positive control: rejects a statement with no IF NOT EXISTS', () => {
    expect(isAdditive('ALTER TABLE projects ADD COLUMN stage TEXT')).toBe(false);
    expect(isAdditive('CREATE TABLE project_lifecycle_states (id UUID)')).toBe(false);
  });

  it('positive control: rejects TRUNCATE and a bare DROP by BRANCH SHAPE, not by a ban', () => {
    // Neither matches a permitted prefix, so neither needs an operand of its own. This is the
    // test that proves removing the `TRUNCATE` clause took nothing away — it still passes.
    expect(isAdditive('TRUNCATE project_lifecycle_states')).toBe(false);
    expect(isAdditive('DROP TABLE project_lifecycle_states')).toBe(false);
    expect(isAdditive('ALTER TABLE t DROP COLUMN c')).toBe(false);
  });

  it('positive control: rejects a bare ALTER action that adds no column at all', () => {
    // THE GAP A MUTATION FOUND IN THIS REMEDIATION, not in the original task. Loosening the
    // prefix from `ADD COLUMN IF NOT EXISTS` to any `ALTER TABLE` survived every other test,
    // because the count check masks it for ADD COLUMN inputs: zero adds equals zero guarded
    // adds, so the balance holds vacuously. These three carry no ADD COLUMN, so the PREFIX is
    // the only thing refusing them — and two of them are genuinely dangerous.
    expect(isAdditive('ALTER TABLE t SET SCHEMA public')).toBe(false);
    expect(isAdditive('ALTER TABLE t OWNER TO someone_else')).toBe(false);
    expect(isAdditive('ALTER TABLE t ENABLE ROW LEVEL SECURITY')).toBe(false);
  });

  it('positive control: the DROP operand refuses a drop chained onto a valid ADD COLUMN', () => {
    // Here the operand IS load-bearing: the prefix matches, the count balances and no column
    // constraint appears, so only the global DROP ban refuses it.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, DROP COLUMN d')).toBe(false);
  });

  it('positive control: the ALTER COLUMN operand refuses a rewrite chained onto an ADD COLUMN', () => {
    // THE SURVIVOR THIS CLOSES. Deleting this operand left the suite green, and the named fix
    // offered to delete it as dead. It is not dead — this shape reaches `isAddColumn` and the
    // global ban is the only thing refusing it, so deleting it would have opened a hole.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, ALTER COLUMN d TYPE INT')).toBe(false);
    expect(isAdditive('ALTER TABLE t ALTER COLUMN c TYPE INTEGER')).toBe(false);
  });

  it('positive control: the RENAME operand refuses a rename chained onto an ADD COLUMN', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, RENAME COLUMN d TO e')).toBe(false);
    expect(isAdditive('ALTER TABLE t RENAME COLUMN c TO d')).toBe(false);
  });

  it('positive control: the SET UNLOGGED operand refuses losing crash-safety', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, SET UNLOGGED')).toBe(false);
  });

  it('positive control: the DISABLE TRIGGER operand refuses switching off a constraint', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, DISABLE TRIGGER ALL')).toBe(false);
  });

  it('positive control: the ADD CONSTRAINT operand refuses validating a populated table', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, ADD CONSTRAINT fk FOREIGN KEY (c) REFERENCES u(id)')).toBe(false);
  });

  it('positive control: the GENERATED operand refuses a computed column', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c INT GENERATED ALWAYS AS (1) STORED')).toBe(false);
  });

  it('positive control: rejects a chained SECOND statement, whichever branch the first matched', () => {
    // The regression test for branch asymmetry. The pre-task rule banned every ALTER, so a
    // chained destructive statement was refused for free; narrowing re-opened it, and the
    // first fix closed it on the ALTER branch only.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT; DELETE FROM t')).toBe(false);
    expect(isAdditive('CREATE TABLE IF NOT EXISTS zz (id UUID); ALTER TABLE t ALTER COLUMN c TYPE TEXT')).toBe(false);
    expect(isAdditive('CREATE TABLE IF NOT EXISTS zz (id UUID); ALTER TABLE t RENAME COLUMN c TO d')).toBe(false);
  });

  it('positive control: rejects an ADD COLUMN that CONSTRAINS a populated table', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT UNIQUE')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT PRIMARY KEY')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c INT CHECK (c > 0)')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT NOT NULL')).toBe(false);
  });

  it('positive control: rejects a mixed ADD COLUMN list where only the FIRST is guarded', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, ADD COLUMN d TEXT')).toBe(false);
  });

  it('POSITIVE COUNTERPART: the permitted forms pass, so the predicate refuses more than nothing', () => {
    // Without these, every assertion above would hold for a predicate returning false
    // unconditionally — which is what the rule did for ALTER before this task.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c VARCHAR(64)')).toBe(true);
    expect(isAdditive("ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT NOT NULL DEFAULT 'x'")).toBe(true);
    // A real CREATE TABLE carries PRIMARY KEY, NOT NULL and CHECK. Without this line, "ban it
    // globally" could be satisfied by banning the tokens the real statement list uses most.
    expect(isAdditive('CREATE TABLE IF NOT EXISTS zz (id UUID PRIMARY KEY, n INT NOT NULL, CHECK (n > 0))')).toBe(true);
  });

  it('POSITIVE COUNTERPART: a gin index is permitted, which the USING ban used to refuse', () => {
    // THE OVER-BREADTH THIS CLOSES. `USING` was banned globally as destructive. It is not: a
    // `CREATE INDEX ... USING gin` is additive and this repo will want one. The operand
    // survived mutation because no test exercised it in either direction — so nothing noticed
    // it was refusing a statement it should permit.
    expect(isAdditive('CREATE INDEX IF NOT EXISTS i ON t USING gin (c)')).toBe(true);
    expect(isAdditive('CREATE UNIQUE INDEX IF NOT EXISTS i ON t USING btree (c)')).toBe(true);
    // And still refused, because each carries an operand that IS load-bearing:
    expect(isAdditive('ALTER TABLE t ALTER COLUMN c TYPE INT USING c::INT')).toBe(false);
  });

  it('every CREATE TABLE targets one of the new REQUIRED_TABLES, never an existing table', () => {
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      const m = /CREATE TABLE IF NOT EXISTS \s+([a-z_]+)/i.exec(sql);
      if (!m) continue;
      expect(PRE_EXISTING).not.toContain(m[1]);
      expect(REQUIRED_TABLES).toContain(m[1]);
    }
  });

  // RECOVERED. This test was DROPPED when the 528-line file was split: the split moved the
  // additive describe wholesale and this assertion did not come with it. Found by diffing the
  // `it(...)` names either side of the split rather than by trusting the total, which had gone
  // UP - five other names changed in the same change because tests were renamed or divided, so
  // the count could not have shown a single silent loss.
  it('foreign keys reference only pre-existing tables or this schema\'s own new tables', () => {
    const refs = PROJECT_LIFECYCLE_STATEMENTS
      .join('\n')
      .match(/REFERENCES\s+(\w+)\s*\(/gi)
      ?.map((r) => r.replace(/REFERENCES\s+/i, '').replace(/\s*\(/, '').trim()) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    const allowed = [...PRE_EXISTING, ...REQUIRED_TABLES];
    for (const t of refs) expect(allowed).toContain(t);
  });

  it('the one permitted ALTER targets a table this module OWNS', () => {
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      const m = /ALTER TABLE \s+([a-z_]+)/i.exec(sql);
      if (!m) continue;
      expect(PRE_EXISTING).not.toContain(m[1]);
      expect(REQUIRED_TABLES).toContain(m[1]);
    }
  });
});
