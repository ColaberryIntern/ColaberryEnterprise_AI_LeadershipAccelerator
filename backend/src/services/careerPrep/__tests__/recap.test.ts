const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { buildRecap, sessionRecap, withoutRefs } from '../recap';
import { buildDashboard } from '../prepViews';
import type { PrepData } from '../prepData';
import type { Observation, ObservationSource } from '../readiness';
import type { SessionView } from '../sessions';

const NOW = new Date('2026-11-16T23:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
type Row = { skill: string; value: number; source: ObservationSource; ref: string; at: Date };
const earlier = (skill: string, value: number): Row[] => [1, 3, 5].map((d) => ({ skill, value, source: 'training', ref: `lesson:${skill}:${d}`, at: daysAgo(d) }));
function dataOf(rows: Row[]): PrepData {
  return {
    enrollmentId: 'e1', firstName: 'Ali',
    observations: rows.map((r): Observation => ({ skill: r.skill, value: r.value, source: r.source, observedAt: r.at, weight: 1 })),
    sourceRefs: rows.map((r) => ({ source: r.source, ref: r.ref })),
    sessions: [{ startedAt: daysAgo(0), secondsActive: 660, status: 'finished' }],
    interviews: [{ id: 'i1', source: 'real', company: 'Meridian Freight', role: 'AI Engineer', type: 'recruiter', startsAt: new Date('2026-11-17T20:00:00Z'), targetReadiness: null, practiceUntil: null }],
    trend: [],
  };
}
const base = [...earlier('pace_clarity', 50), ...earlier('few_fillers', 60), ...earlier('behavioral_stories', 55), ...earlier('answer_structure', 60), ...earlier('proof_of_work', 65)];
const thisSession: Row[] = [
  { skill: 'pace_clarity', value: 80, source: 'video', ref: 'attempt:a1', at: NOW },
  { skill: 'few_fillers', value: 90, source: 'video', ref: 'attempt:a1', at: NOW },
];
const refs = new Set(['attempt:a1']);
const session: SessionView = { id: 's1', planId: 'p1', status: 'finished', startedAt: daysAgo(0).toISOString(), secondsActive: 660, segments: [] };

describe('buildRecap (CP4.5)', () => {
  const data = dataOf([...base, ...thisSession]);
  const recap = buildRecap(data, refs, session, { done: 1, pending: 0 }, NOW, 'i1');

  it("the recap's numbers ARE the dashboard's: after = with this session, before = without it", () => {
    const after = buildDashboard(data, NOW, 'i1');
    const before = buildDashboard(withoutRefs(data, refs), NOW, 'i1');
    expect(recap.readiness).toEqual({ after: after.readiness!.value, before: before.readiness!.value, interviewId: 'i1', company: 'Meridian Freight' });
    expect(recap.readiness!.after).toBeGreaterThan(recap.readiness!.before!);
    for (const s of recap.skills) {
      expect(s.after).toBe(after.skills.find((k) => k.key === s.key)!.score);
      expect(s.before).toBe(before.skills.find((k) => k.key === s.key)!.score);
    }
  });
  it('lists only the skills this session wrote, with their labels', () => {
    expect(recap.skills.map((s) => s.key).sort()).toEqual(['few_fillers', 'pace_clarity']);
    expect(recap.skills.find((s) => s.key === 'pace_clarity')!.label).toBe('Pace and clarity');
    expect(recap).toMatchObject({ status: 'finished', minutes: 11, attempts: 1, pending: 0, firstName: 'Ali', streak: 1 });
  });
  it('a skill this session scored for the first time has no "before" (never 0)', () => {
    const two = [...base.filter((r) => r.skill !== 'pace_clarity'), ...earlier('pace_clarity', 50).slice(0, 2), ...thisSession];
    const r = buildRecap(dataOf(two), refs, session, { done: 1, pending: 0 }, NOW, 'i1');
    const pace = r.skills.find((s) => s.key === 'pace_clarity')!;
    expect(pace.before).toBeUndefined();
    expect(typeof pace.after).toBe('number');
  });
  it('no scored attempt: no changed skills, and readiness omitted when it cannot be computed', () => {
    const r = buildRecap(dataOf(earlier('pace_clarity', 50)), new Set(), { ...session, status: 'ended', secondsActive: 90 }, { done: 0, pending: 0 }, NOW, 'i1');
    expect(r).toMatchObject({ status: 'ended', minutes: 2, attempts: 0, pending: 0, skills: [] });
    expect(r.readiness).toBeUndefined();
  });
});

describe('sessionRecap writes first, then reads (CP4.5)', () => {
  beforeEach(() => mockQuery.mockReset());
  it("writes every scored attempt's observations BEFORE loading the data the recap is built from", async () => {
    const result = { seconds: 40, notes: [], scores: [
      { key: 'pace', label: 'Pace', score: 80, value: '140 wpm', target: '100 to 165', source: 'video' },
      { key: 'fillers', label: 'Fillers', score: 90, value: '1%', target: 'under 3%', source: 'video' },
    ] };
    mockQuery
      .mockResolvedValueOnce([[{ id: 'a1', status: 'done', result, created_at: NOW.toISOString() }], 1])
      .mockResolvedValueOnce([[{ interview_id: 'i1' }], 1]);
    const write = jest.fn(async () => 2);
    const load = jest.fn(async () => dataOf([...base, ...thisSession]));
    const r = await sessionRecap('e1', session, NOW, { write, load });
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
    expect(write).toHaveBeenCalledWith([
      { enrollmentId: 'e1', skill: 'pace_clarity', value: 80, source: 'video', sourceRef: 'attempt:a1', observedAt: NOW },
      { enrollmentId: 'e1', skill: 'few_fillers', value: 90, source: 'video', sourceRef: 'attempt:a1', observedAt: NOW },
    ]);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ s: 's1', e: 'e1' });
    expect(r.readiness?.interviewId).toBe('i1');
    expect(r.attempts).toBe(1);
  });
  it('answers still being scored are counted, not written and not treated as "nothing changed"', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 'a2', status: 'pending', result: null, created_at: NOW }], 1])
      .mockResolvedValueOnce([[{ interview_id: 'i1' }], 1]);
    const write = jest.fn(async () => 0);
    const r = await sessionRecap('e1', session, NOW, { write, load: jest.fn(async () => dataOf(base)) });
    expect(mockQuery.mock.calls[0][0]).toContain("status IN ('done', 'pending')");
    expect(write).toHaveBeenCalledWith([]);
    expect(r).toMatchObject({ attempts: 0, pending: 1, skills: [] });
  });
  it('a failed write stops the recap (no recap from rows that were not written)', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'a1', status: 'done', result: { seconds: 1, notes: [], scores: [] }, created_at: NOW }], 1]);
    const load = jest.fn();
    await expect(sessionRecap('e1', session, NOW, { write: jest.fn(async () => { throw new Error('db down'); }), load })).rejects.toThrow('db down');
    expect(load).not.toHaveBeenCalled();
  });
});
