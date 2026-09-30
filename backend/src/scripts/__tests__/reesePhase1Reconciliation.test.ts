import fs from 'fs';
import path from 'path';

// R1 of the Reese Product Phase 1 plan: every gap from CHECKPOINT_A_DISCOVERY.md (10)
// and REESE_STANDARD_AUDIT.md (14) must be reconciled into one document, 24 rows total,
// each citing evidence. This test is the "24 rows present" verification plan.md requires
// -- it counts real table rows in the committed doc rather than trusting prose.
describe('PHASE_1_RECONCILIATION.md', () => {
  const docPath = path.resolve(
    __dirname,
    '../../../../docs/reese-agentic-employee/PHASE_1_RECONCILIATION.md',
  );
  const content = fs.readFileSync(docPath, 'utf8');

  // Numbered table rows look like "| 1 | ... |" through "| 14 | ... |" -- the leading
  // "| N |" cell is the row's own item number in each source document.
  const rowPattern = /^\|\s*\d+\s*\|/gm;

  it('exists and is readable', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('has exactly 10 numbered rows for CHECKPOINT_A_DISCOVERY.md capabilities', () => {
    const sectionA = content.split('## B. `REESE_STANDARD_AUDIT.md`')[0];
    const rows = sectionA.match(rowPattern) ?? [];
    expect(rows.length).toBe(10);
  });

  it('has exactly 14 numbered rows for REESE_STANDARD_AUDIT.md gaps', () => {
    const sectionB = content.split('## B. `REESE_STANDARD_AUDIT.md`')[1] ?? '';
    const rows = sectionB.match(rowPattern) ?? [];
    expect(rows.length).toBe(14);
  });

  it('has 24 rows total', () => {
    const rows = content.match(rowPattern) ?? [];
    expect(rows.length).toBe(24);
  });

  it('marks every row with one of open, closed, changed, obsolete, or not re-verified', () => {
    const sections = content.split(/\n## /).slice(1, 3);
    for (const section of sections) {
      const lines = section.split('\n').filter((l) => rowPattern.test(l));
      rowPattern.lastIndex = 0;
      for (const line of lines) {
        expect(line).toMatch(/OPEN|CLOSED|CHANGED|OBSOLETE|NOT RE-VERIFIED|PARTIAL/i);
      }
    }
  });

  it('logs "#2477 first" as carried into Phase 2', () => {
    expect(content).toMatch(/#2477 first/);
    expect(content).toMatch(/Phase 2/);
  });

  it('states Phase 1 grants no new authority', () => {
    expect(content.toLowerCase()).toMatch(/phase 1 (adds|grants) no new authority/);
  });
});
