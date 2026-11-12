/**
 * C138 shared work. The rules: its own opt-in, separate from featuring (C127 decision Q1 A); visible to the owner's OWN COHORT only
 * (Ali, 11 Nov 2026), with the viewer's cohort read from enrollments; nothing shared by default; anything not visible is null.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { SHARED_WORK_STATEMENTS } from '../../../db/ensureCareerPublicationSchema';
import {
  getCohortSharedFile, getCohortSharedPiece, listCohortShowcase, newThisWeek, setShared, shareStatus, toShowcaseWork, viewerCohort,
  type ShowcaseWork,
} from '../sharedWork';

const ME = '11111111-2222-4333-8444-00000000000a';
const PIECE = '11111111-2222-4333-8444-000000000001';
const COHORT = 'c0000000-0000-4000-8000-000000000001';
const CASE = { sections: [{ heading: 'Overview', body: 'Text' }], skills_demonstrated: ['Critical Thinking'], review_state: 'secret' };
const shared = (over: Record<string, unknown> = {}) => ({
  id: PIECE, kind: 'case_study', title: 'Week 2 Evaluation Case Study', created_at: '2026-08-25T15:00:00Z', competencies: [],
  content: CASE, shared_at: '2026-11-10T15:00:00Z', author_name: 'Dana Learner', mine: false, ...over,
});
const sqlOf = (i: number): string => String(mockQuery.mock.calls[i][0]);
const repl = (i: number): Record<string, unknown> => (mockQuery.mock.calls[i][1] as { replacements: Record<string, unknown> }).replacements;

beforeEach(() => mockQuery.mockReset());

describe('the table', () => {
  it('is one additive CREATE TABLE IF NOT EXISTS, nothing altered or dropped', () => {
    expect(SHARED_WORK_STATEMENTS).toHaveLength(1);
    expect(SHARED_WORK_STATEMENTS[0]).toMatch(/^CREATE TABLE IF NOT EXISTS career_shared_work/);
    expect(SHARED_WORK_STATEMENTS[0]).toMatch(/PRIMARY KEY \(enrollment_id, artifact_id\)/);
    expect(SHARED_WORK_STATEMENTS.join(' ')).not.toMatch(/ALTER|DROP|career_featured_work/i);
  });
});

describe('setShared: own pieces only, idempotent, separate from featuring', () => {
  it('a piece that is not the caller\'s is not_found and writes nothing', async () => {
    mockQuery.mockResolvedValueOnce([]);
    expect(await setShared(ME, PIECE, true)).toBe('not_found');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(repl(0)).toEqual({ artifactId: PIECE, enrollmentId: ME });
  });

  it('sharing inserts-or-nothing into career_shared_work only (twice is the same end state)', async () => {
    for (let n = 0; n < 2; n++) {
      mockQuery.mockResolvedValueOnce([{ id: PIECE }]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ artifact_id: PIECE }]);
      expect(await setShared(ME, PIECE, true)).toEqual({ shared: true, count: 1 });
    }
    const writes = mockQuery.mock.calls.map((c) => String(c[0])).filter((s) => /INSERT|DELETE/.test(s));
    expect(writes).toHaveLength(2);
    for (const w of writes) { expect(w).toMatch(/INSERT INTO career_shared_work .* ON CONFLICT DO NOTHING/); expect(w).not.toMatch(/featured/); }
  });

  it('unsharing deletes-or-nothing, never touching the featured set', async () => {
    mockQuery.mockResolvedValueOnce([{ id: PIECE }]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    expect(await setShared(ME, PIECE, false)).toEqual({ shared: false, count: 0 });
    expect(sqlOf(1)).toMatch(/^DELETE FROM career_shared_work WHERE enrollment_id = :enrollmentId AND artifact_id = :artifactId/);
    expect(mockQuery.mock.calls.map((c) => String(c[0])).join(' ')).not.toMatch(/career_featured_work/);
  });

  it('shareStatus reads the learner\'s own rows', async () => {
    mockQuery.mockResolvedValueOnce([{ artifact_id: PIECE }]);
    expect(await shareStatus(ME, PIECE)).toEqual({ shared: true });
    mockQuery.mockResolvedValueOnce([]);
    expect(await shareStatus(ME, PIECE)).toEqual({ shared: false });
  });
});

describe('who sees it: the viewer\'s own cohort, from enrollments', () => {
  it('the cohort comes from enrollments by the viewer id', async () => {
    mockQuery.mockResolvedValueOnce([{ cohort_id: COHORT }]);
    expect(await viewerCohort(ME)).toBe(COHORT);
    expect(sqlOf(0)).toMatch(/FROM enrollments WHERE id = :enrollmentId/);
    mockQuery.mockResolvedValueOnce([]);
    expect(await viewerCohort(ME)).toBeNull();
  });

  it('a viewer with no cohort sees nothing and the share table is never read', async () => {
    mockQuery.mockResolvedValueOnce([{ cohort_id: null }]);
    expect(await listCohortShowcase(ME)).toEqual({ items: [], newThisWeek: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    mockQuery.mockResolvedValueOnce([{ cohort_id: null }]);
    expect(await getCohortSharedPiece(ME, PIECE)).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('the list is filtered by the viewer\'s cohort and joins the share to the piece on id AND owner', async () => {
    mockQuery.mockResolvedValueOnce([{ cohort_id: COHORT }]).mockResolvedValueOnce([shared()]);
    const r = await listCohortShowcase(ME);
    expect(r.items).toHaveLength(1);
    const sql = sqlOf(1);
    expect(sql).toMatch(/r\.id = s\.artifact_id AND r\.enrollment_id = s\.enrollment_id/);
    expect(sql).toMatch(/WHERE e\.cohort_id = :cohortId/);
    expect(repl(1)).toEqual({ cohortId: COHORT, viewerId: ME });
  });

  it('a piece not visible (other cohort, unshared, made up) is null, for the piece and its file', async () => {
    mockQuery.mockResolvedValueOnce([{ cohort_id: COHORT }]).mockResolvedValueOnce([]);
    expect(await getCohortSharedPiece(ME, PIECE)).toBeNull();
    expect(sqlOf(1)).toMatch(/AND s\.artifact_id = :artifactId/);
    mockQuery.mockResolvedValueOnce([{ cohort_id: COHORT }]).mockResolvedValueOnce([]);
    expect(await getCohortSharedFile(ME, PIECE)).toBeNull();
  });
});

describe('what a classmate gets', () => {
  it('a card carries the author and the share time, never the private status, kind or leftover data', () => {
    const c = toShowcaseWork(shared());
    expect(c).toMatchObject({ id: PIECE, group: 'written', author: 'Dana Learner', sharedAt: '2026-11-10T15:00:00.000Z', mine: false });
    expect(c).not.toHaveProperty('state');
    expect(c).not.toHaveProperty('kind');
    expect(c).not.toHaveProperty('data');
    expect(toShowcaseWork(shared({ author_name: '  ' })).author).toBe('A classmate');
  });

  it('a piece is the read-only viewer shape: no status, no leftover data (review_state stays private)', async () => {
    mockQuery.mockResolvedValueOnce([{ cohort_id: COHORT }]).mockResolvedValueOnce([shared({ mine: true })]);
    const p = await getCohortSharedPiece(ME, PIECE);
    expect(p).toMatchObject({ id: PIECE, author: 'Dana Learner', mine: true });
    expect(p).not.toHaveProperty('state');
    expect(p).not.toHaveProperty('data');
    expect(JSON.stringify(p)).not.toContain('secret');
  });
});

describe('New this week', () => {
  const card = (id: string, sharedAt: string): ShowcaseWork => ({ ...toShowcaseWork(shared({ id })), sharedAt });
  const NOW = new Date('2026-11-11T18:00:00Z');
  it('is the newest share in the last 7 days, exactly 7 days included', () => {
    expect(newThisWeek([card('a', '2026-11-04T18:00:00Z')], NOW)?.id).toBe('a');
    expect(newThisWeek([card('b', '2026-11-10T00:00:00Z'), card('a', '2026-11-05T00:00:00Z')], NOW)?.id).toBe('b');
  });
  it('is null when nothing was shared in the last 7 days, or nothing at all', () => {
    expect(newThisWeek([card('a', '2026-11-04T17:59:59Z')], NOW)).toBeNull();
    expect(newThisWeek([], NOW)).toBeNull();
  });
});
