import { classifyEmail } from '../timeline';

/**
 * `classifyEmail` read the subject plus the FIRST 250 CHARACTERS of the body, and nothing else.
 *
 * ## What that cost, measured on production 2026-11-11
 *
 * Of 110 intern emails in the 21 day window (operator account excluded, quoted history and URLs
 * stripped), 83 were longer than that window and **35 read as `update` to the classifier while
 * actually asking something**. 47 carried a literal question mark that sat past character 250.
 *
 * These are not edge cases. Verbatim, each one past the window:
 *
 *   Megan     "Is it fine to leave that in my repo, or should I remove it before anything goes
 *              public?"
 *   Kalkidan  "How should I get a token for the /api/admin/... endpoints the STORY-000 panels
 *              read?"
 *   Victoria  "Could you or Kes run these read-only checks?"
 *   Mihret    "...or do you prefer a domain-scoped read-only route?"
 *
 * An intern writes a careful message, puts the courtesy and the context first and the question at
 * the end - which is how people write - and the system files it as a status update. It then does
 * not become a `question` event on the timeline, does not score as a question in
 * `communications`, and does not reach `open_questions`.
 *
 * ## Why the window cannot simply be widened
 *
 * Reading the whole body naively makes it WORSE, and that was measured too, not guessed. Across
 * the same mail with nothing stripped, 378 classifications changed, and the new ones included a
 * Basecamp tracking URL scoring `stuck` on random characters inside its query string, and
 * automated report mail scoring `stuck` on the word "failure" in a footer. A question mark inside
 * `?p=eyJzIjoi...` is not a question.
 *
 * So the text is cleaned the way `communications.ownText` already cleans it - quoted history cut,
 * URLs dropped - and THEN read generously. The last two tests here are that guard, and they are
 * the reason this change is safe rather than merely larger.
 */

const LEAD_IN = 'Hello, here is where the Saratoga Springs asset management and permitting system stands. '
  + 'I have attached the stakeholder briefing, which explains each part story by story, including '
  + 'screenshots, data migration options and a recording of the dashboard. Ten of eleven stories are '
  + 'complete and verified, and the automated tests all pass. ';

describe('the question that sits past the old 250 character window', () => {
  it('reads a question mark that arrives after a long courteous lead-in', () => {
    const body = `${LEAD_IN}Is it fine to leave that in my repo, or should I remove it before anything goes public?`;
    expect(body.indexOf('?')).toBeGreaterThan(250);
    expect(classifyEmail('Project update', body)).toBe('question');
  });

  it('reads a blocker reported at the end of a long update', () => {
    const body = `${LEAD_IN}The one thing in my way is that I cannot reach the admin endpoint at all.`;
    expect(body.indexOf('cannot')).toBeGreaterThan(250);
    expect(classifyEmail('Project update', body)).toBe('stuck');
  });

  it('still prefers stuck over question when the message does both', () => {
    const body = `${LEAD_IN}I am blocked on access. Could you take a look?`;
    expect(classifyEmail('Project update', body)).toBe('stuck');
  });
});

describe('what did not change', () => {
  it('UNCHANGED: a question in the subject is still a question', () => {
    expect(classifyEmail('Quick question about the read route', 'Thanks for the help.')).toBe('question');
  });

  it('UNCHANGED: a question inside the first 250 characters is still a question', () => {
    expect(classifyEmail('Update', 'Could you confirm the endpoint before I build against it?')).toBe('question');
  });

  it('UNCHANGED: a plain status update is still an update', () => {
    expect(classifyEmail('Progress', `${LEAD_IN}That is everything for this week.`)).toBe('update');
  });

  it('UNCHANGED: empty input is an update rather than a throw', () => {
    expect(classifyEmail(null, null)).toBe('update');
  });
});

describe('the guards that make reading further safe', () => {
  /**
   * The quoted thread is OUR words, not theirs. Counting a question we asked last week as a
   * question they are asking today is how a replied-to thread stays open forever.
   */
  it('ignores a question that appears only in the quoted history below their reply', () => {
    const body = 'Done, that is pushed. On Mon, 10 Nov 2026 at 09:00, Ali wrote: Could you confirm which '
      + 'two capabilities you are dropping, and should the rest wait for approval?';
    expect(classifyEmail('Re: The capability map', body)).toBe('update');
  });

  /**
   * A tracking link's query string is full of question marks and random characters. This is the
   * exact false positive the naive "read everything" version produced on real Basecamp mail.
   */
  it('ignores a question mark inside a URL', () => {
    const body = `${LEAD_IN}The board is at https://track.colaberry.com/track/click/30248114/app.basecamp.com?p=eyJzIjoiMWgxLXhnQ1VI`;
    expect(classifyEmail('Progress', body)).toBe('update');
  });

  it('still sees a real question in a message that also contains a URL', () => {
    const body = `${LEAD_IN}The board is at https://app.basecamp.com/x?p=1 and I need to know: should I file it against sales?`;
    expect(classifyEmail('Progress', body)).toBe('question');
  });
});
