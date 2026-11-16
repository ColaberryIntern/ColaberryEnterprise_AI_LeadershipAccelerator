const mockQuery = jest.fn();
const mockTransaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn('tx'));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a), transaction: (fn: (t: unknown) => Promise<unknown>) => mockTransaction(fn) } }));
const mockLoad = jest.fn();
jest.mock('../prepData', () => ({ loadPrepData: (...a: unknown[]) => mockLoad(...a) }));

import { activePlan, createPlan, NotYoursError } from '../plans';

const NOW = new Date('2026-11-16T18:00:00Z');
const data = () => ({
  enrollmentId: 'e1', firstName: null, sourceRefs: [], sessions: [], trend: [],
  interviews: [{ id: 'i1', source: 'real', company: 'Acme', role: 'R', type: 'technical', startsAt: new Date('2026-11-19T20:00:00Z'), targetReadiness: null, practiceUntil: null }],
  observations: [0, 1, 2].flatMap((d) => [
    { skill: 'pace_clarity', value: 40, source: 'video', observedAt: new Date(NOW.getTime() - d * 86_400_000) },
    { skill: 'few_fillers', value: 70, source: 'video', observedAt: new Date(NOW.getTime() - d * 86_400_000) },
  ]),
});

beforeEach(() => { mockQuery.mockReset(); mockLoad.mockReset(); mockTransaction.mockClear(); });

describe('createPlan', () => {
  it('builds on the server from the weakest scored skills and stores it, retiring the previous active plan in one transaction', async () => {
    mockLoad.mockResolvedValue(data());
    mockQuery.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[{ id: 'pl1' }], 1]);
    const r = await createPlan('e1', { interviewId: 'i1', kind: 'days' }, NOW);
    expect(r.id).toBe('pl1');
    expect(r.plan.days.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(r.plan.days[0].segments[1].targetSkill).toBe('pace_clarity');
    expect(String(mockQuery.mock.calls[0][0])).toContain("SET status = 'abandoned'");
    expect(mockQuery.mock.calls[0][1].transaction).toBe('tx');
    expect(mockQuery.mock.calls[1][1].transaction).toBe('tx');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('refuses an interview that is not this student\'s, writing nothing', async () => {
    mockLoad.mockResolvedValue(data());
    await expect(createPlan('e1', { interviewId: 'other', kind: 'days' }, NOW)).rejects.toBeInstanceOf(NotYoursError);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('ignores an unknown focus skill rather than inventing one', async () => {
    mockLoad.mockResolvedValue(data());
    mockQuery.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[{ id: 'pl2' }], 1]);
    const r = await createPlan('e1', { interviewId: 'i1', kind: 'custom', minutes: 10, focusSkill: 'eye_contact' }, NOW);
    expect(r.plan.days[0].segments[1].targetSkill).toBe('pace_clarity');
    expect(mockQuery.mock.calls[1][1].replacements.f).toBeNull();
  });
});

describe('activePlan', () => {
  it('reads the newest active plan, or null', async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 'pl1', interview_id: 'i1', kind: 'days', minutes: 20, days: [{ date: '2026-11-16', label: 'Today', segments: [] }] }], 1]);
    expect(await activePlan('e1', 'i1')).toMatchObject({ id: 'pl1', plan: { kind: 'days', minutes: 20 } });
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await activePlan('e1', 'i1')).toBeNull();
  });
});
