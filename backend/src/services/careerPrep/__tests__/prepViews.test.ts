import { buildDashboard, buildSummary, defaultAnchor } from '../prepViews';
import { rollupRows } from '../rollup';
import { DashboardResponse, SummaryResponse } from '../../../routes/careerPrepSchemas';
import type { PrepData, PrepInterview } from '../prepData';
import type { Observation } from '../readiness';

const NOW = new Date('2026-11-18T18:00:00Z'); // Wed noon Central
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const empty = (): PrepData => ({ enrollmentId: 'e1', firstName: null, observations: [], sourceRefs: [], sessions: [], interviews: [], trend: [] });
const three = (skill: string, v: number): Observation[] => [0, 1, 2].map((d) => ({ skill, value: v, source: 'video', observedAt: ago(d) }));
const interview = (o: Partial<PrepInterview>): PrepInterview => ({ id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: new Date(NOW.getTime() + 3 * DAY), targetReadiness: null, practiceUntil: null, ...o });

function full(): PrepData {
  const obs = [...three('explaining_ai', 100), ...three('role_knowledge', 90), ...three('composure_followups', 60), ...three('few_fillers', 50), ...three('pace_clarity', 40)];
  return { ...empty(), firstName: 'Ali', observations: obs, sourceRefs: obs.map((o, i) => ({ source: o.source, ref: `r${Math.floor(i / 3)}` })), interviews: [interview({})] };
}

describe('buildDashboard', () => {
  it('a student with no data gets a valid payload with nothing invented: no readiness, no scores, zeros only for counts', () => {
    const d = buildDashboard(empty(), NOW);
    expect(DashboardResponse.safeParse(d).success).toBe(true);
    expect(d.readiness).toBeUndefined();
    expect(d.anchorId).toBeUndefined();
    expect(d.skills.every((s) => s.score === undefined && s.change30 === undefined)).toBe(true);
    expect(d.skills).toHaveLength(9);
    expect(d.weeklyMinutes).toHaveLength(8);
  });

  it('computes readiness for the anchor interview type (technical: 75.3) with its default target 75', () => {
    const d = buildDashboard(full(), NOW);
    expect(d.anchorId).toBe('i1');
    expect(d.readiness).toMatchObject({ value: 75.3, target: 75 });
    expect(d.interviews[0]).toMatchObject({ id: 'i1', readiness: 75.3, target: 75 });
    expect(DashboardResponse.safeParse(d).success).toBe(true);
  });

  it('with no interview, shows readiness but no made-up target (no "Ready at")', () => {
    const data = { ...full(), interviews: [] };
    const d = buildDashboard(data, NOW);
    expect(d.readiness?.value).toBe(68);
    expect(d.readiness?.target).toBeUndefined();
    const s = buildSummary(data, NOW);
    expect(s.stops.readiness).toBe(68);
    expect(s.stops.readyAt).toBeUndefined();
    expect(DashboardResponse.safeParse(d).success).toBe(true);
  });

  it('hides readiness with only 4 skills scored', () => {
    const data = full();
    data.observations = data.observations.filter((o) => o.skill !== 'pace_clarity');
    expect(buildDashboard(data, NOW).readiness).toBeUndefined();
  });

  it('lists skills lowest first, unscored last', () => {
    const keys = buildDashboard(full(), NOW).skills.map((s) => s.key);
    expect(keys.slice(0, 5)).toEqual(['pace_clarity', 'few_fillers', 'composure_followups', 'role_knowledge', 'explaining_ai']);
  });

  it('counts distinct evidence per source', () => {
    expect(buildDashboard(full(), NOW).sources).toEqual({ video: 5, phone_mock: 0, real_interview: 0, training: 0, project: 0 });
  });

  it('reports the change since the first week of the trend', () => {
    const data = { ...full(), trend: [{ date: '2026-11-02', interviewId: 'i1', readiness: 60 }, { date: '2026-11-10', interviewId: 'i1', readiness: 70 }] };
    const d = buildDashboard(data, NOW);
    expect(d.readiness?.trend).toEqual([{ week: '2026-11-02', value: 60 }, { week: '2026-11-09', value: 70 }]);
    expect(d.readiness?.changeSinceFirst).toBe(15.3);
  });
});

describe('defaultAnchor', () => {
  it('picks the soonest interview still ahead, else a practice one', () => {
    const past = interview({ id: 'p', startsAt: ago(2) });
    const later = interview({ id: 'l', startsAt: new Date(NOW.getTime() + 9 * DAY) });
    const practice = interview({ id: 'x', source: 'practice', startsAt: null });
    expect(defaultAnchor([past, later, practice], NOW)?.id).toBe('l');
    expect(defaultAnchor([past, practice], NOW)?.id).toBe('x');
    expect(defaultAnchor([past], NOW)).toBeUndefined();
  });
});

describe('buildSummary', () => {
  it('omits every stop without data (never renders a 0 streak or 0 minutes)', () => {
    const s = buildSummary(empty(), NOW);
    expect(s.stops).toEqual({});
    expect(SummaryResponse.safeParse(s).success).toBe(true);
  });

  it('carries the next interview, readiness and ready-at, streak and this week when there is data', () => {
    const data = { ...full(), sessions: [{ startedAt: ago(0), secondsActive: 1200, status: 'finished' }] };
    const s = buildSummary(data, NOW);
    expect(s).toMatchObject({ firstName: 'Ali', nextInterview: { id: 'i1' }, stops: { readiness: 75.3, readyAt: 75, streak: 1, thisWeek: 20 }, today: '2026-11-18' });
    expect(SummaryResponse.safeParse(s).success).toBe(true);
  });
});

describe('rollupRows', () => {
  it('writes the general row plus one per interview, keyed by the Central date', () => {
    const rows = rollupRows(full(), NOW);
    expect(rows.map((r) => [r.interviewId, r.date, r.readiness])).toEqual([
      ['00000000-0000-0000-0000-000000000000', '2026-11-18', 68], ['i1', '2026-11-18', 75.3],
    ]);
    expect(rows[0].skills).toMatchObject({ explaining_ai: 100, pace_clarity: 40 });
  });

  it('stores a null readiness rather than a guess when data is thin', () => {
    expect(rollupRows(empty(), NOW)[0]).toMatchObject({ readiness: null, skills: {} });
  });
});
