/**
 * The question-review email.
 *
 * The failure that matters here is quiet: an email that marks the wrong option
 * as the answer would send a reviewer looking for a fault in a correct item, or
 * worse, get a wrong item approved because the reviewer read our marking rather
 * than the question. So these tests are almost entirely about the answer
 * marking and about showing the reviewer everything they need to judge it.
 */
jest.mock('../../emailService', () => ({
  guardedSendMail: jest.fn(async () => ({ messageId: 'mid' })),
  resolveEmailRecipient: jest.fn(async (to: string, subject: string) => ({ to, subject })),
  htmlToPlainText: jest.fn((h: string) => h),
  emailHeaders: jest.fn(() => ({})),
}));

import { buildReviewHtml, ReviewEmailItem, buildTriageReportHtml, TriageReportItem } from '../certReviewEmail';

const item = (over: Partial<ReviewEmailItem> = {}): ReviewEmailItem => ({
  question_key: 'CCARF-D1-01',
  revision: 2,
  domain_id: 'D1',
  objective_id: 'D1.1',
  difficulty: 'medium',
  stem: 'An agent loop runs until the model stops requesting tools. What is missing?',
  options: [
    { key: 'A', text: 'A lower temperature' },
    { key: 'B', text: 'A maximum turn count and a defined behaviour at the cap' },
    { key: 'C', text: 'More tools' },
    { key: 'D', text: 'A larger context window' },
  ],
  correct_keys: ['B'],
  rationale: 'A loop with no upper bound has no failure mode short of exhaustion.',
  distractor_rationales: {
    A: 'Changes output variety, not termination.',
    C: 'More ways to keep going.',
    D: 'Extends the runway; the loop still never lands.',
  },
  review_status: 'draft',
  ...over,
});

const render = (over: Partial<ReviewEmailItem> = {}) =>
  buildReviewHtml({ to: 'a@b.c', domainId: 'D1', part: 1, ofParts: 5, items: [item(over)] });

describe('the answer marking', () => {
  it('marks the correct option and only the correct option', () => {
    const html = render();
    const marks = html.match(/ANSWER/g) ?? [];
    expect(marks).toHaveLength(1);
    // The marker must sit in B's row, not merely somewhere in the document.
    const bRow = html.slice(html.indexOf('A maximum turn count'));
    expect(bRow.slice(0, 400)).toContain('ANSWER');
  });

  it('marks every key on a multi-select item', () => {
    const html = render({ correct_keys: ['B', 'C'], distractor_rationales: { A: 'no', D: 'no' } });
    expect((html.match(/ANSWER/g) ?? [])).toHaveLength(2);
  });

  it('shows the case AGAINST each distractor — a reviewer cannot judge what they cannot see', () => {
    const html = render();
    expect(html).toContain('Changes output variety, not termination.');
    expect(html).toContain('More ways to keep going.');
    expect(html).toContain('Extends the runway');
  });

  it('shows the reasoning FOR the answer', () => {
    expect(render()).toContain('no failure mode short of exhaustion');
  });

  it('leads with the question key, so a reply can name the item unambiguously', () => {
    expect(render()).toContain('CCARF-D1-01');
  });

  it('surfaces the review status, so nobody reviews an item that is already approved', () => {
    expect(render({ review_status: 'draft' })).toContain('draft');
  });
});

describe('what it does not do', () => {
  it('escapes question content rather than rendering it as markup', () => {
    const html = render({ stem: 'What does <script>alert(1)</script> do?' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders an item with no rationales rather than throwing', () => {
    expect(() => render({ rationale: null, distractor_rationales: null })).not.toThrow();
  });

  it('says plainly that replying approves nothing', () => {
    const html = render();
    expect(html).toContain('does not change any review status');
  });

  it('tells the reviewer these are not being served', () => {
    expect(render()).toContain('nothing here is being served to a student');
  });
});

/**
 * The triage report. The header is the deliverable.
 *
 * The sentence asserted below is not decoration. An earlier draft put it in a
 * handoff document nobody reads, while the email said only "nothing was
 * approved" -- which a reasonable person reads as "the rest passed review", and
 * which ends with somebody approving 138 unread questions in good faith. The
 * exact wording is pinned here because a test that accepts "a disclaimer is
 * present" accepts a weak one.
 */
const flaggedItem = (over: Partial<TriageReportItem> = {}): TriageReportItem => ({
  question_key: 'CCARF-D1-07',
  domain_id: 'D1',
  objective_id: 'D1.3',
  stem: 'Which change most reduces unbounded tool loops?',
  severity: 'high',
  verdict: 'needs_human',
  concerns: [{ kind: 'defensible_distractor', option: 'C', detail: 'C is arguably right under a fixed budget.' }],
  ...over,
});

/**
 * Assert on what a reader sees, not on where the template wrapped.
 *
 * The first version of these tests failed on a sentence that was correct in the
 * output and split across a newline in the source. A prose assertion that breaks
 * when someone re-indents the HTML is testing the indentation.
 */
const flat = (html: string) => html.replace(/\s+/g, ' ');

const report = (over: Partial<Parameters<typeof buildTriageReportHtml>[0]> = {}) =>
  flat(buildTriageReportHtml({
    to: 'a@b.c', scoredCount: 150, flagged: [flaggedItem()],
    reviewerModel: 'gpt-4o-mini', runId: 'triage-20260908T0100', ...over,
  }));

describe('the triage report header', () => {
  it('carries the exact sentence that forecloses "the rest passed review"', () => {
    expect(report()).toContain('which is not the same as checked by a person');
  });

  it('states the denominator, the quiet count and the flagged count', () => {
    const html = report({ scoredCount: 150, flagged: [flaggedItem(), flaggedItem({ question_key: 'CCARF-D2-04' })] });
    expect(html).toContain('150 scored by gpt-4o-mini');
    expect(html).toContain('148 drew no objection');   // computed, not written down
    expect(html).toContain('2 need your judgement');
  });

  it('says plainly that nothing was approved and nothing became servable', () => {
    expect(report()).toContain('Nothing was approved and nothing became servable');
  });

  it('names the reviewer as a model, and as a different one from the author', () => {
    const html = report();
    expect(html).toContain('a language model asked to argue against');
    expect(html).toContain('a second');   // "a second opinion rather than a check"
  });

  it('does not claim the unflagged were checked', () => {
    expect(report()).not.toMatch(/passed review|cleared|verified|approved by/i);
  });
});

describe('the triage report body', () => {
  it('shows each flagged question with its key, concern and the option it is about', () => {
    const html = report();
    expect(html).toContain('CCARF-D1-07');
    expect(html).toContain('C is arguably right under a fixed budget.');
    expect(html).toContain('option C');
  });

  it('renders the concern KIND in words a reader can act on, not a slug', () => {
    expect(report()).toContain('A wrong option may also be right');
    expect(report()).not.toContain('defensible_distractor');
  });

  it('escapes question content rather than rendering it as markup', () => {
    const html = report({ flagged: [flaggedItem({ stem: 'What does <script>alert(1)</script> do?' })] });
    expect(html).not.toContain('<script>alert(1)</script>');   // flattening does not un-escape
    expect(html).toContain('&lt;script&gt;');
  });

  it('when NOTHING is flagged, still refuses to call it clearance', () => {
    const html = report({ flagged: [] });
    expect(html).toContain('That is not clearance');
    expect(html).toContain('has not been read by a person');
    expect(html).toContain('150 scored by gpt-4o-mini');
  });

  it('carries the run id, so the rows behind it can be found and undone', () => {
    expect(report()).toContain('triage-20260908T0100');
  });
});

