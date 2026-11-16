import {
  centralDate, centralWeekStart, minutesThisWeek, readiness, skillReading, skillScore, streak, targetFor,
  type Observation, type SkillReading,
} from '../readiness';

const DAY = 86_400_000;
const NOW = new Date('2026-11-16T18:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const obs = (skill: string, value: number, days: number, source: Observation['source'] = 'video'): Observation => ({ skill, value, source, observedAt: ago(days) });
const reading = (skill: string, score: number | null): SkillReading => ({ skill, score, change30: null, count: 3, sources: [] });

describe('skillScore (hand-computed)', () => {
  it('halves an observation\'s weight every 14 days: 60@0d, 80@14d, 100@28d = 125 / 1.75 = 71.4', () => {
    expect(skillScore([obs('f', 60, 0), obs('f', 80, 14), obs('f', 100, 28)], 'f', NOW)).toBe(71.4);
  });

  it('weights sources 1.5 / 1.0 / 0.8: real 90, video 70, training 50 today = 245 / 3.3 = 74.2', () => {
    expect(skillScore([obs('f', 90, 0, 'real_interview'), obs('f', 70, 0, 'video'), obs('f', 50, 0, 'training')], 'f', NOW)).toBe(74.2);
  });

  it('needs 3 observations: 2 is not enough data, 3 is a score', () => {
    expect(skillScore([obs('f', 60, 0), obs('f', 80, 1)], 'f', NOW)).toBeNull();
    expect(skillScore([obs('f', 60, 0), obs('f', 80, 1), obs('f', 70, 2)], 'f', NOW)).not.toBeNull();
  });

  it('ignores observations older than 60 days and from the future', () => {
    const base = [obs('f', 60, 0), obs('f', 80, 14), obs('f', 100, 28)];
    expect(skillScore([...base, obs('f', 0, 61), obs('f', 0, -2)], 'f', NOW)).toBe(71.4);
  });

  it('reads only the skill asked for', () => {
    expect(skillScore([obs('g', 10, 0), obs('g', 10, 0), obs('g', 10, 0)], 'f', NOW)).toBeNull();
  });
});

describe('skillReading: the 30-day change', () => {
  it('is today\'s score minus the score as of 30 days ago', () => {
    const rows = [obs('f', 50, 31), obs('f', 50, 32), obs('f', 50, 33), obs('f', 90, 0), obs('f', 90, 1), obs('f', 90, 2)];
    const r = skillReading(rows, 'f', NOW);
    expect(skillScore(rows, 'f', ago(30))).toBe(50);
    expect(r.score).toBe(82.9); // hand-computed: 90 at 0-2 d dominates 50 at 31-33 d (weights 0.5^(d/14))
    expect(r.change30).toBe(32.9);
    expect(r.count).toBe(6);
    expect(r.sources).toEqual(['video']);
  });

  it('is null when there was not enough data 30 days ago', () => {
    expect(skillReading([obs('f', 90, 0), obs('f', 90, 1), obs('f', 90, 2)], 'f', NOW).change30).toBeNull();
  });
});

describe('readiness', () => {
  const five = [reading('a', 60), reading('b', 70), reading('c', 80), reading('d', 90), reading('e', 100)];

  it('is the plain mean with no interview type: 80', () => expect(readiness(five, null)).toBe(80));

  it('is hidden with only 4 skills that have data', () => {
    expect(readiness([...five.slice(0, 4), reading('e', null)], null)).toBeNull();
  });

  it('weights skills by interview type (technical): 542 / 7.2 = 75.3', () => {
    const tech = [reading('explaining_ai', 100), reading('role_knowledge', 90), reading('composure_followups', 60), reading('few_fillers', 50), reading('pace_clarity', 40)];
    expect(readiness(tech, 'technical')).toBe(75.3);
  });
});

describe('targetFor', () => {
  it('defaults per type and honors a recruiter override', () => {
    expect([targetFor('recruiter'), targetFor('hiring_manager'), targetFor('technical'), targetFor('behavioral')]).toEqual([65, 75, 75, 70]);
    expect(targetFor('technical', 82)).toBe(82);
  });
});

describe('Central time: streak and this week', () => {
  const s = (iso: string, status = 'finished', secondsActive = 600) => ({ startedAt: new Date(iso), status, secondsActive });

  it('puts 23:59 and 00:01 Central on different days', () => {
    expect(centralDate(new Date('2026-11-17T05:59:00Z'))).toBe('2026-11-16');
    expect(centralDate(new Date('2026-11-17T06:01:00Z'))).toBe('2026-11-17');
  });

  it('counts a streak across the DST change (Sat 31 Oct, Sun 1 Nov, Mon 2 Nov)', () => {
    const rows = [s('2026-10-31T17:00:00Z'), s('2026-11-01T17:00:00Z'), s('2026-11-02T17:00:00Z')];
    expect(streak(rows, new Date('2026-11-03T02:00:00Z'))).toBe(3); // Mon 8 PM Central
    expect(streak(rows, new Date('2026-11-03T15:00:00Z'))).toBe(3); // Tue 9 AM, nothing yet today
    expect(streak(rows, new Date('2026-11-04T15:00:00Z'))).toBe(0); // Wed: Tuesday was missed
  });

  it('steps back by calendar date, not 24 hours: fall-back night at 23:30 CST is still 3, not 4', () => {
    const rows = [s('2026-10-31T17:00:00Z'), s('2026-11-01T17:00:00Z'), s('2026-11-02T17:00:00Z')];
    expect(streak(rows, new Date('2026-11-03T05:30:00Z'))).toBe(3); // Mon 2 Nov 23:30 CST
  });

  it('steps back by calendar date: spring-forward at 00:30 CDT is still 3, not 2', () => {
    const rows = [s('2027-03-13T17:00:00Z'), s('2027-03-14T17:00:00Z'), s('2027-03-15T17:00:00Z')];
    expect(streak(rows, new Date('2027-03-15T05:30:00Z'))).toBe(3); // Mon 15 Mar 00:30 CDT
  });

  it('sums this week across the DST change (week of Mon 26 Oct to Sun 1 Nov 2026)', () => {
    const now = new Date('2026-11-01T22:00:00Z'); // Sun 1 Nov 16:00 CST, the fall-back day
    expect(centralWeekStart(now)).toBe('2026-10-26');
    const rows = [
      s('2026-10-26T04:30:00Z', 'finished', 6000), // Sun 25 Oct 23:30 CDT: last week
      s('2026-10-26T06:30:00Z', 'finished', 600),  // Mon 26 Oct 01:30 CDT
      s('2026-11-01T15:00:00Z', 'finished', 600),  // Sun 1 Nov 09:00 CST
    ];
    expect(minutesThisWeek(rows, now)).toBe(20);
  });

  it('counts only finished sessions toward the streak', () => {
    expect(streak([s('2026-11-16T17:00:00Z', 'abandoned')], NOW)).toBe(0);
  });

  it('sums this week Monday to Sunday Central, rounding minutes down', () => {
    const now = new Date('2026-11-18T18:00:00Z'); // Wed noon Central
    expect(centralWeekStart(now)).toBe('2026-11-16');
    const rows = [
      s('2026-11-16T05:30:00Z', 'finished', 600), // Sun 15 Nov 23:30 Central: last week
      s('2026-11-16T06:30:00Z', 'finished', 600), // Mon 00:30 Central
      s('2026-11-17T15:00:00Z', 'ended', 390),    // Tue, 6.5 minutes
    ];
    expect(minutesThisWeek(rows, now)).toBe(16);
  });
});
