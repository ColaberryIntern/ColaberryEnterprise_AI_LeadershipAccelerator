/**
 * `makeActiveProject` writes the pointer that decides whether a student sees
 * their project at all. It is the last step of publish, and it is deliberately
 * non-fatal — which is exactly why it needs a test of its own.
 *
 * MEASURED, 2026-08-12, production. The statement read:
 *
 *   UPDATE enrollments SET active_project_id = $pid, updated_at = NOW() ...
 *
 * `enrollments` has no `updated_at` column — the model declares
 * `timestamps: false`. Every publish threw, the catch logged and moved on, and
 * the bug this function was written to fix ("12 tasks materialized correctly
 * and were invisible") was never actually fixed in production. The unit suite
 * stayed green throughout because it mocks `sequelize.query`, so no test ever
 * saw a column name.
 *
 * This test reads the two source files and compares them. It needs no database
 * and no model instance, so it runs everywhere the rest of the suite does —
 * and it fails the moment the statement names a column the table lacks.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ACTIVE_PROJECT_COLUMNS } from '../sbpOrchestrator';

const ORCHESTRATOR = join(__dirname, '..', 'sbpOrchestrator.ts');
const ENROLLMENT_MODEL = join(__dirname, '..', '..', '..', 'models', 'Enrollment.ts');

/** Column names the Enrollment model declares, i.e. what the table really has. */
function modelColumns(): Set<string> {
  const src = readFileSync(ENROLLMENT_MODEL, 'utf8');
  const cols = new Set<string>();
  for (const m of src.matchAll(/^ {4}(\w+): \{/gm)) cols.add(m[1]);
  // Sequelize adds createdAt/updatedAt itself unless timestamps are off.
  if (!/timestamps:\s*false/.test(src)) { cols.add('created_at'); cols.add('updated_at'); }
  return cols;
}

/** Columns assigned in the SET clause of the enrollments UPDATE. */
function statementColumns(): string[] {
  const src = readFileSync(ORCHESTRATOR, 'utf8');
  const stmt = /UPDATE enrollments SET([\s\S]*?)WHERE/.exec(src);
  if (!stmt) throw new Error('the enrollments UPDATE moved — update this test with it');
  return [...stmt[1].matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
}

describe('makeActiveProject only touches columns that exist', () => {
  it('the Enrollment model does not carry timestamps', () => {
    // The premise of the bug. If this ever changes, the assertion below relaxes
    // on its own rather than silently going stale.
    expect(readFileSync(ENROLLMENT_MODEL, 'utf8')).toMatch(/timestamps:\s*false/);
  });

  it('every column the statement assigns is a real column on enrollments', () => {
    const real = modelColumns();
    const assigned = statementColumns();

    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned.filter((c) => !real.has(c))).toEqual([]);
  });

  it('does not write updated_at, which is the column that broke it', () => {
    expect(statementColumns()).not.toContain('updated_at');
    expect(ACTIVE_PROJECT_COLUMNS).not.toContain('updated_at' as never);
  });

  it('declares every column it uses, so the check above cannot be bypassed', () => {
    const real = modelColumns();
    for (const col of ACTIVE_PROJECT_COLUMNS) expect(real.has(col)).toBe(true);
    for (const col of statementColumns()) expect(ACTIVE_PROJECT_COLUMNS).toContain(col as never);
  });

  it('keeps the guard that stops a republish stealing focus from another project', () => {
    // Not schema, but the other half of this function's contract: republishing
    // an old plan must not move a student's portal off what they are building.
    const src = readFileSync(ORCHESTRATOR, 'utf8');
    expect(src).toMatch(/active_project_id IS NULL OR active_project_id <> \$pid/);
  });
});
