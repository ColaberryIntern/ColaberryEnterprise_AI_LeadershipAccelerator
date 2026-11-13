import {
  checklist, fullOrder, formatWhen, makeSignature, move, strength, toggleIn, wallTimeToIso, type StudioData,
} from '../hireStudioModel';

/** The studio's pure rules: the 7-item checklist, ordering, and times in the candidate's zone. */

const EMPTY: StudioData = { profile: { identity: null }, intro: null, availability: null, order: null };
const FULL: StudioData = {
  profile: { identity: { full_name: 'Kes D', email: 'x', title: null, company: null, linkedin_url: 'https://linkedin.com/in/k', avatar_data_url: 'data:image/png;base64,x', cohort_name: null, member_since: null, resume: { file_name: 'cv.pdf', uploaded_at: null } } },
  intro: { headlineDraft: null, answers: [{ key: 'team', text: 'Pairing' }], roles: ['FDE'], setups: [], location: null, earliestStart: null, workAuth: null, video: { status: 'published', seconds: 88 } },
  availability: { enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning'], formats: ['intro'], maxPerWeek: 5, minNoticeHours: 24, autoConfirm: false },
  order: { slugs: [], cases: [{ slug: 'a', title: 'A', coverImageUrl: null }], talentSlug: 'kes' },
};

describe('checklist', () => {
  it('has the kit\'s seven items, in order, and counts none for an empty profile', () => {
    const items = checklist(EMPTY);
    expect(items.map((i) => i.key)).toEqual(['case', 'photo', 'video', 'about', 'times', 'resume', 'linkedin']);
    expect(strength(items)).toBe(0);
  });

  it('counts all seven for a complete profile', () => {
    expect(strength(checklist(FULL))).toBe(7);
  });

  it('does not count interview times that are off, or About you with no roles, or a draft video', () => {
    const d: StudioData = {
      ...FULL,
      availability: { ...FULL.availability!, enabled: false },
      intro: { ...FULL.intro!, roles: [], video: { status: 'draft', seconds: 30 } },
    };
    const done = Object.fromEntries(checklist(d).map((i) => [i.key, i.done]));
    expect(done).toMatchObject({ times: false, about: false, video: false, case: true });
    expect(strength(checklist(d))).toBe(4);
  });
});

describe('ordering', () => {
  const order = { slugs: ['c', 'gone'], cases: ['a', 'b', 'c'].map((s) => ({ slug: s, title: s, coverImageUrl: null })), talentSlug: null };

  it('shows the saved order first, then the rest of the published ones, and drops unpublished', () => {
    expect(fullOrder(order)).toEqual(['c', 'a', 'b']);
    expect(fullOrder(null)).toEqual([]);
  });

  it('moves up and down within bounds, and the star moves one to the top', () => {
    expect(move(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(makeSignature(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(makeSignature(['a', 'b'], 'zzz')).toEqual(['a', 'b']);
  });

  it('toggles an item in or out of a list', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('times in the candidate\'s zone', () => {
  it('formats a UTC time as Central wall time, on both sides of the DST change', () => {
    expect(formatWhen('2026-11-16T15:00:00.000Z', 'America/Chicago')).toBe('Mon, Nov 16 · 9:00 AM CT');
    expect(formatWhen('2026-10-26T14:00:00.000Z', 'America/Chicago')).toBe('Mon, Oct 26 · 9:00 AM CT');
  });

  it('reads a datetime-local value as wall time in the candidate\'s zone, never the browser\'s', () => {
    expect(wallTimeToIso('2026-11-18T10:30', 'America/Chicago')).toBe('2026-11-18T16:30:00.000Z');
    expect(wallTimeToIso('2026-11-18T10:30', 'America/New_York')).toBe('2026-11-18T15:30:00.000Z');
    expect(wallTimeToIso('2026-10-28T10:30', 'America/Chicago')).toBe('2026-10-28T15:30:00.000Z');
    expect(wallTimeToIso('', 'America/Chicago')).toBeNull();
  });
});
