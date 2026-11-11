import fs from 'fs';
import path from 'path';

/**
 * THE BUG THIS FILE EXISTS FOR, found in production on 2026-11-11.
 *
 * `/admin/live/studio` showed "The class list could not be loaded" for every operator, because
 * `listStudioSessions` threw:
 *
 *     ERROR: operator does not exist: character varying = uuid
 *     ON r.source_type = 'live_session' AND r.source_id = s.id
 *
 * `broadcast_source_refs.source_id` is VARCHAR and `live_sessions.id` is UUID. Postgres will
 * not compare those without a cast.
 *
 * ## Why every test passed anyway
 *
 * Every unit test in this area mocks `sequelize.query`, so the SQL is a string nothing executes.
 * The feature had tests for its refusals, its write path and its contracts, and not one of them
 * could see a type error in a query.
 *
 * ## Why this is a static check and not an integration test
 *
 * An integration test against a real Postgres would be the better answer and is the right
 * follow-up. This is the cheap one that runs in the unit tier and catches the specific class of
 * mistake: a COLUMN-to-COLUMN comparison against `source_id`.
 *
 * Note what is deliberately NOT flagged. `source_id = :sid` is fine and appears in eight other
 * files: a bound parameter arrives untyped and Postgres coerces it. Only a comparison with
 * another typed column fails, which is why this bug appeared in exactly one query out of ten.
 */

const ROOT = path.join(__dirname, '..', '..', '..');

/** Every backend source file, so a new query cannot be added somewhere this does not look. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__') sourceFiles(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

describe('joining broadcast_source_refs to a uuid column', () => {
  /**
   * Every `source_id =` in some SQL, with whatever it is compared against.
   *
   * Written as "find the operator, then read the token after it" rather than as one regex with
   * lookaheads. The first version of this WAS that regex, and `[\w.]*(?!::text)` happily
   * matched `s.i` - one character short, so the lookahead passed and the cast went unseen. A
   * detector that is wrong in the generous direction is the thing this whole file exists to
   * prevent, so it is written to be read instead of to be short.
   */
  function risky(src: string): string[] {
    const out: string[] = [];
    const op = /source_id\s*=\s*/g;
    for (const m of src.matchAll(op)) {
      /**
       * Scoped to THIS table, which the first version was not.
       *
       * `source_id` is a column name on more than one table, and it is a perfectly ordinary
       * JavaScript property name besides. Unscoped, this flagged a plain object assignment in
       * the tenancy service and a backfill script joining a different table's `source_id` to
       * its own matching type - three findings, none of them this bug. A guard whose output
       * has to be triaged by hand is one somebody learns to skip.
       */
      const before = src.slice(Math.max(0, m.index! - 400), m.index!);
      if (!before.includes('broadcast_source_refs')) continue;

      const rest = src.slice(m.index! + m[0].length);
      if (rest.startsWith(':')) continue;                 // bound parameter: Postgres coerces
      const token = /^[A-Za-z_][\w.]*(::\w+)?/.exec(rest);
      if (!token) continue;                               // a literal or an expression
      if (token[1]) continue;                             // already cast
      out.push(token[0]);
    }
    return out;
  }

  it('never compares source_id to an uncast column', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const rhs of risky(src)) {
        offenders.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}: source_id = ${rhs}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('CONTROL: the detector finds the shape it is looking for', () => {
    // Without this, the clean result above could be a detector that matches nothing at all -
    // the exact way a guard passes vacuously forever.
    expect(risky("FROM broadcast_source_refs r ON r.source_id = s.id\n")).toEqual(['s.id']);
  });

  it('CONTROL: it does NOT flag a bound parameter, which is safe', () => {
    expect(risky("WHERE r.source_type = 'live_session' AND r.source_id = :sid\n")).toEqual([]);
  });

  it('CONTROL: it does NOT flag a column that is already cast', () => {
    expect(risky("ON r.source_type = 'live_session' AND r.source_id = s.id::text\n")).toEqual([]);
  });
});
