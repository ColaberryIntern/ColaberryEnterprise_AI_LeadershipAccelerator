/**
 * No statement may share one bind placeholder between two columns.
 *
 * ## The production failure this exists to prevent
 *
 * The first `--apply` run of `backfillAgentDomainCommandCenter` on 31 October 2026 refused ALL TEN
 * domains:
 *
 *     learner_success  failed  DatabaseError: inconsistent types deduced for parameter $4
 *     ... x10, created 0, failed 10
 *
 * Postgres deduces a parameter's type from each place it is used. The INSERT wrote
 * `VALUES (..., $4, $4, ...)` into `title` and `description` to avoid binding the same string
 * twice. In production `title` is `character varying(500)` and `description` is `text`, so one
 * parameter had to be two types and the planner refused. The `UPDATE` in the refresh branch
 * carried the identical defect as `title = $3, description = $3`.
 *
 * ## Why the existing tests could not see it
 *
 * - The unit tier mocks `sequelize.query`. A mock records a string; it never deduces a type.
 * - `intendedOrder` is pure and was fully covered. The bug was not in the decision.
 * - The DRY RUN passed cleanly and printed all ten as `created`, because a dry run computes the
 *   plan and never executes a write. "Dry run clean" says nothing about the SQL.
 * - The companion `*.integration.test.ts` DOES execute both statements against real Postgres, and
 *   that is the stronger proof - but the integration tier "REPORTS. It does not gate merges"
 *   (`.github/workflows/ci.yml`). So the check with actual teeth on a PR is this one, in the unit
 *   tier, and it is deliberately duplicated rather than deferred.
 *
 * ## What is asserted, and what is NOT
 *
 * Within an INSERT's VALUES list, and within an UPDATE's SET list, every placeholder must be
 * DISTINCT - because each slot there targets a different column, and two columns are not reliably
 * the same type. Reuse elsewhere is fine and is not flagged: `WHERE id = $1 AND position IS
 * DISTINCT FROM $2` legitimately repeats `$2` against the same column.
 *
 * Scoped to these two statements on purpose. A repo-wide sweep would flag working code that reuses
 * a placeholder across two columns that happen to share a type, and a test that fails on correct
 * code gets deleted rather than heeded.
 */
import {
  COMMAND_CENTER_INSERT_SQL,
  COMMAND_CENTER_REFRESH_SQL,
} from '../backfillAgentDomainCommandCenter';

/** Every `$N` in a fragment, in order of appearance, duplicates included. */
const placeholders = (fragment: string): string[] => fragment.match(/\$\d+/g) ?? [];

/** The VALUES list of an INSERT: between the first `VALUES (` and the matching close. */
const valuesList = (sql: string): string => {
  const open = sql.indexOf('VALUES (');
  expect(open).toBeGreaterThan(-1);
  const from = open + 'VALUES ('.length;
  let depth = 1;
  for (let i = from; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(from, i);
    }
  }
  throw new Error('unbalanced parentheses in the VALUES list');
};

/** The SET list of an UPDATE: between `SET` and `WHERE`. */
const setList = (sql: string): string => {
  const m = /\bSET\b([\s\S]*?)\bWHERE\b/.exec(sql);
  expect(m).not.toBeNull();
  return (m as RegExpExecArray)[1];
};

describe('Command Center statements never share a placeholder between two columns', () => {
  it('the INSERT gives every VALUES slot its own placeholder', () => {
    const found = placeholders(valuesList(COMMAND_CENTER_INSERT_SQL));

    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found).size).toBe(found.length);
  });

  it('the UPDATE gives every SET assignment its own placeholder', () => {
    const found = placeholders(setList(COMMAND_CENTER_REFRESH_SQL));

    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found).size).toBe(found.length);
  });

  it('writes title and description from two DIFFERENT placeholders, which is the whole defect', () => {
    // Named explicitly rather than left to the distinctness check above, because this is the
    // exact pair that failed and `varchar(500)` vs `text` is why.
    expect(COMMAND_CENTER_INSERT_SQL).toMatch(/title, description/);
    expect(valuesList(COMMAND_CENTER_INSERT_SQL)).not.toMatch(/\$4, \$4/);
    expect(COMMAND_CENTER_REFRESH_SQL).not.toMatch(/title = \$3, description = \$3/);
    expect(COMMAND_CENTER_REFRESH_SQL).toMatch(/title = \$3, description = \$4/);
  });

  it('POSITIVE CONTROL: the pre-fix statements are what this test would have rejected', () => {
    // Without this, a check that passes proves only that it ran. These are the two statements as
    // they shipped and failed in production.
    const brokenInsert = COMMAND_CENTER_INSERT_SQL
      .replace('$4, $5, $6, $7, $8::jsonb', '$4, $4, $5, $6, $7::jsonb')
      .replace("'not_started', $9, $10, $11", "'not_started', $8, $9, $10");
    const brokenUpdate = COMMAND_CENTER_REFRESH_SQL
      .replace('title = $3, description = $4', 'title = $3, description = $3')
      .replace('narrative = $5, build = $6', 'narrative = $4, build = $5');

    // Prove the substitution actually took, or the control is vacuous.
    expect(brokenInsert).not.toBe(COMMAND_CENTER_INSERT_SQL);
    expect(brokenUpdate).not.toBe(COMMAND_CENTER_REFRESH_SQL);

    const insertFound = placeholders(valuesList(brokenInsert));
    const updateFound = placeholders(setList(brokenUpdate));

    expect(new Set(insertFound).size).toBeLessThan(insertFound.length);
    expect(new Set(updateFound).size).toBeLessThan(updateFound.length);
  });

  it('does not flag a placeholder legitimately repeated outside a VALUES or SET list', () => {
    // The renormalize UPDATE in the same script repeats `$2` on purpose: it assigns `position`
    // and then compares against that same column. A checker that flagged this would be wrong.
    const renormalize = `UPDATE student_tasks SET position = $2, updated_at = now()
                           WHERE id = $1 AND position IS DISTINCT FROM $2`;
    const found = placeholders(setList(renormalize));

    expect(found).toEqual(['$2']);
    expect(new Set(found).size).toBe(found.length);
    expect(placeholders(renormalize)).toHaveLength(3);
  });
});
