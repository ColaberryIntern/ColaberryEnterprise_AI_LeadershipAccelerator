/**
 * The post-deploy schema check must FAIL when something is missing — especially an index.
 *
 * The index cases are the reason this suite exists. A missing table surfaces as a 500 the first
 * time anything reads it. A missing unique index surfaces as nothing at all until two approvers
 * click at the same moment and both succeed, which the LC-13 concurrency suite measured against
 * a real Postgres. So "tables all present" is not a green light, and this proves the check knows
 * that.
 */
import {
  verifyProjectLifecycleSchema,
} from '../verifyProjectLifecycleSchema';
import {
  REQUIRED_TABLES, REQUIRED_INDEXES, REQUIRED_CONSTRAINTS, REQUIRED_COLUMNS,
} from '../../db/projectLifecycleSchemaContract';

/**
 * A fake connection that answers the aggregate presence query.
 *
 * `absent` names whatever should report missing. Everything else reports present. The double
 * returns `[rows, metadata]`, the shape sequelize.query actually produces.
 */
function fakeQuery(absent: ReadonlyArray<string> = []) {
  return async (sql: string): Promise<unknown> => {
    // Recover the names the caller asked about from its own aliases, so the double answers the
    // real query rather than a hard-coded reply.
    const pairs = [...sql.matchAll(/bool_or\((?:\w+) = '([^']+)'\) AS (n\d+)/g)];
    const row: Record<string, boolean> = {};
    for (const [, name, alias] of pairs) row[alias] = !absent.includes(name);
    // The COLUMN query asks a two-predicate question, so it needs its own pattern. Keyed on
    // `table.column` to match REQUIRED_COLUMNS. Without this the double answers nothing for
    // that query and every column reports missing — which is a double that lies, not a
    // finding.
    const colRe = /bool_or\(table_name = '([^']+)' AND column_name = '([^']+)'\) AS (n\d+)/g;
    for (const [, t, c, alias] of sql.matchAll(colRe)) {
      row[alias] = !absent.includes(`${t}.${c}`);
    }
    return [[row], {}];
  };
}

describe('a complete schema verifies', () => {
  it('reports ok with every table, index and constraint present', async () => {
    const r = await verifyProjectLifecycleSchema(fakeQuery());
    expect(r.ok).toBe(true);
    expect(r.tablesPresent).toHaveLength(REQUIRED_TABLES.length);
    expect(r.indexesPresent).toHaveLength(REQUIRED_INDEXES.length);
    expect(r.constraintsPresent).toHaveLength(REQUIRED_CONSTRAINTS.length);
    expect(r.tablesMissing).toEqual([]);
    expect(r.indexesMissing).toEqual([]);
    expect(r.constraintsMissing).toEqual([]);
  });

  it('checks a non-trivial number of things, so a pass cannot be vacuous', () => {
    // FLOORS, not exact counts. This test's purpose is that a pass cannot be vacuous, which a
    // floor serves exactly as well — while an exact count breaks on every legitimate schema
    // addition and teaches whoever hits it to update the number without reading why.
    // P3-T3's blueprint_role_map is what tripped the literal 4/5/2 written in Phase 2.
    expect(REQUIRED_TABLES.length).toBeGreaterThanOrEqual(5);
    expect(REQUIRED_INDEXES.length).toBeGreaterThanOrEqual(6);
    expect(REQUIRED_CONSTRAINTS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('a missing TABLE fails and is named', () => {
  it.each(REQUIRED_TABLES)('detects %s missing', async (table) => {
    const r = await verifyProjectLifecycleSchema(fakeQuery([table]));
    expect(r.ok).toBe(false);
    expect(r.tablesMissing).toEqual([table]);
  });
});

describe('a missing COLUMN fails — the case a table-AND-index check would pass', () => {
  it.each(REQUIRED_COLUMNS)(
    'detects %s missing, with every table and index still present',
    async (column) => {
      const r = await verifyProjectLifecycleSchema(fakeQuery([column]));
      expect(r.ok).toBe(false);
      expect(r.columnsMissing).toEqual([column]);
      // THE STATE THIS CATEGORY EXISTS FOR. `refs_sha256` arrives by ALTER, and
      // `ensureProjectLifecycleSchema` logs a warning and carries on when a statement fails.
      // So the table is present, both indexes are present, and the manifest writer fails at
      // runtime. The three older categories cannot see it.
      expect(r.tablesMissing).toEqual([]);
      expect(r.indexesMissing).toEqual([]);
    },
  );

  it('PASSING COUNTERPART: nothing absent means no column is reported missing', async () => {
    // Without this, the above would hold against a check that reports every column missing.
    const r = await verifyProjectLifecycleSchema(fakeQuery());
    expect(r.columnsMissing).toEqual([]);
    expect(r.columnsPresent).toEqual([...REQUIRED_COLUMNS]);
  });
});

describe('a missing INDEX fails — the case a table-only check would pass', () => {
  it.each(REQUIRED_INDEXES)('detects %s missing', async (index) => {
    const r = await verifyProjectLifecycleSchema(fakeQuery([index]));
    expect(r.ok).toBe(false);
    expect(r.indexesMissing).toEqual([index]);
    // Every table still present: this is precisely the state that looks healthy and is not.
    expect(r.tablesMissing).toEqual([]);
  });

  it('fails on the approval index specifically, which is the LC-13 backstop', async () => {
    // Dropping this one was measured to let two concurrent approvals write two rows.
    const r = await verifyProjectLifecycleSchema(fakeQuery(['uq_blueprint_approval_revision']));
    expect(r.ok).toBe(false);
    expect(r.indexesMissing).toContain('uq_blueprint_approval_revision');
  });
});

describe('a missing CHECK constraint fails', () => {
  it.each(REQUIRED_CONSTRAINTS)('detects %s missing', async (constraint) => {
    const r = await verifyProjectLifecycleSchema(fakeQuery([constraint]));
    expect(r.ok).toBe(false);
    expect(r.constraintsMissing).toEqual([constraint]);
  });
});

describe('a check that cannot run is a FAILURE, not a pass', () => {
  it('reports failure with the reason when introspection throws', async () => {
    const throwing = async () => { throw new Error('connection refused'); };
    const r = await verifyProjectLifecycleSchema(throwing);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/connection refused/);
  });

  it('does not report partial success from a half-answered query', async () => {
    // A connection that answers the tables query then dies must not leave ok true.
    let calls = 0;
    const flaky = async (sql: string) => {
      calls++;
      if (calls === 1) return fakeQuery()(sql);
      throw new Error('connection dropped mid-check');
    };
    const r = await verifyProjectLifecycleSchema(flaky);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/dropped/);
  });
});

describe('everything missing', () => {
  it('names every gap rather than stopping at the first', async () => {
    const all = [...REQUIRED_TABLES, ...REQUIRED_INDEXES, ...REQUIRED_CONSTRAINTS];
    const r = await verifyProjectLifecycleSchema(fakeQuery(all));
    expect(r.ok).toBe(false);
    expect(r.tablesMissing).toHaveLength(REQUIRED_TABLES.length);
    expect(r.indexesMissing).toHaveLength(REQUIRED_INDEXES.length);
    expect(r.constraintsMissing).toHaveLength(REQUIRED_CONSTRAINTS.length);
  });
});

describe('POSITIVE CONTROL: the double itself is answering the real query', () => {
  it('derives its answer from the SQL rather than returning a canned reply', async () => {
    // If the double ignored the SQL, the per-name "missing" cases above would all pass
    // regardless of what the implementation asked for — the check would be testing nothing.
    const seen: string[] = [];
    const spy = async (sql: string) => { seen.push(sql); return fakeQuery()(sql); };
    await verifyProjectLifecycleSchema(spy);
    expect(seen).toHaveLength(4); // tables, indexes, constraints, columns
    expect(seen[0]).toContain('information_schema.tables');
    expect(seen[1]).toContain('pg_indexes');
    expect(seen[2]).toContain('information_schema.table_constraints');
    expect(seen[3]).toContain('information_schema.columns');
    // And every required name appears in the SQL actually issued.
    for (const t of REQUIRED_TABLES) expect(seen[0]).toContain(t);
    for (const n of REQUIRED_INDEXES) expect(seen[1]).toContain(n);
    for (const c of REQUIRED_CONSTRAINTS) expect(seen[2]).toContain(c);
  });

  it('uses the bool_or aliased single-row form, not a bare single-column select', () => {
    // A bare `SELECT indexname` returns RAW ARRAYS from this app's sequelize, which is the bug
    // that once logged a bogus invariant violation on every boot.
    const seen: string[] = [];
    const spy = async (sql: string) => { seen.push(sql); return fakeQuery()(sql); };
    return verifyProjectLifecycleSchema(spy).then(() => {
      for (const sql of seen) {
        expect(sql).toMatch(/bool_or\(/);
        expect(sql).toMatch(/ AS n\d+/);
      }
    });
  });
});
