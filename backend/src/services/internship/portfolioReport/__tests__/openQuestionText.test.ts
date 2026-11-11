import { emailView } from '../compose';
import { classifyEmail } from '../timeline';
import { openQuestions } from '../sidecar/build';
import type { InternCard } from '../types';

/**
 * The last place the 250 character blindness still lived.
 *
 * PR #3900 widened `classifyEmail` to read a cleaned 4000 characters. It could not reach
 * `open_questions`, because `emailView` cut each thread to **300 raw characters** before anything
 * classified it. The classifier got a greeting and a sentence of context, and nothing else - so
 * the same 35 intern emails that ask something past character 250 were still filed as updates on
 * their way into the sidecar.
 *
 * Measured on production 2026-11-11: 47 intern emails in the window carried a literal question
 * mark that sat past character 250, including every one quoted in `classifyWindow.test.ts`.
 *
 * ## The second half of the problem
 *
 * Even once such a message IS admitted, `text` was the first 300 characters - the greeting. A
 * manager reading the console would see "Hi, here is where the Saratoga Springs system stands"
 * and not the question they are being asked. Carrying the whole body instead is not the answer
 * either: `narrate.ts` feeds this text to a model for eight threads per intern, and the sidecar
 * already runs to hundreds of kilobytes.
 *
 * So the thread now carries `ask`: the one sentence that made it a question or a blocker. Bounded
 * like a snippet, useful like the whole body.
 */

const NOW = new Date('2026-11-11T18:00:00.000Z').getTime();
const THEM = 'megan@example.com';

/**
 * Their real shape: courtesy, then context, then the question. The question starts past 300.
 *
 * Deliberately free of every word in QUESTION_RE and STUCK_RE. The first draft of this fixture
 * opened with "thank you for the review", and `review` is in QUESTION_RE - so the message was
 * admitted to `open_questions` by the courtesy line rather than by the question, and the control
 * below passed against the unfixed code. A fixture that passes for the wrong reason proves
 * nothing, so this one is checked by the first test rather than trusted.
 */
const LEAD_IN = 'Hi, thanks for the quick turnaround on the last one. '
  + 'Here is where the case study stands. I have pushed the repository, written the README, and '
  + 'recorded a walkthrough of the dashboard so you get the flow end to end without running it '
  + 'locally. The analysis notebook is in there too, along with the cleaned data and the slide '
  + 'deck I used for the dry run last week. ';
const QUESTION = 'Is it fine to leave the API key stub in my repo, or should I remove it before anything goes public?';
const BODY = `${LEAD_IN}${QUESTION}`;

const card = (snippet: string, subject = 'Case study: where it stands'): InternCard => {
  const emails = [{ email: THEM, subject, snippet, received_at: '2026-11-10T14:00:00.000Z' }];
  return { emails: emailView(THEM, emails, [], NOW, []), replies: [] } as unknown as InternCard;
};

describe('a question asked past the 300 character thread cut', () => {
  /**
   * Guards the fixture itself. The lead-in must be long enough to bury the question AND must not
   * trip either classifier regex on its own, or every assertion below is measuring the greeting.
   */
  it('CONTROL: the lead-in runs past 300 characters and is not itself a question or a blocker', () => {
    expect(LEAD_IN.length).toBeGreaterThan(300);
    expect(BODY.indexOf('?')).toBeGreaterThan(300);
    expect(classifyEmail('Case study: where it stands', LEAD_IN)).toBe('update');
  });

  it('reaches open_questions at all', () => {
    const open = openQuestions(card(BODY));
    expect(open).toHaveLength(1);
    expect(open[0].kind).toBe('question');
  });

  it('shows the manager the question, not the greeting', () => {
    const [q] = openQuestions(card(BODY));
    expect(q.text).toContain('should I remove it before anything goes public');
    expect(q.text).not.toMatch(/^Hi, thank you for the review/);
  });

  it('finds a blocker stated late in the same way', () => {
    const body = `${LEAD_IN}The one thing in my way is that I cannot reach the admin endpoint.`;
    const [q] = openQuestions(card(body));
    expect(q.kind).toBe('stuck');
    expect(q.text).toContain('cannot reach the admin endpoint');
  });
});

describe('what the thread carries', () => {
  it('classifies the thread once, from the whole body, and says so on the thread', () => {
    const [thread] = card(BODY).emails.threads;
    expect(thread.kind).toBe('question');
    expect(thread.ask).toContain('should I remove it');
  });

  it('leaves ask null on a plain update, rather than inventing a question', () => {
    const [thread] = card(`${LEAD_IN}That is everything for this week.`).emails.threads;
    expect(thread.kind).toBe('update');
    expect(thread.ask).toBeNull();
  });

  /**
   * The display snippet is still bounded, because narrate.ts hands it to a model for up to eight
   * threads per intern. It must simply stop on a sentence instead of mid-word.
   */
  it('keeps the display snippet bounded and never cuts it mid-word', () => {
    const [thread] = card(BODY).emails.threads;
    expect(thread.snippet.length).toBeLessThanOrEqual(400);
    expect(thread.snippet).toMatch(/[.?!]$|\.\.\.$/);
  });
});

describe('what did not change', () => {
  it('UNCHANGED: a short question still lands in open_questions', () => {
    const open = openQuestions(card('Could you confirm the endpoint before I build against it?'));
    expect(open).toHaveLength(1);
    expect(open[0].kind).toBe('question');
  });

  it('UNCHANGED: a plain update still stays out of open_questions', () => {
    expect(openQuestions(card('Pushed the README and the walkthrough. That is everything.'))).toEqual([]);
  });

  it('UNCHANGED: a question in the subject alone still counts', () => {
    const open = openQuestions(card('Pushed it all.', 'Quick question on the read route'));
    expect(open).toHaveLength(1);
  });

  it('UNCHANGED: the subject is still carried verbatim', () => {
    expect(openQuestions(card(BODY))[0].subject).toBe('Case study: where it stands');
  });
});
