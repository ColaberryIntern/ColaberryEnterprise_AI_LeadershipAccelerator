/**
 * The seeder's change detection.
 *
 * This exists because of a defect that only appeared on the SECOND run against
 * production: every mapping reported as pending, forever, including immediately
 * after a successful apply. The writes were correct, so the data was right and
 * nothing failed - the script just re-issued four UPDATEs and bumped
 * `updated_at` every time anybody ran it. A dry run that always says "4 changes
 * pending" is worse than useless: it is a diff that cannot ever reach zero, so
 * it stops meaning anything.
 *
 * The cause is that jsonb does not store keys in the order you wrote them.
 * Postgres returned {grain, rationale, objective_ids} and the code compared it
 * to a string built as {objective_ids, rationale, grain}. Two identical values,
 * two different strings.
 */
import { canonicalJson } from '../seedTypeCertificationMap';

describe('canonicalJson', () => {
  it('the production case: jsonb key order does not count as a change', () => {
    // Exactly what Postgres handed back, against exactly what the seeder builds.
    const fromPostgres = { grain: 'type', rationale: 'A Prompt Lab is prompt engineering', objective_ids: ['D4.1', 'D4.2', 'D4.3'] };
    const fromCode = { objective_ids: ['D4.1', 'D4.2', 'D4.3'], rationale: 'A Prompt Lab is prompt engineering', grain: 'type' };
    expect(canonicalJson(fromPostgres)).toBe(canonicalJson(fromCode));
    // and the naive comparison this replaced would have said they differ
    expect(JSON.stringify(fromPostgres)).not.toBe(JSON.stringify(fromCode));
  });

  it('still detects a real change - it is order-blind, not value-blind', () => {
    const a = { grain: 'type', objective_ids: ['D4.1', 'D4.2'] };
    const b = { objective_ids: ['D4.1', 'D4.2', 'D4.3'], grain: 'type' };
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });

  it('array order still matters - objectives are a list, not a set', () => {
    expect(canonicalJson({ objective_ids: ['D4.1', 'D4.2'] }))
      .not.toBe(canonicalJson({ objective_ids: ['D4.2', 'D4.1'] }));
  });

  it('a changed rationale is a change, because a reviewer reads it', () => {
    expect(canonicalJson({ grain: 'type', rationale: 'one' }))
      .not.toBe(canonicalJson({ rationale: 'two', grain: 'type' }));
  });

  it('sorts nested objects too, not just the top level', () => {
    expect(canonicalJson({ a: { y: 1, x: 2 } })).toBe(canonicalJson({ a: { x: 2, y: 1 } }));
  });

  it('an empty mapping and a null mapping are different - {} is what the column held before', () => {
    expect(canonicalJson({})).not.toBe(canonicalJson(null));
  });
});
