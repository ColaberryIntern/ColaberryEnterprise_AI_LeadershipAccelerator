// C120: the pure half of the My Progress celebration: week, level, milestones, the latest win, and the allow-listed background.
import {
  backgroundFrom, buildMyProgress, firstNameOf, goalFrom, latestWinOf, levelOfRung, nextMilestone, weekFrom, earnedMilestones,
  MAX_SKILLS, type MyProgressInputs,
} from '../myProgressModel';

const EXTRACTED = {
  full_name: 'Jordan Q. Resume-Name', phone: '+1 555 0100', location: 'Dallas, TX', linkedin_url: 'https://linkedin.com/in/jq',
  title: 'Director of Operations', role: 'Operations', company_name: 'Acme Logistics', industry: 'Logistics', seniority: 'director',
  years_experience: '14', skills: ['SQL', 'Forecasting', 'Lean', 'Python', 'Power BI', 'Vendor management', 'Excel'],
  education: [{ institution: 'Rice University', credential: 'MBA', field: 'Operations', year: '2012' }], goals: 'Lead an AI program at my company',
};

const base = (over: Partial<MyProgressInputs> = {}): MyProgressInputs => ({
  enrollment: { full_name: 'Ali Muwwakkil', cohort_name: 'Cohort 12', intake_data_json: null },
  weeks: { scheduledWeek: 3, rows: [{ week: 1, publishedCardCount: 5, completed: 5 }, { week: 3, publishedCardCount: 6, completed: 2 }, { week: 12, publishedCardCount: 4, completed: 0 }, { week: null, publishedCardCount: 2, completed: 1 }] },
  pointsTotal: 1379, rungName: 'AI Enabled II', xp: { builder: 93, learning: 130, community: 35 },
  milestones: [], latestCard: { title: 'Prompt patterns lab', completed_at: '2026-11-04T15:00:00.000Z' },
  profile: { resume_file_name: 'resume.pdf', extracted: EXTRACTED },
  ...over,
});

describe('buildMyProgress (happy path)', () => {
  it('draws the hero, XP, win, milestones and background from the inputs', () => {
    const p = buildMyProgress(base());
    expect(p.firstName).toBe('Ali');
    expect(p.week).toEqual({ current: 3, total: 12, cohortName: 'Cohort 12', cardsDoneThisWeek: 2, cardsThisWeek: 6 });
    expect(p.points).toEqual({ total: 1379, level: 4, levelName: 'AI Enabled II', builder: 93, learning: 130, community: 35 });
    expect(p.latestWin).toEqual({ title: 'Prompt patterns lab', date: '2026-11-04T15:00:00.000Z' });
    expect(p.milestones).toEqual({ earned: [], next: { key: 'project_complete', label: 'First build complete', detail: 'Every story of a published build verified' } });
    expect(p.background).toEqual({ title: 'Director of Operations', company: 'Acme Logistics', industry: 'Logistics', years: '14',
      skills: ['SQL', 'Forecasting', 'Lean', 'Python', 'Power BI', 'Vendor management'], education: 'MBA, Operations · Rice University' });
    expect(p.goal).toBe('Lead an AI program at my company');
    expect(p.hasResume).toBe(true);
  });

  it('is deterministic: the same inputs twice give the same payload', () => {
    expect(buildMyProgress(base())).toEqual(buildMyProgress(base()));
  });
});

describe('privacy', () => {
  it('never carries phone, location, the resume full name or the LinkedIn URL, even when the extraction has them', () => {
    const json = JSON.stringify(buildMyProgress(base()));
    for (const leak of ['555 0100', 'Dallas', 'Resume-Name', 'Jordan', 'linkedin.com', 'phone', 'location', 'full_name']) expect(json).not.toContain(leak);
  });
  it('the first name comes from the enrollment, never the resume; an email-shaped name is no name', () => {
    expect(buildMyProgress(base({ enrollment: { full_name: null, cohort_name: null, intake_data_json: null } })).firstName).toBeNull();
    expect(firstNameOf('ali@colaberry.com')).toBeNull();
    expect(firstNameOf('  Maria   Lopez ')).toBe('Maria');
  });
});

describe('no resume / no cohort / empty', () => {
  it('no resume on record: background null and hasResume false, even if an old extraction exists', () => {
    const p = buildMyProgress(base({ profile: { resume_file_name: null, extracted: EXTRACTED } }));
    expect(p.background).toBeNull();
    expect(p.hasResume).toBe(false);
    expect(p.goal).toBeNull();
  });
  it('no profile row at all', () => {
    const p = buildMyProgress(base({ profile: null }));
    expect([p.background, p.hasResume]).toEqual([null, false]);
  });
  it('the learner\'s own goal (Settings) is used before the resume\'s, and shows without a resume', () => {
    const intake = { personalization: { goals: 'Ship my first agent' } };
    expect(buildMyProgress(base({ profile: null, enrollment: { full_name: 'A B', cohort_name: null, intake_data_json: intake } })).goal).toBe('Ship my first agent');
    expect(goalFrom(intake, EXTRACTED)).toBe('Ship my first agent');
  });
  it('no cohort: week null', () => {
    expect(buildMyProgress(base({ weeks: null })).week).toBeNull();
  });
  it('a resume with nothing usable: background null', () => {
    expect(backgroundFrom({ phone: '1', location: 'x', full_name: 'y' })).toBeNull();
    expect(backgroundFrom(null)).toBeNull();
    expect(backgroundFrom('text')).toBeNull();
  });
  it('a brand-new learner: zeros, no win, the first milestone next', () => {
    const p = buildMyProgress(base({ pointsTotal: 0, rungName: '', xp: { builder: 0, learning: 0, community: 0 }, latestCard: null }));
    expect(p.points).toMatchObject({ total: 0, level: null, levelName: null });
    expect(p.latestWin).toBeNull();
  });
});

describe('week boundaries', () => {
  it('week 0 (before the first session) reads as week 1; past the end clamps to the last week', () => {
    expect(weekFrom({ scheduledWeek: 0, rows: [{ week: 1, publishedCardCount: 3, completed: 0 }] }, null)).toMatchObject({ current: 1, total: 1, cardsThisWeek: 3 });
    expect(weekFrom({ scheduledWeek: 20, rows: [{ week: 12, publishedCardCount: 1, completed: 1 }] }, 'C')).toMatchObject({ current: 12, total: 12 });
  });
  it('no numbered weeks: the 12-week fallback total, zero cards', () => {
    expect(weekFrom({ scheduledWeek: 2, rows: [] }, null)).toEqual({ current: 2, total: 12, cohortName: null, cardsDoneThisWeek: 0, cardsThisWeek: 0 });
  });
});

describe('level, skills, education', () => {
  it('agrees with the frontend ladder', () => {
    expect([levelOfRung('AI Aware I'), levelOfRung('AI Enabled II'), levelOfRung('AI Builder IV · Program Graduate'), levelOfRung('Nope'), levelOfRung(null)])
      .toEqual([1, 4, 8, null, null]);
  });
  it(`at most ${MAX_SKILLS} skills, de-duplicated, from an array or a comma list; role when no title`, () => {
    expect(backgroundFrom({ skills: 'a, b, a, , c', role: 'Analyst' })).toMatchObject({ skills: ['a', 'b', 'c'], title: 'Analyst' });
    expect(backgroundFrom({ skills: Array.from({ length: 20 }, (_, i) => `s${i}`) })!.skills).toHaveLength(MAX_SKILLS);
  });
  it('education as text, or the first credential; long values are cut', () => {
    expect(backgroundFrom({ education: 'BS, Computer Science' })!.education).toBe('BS, Computer Science');
    expect(backgroundFrom({ education: [{ institution: 'UT Dallas' }] })!.education).toBe('UT Dallas');
    expect(backgroundFrom({ title: 'x'.repeat(500) })!.title).toHaveLength(120);
  });
});

describe('milestones and the latest win', () => {
  const rows = [
    { milestone_type: 'project_complete', source_ref: 'p1', achieved_at: '2026-10-01T00:00:00.000Z', evidence: { name: 'PropertyPulse' } },
    { milestone_type: 'curriculum_complete', source_ref: 'curriculum', achieved_at: new Date('2026-11-05T00:00:00.000Z'), evidence: null },
    { milestone_type: 'unknown_kind', source_ref: 'x', achieved_at: null, evidence: null },
  ];
  it('labels earned milestones (oldest first) and skips unknown types', () => {
    expect(earnedMilestones(rows).map((m) => m.label)).toEqual(['Build complete: PropertyPulse', 'Curriculum complete']);
  });
  it('the next one follows the ladder; all held: none', () => {
    expect(nextMilestone(rows)).toMatchObject({ label: 'Build 2 of 3 complete' });
    expect(nextMilestone([{ milestone_type: 'project_complete', source_ref: 'p1', achieved_at: null, evidence: null }])).toMatchObject({ key: 'curriculum_complete' });
    const all = [...rows, { milestone_type: 'project_complete', source_ref: 'p2', achieved_at: null, evidence: null }, { milestone_type: 'project_complete', source_ref: 'p3', achieved_at: null, evidence: null }];
    expect(nextMilestone(all)).toMatchObject({ key: 'certification_approved' });
    expect(nextMilestone([...all, { milestone_type: 'certification_approved', source_ref: 'c', achieved_at: null, evidence: null }])).toBeNull();
  });
  it('the win is the newest of the last card and the milestones', () => {
    expect(latestWinOf({ title: 'Lab', completed_at: '2026-11-04T00:00:00.000Z' }, earnedMilestones(rows))).toEqual({ title: 'Curriculum complete', date: '2026-11-05T00:00:00.000Z' });
    expect(latestWinOf({ title: 'Lab', completed_at: 'not a date' }, [])).toBeNull();
  });
});
