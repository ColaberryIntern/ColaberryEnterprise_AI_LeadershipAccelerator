import { factsFor, fillFacts, problemsFor } from '../draftFacts';

/** CH6.3 facts by code and the submit validator (pure). */
const ev = (o: Record<string, unknown> = {}): any => ({
  starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: new Date('2026-12-02T01:00:00Z'), repeat_rule: null,
  join_url: 'https://zoom.us/j/9', registration_url: null, hosts: [{ name: 'Aleem', role: 'Design' }, { name: 'Sai' }], ...o,
});
const NOW = new Date('2026-11-20T15:00:00Z');

describe('factsFor: Central date and time, from the record', () => {
  it('6:00 PM CST on Tuesday, December 1 (00:00Z December 2)', () => {
    expect(factsFor(ev(), null, NOW)).toMatchObject({ date: 'Tuesday, December 1', time: '6:00 PM CST', join_link: 'https://zoom.us/j/9', registration_link: null, hosts: 'Aleem (Design) and Sai' });
  });

  it('summer is CDT; the spring and autumn change days are right', () => {
    expect(factsFor(ev({ starts_at: new Date('2027-07-07T23:00:00Z') }), null, NOW)).toMatchObject({ date: 'Wednesday, July 7', time: '6:00 PM CDT' });
    expect(factsFor(ev({ starts_at: new Date('2027-03-14T23:00:00Z') }), null, NOW)).toMatchObject({ date: 'Sunday, March 14', time: '6:00 PM CDT' });
    expect(factsFor(ev({ starts_at: new Date('2026-11-02T00:00:00Z') }), null, NOW)).toMatchObject({ date: 'Sunday, November 1', time: '6:00 PM CST' });
  });

  it('a series: the next date that has not started, or the occurrence the message was made for', () => {
    const weekly = ev({ starts_at: new Date('2026-11-18T00:00:00Z'), repeat_rule: { freq: 'weekly', until: '2027-01-31' } });
    expect(factsFor(weekly, null, NOW).date).toBe('Tuesday, November 24');
    expect(factsFor(weekly, new Date('2026-12-09T00:00:00Z'), NOW).date).toBe('Tuesday, December 8');
  });
});

describe('fillFacts', () => {
  it('fills every placeholder the event has; one it lacks stays for the validator', () => {
    const f = factsFor(ev(), null, NOW);
    expect(fillFacts('Join {{HOSTS}} on {{DATE}} at {{TIME}}: {{JOIN_LINK}}', f)).toBe('Join Aleem (Design) and Sai on Tuesday, December 1 at 6:00 PM CST: https://zoom.us/j/9');
    expect(fillFacts('Register: {{REGISTRATION_LINK}}', f)).toBe('Register: {{REGISTRATION_LINK}}');
    expect(fillFacts('No facts here {{DATE}}', null)).toBe('No facts here {{DATE}}');
  });
});

describe('problemsFor: what blocks a submit', () => {
  const f = factsFor(ev(), null, NOW);
  const post = (body: string) => ({ channel: 'community_post' as const, title: null, body });
  const app = (title: string, body: string) => ({ channel: 'in_app' as const, title, body });

  it('a draft with the correct date and time passes (title + body together for in-app)', () => {
    expect(problemsFor(post('Demo Tuesday is on Tuesday, December 1 at 6:00 PM CST. Bring a question.'), f)).toEqual([]);
    expect(problemsFor(app('Demo Tuesday, December 1', 'Starts at 6:00 PM CST'), f)).toEqual([]);
  });

  it('missing the date, or the time', () => {
    expect(problemsFor(post('Demo Tuesday starts at 6:00 PM CST.'), f)).toEqual(['The community post must say the date: Tuesday, December 1.']);
    expect(problemsFor(post('Demo is on Tuesday, December 1.'), f)).toEqual(['The community post must say the time: 6:00 PM CST.']);
  });

  it('the model wrote a WRONG date or time itself: blocked, naming what it said', () => {
    const p = problemsFor(post('See you Tuesday, December 1 at 6:00 PM CST, or catch up on Dec 2 at 7 pm.'), f);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('"Dec 2"');
    expect(p[0]).toContain('"7 pm"');
    expect(problemsFor(post('Join us Wednesday, December 1 at 6:00 PM CST.'), f)[0]).toContain('"Wednesday"');
  });

  it('an unfilled placeholder, and a banned word (canonical TWC rule)', () => {
    expect(problemsFor(post('Tuesday, December 1 at 6:00 PM CST. Register: {{REGISTRATION_LINK}}'), f)[0]).toContain('{{REGISTRATION_LINK}}');
    expect(problemsFor(post('A free session on Tuesday, December 1 at 6:00 PM CST.'), f)).toEqual(['The community post uses a word the TWC rules do not allow on Colaberry promotions. Rewrite that sentence.']);
  });

  it('a subject-only message needs no date, but the banned-word and placeholder checks still apply', () => {
    expect(problemsFor(post('The new Weekly Live guide is in the library.'), null)).toEqual([]);
    expect(problemsFor(post('The guide is FREE for members.'), null)).toHaveLength(1);
  });
});
