/**
 * P2-T7 — prove the lifecycle schema actually landed, in the environment it landed in.
 *
 * WHY THIS IS A SCRIPT AND NOT A CHECKLIST ITEM. The DDL in `ensureProjectLifecycleSchema` runs
 * at backend boot in a loop that only `console.warn`s on failure — it never throws, so a failed
 * migration does not crash the process. That is deliberate (a boot that dies on a DDL hiccup is
 * worse), but it means **a failed migration is silent**. The paired assert logs loudly at boot,
 * and this script is how you confirm that from outside, after the fact, on demand.
 *
 * WHY IT IS A PHASE 3 PRECONDITION. The schema is not dark. A boot-registered `ensure*Schema`
 * executes on the next backend deploy by ANY session, regardless of `ENABLE_PROJECT_LIFECYCLE` —
 * the point `server.ts` already makes about `ensureCertPrepSchema`. So the tables arrive in
 * production before anything is activated, and Phase 3 builds on them. If this script fails,
 * Phase 2 is unfinished and Phase 3 does not begin.
 *
 * IT CHECKS INDEXES, NOT JUST TABLES. The LC-13 concurrency suite measured, against a real
 * Postgres, that dropping `uq_blueprint_approval_revision` lets two concurrent approvals of the
 * same revision write TWO rows. The application-level CAS is a read-then-compare and does not
 * close the race alone. A table-only check would therefore report a healthy schema over a
 * reopened production incident.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 * Read-only: it issues SELECTs against `information_schema` and `pg_indexes` and writes nothing.
 * Safe to run against production, which is the point.
 *
 *   # on the backend container, after the deploy that carries this code:
 *   npx ts-node src/scripts/verifyProjectLifecycleSchema.ts
 *
 * Exits 0 when every table, index and constraint is present; 1 otherwise, naming each gap.
 * Prints one structured JSON line so the result can be captured in a deploy log verbatim.
 */
import {
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  REQUIRED_CONSTRAINTS,
  REQUIRED_COLUMNS,
} from '../db/projectLifecycleSchemaContract';

interface VerifyResult {
  ok: boolean;
  tablesPresent: string[];
  tablesMissing: string[];
  indexesPresent: string[];
  indexesMissing: string[];
  constraintsPresent: string[];
  constraintsMissing: string[];
  /** `table.column`. Added by P5-T1.3 — see REQUIRED_COLUMNS for why it is its own category. */
  columnsPresent: string[];
  columnsMissing: string[];
  error?: string;
}

/**
 * Query what actually exists. Exported so a test can drive it with a doubled connection rather
 * than needing a database — the same reason the rest of this subsystem injects its dependencies.
 */
export async function verifyProjectLifecycleSchema(
  query: (sql: string) => Promise<unknown>,
): Promise<VerifyResult> {
  const result: VerifyResult = {
    ok: false,
    tablesPresent: [], tablesMissing: [],
    indexesPresent: [], indexesMissing: [],
    constraintsPresent: [], constraintsMissing: [],
    columnsPresent: [], columnsMissing: [],
  };

  /**
   * Read one aggregate row keyed by alias.
   *
   * The `bool_or(... ) AS n0` shape is not stylistic: this app's `sequelize.query` returns a
   * single-column SELECT as RAW ARRAYS rather than `{ column }` objects, so a membership filter
   * over `SELECT indexname` reports everything missing while it demonstrably exists. That bug
   * logged a bogus invariant violation on every boot once already; the aliased single row
   * sidesteps it. All names interpolated here are fixed constants, so this is not injectable.
   */
  async function presence(names: ReadonlyArray<string>, column: string, from: string): Promise<boolean[]> {
    const selects = names.map((n, i) => `bool_or(${column} = '${n}') AS n${i}`).join(', ');
    const rows = (await query(`SELECT ${selects} FROM ${from}`)) as any;
    // sequelize.query returns [rows, metadata]; a raw driver may return rows directly.
    const list = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    const row = ((list as any[]) || [])[0] || {};
    return names.map((_, i) => row[`n${i}`] === true);
  }

  /**
   * The same aggregate read, for a TWO-predicate question: a column is identified by its
   * table as well as its name, so `bool_or(column_name = ...)` alone would report a column
   * present because some other table happens to have one by that name.
   */
  async function columnPresence(qualified: ReadonlyArray<string>): Promise<boolean[]> {
    const selects = qualified.map((q, i) => {
      const [t, c] = q.split('.');
      return `bool_or(table_name = '${t}' AND column_name = '${c}') AS n${i}`;
    }).join(', ');
    const rows = (await query(
      `SELECT ${selects} FROM information_schema.columns WHERE table_schema = 'public'`,
    )) as any;
    const list = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    const row = ((list as any[]) || [])[0] || {};
    return qualified.map((_, i) => row[`n${i}`] === true);
  }

  try {
    const tables = await presence(
      REQUIRED_TABLES, 'table_name',
      "information_schema.tables WHERE table_schema = 'public'",
    );
    const indexes = await presence(
      REQUIRED_INDEXES, 'indexname',
      "pg_indexes WHERE schemaname = 'public'",
    );
    const constraints = await presence(
      REQUIRED_CONSTRAINTS, 'constraint_name',
      "information_schema.table_constraints WHERE table_schema = 'public'",
    );

    const columns = await columnPresence(REQUIRED_COLUMNS);

    REQUIRED_TABLES.forEach((t, i) => (tables[i] ? result.tablesPresent : result.tablesMissing).push(t));
    REQUIRED_INDEXES.forEach((n, i) => (indexes[i] ? result.indexesPresent : result.indexesMissing).push(n));
    REQUIRED_CONSTRAINTS.forEach((n, i) => (constraints[i] ? result.constraintsPresent : result.constraintsMissing).push(n));
    REQUIRED_COLUMNS.forEach((q, i) => (columns[i] ? result.columnsPresent : result.columnsMissing).push(q));

    result.ok = result.tablesMissing.length === 0
      && result.indexesMissing.length === 0
      && result.constraintsMissing.length === 0
      && result.columnsMissing.length === 0;
  } catch (err: any) {
    // An introspection failure is NOT a pass. Reported as a failure with the reason, because a
    // check that cannot run is indistinguishable from a check that found nothing wrong only if
    // you let it be.
    result.error = String(err?.message ?? err);
    result.ok = false;
  }

  return result;
}

/** Entry point. Kept separate so the logic above is importable without side effects. */
async function main(): Promise<void> {
  const { sequelize } = await import('../config/database');
  const result = await verifyProjectLifecycleSchema((sql) => sequelize.query(sql));

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: result.ok ? 'info' : 'error',
    service: 'backend',
    event: 'project_lifecycle_schema_verified',
    outcome: result.ok ? 'success' : 'failure',
    ...(result.ok ? {} : { error_class: 'SchemaInvariantViolation' }),
    context: {
      tables: `${result.tablesPresent.length}/${REQUIRED_TABLES.length}`,
      indexes: `${result.indexesPresent.length}/${REQUIRED_INDEXES.length}`,
      constraints: `${result.constraintsPresent.length}/${REQUIRED_CONSTRAINTS.length}`,
      columns: `${result.columnsPresent.length}/${REQUIRED_COLUMNS.length}`,
      tables_missing: result.tablesMissing,
      indexes_missing: result.indexesMissing,
      constraints_missing: result.constraintsMissing,
      // NAMED, not just counted. The other three categories name their gaps; a post-deploy
      // gate that reports "columns 0/1" without saying which one scales badly past one.
      columns_missing: result.columnsMissing,
      ...(result.error ? { introspection_error: result.error } : {}),
      ...(result.ok ? {} : {
        impact: 'Project lifecycle registration or blueprint approval will fail, or the approval '
          + 'race is unguarded. A missing unique index does not surface as an error — it surfaces '
          + 'as two approved rows for one revision.',
        remedy: 'Re-run ensureProjectLifecycleSchema (it is idempotent), then re-run this script.',
      }),
    },
  }));

  await sequelize.close().catch(() => { /* closing is best-effort; the verdict is already printed */ });
  process.exit(result.ok ? 0 : 1);
}

// Only run when invoked directly, so importing this for a test has no side effects.
if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'project_lifecycle_schema_verified', outcome: 'failure',
      error_class: 'VerificationScriptFailure',
      context: { message: String(err?.message ?? err) },
    }));
    process.exit(1);
  });
}
