import { computeSchoolHealth } from '../schoolHealth';
import { runDirectors, rankRecommendations } from '../directors';
import { simulateRemoval } from '../digitalTwin';
import { SchoolSignals } from '../schoolSignals';

const base: SchoolSignals = {
  generated_at: '2026-07-09T00:00:00Z',
  students: { active: 20, at_risk: 5, excelling: 6, architect_ready: 3, employment_ready: 8, certification_ready: 4 },
  revenue: { collected: 40000, paid: 15, unpaid: 5, collection_rate: 75 },
  learning: { avg_builder_xp: 180, avg_attendance: 82 },
  employment: { avg_readiness: 58, market_ready: 4 },
  certification: { avg_pass_prob: 61, exam_ready: 4 },
  curriculum: { blueprints: 3, avg_quality: 82 },
  portfolio: { total_artifacts: 22 },
  cohorts: [{ cohort_id: 'c1', students: 20, avg_employment: 58 }],
  roster: [],
};

describe('computeSchoolHealth', () => {
  it('produces an overall + 8 sub-scores with a band', () => {
    const h = computeSchoolHealth(base);
    expect(h.subs).toHaveLength(8);
    expect(h.overall).toBeGreaterThan(0);
    expect(h.overall).toBeLessThanOrEqual(100);
    expect(['critical', 'at-risk', 'steady', 'thriving']).toContain(h.band);
    expect(h.subs.find((s) => s.key === 'employment')!.score).toBe(58);
    expect(h.subs.find((s) => s.key === 'revenue')!.score).toBe(75);
  });
  it('drops to a worse band when the school is struggling', () => {
    const bad = { ...base, students: { ...base.students, at_risk: 18 }, employment: { avg_readiness: 20, market_ready: 0 }, certification: { avg_pass_prob: 15, exam_ready: 0 }, revenue: { ...base.revenue, collection_rate: 30 }, learning: { avg_builder_xp: 20, avg_attendance: 40 } };
    const h = computeSchoolHealth(bad);
    expect(h.overall).toBeLessThan(computeSchoolHealth(base).overall);
    expect(['critical', 'at-risk']).toContain(h.band);
  });
});

describe('runDirectors', () => {
  it('runs a full executive team with domain headlines', () => {
    const ds = runDirectors(base);
    const domains = ds.map((d) => d.domain);
    expect(domains).toEqual(expect.arrayContaining(['student_success', 'career', 'certification', 'curriculum', 'finance', 'operations', 'community']));
    ds.forEach((d) => expect(d.headline).toBeTruthy());
  });
  it('recommends intervention + collection when the signals warrant, ranked high-first', () => {
    const recs = rankRecommendations(runDirectors(base));
    expect(recs.some((r) => r.key === 'student.intervene')).toBe(true);
    expect(recs.some((r) => r.key === 'finance.collect')).toBe(true);
    recs.forEach((r) => { expect(r.why).toBeTruthy(); expect(r.confidence).toBeGreaterThan(0); });
    if (recs.length > 1) { const sev = { high: 3, medium: 2, low: 1 } as any; expect(sev[recs[0].severity]).toBeGreaterThanOrEqual(sev[recs[recs.length - 1].severity]); }
  });
});

describe('digitalTwin.simulateRemoval', () => {
  it('predicts the impact of removing an activity from the canonical week', () => {
    const r = simulateRemoval('prompt_lab');
    expect(r.before.cards).toBeGreaterThan(r.after.cards);
    expect(r.verdict).toContain('prompt_lab');
    expect(typeof r.deltas.quality).toBe('number');
  });
  it('reports no effect for a type not in the week', () => {
    const r = simulateRemoval('daily_streak');
    expect(r.deltas.cards).toBe(0);
    expect(r.verdict).toMatch(/no effect/);
  });
});
