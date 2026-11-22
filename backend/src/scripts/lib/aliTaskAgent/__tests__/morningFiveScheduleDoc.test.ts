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
const { pickFive, timing, scoreTask, WEIGHTS } = require('../pressingFive');

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

  it('and each modifier is APPLIED, not merely declared', () => {
    /*
     * The weights test above reads the constant. This one reads the behavior, because a constant
     * can be right while the branch that adds it is gone. The source-grep version of the timing
     * table had exactly that hole and a verifier walked through it, so the same class is closed
     * here before anyone finds it.
     *
     * `scoreTask` sums the timing points and every modifier that applies. A task due today
     * scores 45 on timing alone, so each modifier is readable as the delta from that.
     */
    const TODAY = '2026-11-21';
    const base = { id: 'P1/t', title: 'a task', projectId: 'P1', list: 'Build', dueOn: TODAY, cat: 'internal', generated: false };
    const score = (over: Record<string, unknown>) => scoreTask({ ...base, ...over }, TODAY).score;

    const plain = score({});
    expect(plain).toBe(45);

    // A decision only Ali can make. `isDecision` reads the title, so the title carries it.
    expect(score({ title: 'Decide whether to renew' }) - plain).toBe(WEIGHTS.decision);
    // The ticket says a person has to do it.
    expect(score({ humanOnly: true }) - plain).toBe(WEIGHTS.person);
    // An approval-gate list.
    expect(score({ list: 'Approval gate' }) - plain).toBe(WEIGHTS.gate);
    // Machine-generated scaffolding, which is a PENALTY and therefore a negative delta.
    expect(score({ generated: true }) - plain).toBe(WEIGHTS.generated);
    expect(WEIGHTS.generated).toBeLessThan(0);
  });

  /**
   * Each band BOUND to its points, by calling `timing` rather than by grepping the source.
   *
   * ## Why this replaced a source grep
   *
   * The first version asserted only that each `pts: N` string appeared SOMEWHERE in
   * `pressingFive.js`. A verifier swapped the points of the `late >= 1` and `late >= 8` bands,
   * so the curve peaked at 8 to 21 days instead of 1 to 7, and all 24 tests passed: both numbers
   * were still present in the file, and nothing bound either to a band. The document's central
   * argument, that the curve peaks at 1 to 7 days overdue because something a week late is
   * rescuable, was false and nothing failed.
   *
   * `timing` takes days LATE, so a negative value is days until due. Each row below names a day
   * count inside the band, the points the band awards, and the document row that publishes it.
   */
  const BANDS: ReadonlyArray<{ late: number | null; pts: number; row: string }> = [
    { late: 3, pts: 50, row: '| 1 to 7 days overdue | 50 |' },
    { late: 0, pts: 45, row: '| due today | 45 |' },
    { late: 14, pts: 40, row: '| 8 to 21 days overdue | 40 |' },
    { late: -2, pts: 35, row: '| due within 3 days | 35 |' },
    { late: 40, pts: 25, row: '| 22 to 60 days overdue | 25 |' },
    { late: -6, pts: 20, row: '| due within 7 days | 20 |' },
    { late: -12, pts: 8, row: '| due within 14 days | 8 |' },
    { late: null, pts: 0, row: '| no due date, over 60 days late, or further out | 0 (disqualified) |' },
  ];

  it.each(BANDS)('timing($late) awards $pts, and the document publishes that row', ({ late, pts, row }) => {
    expect(timing(late).pts).toBe(pts);
    expect(doc()).toContain(row);
  });

  it('the bands are STRICTLY ORDERED the way the document argues they are', () => {
    /*
     * The argument the document makes is about SHAPE, not about seven independent numbers: the
     * curve peaks at 1 to 7 days overdue rather than at the most overdue item. Asserted as the
     * ordering, so a retune that preserved every number while reordering the bands would fail.
     */
    const pts = (late: number | null) => timing(late).pts;
    expect(pts(3)).toBeGreaterThan(pts(0));      // a week late beats due today
    expect(pts(0)).toBeGreaterThan(pts(14));     // due today beats a fortnight late
    expect(pts(14)).toBeGreaterThan(pts(40));    // and the curve keeps falling as it ages
    expect(pts(40)).toBeGreaterThan(pts(61));    // past the dormant line it is disqualified
    expect(pts(61)).toBe(0);
    // The peak is where the document says it is, not merely high.
    const peak = Math.max(...[-12, -6, -2, 0, 3, 14, 40, 61].map(pts));
    expect(pts(3)).toBe(peak);
  });

  it('the dormant line is 60 days in the code and 60 in the document', () => {
    // Bracketed, so moving the line in either direction fails rather than only widening it.
    expect(timing(60).pts).toBeGreaterThan(0);
    expect(timing(61).pts).toBe(0);
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
    /*
     * EXACTLY 2, not "at most 2". A verifier tightened the default from 2 to 1 and every test
     * stayed green while the document published 2, because an upper bound cannot tell a cap
     * from a tighter cap. The mutations in `t14.json` only widened the caps, so the tightening
     * direction was the untested half.
     */
    expect(picked.picks.length).toBe(2);
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
    expect(picked.picks.length).toBe(3);
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
