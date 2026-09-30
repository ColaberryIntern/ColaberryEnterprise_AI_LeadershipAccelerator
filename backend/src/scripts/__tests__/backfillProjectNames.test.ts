/**
 * backfillProjectNames — the naming decision, and the two properties that make
 * it safe to run against a cohort that is working right now.
 *
 * Ali is mid-build in production while this ships. The script must therefore be
 * re-runnable and must never be able to take a name off a student who has just
 * chosen one, including in the window between the sweep's SELECT and its UPDATE.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { decideProjectName, NameCandidateRow } from '../backfillProjectNames';

const SCRIPT = join(__dirname, '..', 'backfillProjectNames.ts');

const row = (over: Partial<NameCandidateRow> = {}): NameCandidateRow => ({
  project_id: '11111111-1111-1111-1111-111111111111',
  student: 'Abrahim Nur',
  intake_name: 'GoalKick',
  plan_name: 'GoalKick',
  idea: 'GoalKick is an AI-powered soccer field booking platform.',
  task_count: 12,
  ...over,
});

describe('decideProjectName', () => {
  it("uses the student's intake name and says so", () => {
    const d = decideProjectName(row({ intake_name: 'CoreOps', plan_name: 'CoreOps AI Operations Dashboard' }));
    expect(d.name).toBe('CoreOps');
    expect(d.source).toBe('intake');
  });

  it('uses the plan name only when the student gave none', () => {
    const d = decideProjectName(row({ intake_name: null, plan_name: 'Keysy – Home Buying App' }));
    expect(d.name).toBe('Keysy – Home Buying App');
    expect(d.source).toBe('plan');
  });

  it('treats a whitespace-only intake name as no name at all', () => {
    const d = decideProjectName(row({ intake_name: '   ', plan_name: 'Small Business KPI Copilot' }));
    expect(d.name).toBe('Small Business KPI Copilot');
    expect(d.source).toBe('plan');
  });

  it('proposes NOTHING when neither source has a name', () => {
    // Production rows c16a410c (Ikenna Nzeribe) and c30f8234 (Taiwo Oludimimu):
    // 10 tasks each, no intake, no plan. They stay NULL and get reported.
    const d = decideProjectName(row({ intake_name: null, plan_name: null }));
    expect(d.name).toBeNull();
    expect(d.source).toBe('none');
  });

  it('never proposes a numbered or templated name', () => {
    // The failure mode this whole change exists to prevent: a label the student
    // would not recognise as their own project.
    const d = decideProjectName(row({ intake_name: null, plan_name: null, student: 'Taiwo Oludimimu' }));
    expect(d.name).toBeNull();
    // Nothing anywhere in the script fabricates a name from a counter or index.
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/`Project \$\{/);
    expect(src).not.toMatch(/'Project ' \+/);
    expect(src).not.toMatch(/Untitled/);
  });

  it('reports the student and idea for review without using them as a name', () => {
    const d = decideProjectName(row({ student: '  Shekia Phillips ', intake_name: 'Peace Of Mind' }));
    expect(d.student).toBe('Shekia Phillips');
    expect(d.name).toBe('Peace Of Mind');
  });

  it('labels a row with no enrollment rather than dropping it', () => {
    expect(decideProjectName(row({ student: null })).student).toBe('(no enrollment)');
  });
});

describe('the sweep is scoped to unnamed projects only', () => {
  const src = readFileSync(SCRIPT, 'utf8');

  it('selects only rows whose name is null or blank', () => {
    expect(src).toContain("WHERE (p.name IS NULL OR btrim(p.name) = '')");
  });

  it('picks one plan per project, preferring the published version', () => {
    // A project can carry several build_plans rows; naming from a superseded
    // draft would title the build after a plan the student is not on.
    expect(src).toContain('DISTINCT ON (project_id)');
    expect(src).toContain("ORDER BY project_id, (status = 'published') DESC, version DESC");
  });
});

describe('the write can never overwrite a name a student set', () => {
  const src = readFileSync(SCRIPT, 'utf8');

  it('writes ONLY through the guarded setProjectNameIfEmpty', () => {
    expect(src).toContain('await setProjectNameIfEmpty(d.project_id, d.name)');
  });

  it('contains no UPDATE or INSERT statement of its own', () => {
    // The guard lives in projectNaming.setProjectNameIfEmpty and is tested
    // there. This asserts the script cannot bypass it — a second, unguarded
    // statement in here would silently defeat that test.
    expect(src).not.toMatch(/UPDATE\s+projects/i);
    expect(src).not.toMatch(/INSERT\s+INTO/i);
    expect(src).not.toMatch(/DELETE\s+FROM/i);
  });

  it('is dry-run by default and writes only behind --apply', () => {
    expect(src).toContain("const APPLY = flag('apply');");
    expect(src).toContain('if (APPLY) {');
  });

  it('counts a row that was named since the sweep as already_named, not updated', () => {
    // setProjectNameIfEmpty returns false when its guard matched nothing. The
    // script must believe that answer rather than assume its own SELECT is
    // still true — that is the whole race this bucket covers.
    expect(src).toContain('(wrote ? updated : alreadyNamed).push(d.project_id)');
  });
});
