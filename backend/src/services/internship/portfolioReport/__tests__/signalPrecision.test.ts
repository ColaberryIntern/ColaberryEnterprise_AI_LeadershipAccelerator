import { classifyEmail, keySentence } from '../timeline';

/**
 * Topic nouns are not signals.
 *
 * ## How this was found
 *
 * By running the real code over the live roster and reading the output instead of the totals.
 * The four changes to this subsystem on 2026-11-11 produced 34 "open questions" across 13
 * interns, which looked like a win until the per-intern rows were inspected. Then:
 *
 *   Omolola    0 question marks; `question` on `review` and `decisions`, from the sentence
 *              "staff review and decisions" inside a status report
 *   Ruth       0 question marks; `issues`, plus `request` out of the SUBJECT "Schedule Request"
 *   Harpreet   0 question marks; `problems`, `guidance`, `review`
 *   Aki        0 question marks; `blocked`, describing somebody else's slide
 *   Tashima    0 question marks; `errors`
 *   Quincy     reported open question: "They are listed with what could not be seen."
 *
 * Seven of the thirteen newest messages contained no question mark at all.
 *
 * ## Why it appeared only after the window widened
 *
 * The old terms were bare nouns, and they were survivable while `classifyEmail` read 250
 * characters: a short window gave them few chances to fire. Widening to a cleaned 4000 characters
 * removed that accidental protection. The window change traded false negatives for false
 * positives, and the tests written alongside it used strong signals - a literal "?" and "cannot" -
 * so they could not catch it.
 *
 * ## The rule now
 *
 * A question is ADDRESSED: a question mark, or a second-person ask. A blocker is FIRST PERSON, or
 * a failure named against the thing that failed. Every fixture below is a real string from the
 * roster, and the ones under "still fires" are the reason the tightening is not simply narrower.
 */

const REPORT = 'Here is where the municipal system stands. Code enforcement permitting covers '
  + 'staff review and decisions, plus a public portal where residents apply and get a tracking '
  + 'link. Ten of eleven stories are complete and verified.';

describe('a topic noun no longer makes something a question', () => {
  it('"staff review and decisions" in a status report is an update', () => {
    expect(REPORT).toMatch(/review and decisions/);
    expect(classifyEmail('Municipal system: project update', REPORT)).toBe('update');
  });

  it('the word Request in a subject line is not an ask', () => {
    expect(classifyEmail('AI Intern - Project Appointment Schedule Request', 'Attaching the schedule as agreed.')).toBe('update');
  });

  it('describing guidance and a review is not asking for one', () => {
    expect(classifyEmail('ToolSmithAI repository and storyline', 'I followed the guidance in the review notes and fixed the problems it listed.')).toBe('update');
  });

  it('an interrogative word used descriptively is not a question', () => {
    expect(classifyEmail('Severity rules', 'They are listed with what could not be seen.')).toBe('update');
  });
});

describe('a topic noun no longer makes something a blocker', () => {
  it('"the issues we closed" is an update', () => {
    expect(classifyEmail('Weekly progress', 'These are the issues we closed this week, and the errors we fixed along the way.')).toBe('update');
  });

  it('reporting that somebody else was blocked is an update', () => {
    expect(classifyEmail('Herriman presentation: my thoughts', 'Slide 10 says the team was blocked for a week before the rewrite.')).toBe('update');
  });
});

describe('still fires, because these are real', () => {
  it.each([
    ['I am unable to access my portal', 'Hello Ali, I am unable to access my portal.'],
    ['unable to, in the subject', 'Unable to Access My Portal - Login Loop'],
    ['is not reaching', 'platform.STORY-000 is not reaching my repo'],
    ['issue + the thing', 'Issue accessing meetings'],
    ['first person cannot', 'I cannot reach the admin endpoint at all.'],
    ['blocked on', 'I am blocked on the access token.'],
  ])('stuck: %s', (_label, text) => {
    expect(classifyEmail(text, text)).toBe('stuck');
  });

  it.each([
    ['a literal question mark', 'Should I remove it before anything goes public?'],
    ['quick question', 'Quick question about the read route'],
    ['question about', 'A question about the read route'],
    ['could you', 'Could you confirm the endpoint before I build against it.'],
    ['please review', 'Please review the definition when you have a moment.'],
    ['what should', 'I am not sure what should happen when the token expires.'],
    ['let me know', 'Let me know whether it is ready.'],
  ])('question: %s', (_label, text) => {
    expect(classifyEmail('Update', text)).toBe('question');
  });
});

describe('the sentence a manager is shown', () => {
  it('prefers the sentence ending in a question mark over a phrase match', () => {
    const body = 'Please review the attached plan. Is partly_unknown acceptable? I will proceed either way.';
    expect(keySentence(body)).toBe('Is partly_unknown acceptable?');
  });

  it('prefers the blocker sentence when the message reports one', () => {
    const body = 'Here is the update on the build. I am unable to access my portal. Could you take a look?';
    expect(keySentence(body)).toBe('I am unable to access my portal.');
  });

  it('is null when nothing in the body is an ask or a blocker', () => {
    expect(keySentence(REPORT)).toBeNull();
  });
});
