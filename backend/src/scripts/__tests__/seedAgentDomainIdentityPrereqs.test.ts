// Tests for T02's production data prerequisites (run 20261007-school-agent-factory).
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT OPTIONAL
//
// T02's acceptance criteria say, in words, "a test asserts no admin_users row is created" and
// "a test enumerates the declared write-set". An independent task verifier scored T02 **0 on
// evidence** and failed it because those two sentences named a test that had never been written --
// in a build whose entire subject is not claiming protections it does not have. This file is that
// test.
//
// It also pins the thing that makes the production write safe to repeat: `uuid5` is a hand-rolled
// SHA-1 construction with manual version/variant bit manipulation, and its determinism is the ONLY
// reason a second `--apply` cannot insert a duplicate `program_blueprints` row (that table's `id`
// carries no database default, unlike `org_members.id`). Both ids below are live in production.
//
// Every assertion here carries a positive or negative control, because an assertion that cannot
// fail is not a check.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prereqs = require('../seedAgentDomainIdentityPrereqs');

const {
  DECLARED_WRITE_SET,
  COLABERRY_ORG_ID,
  DHEE_ORG_MEMBER_ID,
  BLUEPRINT_ID,
  SQL_ORG_MEMBER,
  SQL_BLUEPRINT,
  uuid5,
} = prereqs;

/**
 * The two statements the script WRITES with. Deliberately not called "the statements it executes":
 * `main()` issues FOUR queries in apply mode -- a before-SELECT, these two INSERTs, and an
 * after-SELECT -- and that after-SELECT *does* read `admin_users`, on purpose, to prove no row was
 * created there. A verifier caught the earlier wording claiming otherwise, which was the same genus
 * of defect as the five self-descriptions this file was written to correct.
 */
const WRITING_SQL: string[] = [SQL_ORG_MEMBER, SQL_BLUEPRINT];

function readModuleSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  return fs.readFileSync(path.join(__dirname, '..', 'seedAgentDomainIdentityPrereqs.js'), 'utf8');
}

/** Pull every `INSERT INTO <schema.>table` target out of a SQL string. */
function insertTargets(sql: string): string[] {
  const out: string[] = [];
  const re = /INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push(m[1].toLowerCase());
  return out;
}

describe('T02 write-set is enumerated, and matches what the SQL actually touches', () => {
  it('every INSERT target is in DECLARED_WRITE_SET, and every declared table is inserted into', () => {
    const targets = new Set(WRITING_SQL.flatMap(insertTargets));
    const declared = new Set<string>(DECLARED_WRITE_SET);

    // Both directions. A one-way check would pass a script that declared a table it never wrote,
    // or wrote a table it never declared.
    expect([...targets].sort()).toEqual([...declared].sort());
    expect(declared.size).toBe(2);
  });

  it('POSITIVE CONTROL: a third INSERT target breaks set-equality', () => {
    const rogue = `${SQL_ORG_MEMBER}\nINSERT INTO public.admin_users (id) VALUES ($1);`;
    const targets = new Set([...insertTargets(rogue), ...insertTargets(SQL_BLUEPRINT)]);
    expect([...targets].sort()).not.toEqual([...new Set<string>(DECLARED_WRITE_SET)].sort());
    expect(targets.has('admin_users')).toBe(true);
  });

  it('the extractor really can find a target, so an empty result would be a bug not a pass', () => {
    expect(insertTargets('INSERT INTO public.widgets (id) VALUES (1)')).toEqual(['widgets']);
    expect(insertTargets('SELECT 1')).toEqual([]);
  });
});

describe('T02 grants nothing', () => {
  it('neither WRITING statement touches admin_users (the read-only after-SELECT deliberately does)', () => {
    for (const sql of WRITING_SQL) {
      expect(/admin_users/i.test(sql)).toBe(false);
    }
  });

  it('neither writing statement carries a mutating verb other than INSERT', () => {
    for (const sql of WRITING_SQL) {
      expect(/\bUPDATE\b/i.test(sql)).toBe(false);
      expect(/\bDELETE\b/i.test(sql)).toBe(false);
      expect(/\bALTER\b/i.test(sql)).toBe(false);
      expect(/\bDROP\b/i.test(sql)).toBe(false);
      expect(/\bTRUNCATE\b/i.test(sql)).toBe(false);
      expect(/\bGRANT\b/i.test(sql)).toBe(false);
    }
  });

  it('POSITIVE CONTROL: the verb sweep catches a planted admin_users UPDATE', () => {
    const planted = "UPDATE public.admin_users SET role = 'super_admin' WHERE id = $1;";
    expect(/\bUPDATE\b/i.test(planted)).toBe(true);
    expect(/admin_users/i.test(planted)).toBe(true);
  });

  it('the org_members insert writes role member, never manager', () => {
    // OrgMemberRole permits exactly 'manager' | 'member'. This row takes the lower one.
    expect(SQL_ORG_MEMBER).toContain("'member'");
    expect(SQL_ORG_MEMBER).not.toContain("'manager'");
  });

  it('neither writing statement writes an enrollment, a project, or an agent', () => {
    for (const sql of WRITING_SQL) {
      expect(/\bactive_project_id\b/i.test(sql)).toBe(false);
      expect(/INSERT\s+INTO\s+(?:public\.)?(enrollments|projects|ai_agents)\b/i.test(sql)).toBe(false);
    }
  });
});

describe('no write can escape the enumeration by being inlined in main()', () => {
  // The write-set tests above read the two EXPORTED constants. A future
  // `client.query('INSERT INTO admin_users ...')` written inline inside main() would not appear in
  // either constant and would pass them. So assert against the module's own source text too.
  const source = readModuleSource();

  it('every INSERT INTO in the module appears inside one of the two exported constants', () => {
    const inSource = [...source.matchAll(/INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
      .map((m) => m[1].toLowerCase());
    expect(inSource.length).toBeGreaterThan(0); // the sweep can find something
    for (const table of inSource) expect(DECLARED_WRITE_SET).toContain(table);
  });

  it('the module issues no UPDATE or DELETE through the driver', () => {
    // DELETE appears only inside the printed rollback instruction strings, never in a query call.
    const queryCalls = [...source.matchAll(/client\.query\(\s*([A-Z_`][^,)]*)/g)].map((m) => m[1]);
    expect(queryCalls.length).toBeGreaterThanOrEqual(4); // before, 2 inserts, after
    expect(/client\.query\(\s*`?\s*(UPDATE|DELETE)\b/i.test(source)).toBe(false);
  });

  it('POSITIVE CONTROL: the source sweep would catch an inlined admin_users insert', () => {
    const planted = "await client.query('INSERT INTO public.admin_users (id) VALUES ($1)', [x]);";
    const found = [...planted.matchAll(/INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
      .map((m) => m[1].toLowerCase());
    expect(found).toContain('admin_users');
    expect(DECLARED_WRITE_SET).not.toContain('admin_users');
  });
});

describe('T02 ids are derived, so a re-run cannot duplicate a row', () => {
  it('both ids match the rows that are live in production', () => {
    // Measured in accelerator_prod 2026-10-08. If a refactor changes the derivation, these fail
    // and the production rows become unreachable by re-derivation -- which is the whole risk.
    expect(DHEE_ORG_MEMBER_ID).toBe('bbf01827-c005-5cb2-8a96-903fe8ddadac');
    expect(BLUEPRINT_ID).toBe('8660090e-1f6f-51cf-ae46-483bfa8903c5');
  });

  it('the ids are RE-DERIVED from their names rather than hardcoded', () => {
    expect(uuid5('program_blueprint:internal_ai_employee_operations')).toBe(BLUEPRINT_ID);
    expect(uuid5(`org_member:${COLABERRY_ORG_ID}:dhee@colaberry.com`)).toBe(DHEE_ORG_MEMBER_ID);
  });

  it('NEGATIVE CONTROL: one character off yields a different id', () => {
    // Without this, the two assertions above would also pass if uuid5 returned a constant.
    const off = uuid5('program_blueprint:internal_ai_employee_operation'); // trailing s dropped
    expect(off).not.toBe(BLUEPRINT_ID);
    expect(off).toBe('88d04990-d32b-58b0-9fdb-08885f180111');
  });

  it('uuid5 is deterministic across calls and sets the version and variant bits', () => {
    expect(uuid5('x')).toBe(uuid5('x'));
    // version 5 nibble, and the RFC-4122 variant
    expect(BLUEPRINT_ID[14]).toBe('5');
    expect(DHEE_ORG_MEMBER_ID[14]).toBe('5');
    expect(['8', '9', 'a', 'b']).toContain(BLUEPRINT_ID[19]);
    expect(['8', '9', 'a', 'b']).toContain(DHEE_ORG_MEMBER_ID[19]);
  });

  it('a different namespace yields a different id, so the namespace is load-bearing', () => {
    const other = uuid5('program_blueprint:internal_ai_employee_operations', '00000000-0000-0000-0000-000000000000');
    expect(other).not.toBe(BLUEPRINT_ID);
  });
});

describe('T02 statements are replay-safe', () => {
  it('both inserts carry ON CONFLICT ... DO NOTHING', () => {
    for (const sql of WRITING_SQL) {
      expect(/ON\s+CONFLICT[^;]*DO\s+NOTHING/i.test(sql)).toBe(true);
    }
  });

  it('the org_members conflict target is the real unique index (org_id, email)', () => {
    // Production carries org_members_org_email_unique UNIQUE btree (org_id, email). A conflict
    // target that is not a real unique index raises at runtime rather than deduplicating.
    expect(/ON\s+CONFLICT\s*\(\s*org_id\s*,\s*email\s*\)/i.test(SQL_ORG_MEMBER)).toBe(true);
  });

  it('the blueprint conflict target is the primary key, because that id has no DB default', () => {
    expect(/ON\s+CONFLICT\s*\(\s*id\s*\)/i.test(SQL_BLUEPRINT)).toBe(true);
  });

  it('POSITIVE CONTROL: the conflict sweep rejects a bare INSERT', () => {
    const bare = 'INSERT INTO public.org_members (id) VALUES ($1);';
    expect(/ON\s+CONFLICT[^;]*DO\s+NOTHING/i.test(bare)).toBe(false);
  });
});

describe('T02 module is importable without side effects', () => {
  it('requiring the module neither connects to a database nor runs main', () => {
    // The require at the top of this file already proves it: a `main()` at import time would have
    // thrown on a missing DATABASE_URL before any test ran. 99 sibling scripts use the same guard (measured; an earlier note said 81, which conflated it with the ensure*Schema count).
    expect(typeof prereqs.main).toBe('function');
    expect(Object.isFrozen(DECLARED_WRITE_SET)).toBe(true);
  });

  it('the org of record is the measured Colaberry org, not one of the two single-member ones', () => {
    expect(COLABERRY_ORG_ID).toBe('acdfa378-3613-4e6f-850f-1bbfb9d3e789');
  });
});
