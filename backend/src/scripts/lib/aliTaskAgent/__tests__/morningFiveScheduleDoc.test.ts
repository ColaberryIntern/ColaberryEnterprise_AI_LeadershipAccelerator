/**
 * `docs/project-lifecycle/morning-five-schedule.md` states the Morning Five defaults as settled.
 * These tests make that document CHECKABLE rather than decorative.
 *
 * A decision record that quotes code is a second copy of that code, and this repo has paid for
 * second copies repeatedly: a kit that could drift from its shipped constant, a board row that
 * disagreed with its criteria, a flag comment citing a cap that had been raised 7.5x underneath
 * it. The last one is the closest analogy and it happened in this same session: the justification
 * was true when written and false when read, and nothing failed.
 *
 * So every number the document asserts is pinned to its source here. If somebody retunes a
 * weight, this fails and names the document to update. It does not stop them retuning anything.
 */
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const { pickFive } = require('../pressingFive');

const DOC = path.resolve(__dirname, '../../../../../../docs/project-lifecycle/morning-five-schedule.md');
const SRC = path.resolve(__dirname, '../pressingFive.js');

const doc = (): string => fs.readFileSync(DOC, 'utf8');
const src = (): string => fs.readFileSync(SRC, 'utf8');

describe('the schedule document exists and says what it decided', () => {
  it('is on disk at the path the acceptance matrix will cite', () => {
    expect(fs.existsSync(DOC)).toBe(true);
    expect(doc().length).toBeGreaterThan(2000);
  });

  it('names all three decisions the ticket asks to finalize', () => {
    const d = doc();
    for (const phrase of ['Ranking weights', 'Spread', 'Delivery time']) {
      expect(d).toContain(phrase);
    }
  });

  it('states the delivery time and the skip flag IN THE REGISTRATION BLOCK', () => {
    /*
     * Scoped to the fenced block, not the whole document. Both strings also appear in the prose
     * above it, so a document-wide `toContain` passed while the registration block itself had
     * been gutted: a reader copying that block would have registered a report with no way to
     * turn it off. A mutation found that.
     */
    const d = doc();
    const block = /```js\n([\s\S]*?)```/.exec(d);
    expect(block).not.toBeNull();
    expect(block![1]).toContain("sendCT: '07:00'");
    expect(block![1]).toContain("skipFlag: '--skip-morning-five'");
    expect(block![1]).toContain("scriptPath: 'backend/src/scripts/sendMorningFive.js'");
    // And the prose still explains what the flag is for, which is a different claim.
    expect(d).toContain('adding its skip flag to **all** of the runner');
  });

  it('says plainly that the send is NOT scheduled yet, so the ticket is not read as closed', () => {
    // The sentence that stops this document being mistaken for the done-when.
    expect(doc()).toContain('The daily send is not scheduled yet');
    expect(doc()).toContain('the ticket is not closed by this document');
  });

  it('and nothing has actually been registered, which is what that sentence claims', () => {
    // The claim checked against the registry rather than taken on trust. If somebody adds the
    // entry, this fails and the document must stop saying it has not been added.
    const registry = fs.readFileSync(
      path.resolve(__dirname, '../../reportingRegistry.js'), 'utf8',
    );
    expect(registry).not.toContain('sendMorningFive');
  });
});

describe('the weights the document publishes are the weights the code uses', () => {
  it('every modifier matches pressingFive.js', () => {
    // Read from the source rather than imported, because `WEIGHTS` is not exported: pinning it
    // through the module's surface would mean changing that surface for a test.
    const weights = /const WEIGHTS = \{([^}]*)\}/.exec(src());
    expect(weights).not.toBeNull();
    const text = weights![1];
    expect(text).toContain('decision: 20');
    expect(text).toContain('person: 15');
    expect(text).toContain('gate: 15');
    expect(text).toContain('outside: 10');
    expect(text).toContain('generated: -25');

    const d = doc();
    expect(d).toContain('| +20 |');
    expect(d).toContain('| +15 |');
    expect(d).toContain('| +10 |');
    expect(d).toContain('**-25**');
  });

  it('the timing table in the document matches the bands in the code', () => {
    const s = src();
    // Each band, by the points it awards. A retune changes one of these numbers and this fails.
    for (const pts of [25, 40, 50, 45, 35, 20, 8]) {
      expect(s).toContain(`pts: ${pts}`);
    }
    const d = doc();
    for (const row of ['| 50 |', '| 45 |', '| 40 |', '| 35 |', '| 25 |', '| 20 |', '| 8 |']) {
      expect(d).toContain(row);
    }
  });

  it('the dormant line is 60 days in the code and 60 in the document', () => {
    expect(src()).toContain('late > 60');
    expect(doc()).toContain('60 days');
  });
});

describe('the spread the document publishes is the spread the code applies', () => {
  /**
   * Work orders in one named list and one project, all equally and recently overdue.
   *
   * `list` is the LIST NAME, not an id: `pickFive` keys its per-list cap on `x.list`. The first
   * version of this fixture gave every order the same literal name, which made the per-list cap
   * of 2 apply across projects and capped the control at 2 instead of 5. The code was right.
   */
  const orders = (n: number, list: string, projectId: string, idPrefix = '') =>
    Array.from({ length: n }, (_, i) => ({
      id: `${projectId}/${idPrefix}t${i}`,
      title: `task ${i}`,
      projectId,
      list,
      dueOn: '2026-11-18',
      cat: 'internal',
      generated: false,
    }));

  const TODAY = '2026-11-21';

  it('caps at 2 from one list, which is the default the document states', () => {
    const picked = pickFive(orders(6, 'List one', 'P1'), TODAY);
    expect(picked.picks.length).toBeLessThanOrEqual(2);
    // And it did have more to choose from, so the cap is what limited it.
    expect(picked.qualified).toBe(6);
    expect(doc()).toContain('2 from one list');
  });

  it('caps at 3 from one project across different lists', () => {
    const many = [
      ...orders(2, 'List one', 'P1', 'a'),
      ...orders(2, 'List two', 'P1', 'b'),
      ...orders(2, 'List three', 'P1', 'c'),
    ];
    const picked = pickFive(many, TODAY);
    expect(picked.picks.length).toBeLessThanOrEqual(3);
    expect(picked.qualified).toBe(6);
    expect(doc()).toContain('3 from one project');
  });

  it('still returns five when the work is spread across enough projects', () => {
    // The control. Caps that produced fewer than five on ANY input would satisfy both cases
    // above while making the report useless.
    const spread = ['P1', 'P2', 'P3', 'P4', 'P5'].flatMap((p) => orders(1, `List of ${p}`, p));
    expect(pickFive(spread, TODAY).picks.length).toBe(5);
  });
});
