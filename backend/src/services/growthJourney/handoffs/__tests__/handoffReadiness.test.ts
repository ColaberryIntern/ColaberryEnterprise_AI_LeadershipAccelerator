import { personRefFor, scoreRows, sortByReadiness, READINESS_CONCURRENCY, type Readiness, type ReadinessRow } from '../handoffReadiness';

/**
 * M35 acceptance: every handoff appears exactly once; ordered by the readiness score. A row that cannot be scored is
 * kept (last, readiness null), never dropped; scoring is bounded in concurrency.
 */

const row = (id: string, created: string, enrollment: string | null = `enr-${id}`, lead: number | null = null): ReadinessRow =>
  ({ id, enrollment_id: enrollment, lead_id: lead, created_at: created });

const R = (total: number): Readiness => ({ total, scoreableMax: 60, coverage: 0.8 });

let warnSpy: jest.SpyInstance;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warnSpy.mockRestore());

describe('personRefFor', () => {
  it('enrollment outranks lead; neither -> null', () => {
    expect(personRefFor({ enrollment_id: 'e1', lead_id: 7 })).toBe('enrollment:e1');
    expect(personRefFor({ enrollment_id: null, lead_id: 7 })).toBe('lead:7');
    expect(personRefFor({ enrollment_id: null, lead_id: null })).toBeNull();
  });
});

describe('sortByReadiness', () => {
  const rows = [row('a', '2026-11-01'), row('b', '2026-11-02'), row('c', '2026-11-03'), row('d', '2026-11-04'), row('e', '2026-10-30')];
  const scores = new Map<string, Readiness | null>([['a', R(20)], ['b', R(45)], ['c', null], ['d', R(45)], ['e', null]]);

  it('highest score first, ties oldest first, unscorable last (oldest first among them)', () => {
    expect(sortByReadiness(rows, scores).map((r) => r.id)).toEqual(['b', 'd', 'a', 'e', 'c']);
  });

  it('EVERY handoff appears exactly once: same rows, no duplicates, none dropped, input untouched', () => {
    const out = sortByReadiness(rows, scores);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('scoreRows', () => {
  it('scores each row once by its person ref; a row with no person is null without a read', async () => {
    const scoreFor = jest.fn(async (ref: string) => (ref === 'enrollment:enr-a' ? R(30) : R(10)));
    const scores = await scoreRows([row('a', '2026-11-01'), row('n', '2026-11-01', null, null)], { scoreFor });
    expect(scoreFor).toHaveBeenCalledTimes(1);
    expect(scores.get('a')).toEqual(R(30));
    expect(scores.get('n')).toBeNull();
  });

  it('a read that throws keeps the row (null) and logs with its class', async () => {
    const scores = await scoreRows([row('a', '2026-11-01')], { scoreFor: async () => { throw new Error('profile down'); } });
    expect(scores.get('a')).toBeNull();
    expect(JSON.parse(String(warnSpy.mock.calls[0][0])).event).toBe('handoff_readiness_failed');
  });

  it(`never has more than ${READINESS_CONCURRENCY} profile reads in flight`, async () => {
    let inFlight = 0; let peak = 0;
    const scoreFor = async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return R(1); };
    const rows = Array.from({ length: 23 }, (_, i) => row(String(i), '2026-11-01'));
    const scores = await scoreRows(rows, { scoreFor });
    expect(scores.size).toBe(23);
    expect(peak).toBeLessThanOrEqual(READINESS_CONCURRENCY);
  });

  it('an empty queue is an empty map (production today: 0 handoffs)', async () => {
    expect((await scoreRows([], { scoreFor: jest.fn() })).size).toBe(0);
  });
});
