/**
 * The L9.7 and L11.7 decision records, asserted as records rather than as files.
 *
 * T14's acceptance: each record names the DECISION, the REASONING, and WHAT WOULD REOPEN IT, and
 * the L9.7 record exists on disk at a known path because `acceptance-matrix-l04.md` is going to
 * cite that path by name. A matrix citing a file that does not exist is worse than a matrix with
 * a gap in it: the gap is visible and the dead citation reads as evidence.
 *
 * The third element is the one worth enforcing. A decision record that says what was decided and
 * why, and never says what would change the answer, is a position paper. "What would reopen this"
 * is what makes it a decision somebody can revisit instead of a wall somebody has to argue with.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(__dirname, '../../../../../docs/project-lifecycle');

const RECORDS: ReadonlyArray<[string, string, readonly string[]]> = [
  [
    'L9.7',
    'decision-l97-lc10-lc11-rescoped.md',
    // The distinction the whole record exists to preserve: withdrawn is not satisfied.
    ['LC-10', 'LC-11', 'withdrawn', 'not satisfied', 'approved_by_role'],
  ],
  [
    'L11.7',
    'decision-l117-no-artifact-contract-sweep.md',
    ['no retrofit sweep', 'artifact contract', 'four live boards'],
  ],
];

describe('the decision records exist where the matrix will cite them', () => {
  it.each(RECORDS.map(([code, file]) => [code, file]))('%s is at %s', (_code, file) => {
    expect(fs.existsSync(path.join(DIR, file))).toBe(true);
  });

  it.each(RECORDS.map(([code, file]) => [code, file]))('%s is a record, not a stub', (_code, file) => {
    // A path that resolves to three lines would satisfy the existence check above.
    expect(fs.readFileSync(path.join(DIR, file), 'utf8').length).toBeGreaterThan(1500);
  });
});

describe('each record names the decision, the reasoning, and what would reopen it', () => {
  it.each(RECORDS.map(([code, file]) => [code, file]))('%s states a decision', (_code, file) => {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    expect(text).toContain('## The decision');
  });

  it.each(RECORDS.map(([code, file]) => [code, file]))('%s states what would reopen it', (_code, file) => {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    expect(text).toMatch(/## What would reopen this/);
    // Not an empty heading: the section has to carry at least two conditions, because a single
    // condition is usually "if we change our minds".
    const section = text.slice(text.indexOf('## What would reopen this'));
    expect((section.match(/^- /gm) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it.each(RECORDS.map(([code, file, needles]) => [code, file, needles]))(
    '%s carries the specifics that make it checkable',
    (_code, file, needles) => {
      const text = fs.readFileSync(path.join(DIR, file as string), 'utf8');
      for (const needle of needles as readonly string[]) {
        expect(text).toContain(needle);
      }
    },
  );
});

describe('the L9.7 record keeps the distinction its whole purpose rests on', () => {
  const text = () => fs.readFileSync(path.join(DIR, 'decision-l97-lc10-lc11-rescoped.md'), 'utf8');

  it('says the rows are WITHDRAWN and explicitly NOT satisfied', () => {
    /*
     * A withdrawn row and a satisfied row look identical in a summary count and mean opposite
     * things. If this sentence ever goes, the matrix can be read as claiming LC-10 passed.
     */
    const t = text();
    expect(t).toContain('not marked satisfied');
    expect(t).toMatch(/withdrawn/i);
  });

  it('names the specific limb that is unbuilt, not just that something is missing', () => {
    // "No role is compared at approval time" is checkable in one grep. "Not fully implemented"
    // is not, and is what this record would decay into.
    const t = text();
    expect(t).toContain('no role is compared at approval time');
    expect(t).toContain('RECORDING, not by ENFORCEMENT');
  });

  it('rejects the three easier alternatives in writing, so the ruling is a choice not a default', () => {
    const t = text();
    expect(t).toContain('Mark them satisfied');
    expect(t).toContain('Hold the phase open');
    expect(t).toContain('Leave them silently open');
  });
});
