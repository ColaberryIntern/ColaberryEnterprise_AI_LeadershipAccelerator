import { buildPlan, planDates, rehearsal, session } from '../planBuilder';

const NOW = new Date('2026-11-16T18:00:00Z'); // Mon noon Central
const weak = [{ key: 'pace_clarity', label: 'Pace and clarity' }, { key: 'few_fillers', label: 'Few filler words' }, { key: 'answer_structure', label: 'Answer structure (STAR)' }];
const total = (segs: { minutes: number }[]) => segs.reduce((a, s) => a + s.minutes, 0);

describe('session shapes', () => {
  it('20 minutes: warm up, learn, try, pressure round, cool down; no Watch until the library exists', () => {
    const s = session(20, weak[0]);
    expect(s.map((x) => x.kind)).toEqual(['warmup', 'learn', 'try', 'pressure', 'cooldown']);
    expect(total(s)).toBe(20);
    expect(s.map((x) => x.kind)).not.toContain('watch');
    expect(s[1]).toMatchObject({ title: 'Learn: Pace and clarity', targetSkill: 'pace_clarity' });
  });
  it.each([10, 15] as const)('%i minutes or less: warm up, learn, try, cool down, and adds up', (m) => {
    const s = session(m, weak[0]);
    expect(s.map((x) => x.kind)).toEqual(['warmup', 'learn', 'try', 'cooldown']);
    expect(total(s)).toBe(m);
  });
  it('45 minutes adds up, and a full rehearsal is 30', () => {
    expect(total(session(45))).toBe(45);
    expect(total(rehearsal())).toBe(30);
  });
});

describe('planDates (Central)', () => {
  it('runs from today to the day before the interview, never on or after it', () => {
    expect(planDates(NOW, { startsAt: new Date('2026-11-19T20:00:00Z'), practiceUntil: null })).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
  });
  it('an interview today is one session today', () => {
    expect(planDates(NOW, { startsAt: new Date('2026-11-16T22:00:00Z'), practiceUntil: null })).toEqual(['2026-11-16']);
  });
  it('a practice interview uses its window', () => {
    expect(planDates(NOW, { startsAt: null, practiceUntil: '2026-11-19' })).toHaveLength(4);
  });
  it('caps a far interview at 14 days', () => {
    expect(planDates(NOW, { startsAt: new Date('2027-01-30T20:00:00Z'), practiceUntil: null })).toHaveLength(14);
  });
  it('crosses the DST change by calendar date', () => {
    const now = new Date('2026-10-31T17:00:00Z'); // Sat 31 Oct, CDT
    expect(planDates(now, { startsAt: new Date('2026-11-03T20:00:00Z'), practiceUntil: null })).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('buildPlan', () => {
  const interview = { startsAt: new Date('2026-11-19T20:00:00Z'), practiceUntil: null };

  it('days: one session a day on the next weakest skill, and a Full rehearsal the day before', () => {
    const p = buildPlan({ kind: 'days', now: NOW, interview, weakest: weak });
    expect(p.days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Wednesday, Nov 18']);
    expect(p.days[0].segments[1].targetSkill).toBe('pace_clarity');
    expect(p.days[1].segments[1].targetSkill).toBe('few_fillers');
    expect(p.days[2].segments.map((s) => s.kind)).toContain('rehearsal');
    expect(p.minutes).toBe(20);
  });

  it('is deterministic: the same input gives the same plan', () => {
    const a = buildPlan({ kind: 'days', now: NOW, interview, weakest: weak });
    expect(buildPlan({ kind: 'days', now: NOW, interview, weakest: weak })).toEqual(a);
  });

  it('works with no scored skills yet (no target skill, never an invented one)', () => {
    const p = buildPlan({ kind: 'days', now: NOW, interview, weakest: [] });
    expect(p.days[0].segments.every((s) => s.targetSkill === undefined)).toBe(true);
  });

  it('tonight, full and custom are one session today', () => {
    expect(buildPlan({ kind: 'tonight', now: NOW, interview, weakest: weak })).toMatchObject({ minutes: 15, days: [{ date: '2026-11-16' }] });
    expect(buildPlan({ kind: 'full', now: NOW, interview, weakest: weak }).days[0].segments[1].kind).toBe('rehearsal');
    const c = buildPlan({ kind: 'custom', now: NOW, interview, weakest: weak, minutes: 10, focus: weak[2] });
    expect(c.minutes).toBe(10);
    expect(c.days[0].segments[1].targetSkill).toBe('answer_structure');
  });

  it('never schedules a day on or after the interview', () => {
    const p = buildPlan({ kind: 'days', now: NOW, interview, weakest: weak });
    expect(p.days.every((d) => d.date < '2026-11-19')).toBe(true);
  });
});
