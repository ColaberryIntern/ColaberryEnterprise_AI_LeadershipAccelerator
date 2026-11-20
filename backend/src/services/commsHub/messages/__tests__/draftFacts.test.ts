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
    const p = problemsFor(post('See you Tuesday, December 1 at 6:00 PM CST, or catch up on Dec 2 at 8 pm.'), f);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('"Dec 2"');
    expect(p[0]).toContain('"8 pm"');
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

describe('CH6.3 attempt 2: the validator reads values, not exact text', () => {
  // Tuesday, December 1, 6:00 PM CST to 7:00 PM (00:00Z-01:00Z December 2).
  const f = factsFor(ev(), null, NOW);
  const ok = (body: string): string[] => problemsFor({ channel: 'community_post', title: null, body }, f);

  it.each([
    'Demo Tuesday is Tuesday, December 1 at 6 PM CST.',
    'Demo Tuesday is Tue, Dec 1 at 6pm.',
    'Join us Dec. 1st at 6:00 p.m. CST.',
    'December 1, 2026, 6:00 PM Central Time.',
    'Tuesday, 1 December, 6:00 PM CT.',
    'On 12/1 from 6:00 PM to 7:00 PM CST.',
    'Tuesday, December 1 at 18:00 Central.',
  ])('correct, however written: %s', (body) => {
    expect(ok(body)).toEqual([]);
  });

  it.each([
    ['Tuesday, December 1 at 6:00 PM EST.', /time in EST/],
    ['Tuesday, December 1 at 6:00 PM PT.', /time in PT/],
    ['Tuesday, December 1 at 6:00 PM CDT.', /time in CDT/], // December is CST
    ['Tuesday, December 1 at 6:00 PM, or 18:30 for the replay.', /"18:30"/],
    ['Tuesday, December 1 at 6:00 PM CST, wrap-up at noon.', /"noon"/],
    ['See you tomorrow, Tuesday, December 1 at 6:00 PM CST.', /"tomorrow"/],
    ['Tuesday, December 1 at 6:00 PM CST. Next week we go deeper.', /"Next week"/],
    ['Tuesday, December 1 at 6:00 PM CST (2026-12-02 in UTC).', /"2026-12-02"/],
    ['Weds, December 1 at 6:00 PM CST.', /"Weds"/],
    ['Tuesday, December 1 at 6:00 PM CST, doors at eight pm.', /"eight pm"/],
    ['Tuesday, December 1 at 6:00 PM CST, or 7 o\'clock on the dot.', /"7 o'clock"/],
    ['Tuesday, 2 December at 6:00 PM CST.', /"2 December"/],
    ['Tuesday, December 1 at 6:00 PM CST. Details: https://evil.example.com/x', /link that is not this event's/],
  ])('wrong, and named: %s', (body, pattern) => {
    expect(ok(body).join(' ')).toMatch(pattern);
  });

  it('the event\'s own links pass; a subject-only message may link a colaberry.com page and nothing else', () => {
    expect(ok('Tuesday, December 1 at 6:00 PM CST. Join: https://zoom.us/j/9')).toEqual([]);
    expect(problemsFor({ channel: 'community_post', title: null, body: 'The guide: https://training.colaberry.com/guide' }, null)).toEqual([]);
    expect(problemsFor({ channel: 'community_post', title: null, body: 'The guide: https://bit.ly/abc' }, null)[0]).toMatch(/not a Colaberry page/);
  });

  it('a noon event may say "noon"', () => {
    const noon = factsFor(ev({ starts_at: new Date('2026-12-01T18:00:00Z'), ends_at: null }), null, NOW);
    expect(problemsFor({ channel: 'community_post', title: null, body: 'Office hours Tuesday, December 1 at noon CST.' }, noon)).toEqual([]);
  });
});

describe('CH6.4 Recording and thanks (after the event)', () => {
  const f = factsFor(ev(), null, NOW, 'https://enterprise.colaberry.ai/portal/replays');
  const post = (body: string) => ({ channel: 'community_post' as const, title: null, body });
  it('need not restate the date and time, may link the replays page, and still may not state a wrong date or a relative day', () => {
    expect(problemsFor(post('Thank you for coming to Demo Tuesday. The recording: https://enterprise.colaberry.ai/portal/replays'), f, { postEvent: true })).toEqual([]);
    expect(problemsFor(post('Thanks for joining on December 3.'), f, { postEvent: true }).join(' ')).toMatch(/"December 3"/);
    expect(problemsFor(post('Thanks for joining today.'), f, { postEvent: true }).join(' ')).toMatch(/"today"/);
    // Not a thanks message: the date and time are still required.
    expect(problemsFor(post('Thank you. The recording: https://enterprise.colaberry.ai/portal/replays'), f).join(' ')).toMatch(/must say the date/);
  });
  it('fills {{REPLAY_LINK}}', () => {
    expect(fillFacts('Watch it: {{REPLAY_LINK}}', f)).toBe('Watch it: https://enterprise.colaberry.ai/portal/replays');
  });
});
