/**
 * The project-lifecycle schema must be purely ADDITIVE, and its two load-bearing invariants —
 * the exactly-one-project CHECK and the UNIQUE revision backstop — must actually be in the DDL.
 *
 * Asserted against the real statement list so a future edit that sneaks in an ALTER of an
 * existing table, or quietly drops the unique index the approval CAS depends on, fails here.
 *
 * Every assertion below is paired with a POSITIVE CONTROL that feeds it a deliberately-bad
 * input and proves the assertion rejects it. A schema check that cannot fail is not a check,
 * and this repo has already been bitten by one that passed because it was scanning nothing.
 */
// Hoisted above the imports by jest, which is the only place a module mock works. Both exports
// of config/database are declared: a mock factory that enumerates exports silently deletes every
// one it omits, and `connectDatabase` is the other. The module under test imports only
// `sequelize`, so this mock is complete for it and nothing real connects to a database.
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
  connectDatabase: jest.fn(),
}));

import { sequelize } from '../../config/database';
import {
  PROJECT_LIFECYCLE_STATEMENTS,
  REQUIRED_TABLES,
  assertProjectLifecycleSchema,
} from '../ensureProjectLifecycleSchema';

const queryMock = sequelize.query as unknown as jest.Mock;

// Tables that already exist at base and may therefore be referenced but never altered.
const PRE_EXISTING = ['tenants', 'projects', 'delivery_projects'];

/** The additive predicate, extracted so the positive control can exercise the same code path. */
function isAdditive(sql: string): boolean {
  const s = sql.trim().toUpperCase();
  const startsRight =
    s.startsWith('CREATE TABLE IF NOT EXISTS') ||
    s.startsWith('CREATE INDEX IF NOT EXISTS') ||
    s.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS');
  return startsRight && !/\bALTER\s+TABLE\b/.test(s) && !/\bDROP\b/.test(s) && !/\bTRUNCATE\b/.test(s);
}

describe('ensureProjectLifecycleSchema is additive-only', () => {
  it('finds a non-trivial statement list, so the sweep cannot pass by scanning nothing', () => {
    expect(PROJECT_LIFECYCLE_STATEMENTS.length).toBeGreaterThanOrEqual(10);
    expect(REQUIRED_TABLES.length).toBeGreaterThanOrEqual(5);
  });

  it('every statement is CREATE ... IF NOT EXISTS (no ALTER, no DROP, no TRUNCATE)', () => {
    for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
      expect(isAdditive(sql)).toBe(true);
    }
  });

  it('positive control: the additive predicate rejects a destructive statement', () => {
    expect(isAdditive('ALTER TABLE projects ADD COLUMN stage TEXT')).toBe(false);
    expect(isAdditive('DROP TABLE project_lifecycle_states')).toBe(false);
    expect(isAdditive('CREATE TABLE project_lifecycle_states (id UUID)')).toBe(false); // missing IF NOT EXISTS
    expect(isAdditive('TRUNCATE project_lifecycle_states')).toBe(false);
  });

  it('every CREATE TABLE targets one of the new REQUIRED_TABLES, never an existing table', () => {
    const created = PROJECT_LIFECYCLE_STATEMENTS
      .map((s) => s.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i)?.[1])
      .filter(Boolean) as string[];
    expect(created.sort()).toEqual([...REQUIRED_TABLES].sort());
    for (const t of created) expect(PRE_EXISTING).not.toContain(t);
  });

  it('foreign keys reference only pre-existing tables or this schema\'s own new tables', () => {
    const refs = PROJECT_LIFECYCLE_STATEMENTS
      .join('\n')
      .match(/REFERENCES\s+(\w+)\s*\(/gi)
      ?.map((r) => r.replace(/REFERENCES\s+/i, '').replace(/\s*\(/, '').trim()) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    const allowed = [...PRE_EXISTING, ...REQUIRED_TABLES];
    for (const t of refs) expect(allowed).toContain(t);
  });
});

describe('the two identity tables stay separate, as a database invariant', () => {
  const joined = PROJECT_LIFECYCLE_STATEMENTS.join('\n');

  it('both the lifecycle state and the manifest CHECK that exactly one project FK is set', () => {
    expect(joined).toMatch(/CONSTRAINT\s+ck_lifecycle_exactly_one_project\s+CHECK/i);
    expect(joined).toMatch(/CONSTRAINT\s+ck_manifest_exactly_one_project\s+CHECK/i);
    // Both arms of each CHECK must be present, or it would permit neither-or-both.
    const checks = joined.match(/CHECK \([\s\S]*?\)\s*\n\s*\)/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(2);
  });

  it('carries a nullable FK to each project table, neither of them NOT NULL', () => {
    expect(joined).toMatch(/student_project_id\s+UUID\s+REFERENCES\s+projects\(id\)/i);
    expect(joined).toMatch(/delivery_project_id\s+UUID\s+REFERENCES\s+delivery_projects\(id\)/i);
    // A NOT NULL on either would make the other arm of the CHECK unsatisfiable.
    expect(joined).not.toMatch(/student_project_id\s+UUID\s+NOT NULL/i);
    expect(joined).not.toMatch(/delivery_project_id\s+UUID\s+NOT NULL/i);
  });

  it('scopes every table to a tenant, so no row can exist outside a tenant', () => {
    const tables = PROJECT_LIFECYCLE_STATEMENTS.filter((s) => /CREATE TABLE/i.test(s));
    // Derived, not hardcoded: this cross-checks the STATEMENTS against the DECLARED list, so
    // adding a table to one without the other fails here. A literal 4 drifted the moment
    // P3-T3 added blueprint_role_map, and the count is not the property under test anyway.
    expect(tables.length).toBe(REQUIRED_TABLES.length);
    for (const t of tables) {
      expect(t).toMatch(/tenant_id\s+UUID\s+NOT NULL\s+REFERENCES\s+tenants\(id\)/i);
    }
  });
});

describe('the invariants the approval ladder depends on', () => {
  const joined = PROJECT_LIFECYCLE_STATEMENTS.join('\n');

  it('declares the UNIQUE revision backstop for BOTH project kinds', () => {
    // This index is what actually makes a concurrent double-approval impossible; the
    // application-level CAS is a read-then-compare and cannot do it alone.
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_manifest_revision_student/i);
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_manifest_revision_delivery/i);
    expect(joined).toMatch(/\(tenant_id,\s*student_project_id,\s*revision\)/i);
    expect(joined).toMatch(/\(tenant_id,\s*delivery_project_id,\s*revision\)/i);
  });

  it('declares proposed_by on the manifest, so separation of duty is not vacuous', () => {
    // Without a proposer there is nothing to compare the approver against, and the SoD check
    // would short-circuit on a null and pass silently on every row.
    expect(joined).toMatch(/proposed_by\s+TEXT/i);
  });

  it('makes an approval of a given revision happen at most once', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_approval_revision/i);
    expect(joined).toMatch(/\(manifest_id,\s*revision\)/i);
  });

  it('binds an approval to an actor, a role, a revision and a content hash', () => {
    const approvals = PROJECT_LIFECYCLE_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS blueprint_approvals/i.test(s))!;
    expect(approvals).toMatch(/approved_by\s+TEXT\s+NOT NULL/i);
    expect(approvals).toMatch(/approved_by_role\s+TEXT/i);
    expect(approvals).toMatch(/revision\s+INTEGER\s+NOT NULL/i);
    expect(approvals).toMatch(/content_sha256\s+VARCHAR\(64\)\s+NOT NULL/i);
  });

  it('keeps condition separate from stage, so the resume point is never lost', () => {
    const states = PROJECT_LIFECYCLE_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS project_lifecycle_states/i.test(s))!;
    expect(states).toMatch(/stage\s+TEXT\s+NOT NULL\s+DEFAULT\s+'discovery'/i);
    expect(states).toMatch(/\bcondition\s+TEXT\b/i);
    // condition must NOT be NOT NULL: most of a project's life has no condition.
    expect(states).not.toMatch(/condition\s+TEXT\s+NOT NULL/i);
  });

  it('gives the old->new role map a table of its own, keyed to a manifest revision', () => {
    // Its own table rather than a JSONB column on the manifest: a role map is read per row
    // ("what happened to MY job"), and a durable fact inside a JSONB blob is how unrelated keys
    // get erased by the next whole-object write.
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS blueprint_role_map/i);
    expect(joined).toMatch(/manifest_id\s+UUID\s+NOT NULL\s+REFERENCES\s+operating_blueprint_manifests\(id\)/i);
    // Three explicit regex literals rather than a template-literal RegExp. The template
    // version read '${col}\s+TEXT' and a collapsed escape turned \s into a literal
    // "s", so it matched nothing while looking entirely correct.
    expect(joined).toMatch(/previous_function\s+TEXT\s+NOT NULL/i);
    expect(joined).toMatch(/ai_contribution\s+TEXT\s+NOT NULL/i);
    expect(joined).toMatch(/new_role_id\s+TEXT\s+NOT NULL/i);
  });

  it('makes the role map a MAP: one row per (manifest, previous_function)', () => {
    // Without this index the same displaced function can appear twice under different new roles.
    // Two answers to "what happened to this job" is worse than none, because a reviewer reads
    // whichever row the query returned first.
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_role_map_manifest_function/i);
    expect(joined).toMatch(/ON blueprint_role_map \(tenant_id, manifest_id, previous_function\)/i);
  });

  it('keeps retained_responsibilities an ARRAY at the database level', () => {
    // JSONB to match refs_json/measures_json, but a bare string must not be storable where a
    // list is read, so the shape is a CHECK rather than a convention.
    expect(joined).toMatch(/CONSTRAINT ck_role_map_retained_is_array CHECK/i);
    expect(joined).toMatch(/jsonb_typeof\(retained_responsibilities\) = 'array'/i);
  });

  it('POSITIVE CONTROL: the role-map assertions are not satisfied by any other table', () => {
    // Proves the three assertions above are actually reading the new table's statement and not
    // matching text that happens to exist elsewhere in the set.
    const others = PROJECT_LIFECYCLE_STATEMENTS
      .filter((sql) => !/blueprint_role_map/i.test(sql))
      .join(' ');
    expect(others).not.toMatch(/uq_role_map_manifest_function/i);
    expect(others).not.toMatch(/ck_role_map_retained_is_array/i);
    expect(others).not.toMatch(/retained_responsibilities/i);
  });
  it('binds a design decision to a manifest AND records the hash it was taken against', () => {
    // The hash is RECORDED, not acted on: nothing in production writes `manifest.refs_json`
    // and no material-vs-cosmetic classifier exists, so approval invalidation is deferred with
    // its three parts named in the register. Storing the hash now is what makes the later
    // classifier possible without a backfill.
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS blueprint_design_decisions/i);
    expect(joined).toMatch(/manifest_id\s+UUID\s+NOT NULL\s+REFERENCES\s+operating_blueprint_manifests\(id\)/i);
    expect(joined).toMatch(/manifest_content_hash\s+TEXT\s+NOT NULL/i);
  });

  it('keeps supersession possible: a self-FK, and the approved index is PARTIAL', () => {
    // `deliveryDesignLoop` is built on "supersession, never silent overwrite", so many rows
    // per tier over time is CORRECT. A full unique index on (tenant, manifest, tier) would
    // forbid that; no index at all would let two rows both claim to be what was agreed. The
    // WHERE clause is the whole distinction, which is why it is asserted separately.
    expect(joined).toMatch(/supersedes_decision_id\s+UUID\s+REFERENCES\s+blueprint_design_decisions\(id\)/i);
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_design_decision_approved_tier/i);
    expect(joined).toMatch(/WHERE status = 'approved'/i);
  });

  it('makes a visual-contract revision resolve to exactly one row', () => {
    // 4.5 requires the approval record to reference the selected variant AND the contract
    // revision. A reference that can resolve to two rows is not a reference: Gate 9 would
    // compare an implementation against whichever row came back first.
    expect(joined).toMatch(/CREATE TABLE IF NOT EXISTS blueprint_visual_contracts/i);
    expect(joined).toMatch(/revision\s+INTEGER\s+NOT NULL/i);
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_visual_contract_decision_revision/i);
    expect(joined).toMatch(/ON blueprint_visual_contracts \(tenant_id, decision_id, revision\)/i);
  });

  it('bounds acceptable_variance to a fraction, because an unbounded one gates nothing', () => {
    // Outside 0..1 the visual diff passes every screen or fails every screen depending on
    // which default someone picked — the same refusal `validateVisualContract` makes in
    // memory. Defence in depth for a value whose corruption is silent.
    expect(joined).toMatch(/CONSTRAINT ck_visual_contract_variance_fraction CHECK/i);
    expect(joined).toMatch(/acceptable_variance >= 0 AND acceptable_variance <= 1/i);
    expect(joined).toMatch(/CONSTRAINT ck_visual_contract_regions_is_array CHECK/i);
  });

  it('does NOT constrain tier or status in DDL, so the vocabulary has one definition', () => {
    // An absence asserted on purpose. `DesignTier` and `DesignDecisionStatus` are closed
    // unions in `deliveryDesignLoop`; an IN (...) list here would be a SECOND definition that
    // a future change to the union would silently disagree with. Same for an upper bound on
    // variant_count, where MAX_VARIANTS already lives in exactly one place.
    const decisions = PROJECT_LIFECYCLE_STATEMENTS
      .filter((sql) => /blueprint_design_decisions/i.test(sql))
      .join(' ');
    expect(decisions).not.toMatch(/tier\s+TEXT[^,]*CHECK/i);
    expect(decisions).not.toMatch(/status\s+TEXT[^,]*CHECK/i);
    expect(decisions).not.toMatch(/variant_count[^,]*<=/i);
    // and the control that this filter found the statements at all
    expect(decisions).toMatch(/CREATE TABLE IF NOT EXISTS blueprint_design_decisions/i);
  });

  it('POSITIVE CONTROL: the design assertions are not satisfied by any other table', () => {
    const others = PROJECT_LIFECYCLE_STATEMENTS
      .filter((sql) => !/blueprint_design_decisions|blueprint_visual_contracts/i.test(sql))
      .join(' ');
    expect(others).not.toMatch(/manifest_content_hash/i);
    expect(others).not.toMatch(/uq_design_decision_approved_tier/i);
    expect(others).not.toMatch(/uq_visual_contract_decision_revision/i);
    expect(others).not.toMatch(/ck_visual_contract_variance_fraction/i);
  });

  it('gives exhausted retries somewhere to land', () => {
    const dl = PROJECT_LIFECYCLE_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS lifecycle_stage_failures/i.test(s))!;
    expect(dl).toMatch(/attempts\s+INTEGER\s+NOT NULL/i);
    expect(dl).toMatch(/error_class\s+TEXT/i);
    expect(dl).toMatch(/context_json\s+JSONB/i);
  });
});

describe('assertProjectLifecycleSchema checks tables, indexes AND constraints', () => {
  /**
   * The assert issues THREE queries now, so the double answers whichever it is handed by
   * recovering the aliases from the SQL itself. A single canned reply would answer the tables
   * query and leave the index aliases undefined — which is exactly how the first version of this
   * test broke when index checking was added, and why deriving the answer is better than fixing
   * three hard-coded responses in order.
   */
  function answerFrom(sql: string, absent: ReadonlyArray<string>): Record<string, boolean> {
    const row: Record<string, boolean> = {};
    for (const [, name, alias] of sql.matchAll(/bool_or\((?:\w+) = '([^']+)'\) AS (\w+)/g)) {
      row[alias] = !absent.includes(name);
    }
    return row;
  }
  function answerAll(absent: ReadonlyArray<string> = []) {
    queryMock.mockImplementation(async (sql: string) => [[answerFrom(String(sql), absent)]]);
  }

  beforeEach(() => {
    queryMock.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('returns true when every table, index and constraint reports present', async () => {
    answerAll();
    await expect(assertProjectLifecycleSchema()).resolves.toBe(true);
    // Three queries, not one: tables, indexes, constraints.
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it('POSITIVE CONTROL: returns false and names the table when one is absent', async () => {
    answerAll([REQUIRED_TABLES[2]]);
    const errSpy = jest.spyOn(console, 'error');
    await expect(assertProjectLifecycleSchema()).resolves.toBe(false);
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(REQUIRED_TABLES[2]);
    expect(logged).toContain('project_lifecycle_schema_invariant_violated');
  });

  it('returns false and names the INDEX when one is absent — tables alone are not a green light', async () => {
    // A missing unique index does not surface as an error. It surfaces as two approved rows for
    // one revision, which the LC-13 concurrency suite measured against a real Postgres.
    answerAll(['uq_blueprint_approval_revision']);
    const errSpy = jest.spyOn(console, 'error');
    await expect(assertProjectLifecycleSchema()).resolves.toBe(false);
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('uq_blueprint_approval_revision');
    expect(logged).toContain('correctness guarantee');
  });

  it('returns false and names the CHECK constraint when one is absent', async () => {
    answerAll(['ck_manifest_exactly_one_project']);
    const errSpy = jest.spyOn(console, 'error');
    await expect(assertProjectLifecycleSchema()).resolves.toBe(false);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('ck_manifest_exactly_one_project');
  });

  it('returns false when introspection itself throws, rather than reporting success', async () => {
    queryMock.mockRejectedValue(new Error('connection refused'));
    await expect(assertProjectLifecycleSchema()).resolves.toBe(false);
  });

  it('asks for one bool_or alias per required name, across all three queries', async () => {
    answerAll();
    await assertProjectLifecycleSchema();
    const sqls = queryMock.mock.calls.map((c) => String(c[0]));
    REQUIRED_TABLES.forEach((t, i) => expect(sqls[0]).toContain(`bool_or(table_name = '${t}') AS t${i}`));
    expect(sqls[0]).toContain("table_schema = 'public'");
    expect(sqls[1]).toContain('pg_indexes');
    expect(sqls[2]).toContain('table_constraints');
  });
});
