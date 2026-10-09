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

import { isAdditive, splitActions } from './fixtures/additivePredicate';


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
    // because they carry no ADD COLUMN at all, so the allow-list prefix is the only thing
    // refusing them. (An earlier comment here described a per-statement COUNT CHECK that no
    // longer exists — the allow-list over actions replaced it. A comment naming a mechanism
    // the file does not contain is the same defect as a test name asserting one.) The PREFIX is
    // the only thing refusing them — and two of them are genuinely dangerous.
    expect(isAdditive('ALTER TABLE t SET SCHEMA public')).toBe(false);
    expect(isAdditive('ALTER TABLE t OWNER TO someone_else')).toBe(false);
    expect(isAdditive('ALTER TABLE t ENABLE ROW LEVEL SECURITY')).toBe(false);
  });

  it('positive control: the DROP operand refuses a drop chained onto a valid ADD COLUMN', () => {
    // Here the deny-list is load-bearing: the first action is a permitted ADD COLUMN, so the
    // allow-list alone would have to rely on the split working to see the second one. LAYER 1
    // refuses it on the token regardless, which is why both layers exist.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, DROP COLUMN d')).toBe(false);
  });

  it('positive control: the ALTER COLUMN operand refuses a rewrite chained onto an ADD COLUMN', () => {
    // THE SURVIVOR THIS CLOSES. Deleting this operand left the suite green, and the named fix
    // offered to delete it as dead. It is not dead — this shape reaches the allow-list and the
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

  it('GENERATED SWEEP: nothing carrying a destructive token is ever accepted', () => {
    // THE EVIDENCE THAT WAS MISSING, and it is a TEST rather than a script in a scratch
    // directory. The previous version of this claim ran a 1,373-case corpus from an uncommitted
    // generator, so the claim was not re-derivable from the repo (standing rule 1) — and worse,
    // the corpus contained no CARRIER TOKENS, so it could not see the class of hole it was
    // supposed to be ruling out. A verifier generated 14,720 cases including carriers and found
    // 954 distinct destructive shapes accepted.
    //
    // Built from components rather than hand-listed, and the carriers are the point: each of
    // these first-actions ends with an UNBALANCED parenthesis hidden inside a literal, an
    // identifier or a comment, which is exactly what fooled the splitter.
    const heads = ['ALTER TABLE t', 'ALTER TABLE operating_blueprint_manifests'];
    const carriers = [
      'ADD COLUMN IF NOT EXISTS c TEXT',
      "ADD COLUMN IF NOT EXISTS c TEXT DEFAULT '('",
      "ADD COLUMN IF NOT EXISTS c TEXT DEFAULT ')'",
      "ADD COLUMN IF NOT EXISTS c TEXT DEFAULT 'a (b'",
      "ADD COLUMN IF NOT EXISTS c TEXT DEFAULT '))('",
      'ADD COLUMN IF NOT EXISTS c TEXT /* ( */',
      'ADD COLUMN IF NOT EXISTS c TEXT /* )( */',
      'ADD COLUMN IF NOT EXISTS "a(b" TEXT',
      'ADD COLUMN IF NOT EXISTS c TEXT COLLATE "x(y"',
      'ADD COLUMN IF NOT EXISTS c NUMERIC(10,2)',
    ];
    const destructive = [
      'DROP COLUMN d', 'DROP CONSTRAINT ck', 'TRUNCATE t', 'RENAME COLUMN d TO e',
      'RENAME TO t2', 'SET UNLOGGED', 'SET LOGGED', 'DISABLE TRIGGER ALL',
      'ADD CONSTRAINT fk FOREIGN KEY (c) REFERENCES u(id)', 'ADD CONSTRAINT ck CHECK (c > 0)',
      'ALTER COLUMN d TYPE INTEGER', 'ALTER COLUMN d TYPE INTEGER USING d::INTEGER',
      'ALTER d TYPE INTEGER', 'ALTER d SET DATA TYPE INTEGER USING d::INTEGER',
      'ALTER COLUMN d SET NOT NULL', 'ALTER COLUMN d DROP DEFAULT', 'OWNER TO someone_else',
      'SET SCHEMA public', 'ENABLE ROW LEVEL SECURITY', 'CLUSTER ON i', 'INHERIT parent',
      'VALIDATE CONSTRAINT ck', 'ADD COLUMN d TEXT',
    ];
    const tails = ['', ';'];

    // The tokens that make a statement non-additive. `ADD COLUMN` without `IF NOT EXISTS` counts:
    // it is not destructive but it is not idempotent, and a re-run throws.
    const BAD = /DROP|TRUNCATE|RENAME|UNLOGGED|DISABLE TRIGGER|ADD CONSTRAINT|OWNER TO|SET SCHEMA|ROW LEVEL SECURITY|CLUSTER ON|INHERIT|VALIDATE CONSTRAINT|ALTER (COLUMN )?[^ ]+ (SET DATA )?TYPE|ALTER COLUMN/i;

    const wronglyAccepted: string[] = [];
    let checked = 0;
    for (const head of heads) {
      for (const first of carriers) {
        for (const second of destructive) {
          for (const tail of tails) {
            const sql = `${head} ${first}, ${second}${tail}`;
            checked += 1;
            if (isAdditive(sql) && BAD.test(sql)) wronglyAccepted.push(sql);
          }
        }
      }
    }

    // Reported as a LIST, not a count: a bare number tells a reader nothing about which hole.
    expect(wronglyAccepted).toEqual([]);
    // Non-vacuity, twice over. Without these the assertion above holds for a generator that
    // produced nothing, which is how the previous corpus managed to miss an entire class.
    expect(checked).toBe(heads.length * carriers.length * destructive.length * tails.length);
    expect(checked).toBeGreaterThan(900);
    // And the carriers really do carry an unbalanced paren, or they are not carriers at all.
    const unbalanced = carriers.filter((c) => {
      const opens = (c.match(/\(/g) ?? []).length;
      const closes = (c.match(/\)/g) ?? []).length;
      return opens !== closes;
    });
    expect(unbalanced.length).toBeGreaterThanOrEqual(6);
  });

  it('positive control: a CARRIER TOKEN cannot smuggle a destructive action past the split', () => {
    // THE REGRESSION THIS CLOSES, and it was mine. `splitActions` counted parens with no idea
    // what a quote or a comment was, so ONE unbalanced open-paren suppressed the comma split and
    // glued the destructive action into a string beginning `ADD COLUMN IF NOT EXISTS`. At the
    // same time I had moved the global DROP / ALTER COLUMN / RENAME bans into the CREATE branch,
    // so nothing else caught it. A verifier ran the first of these against real Postgres: exit 0,
    // and a populated column was dropped. 954 distinct destructive shapes were accepted.
    //
    // Two layers now. `blankLiterals` stops the carrier reaching the scanner, and the deny-list
    // is back on BOTH branches so a tokeniser bug cannot be the only thing standing between this
    // list and a DROP.
    const NL = String.fromCharCode(10);
    expect(isAdditive("ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT DEFAULT '(', DROP COLUMN d")).toBe(false);
    expect(isAdditive("ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT DEFAULT ')', DROP CONSTRAINT ck")).toBe(false);
    expect(isAdditive("ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT DEFAULT 'a (b', RENAME COLUMN d TO e")).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT /* ( */, ALTER COLUMN d TYPE INTEGER USING d::numeric::INTEGER')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT -- (' + NL + ', DROP COLUMN d')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS "a(b" TEXT, DROP COLUMN d')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT COLLATE "x(y", DROP COLUMN d')).toBe(false);
  });

  it('POSITIVE COUNTERPART: a parenthesis in a legitimate literal or precision still passes', () => {
    // Without these, blanking literals could be satisfied by refusing anything containing a
    // paren, which would reject the real statement list — it contains VARCHAR(64).
    expect(isAdditive("ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT DEFAULT 'n/a (unknown)'")).toBe(true);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c NUMERIC(10,2)')).toBe(true);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c VARCHAR(64)')).toBe(true);
  });

  it('positive control: the DENY-LIST refuses a destructive token on the ALTER branch too', () => {
    // These are the shapes that became acceptable when I moved the deny-list into the CREATE
    // branch. Each is refused by LAYER 1 now, independently of whether the split works at all —
    // which is the point of having two layers rather than a better one.
    for (const action of [
      'DROP COLUMN d', 'DROP CONSTRAINT ck', 'RENAME COLUMN d TO e', 'SET UNLOGGED',
      'DISABLE TRIGGER ALL', 'ADD CONSTRAINT fk FOREIGN KEY (c) REFERENCES u(id)',
      'OWNER TO someone_else', 'SET SCHEMA public', 'ENABLE ROW LEVEL SECURITY',
      'CLUSTER ON i', 'INHERIT parent', 'VALIDATE CONSTRAINT ck',
      'ALTER COLUMN d TYPE INTEGER', 'ALTER d TYPE INTEGER', 'ALTER d SET DATA TYPE INTEGER',
    ]) {
      expect(isAdditive(`ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, ${action}`)).toBe(false);
      // and alone, not only when chained behind a permitted action
      expect(isAdditive(`ALTER TABLE t ${action}`)).toBe(false);
    }
  });

  it('positive control: rejects a chained SECOND statement, whichever branch the first matched', () => {
    // The regression test for branch asymmetry. The pre-task rule banned every ALTER, so a
    // chained destructive statement was refused for free; narrowing re-opened it, and the
    // first fix closed it on the ALTER branch only.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT; DELETE FROM t')).toBe(false);
    expect(isAdditive('CREATE TABLE IF NOT EXISTS zz (id UUID); ALTER TABLE t ALTER COLUMN c TYPE TEXT')).toBe(false);
    expect(isAdditive('CREATE TABLE IF NOT EXISTS zz (id UUID); ALTER TABLE t RENAME COLUMN c TO d')).toBe(false);
  });

  // FOUR TESTS, NOT ONE. These four operands shared a single name until now, so a mutation
  // of any of them reported the same failure and the attribution said "something in the
  // per-action checks broke". A verdict noted it without deducting; it is the same defect
  // this task was already marked down for twice, so it is fixed rather than left because
  // nobody charged for it.

  it('positive control: the per-action UNIQUE refusal rejects a unique index on a populated table', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT UNIQUE')).toBe(false);
  });

  it('positive control: the per-action PRIMARY KEY refusal rejects a key on a populated table', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT PRIMARY KEY')).toBe(false);
  });

  it('positive control: the per-action CHECK refusal rejects a constraint needing validation', () => {
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c INT CHECK (c > 0)')).toBe(false);
  });

  it('positive control: the per-action NOT NULL refusal rejects a column with no DEFAULT', () => {
    // NOT NULL without a DEFAULT fails outright on a populated table; with one it is fine,
    // and the permitted counterpart is in the POSITIVE COUNTERPART test.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT NOT NULL')).toBe(false);
    // PER-ACTION is the point: before the allow-list, a DEFAULT anywhere in the statement
    // satisfied the check for every action in it, so this passed.
    expect(isAdditive("ALTER TABLE t ADD COLUMN IF NOT EXISTS a TEXT NOT NULL DEFAULT 'x', ADD COLUMN IF NOT EXISTS b TEXT NOT NULL")).toBe(false);
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
    // And still refused — by the ALLOW-LIST, not by a `USING` ban:
    expect(isAdditive('ALTER TABLE t ALTER COLUMN c TYPE INT USING c::INT')).toBe(false);
  });

  it('positive control: refuses the KEYWORD-LESS column rewrite, both spellings', () => {
    // THE HOLE MY `USING` REMOVAL OPENED, and the reason this predicate is now an allow-list.
    //
    // `COLUMN` is OPTIONAL in PostgreSQL: `ALTER [COLUMN] col [SET DATA] TYPE ty [USING
    // expr]`. So neither of these carries `ALTER COLUMN` or `ADD CONSTRAINT`, both are valid
    // SQL, and both REWRITE a populated column. A verifier ran the first against a real
    // database: a text column holding '7.9' and '3.2' became an integer column holding 8 and
    // 3, exit 0. The predicate accepted both, under a comment of mine asserting that every
    // destructive `USING` also carries `ALTER COLUMN`. That comment was false.
    //
    // These pass now because the ALTER branch allow-lists its actions: the second action is
    // not an `ADD COLUMN IF NOT EXISTS`, so it is refused for not being on the list — not
    // because a third destructive keyword was remembered.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS newc TEXT, ALTER d TYPE INTEGER USING d::INTEGER')).toBe(false);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS newc TEXT, ALTER d SET DATA TYPE INTEGER USING d::INTEGER')).toBe(false);
    // The same shape without the USING clause, which is just as destructive:
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS newc TEXT, ALTER d TYPE INTEGER')).toBe(false);
  });

  it('positive control: refuses an inline FK, which locks the referenced table', () => {
    // Every value in a freshly added column is NULL, so the constraint validates trivially —
    // but the lock on the referenced table is real, and it is taken while a deploy is mid-way
    // through a warn-only statement loop.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c UUID REFERENCES tenants(id)')).toBe(false);
  });

  it('positive control: the CREATE branch still refuses a hand-typed DROP or TRUNCATE', () => {
    // Neither is reachable from valid `CREATE ...` SQL, so these two operands exist for a
    // different reason: this predicate guards a HAND-MAINTAINED array of statements, and the
    // input it has to survive is what a person might type into it. These are those strings.
    // Without this control the two operands would be untestable, which Amendment 4 forbids.
    expect(isAdditive('CREATE TABLE IF NOT EXISTS zz (id UUID) DROP TABLE tenants')).toBe(false);
    expect(isAdditive('CREATE INDEX IF NOT EXISTS i ON t (c) TRUNCATE tenants')).toBe(false);
  });

  it('the collapse guarantees a non-empty action list, so no length guard is needed', () => {
    // THE PREMISE BEHIND A REMOVED OPERAND. `actions.length > 0` survived deletion, so under
    // Amendment 4 it was either untested or unreachable. It is unreachable — but only because
    // `isAdditive` collapses whitespace before matching. Remove that collapse and
    // `ALTER TABLE t  ADD COLUMN ...` would yield a body starting with a space.
    //
    // Unlike the `USING` removal that preceded it, this rests on two functions in THIS file
    // rather than on my reading of the PostgreSQL grammar — and the premise is asserted here
    // instead of argued in a comment.
    expect(splitActions(' ')).toEqual([]);          // the only input that yields none
    expect(splitActions(',')).toEqual(['']);        // a bare comma yields ONE empty action
    expect(splitActions('x')).toEqual(['x']);

    // And no statement reaching the ALTER branch can present such a body. Derived from the
    // real list plus the shapes the controls use, not hand-asserted on one example.
    const probes = [
      ...PROJECT_LIFECYCLE_STATEMENTS,
      'ALTER TABLE t  ADD COLUMN IF NOT EXISTS c TEXT',
      'ALTER TABLE  t ADD COLUMN IF NOT EXISTS c TEXT',
      'ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT, DROP COLUMN d',
    ];
    let matched = 0;
    for (const sql of probes) {
      const one = sql.trim().toUpperCase().replace(/\s+/g, ' ');
      const m = /^ALTER TABLE (\S+) (.+)$/.exec(one);
      if (m === null) continue;
      matched += 1;
      expect(m[2].startsWith(' ')).toBe(false);
      expect(splitActions(m[2]).length).toBeGreaterThan(0);
    }
    // Non-vacuity: if the regex stopped matching, the loop above would prove nothing.
    expect(matched).toBeGreaterThanOrEqual(3);
  });

  it('splitActions respects paren depth, so a precision is not read as a second action', () => {
    // `NUMERIC(10,2)` carries a comma that is not an action boundary. A plain split would
    // produce `ADD COLUMN IF NOT EXISTS c NUMERIC(10` and `2)` and refuse a legitimate
    // statement — and the real statement list contains `VARCHAR(64)`, so this is on the path.
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c NUMERIC(10,2)')).toBe(true);
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c VARCHAR(64)')).toBe(true);
    // And the boundary still works when a real second action follows a parenthesised type:
    expect(isAdditive('ALTER TABLE t ADD COLUMN IF NOT EXISTS c NUMERIC(10,2), DROP COLUMN d')).toBe(false);
  });

  it('every CREATE TABLE targets one of the new REQUIRED_TABLES, never an existing table', () => {
    // THE REGEX HERE USED TO MATCH NOTHING. It read `CREATE TABLE IF NOT EXISTS \\s+`, with a
    // LITERAL SPACE before the `\\s+`, so it required two spaces and matched 0 of 21
    // statements. Every iteration hit the `continue` and this test executed ZERO assertions
    // while passing. A verifier planted a `CREATE TABLE IF NOT EXISTS tenants (...)` into the
    // DDL and the test named for refusing exactly that passed anyway.
    const created: string[] = [];
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      const m = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i.exec(sql);
      if (m === null) continue;
      created.push(m[1]);
      expect(PRE_EXISTING).not.toContain(m[1]);
      expect(REQUIRED_TABLES).toContain(m[1]);
    }

    // NON-VACUITY GUARD, restored. Without it the loop above proves nothing when the regex
    // stops matching — which is exactly how this test came to assert nothing at all.
    expect(created.length).toBeGreaterThan(0);

    // SET EQUALITY, restored. This is the stronger property and it is the one that was lost:
    // the loop only says every CREATED table is required. This says every REQUIRED table is
    // actually created, so a table declared in the contract but never built fails HERE
    // rather than at boot.
    expect([...created].sort()).toEqual([...REQUIRED_TABLES].sort());
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
    // Same defect as the CREATE test above: `ALTER TABLE \\s+` with a literal space first
    // required two spaces and matched 0 of 21.
    const altered: string[] = [];
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      const m = /ALTER TABLE\s+([a-z_]+)/i.exec(sql);
      if (m === null) continue;
      altered.push(m[1]);
      expect(PRE_EXISTING).not.toContain(m[1]);
      expect(REQUIRED_TABLES).toContain(m[1]);
    }

    // The non-vacuity guard, and the count, in one: there is exactly ONE permitted ALTER, so
    // a loop that found none is broken and a loop that found two is a new exception nobody
    // audited.
    expect(altered).toHaveLength(1);
  });
});
