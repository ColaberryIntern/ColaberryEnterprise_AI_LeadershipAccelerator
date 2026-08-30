// NOT mocked, deliberately. `Model.init` needs a real Sequelize instance, and mocking
// the module breaks every model import with "Cannot read properties of undefined".
// The instance is constructed without connecting, which is what the other delivery model
// contract tests already rely on - no database is touched here.
import { REFACTORED_DELIVERY_SCHEMA_STATEMENTS } from '../ensureRefactoredDeliverySchema';
import DeliveryStory from '../../models/DeliveryStory';
import DeliveryCapacityOverride from '../../models/DeliveryCapacityOverride';
import DeliveryClientSigninToken from '../../models/DeliveryClientSigninToken';
import DeliveryProjectMember from '../../models/DeliveryProjectMember';
import DeliveryEvidence from '../../models/DeliveryEvidence';

/**
 * The DDL and the Sequelize models must describe the same table.
 *
 * ## Why this exists
 *
 * This session hit the disagreement in **both directions**, weeks apart, and neither was
 * caught by anything:
 *
 *   - `delivery_capacity_overrides` had existed in the DDL since Gate 12 **with no
 *     model**, so nothing could read it. `effectiveMaxParallelProjects` took an
 *     `ActiveOverride` that no code path was able to supply — the override mechanism was
 *     unreachable rather than unused.
 *   - `delivery_stories` was needed by a model **with no table**, because Gate 7 shipped
 *     the Story Contract as pure logic.
 *
 * A model that names a column the table lacks fails only at runtime, on the one query
 * that touches it — which in this codebase could be months after the mismatch shipped.
 * `sync({ alter: true })` is not an option here: it once produced ~50k duplicate
 * constraints and OOM-ed Postgres, which is why the DDL is hand-written in the first
 * place. So agreement has to be asserted rather than enforced.
 *
 * ## What this deliberately does NOT check
 *
 * Types, nullability and defaults. The DDL is the authority on those and the model's
 * declarations are advisory to Sequelize — comparing them would produce noise about
 * `TIMESTAMPTZ` versus `DATE` that says nothing about correctness. **Column presence is
 * the property that actually breaks things**, in both directions.
 */

/** Column names declared by a `CREATE TABLE` statement in the DDL array. */
function ddlColumnsFor(table: string): string[] {
  const stmt = REFACTORED_DELIVERY_SCHEMA_STATEMENTS.find((s) =>
    s.includes(`CREATE TABLE IF NOT EXISTS ${table} (`),
  );
  if (!stmt) return [];

  const body = stmt.slice(stmt.indexOf('(') + 1, stmt.lastIndexOf(')'));
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // A column line starts with an identifier followed by a type. Table-level constraints
    // (UNIQUE (...), PRIMARY KEY (...)) start with a keyword, so they are skipped.
    .map((line) => /^([a-z_]+)\s+[A-Z]/.exec(line)?.[1])
    .filter((c): c is string => Boolean(c));
}

const PAIRS: Array<{ table: string; model: { getAttributes(): Record<string, unknown> } }> = [
  { table: 'delivery_stories', model: DeliveryStory },
  { table: 'delivery_capacity_overrides', model: DeliveryCapacityOverride },
  { table: 'delivery_client_signin_tokens', model: DeliveryClientSigninToken },
  { table: 'delivery_project_members', model: DeliveryProjectMember },
  { table: 'delivery_evidence', model: DeliveryEvidence },
];

describe('DDL and models describe the same tables', () => {
  for (const { table, model } of PAIRS) {
    describe(table, () => {
      it('has a CREATE TABLE in the DDL at all', () => {
        // The `delivery_stories` case: a model whose table was never created.
        expect(ddlColumnsFor(table).length).toBeGreaterThan(0);
      });

      it('declares no model attribute the table lacks', () => {
        // This direction fails at runtime on the first query that touches the column.
        const ddl = new Set(ddlColumnsFor(table));
        const missing = Object.keys(model.getAttributes()).filter((a) => !ddl.has(a));
        expect({ table, missingFromTable: missing }).toEqual({ table, missingFromTable: [] });
      });

      it('has a model attribute for every column the table declares', () => {
        // This direction is quieter and was the capacity-override case: the column exists,
        // nothing can read it, and the feature is simply unreachable.
        const attrs = new Set(Object.keys(model.getAttributes()));
        const unreadable = ddlColumnsFor(table).filter((c) => !attrs.has(c));
        expect({ table, unreadableColumns: unreadable }).toEqual({ table, unreadableColumns: [] });
      });
    });
  }

  it('parses real column names rather than silently matching nothing', () => {
    // Guards the parser itself. If the regex stopped matching, every assertion above
    // would compare two empty sets and pass — a green suite proving nothing, which is the
    // failure mode this session has hit repeatedly.
    const cols = ddlColumnsFor('delivery_stories');
    expect(cols).toContain('story_key');
    expect(cols).toContain('contract');
    expect(cols.length).toBeGreaterThanOrEqual(10);
  });
});
