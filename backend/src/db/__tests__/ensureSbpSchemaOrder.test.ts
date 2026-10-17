/**
 * An `ALTER TABLE` must not run before the `CREATE TABLE` it depends on.
 *
 * ## The defect this was written for
 *
 * `ensureSbpSchema` applies its statements in array order, each wrapped in a per-statement
 * `catch` that warns and continues. So an `ALTER TABLE build_plans ...` placed ABOVE
 * `CREATE TABLE IF NOT EXISTS build_plans` fails on a pristine database with
 * `relation "build_plans" does not exist`, is swallowed, and the column never lands. On a
 * database that already has the table -- every developer machine, and production -- it works,
 * so the bug is invisible except on a first boot.
 *
 * That is exactly what happened to `truth_revision`. Its own comment records the 2026-09-11
 * outage it exists to prevent: *"`savePlanDraft` INSERTs this column, so without it every INSERT
 * throws and no plan is ever saved"*. The statement was ordered before the CREATE, so the guard
 * reproduced the outage it was written to stop. Found by P7-T3's `providerFailure.integration`,
 * which failed 3 of 3 on a fresh container and passed on a second run against the same one --
 * the signature of a first-boot-only defect.
 *
 * ## Why a SOURCE scan rather than a database test
 *
 * A database test for this is awkward (it needs a genuinely pristine database per run, which is
 * the condition that hides the bug) and it would only cover the one column somebody thought to
 * check. The ordering is a property of the statement list, so the statement list is what gets
 * asserted -- and that covers every table and column this file will ever add.
 *
 * The scan is deliberately narrow: it only judges tables THIS FILE creates. The ALTERs targeting
 * `student_tasks` and `github_connections` are left alone, because those tables belong to other
 * schema modules and their ordering is a cross-module question this file cannot settle.
 */
import fs from 'fs';
import path from 'path';

const SOURCE = path.join(__dirname, '..', 'ensureSbpSchema.ts');

/** Statement positions, by the order they appear in the file. */
function scan(text: string) {
  const creates = new Map<string, number>();
  const alters: Array<{ table: string; line: number }> = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    // Only statement lines: a backtick-quoted SQL string in the array. This skips the prose,
    // which matters because several comments in this file quote the SQL they describe.
    if (!line.startsWith('`')) return;
    const c = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(line);
    if (c && !creates.has(c[1])) creates.set(c[1], i + 1);
    const a = /ALTER TABLE (\w+)/.exec(line);
    if (a) alters.push({ table: a[1], line: i + 1 });
  });
  return { creates, alters };
}

/** The violations: an ALTER on a locally-created table, positioned before its CREATE. */
function violations(text: string) {
  const { creates, alters } = scan(text);
  return alters
    .filter((a) => creates.has(a.table) && a.line < (creates.get(a.table) as number))
    .map((a) => `${a.table}: ALTER at line ${a.line} precedes CREATE at line ${creates.get(a.table)}`);
}

describe('ensureSbpSchema statement ordering', () => {
  const text = fs.readFileSync(SOURCE, 'utf8');

  it('APPARATUS: the scan finds the real statements, so a clean result is not an empty read', () => {
    // Without this, a regex that matched nothing would report "no violations" forever -- the
    // broken-instrument failure this repo keeps finding.
    const { creates, alters } = scan(text);
    expect(creates.has('build_plans')).toBe(true);
    expect(creates.has('build_intake')).toBe(true);
    expect(alters.length).toBeGreaterThan(5);
    // And it really did find the column the outage was about.
    expect(alters.some((a) => a.table === 'build_plans')).toBe(true);
  });

  it('no ALTER runs before the CREATE of a table this file creates', () => {
    expect(violations(text)).toEqual([]);
  });

  it('POSITIVE CONTROL: the check CATCHES an ALTER moved above its CREATE', () => {
    // The exact defect, reconstructed in memory rather than on disk. If this does not report a
    // violation, the test above is not evidence about anything.
    const broken = [
      '    `ALTER TABLE build_plans ADD COLUMN IF NOT EXISTS truth_revision INTEGER`,',
      '    `CREATE TABLE IF NOT EXISTS build_plans (id UUID PRIMARY KEY)`,',
    ].join('\n');

    const found = violations(broken);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('build_plans');
  });

  it('and does NOT flag the correct order, so it is not simply always failing', () => {
    const fine = [
      '    `CREATE TABLE IF NOT EXISTS build_plans (id UUID PRIMARY KEY)`,',
      '    `ALTER TABLE build_plans ADD COLUMN IF NOT EXISTS truth_revision INTEGER`,',
    ].join('\n');

    expect(violations(fine)).toEqual([]);
  });

  it('ignores ALTERs on tables other modules own, which this file cannot order', () => {
    // `student_tasks` is created elsewhere. Flagging it here would be a false positive that
    // trains the next reader to ignore this test.
    const foreign = [
      '    `ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS due_on DATE`,',
      '    `CREATE TABLE IF NOT EXISTS build_plans (id UUID PRIMARY KEY)`,',
    ].join('\n');

    expect(violations(foreign)).toEqual([]);
  });

  it('the truth_revision ALTER is specifically after its CREATE, by line number', () => {
    // Named explicitly, because this is the one that took production down. A general rule plus
    // the specific instance, so a refactor that weakened the general rule still fails here.
    const { creates, alters } = scan(text);
    const alter = alters.find((a) => a.table === 'build_plans');
    expect(alter).toBeDefined();
    expect(alter!.line).toBeGreaterThan(creates.get('build_plans') as number);
  });
});
