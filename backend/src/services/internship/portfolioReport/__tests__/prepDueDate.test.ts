import * as fs from 'fs';
import * as path from 'path';

/**
 * The PREP due date the intern is TOLD must come from `due_baseline_on`.
 *
 * `due_on` is back-dated on gov projects to a cohort schedule that can predate the project itself.
 * Measured on production on 2026-11-10: of 348 PREP rows, 12 disagree between the two columns, by
 * as much as 58 days.
 *
 * This is not a cosmetic preference. `PREP_SQL` feeds `presentationDue()`, whose text goes
 * verbatim into an intern's email as a statement of fact: Quincy was told his Project introduction
 * "was due 39 days ago (2026-10-02)". Meanwhile `nudgeBrief/deadline.ts` reads `due_baseline_on`
 * for the case study band on the same card, so before this fix one message could carry two
 * different dates for the same task.
 *
 * Asserted against the SOURCE because the defect lives in a SQL string. A behavioural test would
 * need a live database, and the repo already uses source assertions for exactly this shape of
 * problem (see `internNudgeRoutes.access.test.ts`, which greps the router for its guards).
 */

const COLLECT_SRC = path.join(__dirname, '..', 'collect.ts');
const DEADLINE_SRC = path.join(__dirname, '..', '..', 'nudgeBrief', 'deadline.ts');

const read = (p: string) => fs.readFileSync(p, 'utf8');

/** The PREP_SQL template literal, comments stripped so a comment cannot satisfy an assertion. */
function prepSql(): string {
  const src = read(COLLECT_SRC).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = src.match(/const PREP_SQL = `([\s\S]*?)`/);
  if (!m) throw new Error('PREP_SQL not found in collect.ts');
  return m[1];
}

describe('the PREP due date an intern is told', () => {
  it('POSITIVE CONTROL: PREP_SQL is found and is a real query', () => {
    const sql = prepSql();
    expect(sql).toMatch(/FROM\s+student_tasks/i);
    expect(sql).toMatch(/PREP-%/);
  });

  it('reads due_baseline_on, not the back-dated due_on', () => {
    expect(prepSql()).toMatch(/COALESCE\(\s*t\.due_baseline_on\s*,\s*t\.due_on\s*\)/i);
  });

  /**
   * The fallback is deliberate and must stay: not every PREP row is guaranteed a baseline, and a
   * missing date would drop the task out of `presentationDue()` entirely rather than show a
   * slightly wrong one. Losing the nudge is worse than dating it from the older column.
   */
  it('keeps due_on as a fallback so a missing baseline does not drop the task', () => {
    expect(prepSql()).toContain('t.due_on');
  });

  it('never selects a bare t.due_on as the due date', () => {
    const sql = prepSql();
    const bare = sql.match(/(?<!COALESCE\([^)]*)\bt\.due_on\b(?![^(]*\))/g) ?? [];
    expect(bare).toEqual([]);
  });

  /** The other path that dates the same PREP tasks. If these two drift, one email states two dates. */
  it('agrees with the case study deadline, which reads the baseline column', () => {
    const deadline = read(DEADLINE_SRC).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(deadline).toContain('due_baseline_on');
    expect(prepSql()).toContain('due_baseline_on');
  });
});
