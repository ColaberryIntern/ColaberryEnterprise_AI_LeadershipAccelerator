/**
 * communityRituals — validates all 12 weekly rituals are structurally sound and
 * that the pure compose/validate logic behaves. Imports only the config module
 * (no model graph), so it runs anywhere. This is the automated E2E of the ritual
 * LOGIC: what the panel renders and what the service will store.
 */
import {
  RITUALS, ritualForWeek, ritualStudentLabel, publicRitual, DEFAULT_RITUAL,
  normalizeValues, composeBody, headlineOf,
} from '../communityRituals';

const VALID_VARIANTS = ['standard', 'chips', 'prompt', 'qa', 'debate', 'before_after', 'manifesto'];
// The community feed's category set (frontend COMMUNITY_CATEGORIES) + 'Community'.
const VALID_CATEGORIES = ['General', 'Wins', 'Support', 'Introductions', 'Community'];

describe('the 12 community rituals', () => {
  it('has exactly weeks 1..12', () => {
    expect(Object.keys(RITUALS).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('every ritual is structurally valid', () => {
    for (const [wk, r] of Object.entries(RITUALS)) {
      expect(r.week).toBe(Number(wk));
      expect(r.key && r.name && r.icon && r.accent).toBeTruthy();
      expect(r.ask.length).toBeGreaterThan(10);
      expect(r.lead.length).toBeGreaterThan(5);
      expect(r.postCta.length).toBeGreaterThan(2);
      expect(VALID_VARIANTS).toContain(r.variant);
      expect(VALID_CATEGORIES).toContain(r.category);
      expect(r.reaction.emoji && r.reaction.label).toBeTruthy();
      expect(r.mechanic.caption).toBeTruthy();
      // at least one required field
      expect(r.fields.some((f) => f.required)).toBe(true);
      // headlineField exists among fields
      expect(r.fields.map((f) => f.key)).toContain(r.headlineField);
      // unique field keys
      const keys = r.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      // choice fields carry choices
      for (const f of r.fields) if (f.kind === 'choice') expect((f.choices || []).length).toBeGreaterThan(1);
      // variant-specific structure
      if (r.variant === 'before_after') {
        expect(r.beforeAfter).toBeTruthy();
        for (const k of r.beforeAfter!) expect(keys).toContain(k);
      }
      if (r.variant === 'debate') expect(r.fields.some((f) => f.kind === 'choice')).toBe(true);
      if (r.variant === 'chips') expect(r.fields.some((f) => f.kind === 'list')).toBe(true);
      if (r.variant === 'prompt') expect(r.fields.some((f) => f.mono)).toBe(true);
    }
  });

  it('publicRitual is JSON-serializable and carries the fields', () => {
    const p = publicRitual(RITUALS[5]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(p.fields.length).toBeGreaterThan(0);
    expect(p.beforeAfter).toBeNull();
  });
});

describe('ritualForWeek + ritualStudentLabel', () => {
  it('resolves each week and falls back for out-of-range', () => {
    expect(ritualForWeek(1).key).toBe('roll_call');
    expect(ritualForWeek(5).key).toBe('cohort_wins');
    expect(ritualForWeek(12).key).toBe('architect_manifesto');
    expect(ritualForWeek(0)).toBe(DEFAULT_RITUAL);
    expect(ritualForWeek(99)).toBe(DEFAULT_RITUAL);
    expect(ritualForWeek(null)).toBe(DEFAULT_RITUAL);
  });

  it('labels a community_discussion card by its week ritual, else the fallback', () => {
    expect(ritualStudentLabel('community_discussion', 1, 'X')).toBe('Roll Call');
    expect(ritualStudentLabel('community_discussion', 5, 'X')).toBe('Cohort Wins');
    expect(ritualStudentLabel('community_discussion', 10, 'X')).toBe('Hot Take');
    expect(ritualStudentLabel('survey', 3, 'Weekly Feedback')).toBe('Weekly Feedback');
  });
});

describe('normalizeValues (validation + cleaning)', () => {
  const rollCall = RITUALS[1];      // intro (req), want (req)
  const skillDrop = RITUALS[2];     // skills (list, req), surprise
  const hotTake = RITUALS[10];      // side (choice, req), because (req)
  const showTell = RITUALS[3];      // does (req), before, after, link

  it('requires the required fields', () => {
    expect(() => normalizeValues(rollCall, { intro: 'Dana' })).toThrow(/required/i);
    expect(() => normalizeValues(rollCall, { intro: 'Dana', want: 'brief' })).not.toThrow();
  });

  it('splits a list field on newlines and caps items', () => {
    const v = normalizeValues(skillDrop, { skills: 'a\nb\n\n c ' });
    expect(v.skills).toEqual(['a', 'b', 'c']);
  });

  it('rejects an invalid choice and requires it', () => {
    expect(() => normalizeValues(hotTake, { side: 'Maybe', because: 'x' })).toThrow(/pick one/i);
    expect(() => normalizeValues(hotTake, { because: 'x' })).toThrow(/pick one/i);
    expect(normalizeValues(hotTake, { side: 'Agree', because: 'x' }).side).toBe('Agree');
  });

  it('keeps only http(s) links, drops junk quietly', () => {
    expect(normalizeValues(showTell, { does: 'thing', link: 'https://x.com' }).link).toBe('https://x.com');
    expect(normalizeValues(showTell, { does: 'thing', link: 'not a url' }).link).toBeUndefined();
  });

  it('trims and omits empty optionals', () => {
    const v = normalizeValues(showTell, { does: '  built  ', before: '', after: 'now' });
    expect(v.does).toBe('built');
    expect(v.before).toBeUndefined();
    expect(v.after).toBe('now');
  });
});

describe('composeBody + headlineOf', () => {
  it('composes a readable body tagged with the ritual + week', () => {
    const body = composeBody(RITUALS[5], { built: 'an MCP server', tip: 'verify first', link: 'https://x' });
    expect(body).toContain('🏆 Cohort Wins · Week 5');
    expect(body).toContain('What I built: an MCP server');
    expect(body).toContain('One tip'); // tip label present
    expect(body).not.toContain('https://x'); // link fields are not in the body
  });

  it('headline is the ritual headline field, with a fallback', () => {
    expect(headlineOf(RITUALS[5], { built: 'the thing' })).toBe('the thing');
    expect(headlineOf(RITUALS[2], { skills: ['a', 'b'] })).toBe('a, b'); // week2 headline=surprise; falls back to skills
    expect(headlineOf(RITUALS[1], {})).toBe('Roll Call'); // nothing filled → ritual name
  });
});
