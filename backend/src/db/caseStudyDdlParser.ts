/**
 * Case Study OS — DDL text parsers.
 *
 * WHY THIS IS A SEPARATE MODULE.
 * `ensureCaseStudySchema.ts` stood at 508 lines against CLAUDE.md's 500-line
 * hard ceiling, and the Modular Composition Rule requires a split before the
 * next addition rather than after it. These two functions are the natural seam:
 * they are pure text→list transforms that never touch a database, they are the
 * only part of that module with no `sequelize` dependency, and they were ALREADY
 * being imported across a module boundary — `ensureCaseStudyStoryAssets.ts`
 * reaches into the core ensure module purely to borrow them, which is a
 * dependency arrow that only made sense while they had nowhere else to live.
 *
 * WHAT DELIBERATELY DID NOT MOVE. The DDL statement arrays stay where they are.
 * Three guard suites read `ensureCaseStudySchema.ts` as SOURCE TEXT —
 * `db/__tests__/ensureCaseStudySchema.test.ts`,
 * `models/__tests__/caseStudyModelParity.test.ts` (which pins the DDL column
 * total to exactly 158) and
 * `services/caseStudy/__tests__/caseStudyStoryStudio.test.ts` — so moving the
 * statements would have turned a refactor into three red guards, and a red guard
 * is the one most likely to get "fixed" rather than honoured. Moving the
 * parsers instead leaves every one of those reads pointing at exactly the text
 * it was written to check.
 *
 * The core module re-exports both functions, so every existing import site and
 * the import-specifier assertion in `caseStudyModelParity.test.ts:295` keep
 * working unchanged. Nothing is weakened; only the file boundary moved.
 */

/**
 * Pull `table.column` pairs out of the CREATE TABLE statements themselves.
 *
 * Pure and exported so (a) the schema post-check can never drift from the DDL it
 * checks, and (b) the model-parity test can assert every column created there has
 * a matching Sequelize attribute. That parity guard is not theoretical: on
 * 2026-08-22 nine models were given columns in Postgres that were never declared
 * as attributes, and because Sequelize only ever reads and writes attributes it
 * knows about, the entire tenancy runtime did nothing while every test passed.
 */
export function parseCreatedColumns(statements: string[]): string[] {
  const NON_COLUMN = /^(UNIQUE|PRIMARY|CONSTRAINT|FOREIGN|CHECK|EXCLUDE)\b/i;
  const columns: string[] = [];

  for (const stmt of statements) {
    const header = stmt.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/i);
    if (!header) continue;
    const table = header[1];

    const body = stmt.slice(stmt.indexOf('(') + 1, stmt.lastIndexOf(')'));

    // Split on top-level commas, NOT on newlines. Splitting by line had two holes:
    // a column definition wrapped across two lines produced a phantom entry from
    // the continuation, and two columns declared on one physical line silently
    // dropped the second. The silent one is the dangerous half — this list is the
    // parity source of truth, and a column it fails to report is a column the
    // parity test will never require a model to declare, which is precisely how
    // the 2026-08-22 tenancy runtime ended up inert with every test green.
    // Depth tracking keeps `UNIQUE (a, b)` and `gen_random_uuid()` intact.
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of body) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);

    for (const part of parts) {
      const definition = part.trim().replace(/\s+/g, ' ');
      if (!definition || NON_COLUMN.test(definition)) continue;
      const name = definition.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (name) columns.push(`${table}.${name[1]}`);
    }
  }
  return columns;
}

/**
 * Index names, derived from the DDL for the same reason the column list is:
 * a hand-maintained subset silently stops covering whatever is added later.
 *
 * The first version of the schema module hardcoded 8 of the 19 indexes, which
 * meant the other 11 could be entirely absent from production and
 * assertCaseStudySchema() would still report ok — a post-check with a hole in it
 * is worse than none, because it produces false confidence rather than no
 * confidence.
 *
 * The `(?:UNIQUE )?` group is load bearing rather than defensive: a UNIQUE index
 * is exactly the kind that carries an invariant, so an index added to enforce
 * one must land in the required list and be asserted against `pg_indexes` like
 * any other. Dropping that group would let the strongest indexes be the only
 * ones nobody checks.
 */
export function parseCreatedIndexes(statements: string[]): string[] {
  return statements
    .map((s) => s.replace(/\s+/g, ' ').match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/i)?.[1])
    .filter((name): name is string => Boolean(name));
}
