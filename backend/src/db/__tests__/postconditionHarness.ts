/**
 * Shared harness for the ensure*Schema post-condition suites.
 *
 * Extracted at the fourth use, one past CLAUDE.md's "three is the threshold". All four
 * post-condition suites now use it — the three earlier ones (ensureMarketingTrackingSchema,
 * ensureMarketingCampaignSchema, ensureContentOsSchema) were retrofitted once the review they
 * were under had closed, since moving files mid-grade wastes the reviewer's work.
 *
 * Not named `*.test.ts`, so jest's testMatch does not collect it as a suite.
 *
 * WHAT THESE SUITES ARE FOR. Every ensure*Schema module runs its DDL in a loop that only
 * `console.warn`s on failure — deliberately, so one bad statement never aborts boot. The
 * consequence is that "it did not throw" proves nothing about whether the tables landed. The
 * catalog post-condition is what catches that, and a check nobody tests is a check nobody
 * knows works.
 *
 * The asymmetry that makes the INDEX half worth testing separately: a missing column is loud
 * (Sequelize emits every declared attribute in every SELECT, so the next read throws), while
 * a missing UNIQUE index is silent — every write succeeds and the only symptom is a duplicate
 * discovered much later, by which time it may be unrecallable.
 */

export interface CatalogState {
  /** table name -> the columns information_schema should report for it */
  columns: Record<string, string[]>;
  /** the index names pg_indexes should report */
  indexes: string[];
}

/**
 * Builds a `sequelize.query` implementation that answers catalog probes from a fixture.
 *
 * Recognises the two shapes the ensure* modules issue — an `information_schema.columns`
 * lookup carrying `replacements.table`, and a `pg_indexes` lookup — and returns `[[]]` for
 * anything else, which is what the DDL statements themselves get.
 */
export function catalogResponder(state: CatalogState) {
  return (sql: string, opts?: any) => {
    if (typeof sql === 'string' && sql.includes('information_schema.columns')) {
      const table = opts?.replacements?.table as string | undefined;

      // Some modules probe a single hardcoded table without `replacements`
      // (ensureMarketingCampaignSchema hardcodes `table_name = 'campaigns'`). Fall back to
      // the sole fixture entry for those — but ONLY when there is exactly one, and THROW
      // otherwise.
      //
      // The naive fallback took `Object.keys(...)[0]` unconditionally, which meant a future
      // module probing TWO hardcoded tables would get the first fixture for both, and its
      // suite would stay green while the module was wrong. A test harness that guesses is
      // worse than one that fails: the guess is invisible and the failure is not.
      let key = table;
      if (key === undefined) {
        const keys = Object.keys(state.columns);
        if (keys.length !== 1) {
          throw new Error(
            'catalogResponder could not resolve which table an information_schema probe '
            + `refers to: the query passed no \`replacements.table\` and the fixture has `
            + `${keys.length} entries (${keys.join(', ')}). Give the fixture exactly one `
            + 'entry, or make the module pass a replacement.',
          );
        }
        [key] = keys;
      }

      const cols = state.columns[key] ?? [];
      return Promise.resolve([cols.map((column_name) => ({ column_name }))]);
    }
    if (typeof sql === 'string' && sql.includes('pg_indexes')) {
      return Promise.resolve([state.indexes.map((indexname) => ({ indexname }))]);
    }
    return Promise.resolve([[]]);
  };
}

/** A responder where every catalog probe rejects, for the fail-open path. */
export function throwingCatalogResponder(message = 'permission denied') {
  return (sql: string) => {
    if (typeof sql === 'string'
      && (sql.includes('information_schema.columns') || sql.includes('pg_indexes'))) {
      return Promise.reject(new Error(message));
    }
    return Promise.resolve([[]]);
  };
}

/**
 * Pulls the structured SchemaInvariantViolation payloads out of a console.error spy.
 *
 * Asserting on the parsed object rather than a substring means a change to the log's shape
 * fails the test, instead of a message that merely still contains the right words.
 */
export function violationPayloads(errorSpy: jest.SpyInstance): any[] {
  return errorSpy.mock.calls
    .map((c) => {
      try {
        return JSON.parse(c[0] as string);
      } catch {
        return null;
      }
    })
    .filter((p) => p && p.event === 'SchemaInvariantViolation');
}
