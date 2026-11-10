import { composeInternshipPortfolio } from '../compose';
import { fallbackSummary, summarizeInterns, summaryFacts, validateSummary } from '../summary';
import type { ChatClient } from '../narrate';
import { renderInternshipPortfolio } from '../render';
import { NOW, collected } from './fixtures';

const report = () => composeInternshipPortfolio(collected(), { now: NOW });
const card = () => report().groups[0].interns[0];
const stub = (content: string | (() => never)): ChatClient => ({
  chat: { completions: { create: async () => (typeof content === 'function' ? content() : { choices: [{ message: { content } }] }) } },
});

describe('summary: the guardrails on the model paragraph', () => {
  const facts = { project: { verifiedStories: 7, totalStories: 189, commitMessages: ['Nov 5: verify six panels'] } };

  it('accepts a grounded 2-3 sentence paragraph', () => {
    const v = validateSummary('Kalkidan is early in the build and verified the Command Center, 7 stories so far. Last work was Nov 5 on the six panels.', facts);
    expect(v.ok).toBe(true);
  });

  it('rejects a number that is not in the facts (an invented count or date)', () => {
    const v = validateSummary('Kalkidan has 12 stories verified. Next is the decision story.', facts);
    expect(v).toEqual({ ok: false, reason: 'number not in facts: 12' });
  });

  it('rejects gendered pronouns', () => {
    expect(validateSummary('She is building panels. She has 7 verified.', facts)).toEqual({ ok: false, reason: 'gendered pronoun' });
  });

  it('rejects one sentence or more than three', () => {
    expect(validateSummary('Kalkidan is building.', facts).ok).toBe(false);
    expect(validateSummary('A one. B two. C three. D four.', facts).ok).toBe(false);
  });

  it('rejects any restated count: the progress bar owns those (prod: "46 of 136" when it was 47)', () => {
    const f = { firstName: 'Quincy', n: [46, 47, 136, 35] };
    expect(validateSummary('Quincy has 46 of 136 stories verified. Next is the watch.', f)).toEqual({ ok: false, reason: 'restates a count' });
    expect(validateSummary('Quincy has 4 days out of 12 done. Next is more.', f)).toEqual({ ok: false, reason: 'restates a count' });
    expect(validateSummary('Quincy is well underway, 35% verified. Next is the watch.', f).ok).toBe(true);
  });

  it('must start with their name', () => {
    expect(validateSummary('0 stories so far. Then more.', { firstName: 'Samrawit' })).toEqual({ ok: false, reason: 'does not start with their name' });
  });

  it('may not say "nothing" about someone who trained (prod: Harpreet, Megan)', () => {
    expect(validateSummary('Harpreet has no project and has not worked on anything. Next is a project.', { firstName: 'Harpreet', trainingDaysLast21: 4 }))
      .toEqual({ ok: false, reason: 'says no activity but they trained' });
  });

  it('rejects the next story described as current work (prod: Mihret, Aki)', () => {
    const f = { lastWorkedOn: 'Nov 2 commit: correct the record of answers', notStartedYet: ['Review the vendored design-system drift pull request'] };
    expect(validateSummary('Mihret is reviewing the vendored design-system drift pull request now. They are waiting on a reply.', f))
      .toEqual({ ok: false, reason: 'next/late story described as current work' });
    expect(validateSummary('Mihret last corrected the record of answers. Next is to review the vendored design-system drift pull request.', f).ok).toBe(true);
  });

  it('a word that merely contains "he" is not a pronoun', () => {
    expect(validateSummary('They finished the theme. Then they shipped it.', {}).ok).toBe(true);
  });

  it('strips em-dashes', () => {
    const v = validateSummary('Kalkidan is building — the panels. Next is review.', facts);
    expect(v.ok && v.summary).toBe('Kalkidan is building - the panels. Next is review.');
  });
});

describe('summary: facts and fallback', () => {
  it('gives the model the commits (tag stripped), what they last worked on, and the progress phrase', () => {
    const f = summaryFacts(card()) as { recentCommits: string[]; lastWorkedOn: string; progressPhrase: string; notStartedYet: string[] };
    expect(f.recentCommits.join()).toContain('build it');
    expect(f.lastWorkedOn).toMatch(/commit: build it$/);
    expect(f.progressPhrase).toBe('1 of 10 stories verified (10%)');
    expect(f.notStartedYet).toEqual(['Next thing']);
  });

  it('the fallback is always present, names the project and progress, and passes its own number check', () => {
    const c = card();
    expect(c.summary).toBe(fallbackSummary(c));
    expect(c.summary).toMatch(/^Kalkidan is early in the build on Console project and last committed "build it"\. Their last build work was 1 day ago\./);
    expect(validateSummary(c.summary, summaryFacts(c) as Record<string, unknown>).ok).toBe(true);
  });

  it('a no-project intern still gets a specific paragraph', () => {
    const r = composeInternshipPortfolio(collected({ roster: [{ ...collected().roster[0], project: null }], projects: [] }), { now: NOW });
    expect(r.groups[0].interns[0].summary).toMatch(/^Kalkidan has no project yet; training is at week 2 with the weeks 1-3 gate at 2\/3/);
  });
});

describe('summary: running the model', () => {
  it('uses the model paragraph when it passes', async () => {
    const r = report();
    const res = await summarizeInterns(r, stub(JSON.stringify({ summary: 'Kalkidan is early in the build and last committed build it. Next is the next thing.' })));
    expect(res).toEqual({ fromModel: 1, total: 1 });
    expect(r.groups[0].interns[0].summaryFromModel).toBe(true);
  });

  it('keeps the fallback when the model invents a number', async () => {
    const r = report();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await summarizeInterns(r, stub(JSON.stringify({ summary: 'Kalkidan has 99 stories verified. Next is more.' })));
    expect(r.groups[0].interns[0].summaryFromModel).toBe(false);
    expect(r.groups[0].interns[0].summary).toMatch(/^Kalkidan is early in the build on Console project/);
    warn.mockRestore();
  });

  it('keeps the fallback when the API fails', async () => {
    const r = report();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await summarizeInterns(r, stub(() => { throw new Error('503'); }));
    expect(res.fromModel).toBe(0);
    expect(r.groups[0].interns[0].summary.length).toBeGreaterThan(20);
    warn.mockRestore();
  });

  it('renders the paragraph above the timeline', () => {
    const r = report();
    const { html } = renderInternshipPortfolio(r);
    const card0 = html.slice(html.indexOf('Kalkidan Bezabeh</div>'));
    expect(card0.indexOf('Kalkidan is early')).toBeLessThan(card0.indexOf('TODAY'));
  });
});
