import * as fs from 'fs';
import * as path from 'path';

/**
 * A project with no NAME must not be reported as no project at all.
 *
 * Measured on production 2026-11-11: Harpreet Kaur's project `50a24430-a604-4228-96d6-94800f245670`
 * was created at 01:42 that morning with `name` NULL. It carried her repository
 * `Harpreet-95/ToolSmithAI`, a `github_connections` row pointing at it, and a case study in
 * `approved` status. The delivery query's predicate was `p.name IS NOT NULL AND p.name <> ''`, so
 * the row was dropped as scratch; the internship report saw no project for her; `triage()`
 * returned `no_project_at_day_N`; and the message generated for her opened:
 *
 *     "It is day 51 and there is still no project on your name."
 *
 * That sentence was false, and it was false because of a missing write of ours. The intern-nudges
 * skill has this as rule 9 and rule 10: when our own data is why somebody looks stuck, say so
 * first, and never send what a fact we already hold would invalidate.
 *
 * Asserted against the SOURCE because the defect lives in a SQL string, which is the same reason
 * `portfolioReport/__tests__/prepDueDate.test.ts` reads `collect.ts`. Comments are stripped first,
 * so the long explanatory comment above the predicate cannot satisfy an assertion about it.
 */

const SRC = path.join(__dirname, '..', 'projectDeliveryService.ts');

/** The file with every comment removed, so prose can never pass for code. */
function codeOnly(): string {
  return fs.readFileSync(SRC, 'utf8')
    .replace(/^\s*--.*$/gm, '')      // SQL line comments inside the template literal
    .replace(/\/\/.*$/gm, '')        // TS line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the delivery query decides who has a project', () => {
  it('POSITIVE CONTROL: comment stripping leaves real SQL behind', () => {
    const code = codeOnly();
    expect(code).toMatch(/FROM\s+projects\s+p/i);
    expect(code).toMatch(/LEFT JOIN\s+github_connections/i);
    // And it really did remove the prose: the explanation names the old predicate verbatim.
    expect(fs.readFileSync(SRC, 'utf8')).toContain("p.name IS NOT NULL AND p.name <> ''");
    expect(code).not.toContain("p.name IS NOT NULL AND p.name <> ''");
  });

  it('does not reject a project for having no name alone', () => {
    const code = codeOnly();
    // The old predicate, as the ONLY gate, is gone.
    expect(code).not.toMatch(/WHERE\s+p\.name\s+IS NOT NULL\s+AND\s+p\.name\s*<>\s*''/i);
  });

  it('admits a nameless project on evidence that it is a real build', () => {
    const code = codeOnly();
    // A repository on the project row, or on its github_connections row.
    expect(code).toMatch(/NULLIF\(btrim\(p\.github_repo_url\), ''\)\s+IS NOT NULL/i);
    expect(code).toMatch(/NULLIF\(btrim\(gc\.repo_url\), ''\)\s+IS NOT NULL/i);
    // Work on it.
    expect(code).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM student_tasks t WHERE t\.project_id = p\.id\s*\)/i);
    // Or a case study built from it, which is Harpreet's case exactly.
    expect(code).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM case_studies cs WHERE cs\.project_id = p\.id\s*\)/i);
  });

  it('still excludes a departed enrollment, which was the other half of the predicate', () => {
    expect(codeOnly()).toMatch(/e\.status\s+IS NULL\s+OR\s+e\.status\s+NOT IN\s*\(:departed\)/i);
  });

  it('collapses an empty name to NULL so a caller fallback fires', () => {
    // `?? trackLabel` does not catch '', and a project admitted by the evidence branches may have
    // no name at all. Without this the message would read "Where  stands".
    expect(codeOnly()).toMatch(/NULLIF\(btrim\(p\.name\), ''\)\s+AS name/i);
  });
});
