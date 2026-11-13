import { bodyFacts, validateMiddle, type BodyFacts } from '../modelBody';

/**
 * The gate on model-written message bodies.
 *
 * Ali approved the hybrid on 2026-11-11: the model may write the middle of the message, behind a
 * check on the facts. This file is that check, and it is deliberately a list of REFUSALS rather
 * than a score.
 *
 * The reason is the failure mode. When `summary.ts` lets a bad sentence through, a number on a
 * dashboard is wrong and Ali sees it. When this lets a bad sentence through, a false statement
 * arrives in Ali's name, by email, at a person who may never mention it and will quietly trust us
 * less. The cost of refusing is only that today's deterministic wording is used instead, which is
 * the wording that has been going out all along. So the gate refuses on any doubt.
 *
 * Every rejection case below is a real failure this pipeline has already produced somewhere:
 * a gendered intern on the 9 Nov dry run, "46 of 136" when the number was 47, a date nobody
 * promised, and a paraphrase presented as a quotation.
 */

const FACTS: BodyFacts = bodyFacts({
  firstName: 'Quincy',
  focus: 'stalled',
  tier: 'quiet',
  theirWords: {
    subject: 'The Capability Map, and where your decisions stand',
    receivedAt: '2026-11-09T16:00:00.000Z',
    text: 'The set is empty on the board and what remains is R5 and above, which needs the live export. Is partly_unknown acceptable?',
  },
  openQuestions: [{ subject: 'The Capability Map', text: 'Is partly_unknown acceptable?' }],
  promises: [{ quote: 'On the six: you will have them before Friday.', sentAt: '2026-11-10T14:21:00.000Z' }],
  project: { name: 'Agent: Ellis', hasRepo: true },
  signals: { storiesVerified: 47, storiesTotal: 136, daysSinceBuildWork: 3, overdueTasks: 0 },
  deadline: null,
  nextTask: { title: 'Wire the export to the board', dueOn: null },
  draft: 'Your last build work was 3 days ago. The next thing is to wire the export to the board.',
});

const GOOD = 'You flagged that the set is empty on the board and that what remains needs the live export. '
  + 'That is the thing to clear first, because everything above R5 is waiting behind it. '
  + 'Your last build work was 3 days ago, so this is the one to pick up today.';

describe('a draft that is allowed through', () => {
  it('accepts a middle that only uses the facts it was given', () => {
    const v = validateMiddle(GOOD, FACTS);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.middle).toContain('live export');
  });

  it('accepts a verbatim quotation of their own words', () => {
    const text = `You asked "Is partly_unknown acceptable?" and that is a real decision, not a detail. ${GOOD}`;
    expect(validateMiddle(text, FACTS).ok).toBe(true);
  });

  it('accepts a day name that the facts themselves contain', () => {
    const text = `We said you would have the six before Friday, and that still stands. ${GOOD}`;
    expect(validateMiddle(text, FACTS).ok).toBe(true);
  });
});

describe('what it refuses, and why each one exists', () => {
  const reject = (text: string): string => {
    const v = validateMiddle(text, FACTS);
    expect(v.ok).toBe(false);
    return v.ok ? '' : v.reason;
  };

  it('a gendered pronoun, because their pronouns are not in the data', () => {
    expect(reject(`${GOOD} I will ask her to take a look.`)).toBe('gendered pronoun');
  });

  it('a number the facts do not contain', () => {
    expect(reject('You have cleared 52 of 136 stories so far, which is good progress. Keep going today.'))
      .toMatch(/number not in facts: 52/);
  });

  it('a day name nobody promised', () => {
    expect(reject(`${GOOD} Let us get it done by Tuesday.`)).toMatch(/date word not in facts: tuesday/);
  });

  it('a quotation that is a paraphrase rather than their words', () => {
    expect(reject(`You said "the board is basically finished now" and I want to check that. ${GOOD}`))
      .toMatch(/quoted words are not theirs/);
  });

  it('a link the facts do not contain', () => {
    expect(reject(`${GOOD} The board is at https://example.com/not-in-the-facts here.`))
      .toMatch(/link not in facts/);
  });

  it('an em dash, because the sender refuses one', () => {
    expect(reject('You flagged the export problem — and it is the thing to clear first today. It matters.'))
      .toMatch(/sender would refuse it/);
  });

  it('an angle bracket, for the same reason', () => {
    expect(reject('Open Internship > Projects and start the export from there today. That is the one thing.'))
      .toMatch(/sender would refuse it/);
  });

  it('a greeting, which is not its line to write', () => {
    expect(reject(`Hi Quincy, ${GOOD}`)).toMatch(/wrote the greeting/);
  });

  it('a sign-off, for the same structural reason', () => {
    expect(reject(`${GOOD}\n\nThanks,\nAli`)).toMatch(/sender would refuse it/);
  });

  it('an empty draft', () => {
    expect(reject('')).toBe('empty');
  });

  it('one sentence, which is a fragment rather than a message', () => {
    expect(reject('Your last build work was 3 days ago and the export is the thing to clear first today.'))
      .toMatch(/1 sentences/);
  });

  it('something far too long to be a nudge', () => {
    expect(reject(`${GOOD} ${'The export still needs wiring to the board. '.repeat(40)}`)).toMatch(/too long/);
  });
});

describe('the facts object is the whole world the model sees', () => {
  it('a number is allowed because it is in the facts, not because it looks plausible', () => {
    expect(validateMiddle('Your last build work was 3 days ago, which is why this is today. Pick the export back up.', FACTS).ok).toBe(true);
    expect(validateMiddle('Your last build work was 4 days ago, which is why this is today. Pick the export back up.', FACTS).ok).toBe(false);
  });

  /**
   * The guard that matters most for the premise of this whole workstream. Their words are the one
   * thing a message is supposed to be built from, so a quotation is checked against them and
   * nothing else - not against the draft, and not against the rest of the facts.
   */
  it('checks quotations against their words even when the phrase appears in our own draft', () => {
    const facts = bodyFacts({ ...FACTS, draft: 'Wire the export to the board, which is the next thing.' });
    expect(validateMiddle('You told me "wire the export to the board" was next, so let us do that. It is the one thing today.', facts).ok)
      .toBe(false);
  });
});
