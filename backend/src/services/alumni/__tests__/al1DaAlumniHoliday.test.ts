/**
 * AL1: the DA alumni holiday campaign. Ali's text word for word, one AI-written personal opening
 * per email that can never carry a price, number, link or claim, and an audience that never
 * includes payers, unsubscribes or staff.
 */
jest.mock('../../llmCallWrapper', () => ({ getOpenAI: jest.fn() }));

import { openingContextFrom, screenOpening, writeOpening, fillPersonalOpening, fallbackOpening, buildOpeningPrompt, OPENING_PLACEHOLDER } from '../alumniPersonalOpening';
import { DA_ALUMNI_STEPS, alumniStepBody, ALUMNI_SIGNUP_URL } from '../daAlumniHolidayCopy';
import { AUDIENCE_SQL } from '../../../scripts/ensureDaAlumniHolidayCampaign';

const CTX = openingContextFrom({ class_name: 'Data Analytics Bootcamp - Jul 11 2020 (ONLINE)', career_stage: 'placed' });

describe('reading the alumni record', () => {
  it('turns the CCPP class name into a program and a class month and year', () => {
    expect(CTX).toEqual({ program: 'Data Analytics Bootcamp', classMonthYear: 'July 2020', classYear: '2020', careerStage: 'placed' });
    expect(openingContextFrom({ class_name: 'DATA ANALYTICS BOOTCAMP - MAR 6 2021 (ONLINE)' })).toMatchObject({ program: 'Data Analytics Bootcamp', classMonthYear: 'March 2021' });
    expect(openingContextFrom({ class_name: 'Data Analytics I with MS SQL Server BI - Jul 14 2018 (ONLINE)' }).classMonthYear).toBe('July 2018');
  });
  it('says less, never something wrong, when the record is thin', () => {
    expect(openingContextFrom(null)).toEqual({ program: null, classMonthYear: null, classYear: null, careerStage: null });
    expect(buildOpeningPrompt(openingContextFrom(null), 'x').user).toMatch(/They are a Colaberry alum\./);
  });
});

describe('the opening screen', () => {
  it('accepts a warm line that names their class and year', () => {
    expect(screenOpening('It has been a while since your July 2020 Data Analytics Bootcamp, and I still think about that cohort.', CTX)).toEqual([]);
  });
  it.each([
    ['a price', 'Our yearly plan is a great deal right now.'],
    ['a dollar sign', 'Save $894 this week.'],
    ['a percent', 'Half off, 50% for alumni.'],
    ['a number that is not their class year', 'Over 10000 people have joined.'],
    ['a link', 'Visit https://enterprise.colaberry.ai today.'],
    ['a salary claim', 'This role pays a great salary.'],
    ['three sentences', 'One. Two. Three.'],
    ['a greeting', 'Hi Ana, hope you are well.'],
    ['a dash', 'Your class — July 2020 — was special.'],
    ['a company claim', 'Anthropic is hiring for this.'],
  ])('rejects %s', (_label, text) => {
    expect(screenOpening(text, CTX).length).toBeGreaterThan(0);
  });
});

describe('writing the opening', () => {
  it('uses the AI line when it passes', async () => {
    const r = await writeOpening(CTX, 'the role change', 0, async () => 'I hope you are well since your July 2020 bootcamp.');
    expect(r).toEqual({ text: 'I hope you are well since your July 2020 bootcamp.', source: 'ai', problems: [] });
  });
  it('falls back to the plain line for that email when the draft breaks a rule', async () => {
    const r = await writeOpening(CTX, 'x', 3, async () => 'Get 50% off now!');
    expect(r.source).toBe('fallback');
    expect(r.text).toBe(fallbackOpening(3));
    expect(r.problems.join(' ')).toMatch(/banned|numbers/);
  });
  it('falls back, never throws, when the model is unreachable', async () => {
    const r = await writeOpening(CTX, 'x', 1, async () => { throw Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' }); });
    expect(r).toMatchObject({ source: 'fallback', text: fallbackOpening(1) });
    expect(r.problems[0]).toMatch(/APIConnectionTimeoutError/);
  });
  it('fills the placeholder, escaped, and leaves other bodies alone', () => {
    expect(fillPersonalOpening(`<p>${OPENING_PLACEHOLDER}</p>`, 'Fish & <chips>')).toBe('<p>Fish &amp; &lt;chips&gt;</p>');
    expect(fillPersonalOpening('<p>no placeholder</p>', 'x')).toBe('<p>no placeholder</p>');
  });
  it('every fallback passes its own screen', () => {
    for (let i = 0; i < 10; i++) expect(screenOpening(fallbackOpening(i), CTX)).toEqual([]);
  });
});

describe("Ali's ten emails", () => {
  it('ten emails, Nov 24 to Dec 24, with Thanksgiving and Christmas Specials on the right days', () => {
    expect(DA_ALUMNI_STEPS.map((s) => s.date)).toEqual(['2026-11-24', '2026-11-26', '2026-11-30', '2026-12-03', '2026-12-07', '2026-12-10', '2026-12-14', '2026-12-17', '2026-12-21', '2026-12-24']);
    expect(DA_ALUMNI_STEPS[1].subject).toMatch(/Thanksgiving Special/);
    expect(DA_ALUMNI_STEPS[8].subject).toMatch(/Christmas Special/);
  });
  it('every email says Ali is letting all alumni know, offers 50% ($894 instead of $1,788) and says how to claim it', () => {
    for (const s of DA_ALUMNI_STEPS) {
      const body = alumniStepBody(s, 'Ana');
      expect(body).toMatch(/letting all (of our )?alumni know/);
      expect(body).toContain('$894 instead of $1,788');
      expect(body).toContain(ALUMNI_SIGNUP_URL);
    }
  });
  it('never says the offer ends at year end, never uses the no-cost word, no long dashes', () => {
    for (const s of DA_ALUMNI_STEPS) {
      const text = `${s.subject} ${s.paragraphs.join(' ')}`;
      expect(text).not.toMatch(/end of (the )?year|year[- ]end|december 31|dec 31|expires|deadline/i);
      expect(text).not.toMatch(/\bfree\b/i);
      expect(text).not.toMatch(/[–—]/);
    }
  });
  it('the opening sits after the greeting, or after the holiday line on holiday emails; the name is escaped', () => {
    expect(alumniStepBody(DA_ALUMNI_STEPS[0], 'Ana')).toMatch(/^<p>Hi Ana,<\/p>\n<p>\{\{personal_opening\}\}<\/p>/);
    expect(alumniStepBody(DA_ALUMNI_STEPS[1], 'Ana')).toMatch(/^<p>Hi Ana,<\/p>\n<p>Happy Thanksgiving\.<\/p>\n<p>\{\{personal_opening\}\}<\/p>/);
    expect(alumniStepBody(DA_ALUMNI_STEPS[0], '<b>')).toContain('Hi &lt;b&gt;,');
    expect(alumniStepBody(DA_ALUMNI_STEPS[0], null)).toMatch(/^<p>Hi,<\/p>/);
  });
  it('the Anthropic line says engineers and nomination, not developers or open enrollment', () => {
    const t = DA_ALUMNI_STEPS[5].paragraphs.join(' ');
    expect(t).toMatch(/10,000 engineers/);
    expect(t).toMatch(/aren't open to the public\. Companies nominate/);
    expect(t).not.toMatch(/developers/);
  });
});

describe('the audience', () => {
  it('DA alumni with an email; never unsubscribed, bounced, paying or staff', () => {
    expect(AUDIENCE_SQL).toMatch(/program_type' IN \('data_analytics_bootcamp', 'data_analytics_short_course'\)/);
    expect(AUDIENCE_SQL).toMatch(/NOT IN \('unsubscribed', 'dnd', 'do_not_contact', 'bounced'\)/);
    expect(AUDIENCE_SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM unsubscribe_events/);
    expect(AUDIENCE_SQL).toMatch(/paysimple_payment_id IS NOT NULL AND sb\.status::text IN \('active', 'past_due'\)/);
    expect(AUDIENCE_SQL).toMatch(/NOT ILIKE '%@colaberry\.com'/);
  });
});
