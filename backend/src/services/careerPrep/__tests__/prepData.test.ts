/**
 * CP8.3: a prep row linked to a placement interview counts only while that interview is booked (or held) at the row's
 * time. The real statement runs on Postgres in bookingConfirm.integration.test.ts; here, the filter's wording and the
 * one-time table check.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

type Mod = typeof import('../prepData');
const fresh = (): Mod => { let m: Mod | undefined; jest.isolateModules(() => { m = jest.requireActual('../prepData') as Mod; }); return m as Mod; };
const interviewsSql = () => String(mockQuery.mock.calls.map((c) => c[0]).find((s) => String(s).includes('FROM career_interviews')));

beforeEach(() => { mockQuery.mockReset(); });

describe('loadPrepData: placement-linked prep rows', () => {
  it('with the placement tables: a linked row shows only while its interview is booked or done at the same time, for the same learner', async () => {
    const m = fresh();
    mockQuery.mockImplementation(async (sql: string) => (sql.includes('to_regclass') ? [[{ ok: true }], 1] : [[], 0]));
    await m.loadPrepData('e1', new Date('2026-11-20T18:00:00Z'));
    const sql = interviewsSql().replace(/\s+/g, ' ');
    expect(sql).toContain('AND (placement_interview_id IS NULL OR EXISTS (SELECT 1 FROM placement_interviews p WHERE p.id = career_interviews.placement_interview_id');
    expect(sql).toContain("AND p.enrollment_id = career_interviews.enrollment_id AND p.state IN ('booked','done') AND p.starts_at = career_interviews.starts_at))");
    // the table check runs once per process, not on every read
    await m.loadPrepData('e1', new Date('2026-11-20T18:00:00Z'));
    expect(mockQuery.mock.calls.filter((c) => String(c[0]).includes('to_regclass'))).toHaveLength(1);
  });
  it('without them (a database the placement schema never ran on): linked rows are left out and the read still works', async () => {
    const m = fresh();
    mockQuery.mockImplementation(async (sql: string) => (sql.includes('to_regclass') ? [[{ ok: false }], 1] : [[], 0]));
    const data = await m.loadPrepData('e1', new Date('2026-11-20T18:00:00Z'));
    expect(interviewsSql()).toContain('AND placement_interview_id IS NULL');
    expect(interviewsSql()).not.toContain('placement_interviews p');
    expect(data.interviews).toEqual([]);
    // and it looks again next time (the tables may have been created since)
    await m.loadPrepData('e1', new Date('2026-11-20T18:00:00Z'));
    expect(mockQuery.mock.calls.filter((c) => String(c[0]).includes('to_regclass'))).toHaveLength(2);
  });
});
