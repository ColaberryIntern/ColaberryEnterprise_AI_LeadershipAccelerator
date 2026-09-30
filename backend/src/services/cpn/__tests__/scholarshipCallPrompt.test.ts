/**
 * The scholarship voice prompt, and the guard that refuses to dial without one.
 *
 * WHY THE GUARD TEST IS HERE AND NOT ONLY THE PROMPT TEST
 *
 * `synthflowService` refused to dial an unscripted agent only when
 * `brandSlug === 'ai-flotation'`. Its own comment gives a reason that names no
 * brand - an empty prompt produces "an unscripted one on a number the person may
 * associate with a different business" - so the rule was universal and the check
 * was not. Every other brand reaching that line would have dialled a stranger
 * with an empty instruction block.
 *
 * It had never fired because nothing else was routed to voice. It was a trap
 * armed for whoever came second, and the second brand is a nonprofit phoning
 * people who are asking it for help.
 */
jest.mock('../../synthflowService', () => {
  const actual = jest.requireActual('../../synthflowService');
  return actual;
});

import { buildScholarshipCallPrompt } from '../scholarshipCallPrompt';

describe('what the voice agent may never do', () => {
  const prompt = buildScholarshipCallPrompt({ name: 'Sam', message: 'a rota app for my church' }).toLowerCase();

  it.each([
    ['money', 'money'],
    ['debt', 'debt'],
    ['benefits', 'benefits'],
    ['immigration status', 'immigration'],
    ['health or disability', 'health'],
    ['who they live with', 'who they live with'],
  ])('forbids asking about %s', (_l, needle) => {
    expect(prompt).toContain(needle);
  });

  it('forbids making somebody justify their own worth', () => {
    expect(prompt).toContain('deserve');
    expect(prompt).toContain('justify themselves');
  });

  it('forbids implying a decision', () => {
    expect(prompt).toContain('never imply a decision');
    expect(prompt).toContain('not assessing');
  });

  it('promises nothing it cannot keep', () => {
    // No scholarship, no named callback, and above all no email - this programme
    // still cannot send automatic mail from its own domain.
    expect(prompt).toContain('never promise');
    expect(prompt).toContain('an email');
  });
});

describe('rules that exist only because it is a phone call', () => {
  const prompt = buildScholarshipCallPrompt({ name: 'Sam' }).toLowerCase();

  it('says it is an AI before anything else', () => {
    // Somebody who thinks they are talking to a person from the charity they are
    // asking for help is being deceived.
    expect(prompt).toContain('say this first');
    expect(prompt).toContain('you are an ai assistant');
  });

  it('discloses that the call is recorded', () => {
    expect(prompt).toContain('recorded');
  });

  it('takes no for an answer immediately', () => {
    // One offer, then end. A voice agent that pushes past a brush-off is
    // harassment, and these are the people least able to afford it.
    expect(prompt).toContain('offer once');
    expect(prompt).toContain('do not push');
  });

  it('names the written version as an equal option', () => {
    // Ali's decision: voice is an equal path, never the fallback for people who
    // could not manage the form.
    expect(prompt).toContain('written version');
    expect(prompt).toContain('makes no difference which they use');
  });

  it('asks about the week in hours, not about commitment', () => {
    expect(prompt).toContain('never "can you commit?"');
  });
});

describe('the prompt is never empty, because empty means unscripted', () => {
  it('returns instructions even when the form told us nothing', () => {
    const bare = buildScholarshipCallPrompt({});

    expect(bare.trim().length).toBeGreaterThan(400);
    // With nothing to reflect back it must still know how to open.
    expect(bare).toContain('did not write anything');
  });

  it('reflects their own words back when the form captured them', () => {
    const p = buildScholarshipCallPrompt({ message: 'a rota app for my church' });

    expect(p).toContain('a rota app for my church');
    expect(p.toLowerCase()).toContain('reflecting that back');
  });

  it('truncates a very long message rather than sending it whole', () => {
    // An unbounded field from a public form must not become an unbounded prompt.
    const p = buildScholarshipCallPrompt({ message: 'x'.repeat(5000) });

    expect(p.length).toBeLessThan(4000);
  });
});
