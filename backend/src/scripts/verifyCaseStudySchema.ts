/**
 * verifyCaseStudySchema — prove the Case Study OS DDL actually APPLIED.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * `ensureCaseStudySchema()` wraps every statement in its own try/catch that
 * `console.warn`s and continues (the house convention across all 37 ensure*
 * modules). A statement can fail completely and the function still resolves.
 * So "boot ran without throwing" proves NOTHING about whether the tables exist.
 * Every unit test in this workstream mocks `sequelize.query`, which proves the
 * SQL is ISSUED — not that Postgres accepted it.
 *
 * This script closes that gap by reading the only source of truth that cannot
 * lie: `information_schema` and `pg_indexes`, on a real connection.
 *
 * WHAT IT PROVES
 *   1. DDL applies to a fresh database, with every swallowed warning surfaced.
 *   2. assertCaseStudySchema() passes, corroborated by an independent catalog read.
 *   3. Idempotency: ensure twice, identical object counts, and NO duplicate
 *      indexes (this repo has a production incident where a boot-time sync
 *      created duplicate indexes until Postgres OOMed).
 *   4. Parser parity: CASE_STUDY_REQUIRED_COLUMNS is set-equal, in BOTH
 *      directions, to the columns Postgres actually created. A parser bug would
 *      make the whole parity guarantee hollow while looking rigorous.
 *   5. Model parity: every Sequelize attribute has a backing column (else every
 *      SELECT throws), and every column is a declared attribute (else Sequelize
 *      silently never reads or writes it — the 2026-08-22 tenancy failure).
 *
 * SAFETY
 * Read-only apart from `ensureCaseStudySchema()`, which is additive and
 * idempotent by construction (every statement is CREATE ... IF NOT EXISTS).
 * It never DROPs, ALTERs or writes a row. Point it at any database safely:
 *
 *   DATABASE_URL=postgres://... npx ts-node -T backend/src/scripts/verifyCaseStudySchema.ts
 *
 * Exit code 0 = every proof passed. Exit code 1 = at least one FAIL; the
 * failing proof names the specific object.
 */
import { Model, ModelStatic } from 'sequelize';
import { sequelize } from '../config/database';
import {
  CASE_STUDY_TABLES,
  CASE_STUDY_REQUIRED_COLUMNS,
  CASE_STUDY_REQUIRED_INDEXES,
  CASE_STUDY_STATEMENTS,
  ensureCaseStudySchema,
  assertCaseStudySchema,
} from '../db/ensureCaseStudySchema';

import CaseStudy from '../models/CaseStudy';
import CaseStudyRepoCollection from '../models/CaseStudyRepoCollection';
import CaseStudyRepository from '../models/CaseStudyRepository';
import CaseStudySnapshot from '../models/CaseStudySnapshot';
import CaseStudyMetric from '../models/CaseStudyMetric';
import CaseStudyEvidence from '../models/CaseStudyEvidence';
import CaseStudyArtifact from '../models/CaseStudyArtifact';
import CaseStudyPublication from '../models/CaseStudyPublication';
import CaseStudySyncRun from '../models/CaseStudySyncRun';
import CaseStudyCollection from '../models/CaseStudyCollection';

/**
 * Ten DIFFERENT model classes iterated as one list. `ModelStatic<Model<any, any>>`
 * is the widest shape that still types `getTableName()` and `getAttributes()`;
 * a narrower element type makes the union non-assignable to either method's
 * `this`. `any` here is the attribute payload only — this script never reads a
 * row through these classes, it only inspects their attribute METADATA.
 */
const MODELS: ModelStatic<Model<any, any>>[] = [
  CaseStudy,
  CaseStudyRepoCollection,
  CaseStudyRepository,
  CaseStudySnapshot,
  CaseStudyMetric,
  CaseStudyEvidence,
  CaseStudyArtifact,
  CaseStudyPublication,
  CaseStudySyncRun,
  CaseStudyCollection,
];

let failures = 0;

function head(n: string): void {
  console.log(`\n${'='.repeat(78)}\n${n}\n${'='.repeat(78)}`);
}
function pass(msg: string): void {
  console.log(`  PASS  ${msg}`);
}
function fail(msg: string): void {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
}
function check(ok: boolean, msg: string): void {
  (ok ? pass : fail)(msg);
}

/** Run `fn` with console.warn/error captured, so swallowed statements surface. */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ value: T; warns: string[]; errors: string[] }> {
  const warns: string[] = [];
  const errors: string[] = [];
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = (...args: any[]) => warns.push(args.map(String).join(' '));
  console.error = (...args: any[]) => errors.push(args.map(String).join(' '));
  try {
    const value = await fn();
    return { value, warns, errors };
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

/** Independent catalog read — does not trust ensure() or assert(). */
async function readCatalog(): Promise<{
  tables: string[];
  columns: string[];
  indexes: { name: string; table: string; def: string }[];
}> {
  // The alias on table_name is LOAD BEARING, not style.
  // sequelize/lib/dialects/postgres/query.js:71 (sequelize 6.37.7) special-cases
  // any raw SQL whose text startsWith("SELECT table_name FROM
  // information_schema.tables"); the rewrite itself is at :79-81 and returns
  // `rows.map(r => Object.values(r))` — a bare array of value-arrays — instead
  // of the documented `[rows, metadata]` tuple. Destructuring `[tRows]` off that
  // yields ONE row's values (`['case_studies']`) and every other table silently
  // disappears. Aliasing the column breaks the string match and restores the
  // normal contract.
  //
  // Two things guard this query, and only one of them is the alias. The match is
  // an EXACT prefix with single spaces, so the line break before FROM defeats it
  // independently: removing `AS tbl` while keeping this formatting still does
  // NOT arm the trap — both would have to go. Verified, because the opposite was
  // asserted during review and did not survive checking.
  //
  // Do not "tidy" this into a single line AND drop the alias. Either alone is
  // survivable; together they reduce this ten-row read to one, with no error.
  const [tRows]: any = await sequelize.query(
    `SELECT table_name AS tbl FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'case_stud%'
      ORDER BY table_name`,
  );
  const [cRows]: any = await sequelize.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'case_stud%'
      ORDER BY table_name, ordinal_position`,
  );
  const [iRows]: any = await sequelize.query(
    `SELECT indexname, tablename, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'case_stud%'
      ORDER BY tablename, indexname`,
  );
  return {
    tables: tRows.map((r: any) => r.tbl),
    columns: cRows.map((r: any) => `${r.table_name}.${r.column_name}`),
    indexes: iRows.map((r: any) => ({ name: r.indexname, table: r.tablename, def: r.indexdef })),
  };
}

/**
 * Two indexes with different names but the same (table, columns, predicate) are
 * a duplicate. This is exactly the shape of the documented boot-sync incident:
 * every restart minted another equivalent index until the database OOMed.
 */
function findDuplicateIndexes(indexes: { name: string; table: string; def: string }[]): string[] {
  const bySignature = new Map<string, string[]>();
  for (const ix of indexes) {
    // Strip the index NAME out of the definition, leaving table + method +
    // column list + predicate: the shape that actually costs storage and writes.
    const signature = ix.def.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /i, 'ON ');
    const list = bySignature.get(signature) ?? [];
    list.push(ix.name);
    bySignature.set(signature, list);
  }
  return [...bySignature.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([sig, names]) => `${names.join(' == ')}  ->  ${sig}`);
}

function diff(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((x) => !setB.has(x)).sort();
}

async function main(): Promise<void> {
  head('CONNECTION');
  await sequelize.authenticate();
  const [[verRow]]: any = await sequelize.query(
    `SELECT version() AS v, current_database() AS db, inet_server_port() AS port`,
  );
  console.log(`  database : ${verRow.db}  (port ${verRow.port})`);
  console.log(`  server   : ${verRow.v}`);

  // ---------------------------------------------------------------------
  head('PROOF 1 — ensureCaseStudySchema() applies to this database');
  const run1 = await captureConsole(() => ensureCaseStudySchema());
  console.log(`  statements issued : ${CASE_STUDY_STATEMENTS.length}`);
  console.log(`  console.warn fired: ${run1.warns.length}`);
  for (const w of run1.warns) console.log(`      WARN> ${w}`);
  check(
    run1.warns.length === 0,
    run1.warns.length === 0
      ? 'run 1: zero swallowed statements — no DDL was silently skipped'
      : `run 1: ${run1.warns.length} statement(s) were swallowed by the try/catch (listed above)`,
  );

  const cat1 = await readCatalog();
  console.log(`  catalog after run 1: ${cat1.tables.length} tables, ${cat1.columns.length} columns, ${cat1.indexes.length} indexes`);

  // ---------------------------------------------------------------------
  head('PROOF 2 — assertCaseStudySchema() against the real catalog');
  const assert1 = await captureConsole(() => assertCaseStudySchema());
  for (const e of assert1.errors) console.log(`      ERROR> ${e}`);
  check(assert1.value.ok, `assertCaseStudySchema() -> ok=${assert1.value.ok} missing=${JSON.stringify(assert1.value.missing)}`);

  // Corroborate independently: do not take assert()'s word for it.
  const missingTables = diff([...CASE_STUDY_TABLES], cat1.tables);
  const missingIndexes = diff([...CASE_STUDY_REQUIRED_INDEXES], cat1.indexes.map((i) => i.name));
  const missingColumns = diff([...CASE_STUDY_REQUIRED_COLUMNS], cat1.columns);
  check(missingTables.length === 0, `information_schema.tables: all ${CASE_STUDY_TABLES.length} tables present ${missingTables.length ? `MISSING ${JSON.stringify(missingTables)}` : ''}`);
  check(missingIndexes.length === 0, `pg_indexes: all ${CASE_STUDY_REQUIRED_INDEXES.length} declared indexes present ${missingIndexes.length ? `MISSING ${JSON.stringify(missingIndexes)}` : ''}`);
  check(missingColumns.length === 0, `information_schema.columns: all ${CASE_STUDY_REQUIRED_COLUMNS.length} declared columns present ${missingColumns.length ? `MISSING ${JSON.stringify(missingColumns)}` : ''}`);

  // ---------------------------------------------------------------------
  head('PROOF 4 — idempotency: second ensure() run changes nothing');
  const run2 = await captureConsole(() => ensureCaseStudySchema());
  console.log(`  console.warn fired: ${run2.warns.length}`);
  for (const w of run2.warns) console.log(`      WARN> ${w}`);
  check(run2.warns.length === 0, `run 2: ${run2.warns.length} warning(s)`);

  const cat2 = await readCatalog();
  console.log(`  catalog after run 2: ${cat2.tables.length} tables, ${cat2.columns.length} columns, ${cat2.indexes.length} indexes`);
  check(cat1.tables.length === cat2.tables.length, `table count stable: ${cat1.tables.length} -> ${cat2.tables.length}`);
  check(cat1.columns.length === cat2.columns.length, `column count stable: ${cat1.columns.length} -> ${cat2.columns.length}`);
  check(cat1.indexes.length === cat2.indexes.length, `index count stable: ${cat1.indexes.length} -> ${cat2.indexes.length}`);
  check(
    JSON.stringify(cat1.indexes) === JSON.stringify(cat2.indexes),
    'pg_indexes byte-identical between run 1 and run 2 — no index was recreated or renamed',
  );

  const dupes = findDuplicateIndexes(cat2.indexes);
  check(dupes.length === 0, dupes.length === 0
    ? 'no duplicate index signatures — the boot-sync OOM failure mode cannot occur here'
    : `DUPLICATE INDEXES: ${dupes.join(' | ')}`);

  const assert2 = await captureConsole(() => assertCaseStudySchema());
  check(assert2.value.ok, `assertCaseStudySchema() after run 2 -> ok=${assert2.value.ok}`);

  // ---------------------------------------------------------------------
  head('PROOF 7 — CASE_STUDY_REQUIRED_COLUMNS is set-equal to reality');
  const ownedColumns = cat2.columns.filter((c) => (CASE_STUDY_TABLES as readonly string[]).includes(c.split('.')[0]));
  const parserExtra = diff([...CASE_STUDY_REQUIRED_COLUMNS], ownedColumns);
  const parserMissed = diff(ownedColumns, [...CASE_STUDY_REQUIRED_COLUMNS]);
  console.log(`  parser reports : ${CASE_STUDY_REQUIRED_COLUMNS.length} columns`);
  console.log(`  postgres has   : ${ownedColumns.length} columns`);
  check(parserExtra.length === 0, `parser claims no column Postgres lacks ${parserExtra.length ? `EXTRA ${JSON.stringify(parserExtra)}` : ''}`);
  check(parserMissed.length === 0, `parser misses no column Postgres has ${parserMissed.length ? `MISSED ${JSON.stringify(parserMissed)}` : ''}`);

  const declaredIndexNames = new Set(CASE_STUDY_REQUIRED_INDEXES);
  const unexpectedIndexes = cat2.indexes
    .filter((i) => !declaredIndexNames.has(i.name) && !i.name.endsWith('_pkey'))
    .map((i) => i.name);
  check(unexpectedIndexes.length === 0, `no index exists that the DDL never declared (primary keys excluded) ${unexpectedIndexes.length ? JSON.stringify(unexpectedIndexes) : ''}`);

  // ---------------------------------------------------------------------
  head('PROOF 6 — Sequelize model <-> real column parity (both directions)');
  const dbColumnsByTable = new Map<string, Set<string>>();
  for (const c of ownedColumns) {
    const [t, col] = c.split('.');
    if (!dbColumnsByTable.has(t)) dbColumnsByTable.set(t, new Set());
    dbColumnsByTable.get(t)!.add(col);
  }

  for (const model of MODELS) {
    const table = model.getTableName() as string;
    const dbCols = dbColumnsByTable.get(table) ?? new Set<string>();
    const attrs = model.getAttributes() as Record<string, any>;
    // The COLUMN a model actually reads/writes is attribute.field (Sequelize
    // maps attribute -> field; `underscored: true` derives it when unset).
    const modelCols = new Set(Object.entries(attrs).map(([name, a]) => (a?.field as string) || name));

    const invisible = [...dbCols].filter((c) => !modelCols.has(c)).sort();
    const phantom = [...modelCols].filter((c) => !dbCols.has(c)).sort();

    const label = `${model.name} -> ${table} (${dbCols.size} db cols, ${modelCols.size} model attrs)`;
    if (invisible.length === 0 && phantom.length === 0) {
      pass(label);
    } else {
      if (invisible.length) fail(`${label}: columns the model CANNOT SEE (silently never read/written): ${JSON.stringify(invisible)}`);
      if (phantom.length) fail(`${label}: attributes with NO BACKING COLUMN (every SELECT would throw): ${JSON.stringify(phantom)}`);
    }
  }

  // ---------------------------------------------------------------------
  head(`RESULT: ${failures === 0 ? 'PASS' : `FAIL (${failures} failed check${failures === 1 ? '' : 's'})`}`);
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('\nverifyCaseStudySchema aborted:', err?.message ?? err);
    console.error(err?.stack);
    try {
      await sequelize.close();
    } catch {
      /* connection already gone */
    }
    process.exit(1);
  });
