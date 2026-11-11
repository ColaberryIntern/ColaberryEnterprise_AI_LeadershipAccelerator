/**
 * C130 featured work. The rule (Ali, 11 Nov 2026, "After review"): the learner's live set shows on Preview; a stranger sees only the
 * set frozen at review, and only while each piece's content still matches. Nothing is public by default.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockPage = jest.fn();
jest.mock('../careerPortfolioPageAccess', () => ({
  findPageBySlug: (s: string) => mockPage(s),
  publicViewDecision: jest.requireActual('../careerPortfolioPageAccess').publicViewDecision,
}));

import {
  contentHash, featuredSource, featuredWorkFor, freezeFeatured, frozenFeaturedOf, getPublicFeaturedPiece, MAX_FEATURED,
  setFeatured, stillApproved, toPublicPiece,
} from '../featuredWork';

const A = '11111111-2222-4333-8444-000000000001';
const B = '11111111-2222-4333-8444-000000000002';
const row = (id: string, content: Record<string, unknown>, kind = 'case_study') =>
  ({ id, kind, title: 'Week 2 Evaluation Case Study', created_at: '2026-08-25T15:00:00Z', competencies: [], content });
const CASE = { sections: [{ heading: 'Overview', body: 'Text' }], skills_demonstrated: ['Critical Thinking'] };

beforeEach(() => { mockQuery.mockReset(); mockPage.mockReset(); });

describe('who sees which set', () => {
  it('only the reviewer preview reads the live set; every public read is frozen, and a missing approval is an EMPTY set', () => {
    expect(featuredSource(null, null)).toBeNull();
    expect(featuredSource([], { featured_work: [] })).toEqual({ featured_work: [] });
    expect(featuredSource([], null)).toEqual({});
    expect(featuredSource([], undefined)).toEqual({});
  });

  it('a page approved before featured work existed has nothing featured; malformed entries are dropped', () => {
    expect(frozenFeaturedOf({ title: 'x', projects: [] })).toEqual([]);
    expect(frozenFeaturedOf(null)).toEqual([]);
    expect(frozenFeaturedOf({ featured_work: [{ artifact_id: A, content_sha256: 'h' }, { artifact_id: 5 }, 'junk'] }))
      .toEqual([{ artifact_id: A, content_sha256: 'h' }]);
  });

  it('a piece whose content changed after approval drops off until the next review; order follows the approval', () => {
    const a = row(A, CASE);
    const b = row(B, { ...CASE, sections: [{ heading: 'Rewritten', body: 'after approval' }] });
    const frozen = [{ artifact_id: B, content_sha256: contentHash(CASE) }, { artifact_id: A, content_sha256: contentHash(CASE) }];
    expect(stillApproved([a, b], frozen).map((r) => r.id)).toEqual([A]);
    expect(stillApproved([a], [{ artifact_id: B, content_sha256: contentHash(CASE) }])).toEqual([]);
  });
});

describe('setFeatured', () => {
  it('another learner\'s piece is not_found and writes nothing', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(setFeatured('enr-9', A, true)).resolves.toBe('not_found');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/id = :artifactId AND enrollment_id = :enrollmentId/);
  });

  it('featuring is insert-or-nothing (idempotent) and unfeaturing is delete', async () => {
    mockQuery.mockResolvedValueOnce([{ id: A }]).mockResolvedValueOnce([]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ artifact_id: A }]);
    await expect(setFeatured('enr-9', A, true)).resolves.toEqual({ featured: true, count: 1 });
    expect(String(mockQuery.mock.calls[2][0])).toContain('ON CONFLICT DO NOTHING');
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce([{ id: A }]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    await expect(setFeatured('enr-9', A, false)).resolves.toEqual({ featured: false, count: 0 });
    expect(String(mockQuery.mock.calls[1][0])).toMatch(/^DELETE FROM career_featured_work WHERE enrollment_id = :enrollmentId AND artifact_id/);
  });

  it(`the ${MAX_FEATURED + 1}th feature is refused; re-featuring one already featured at the cap is fine`, async () => {
    const twelve = Array.from({ length: MAX_FEATURED }, (_, i) => ({ artifact_id: `id-${i}` }));
    mockQuery.mockResolvedValueOnce([{ id: A }]).mockResolvedValueOnce(twelve);
    await expect(setFeatured('enr-9', A, true)).resolves.toBe('limit');
    expect(mockQuery).toHaveBeenCalledTimes(2);
    mockQuery.mockReset();
    const withA = [...twelve.slice(1), { artifact_id: A }];
    mockQuery.mockResolvedValueOnce([{ id: A }]).mockResolvedValueOnce(withA).mockResolvedValueOnce(undefined).mockResolvedValueOnce(withA);
    await expect(setFeatured('enr-9', A, true)).resolves.toEqual({ featured: true, count: MAX_FEATURED });
  });
});

describe('freeze and read', () => {
  it('freezes the live set with the hash of the content being approved, skipping ids that no longer exist', async () => {
    mockQuery.mockResolvedValueOnce([{ artifact_id: A }, { artifact_id: B }]).mockResolvedValueOnce([row(A, CASE)]);
    await expect(freezeFeatured('enr-9')).resolves.toEqual([{ artifact_id: A, content_sha256: contentHash(CASE) }]);
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({ enrollmentId: 'enr-9', ids: [A, B] });
  });

  it('the public section lists only approved, unchanged pieces, in named fields', async () => {
    mockQuery.mockResolvedValueOnce([row(A, CASE)]);
    const list = await featuredWorkFor('enr-9', { featured_work: [{ artifact_id: A, content_sha256: contentHash(CASE) }] });
    expect(list).toEqual([{ id: A, group: 'written', title: 'Week 2 Evaluation Case Study', from: 'Case study', created_at: '2026-08-25T15:00:00.000Z' }]);
  });

  it('nothing frozen: no query, nothing listed', async () => {
    await expect(featuredWorkFor('enr-9', {})).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a public piece never carries the private status, leftover data or server paths', () => {
    const p = toPublicPiece(row(A, { stored_path: '/app/uploads/x/secret.pdf', stored_name: 'secret.pdf', filename: 'a.pdf', mimetype: 'application/pdf', repo_path: 'r' }, 'build_artifact'));
    expect(p).not.toHaveProperty('state');
    expect(p).not.toHaveProperty('data');
    expect(JSON.stringify(p)).not.toMatch(/app\/uploads|secret/);
  });
});

describe('getPublicFeaturedPiece', () => {
  const page = (extra: Record<string, unknown> = {}) => ({ enrollment_id: 'enr-9', slug: 's', status: 'published', visibility: 'unlisted',
    approved_identity: { featured_work: [{ artifact_id: A, content_sha256: contentHash(CASE) }] }, ...extra });

  it('serves an approved, unchanged piece on a viewable page, keeping noindex for unlisted', async () => {
    mockPage.mockResolvedValue(page());
    mockQuery.mockResolvedValueOnce([row(A, CASE)]);
    const hit = await getPublicFeaturedPiece('s', A);
    expect(hit?.piece.id).toBe(A);
    expect(hit?.indexable).toBe(false);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ enrollmentId: 'enr-9', ids: [A] });
  });

  it.each([
    ['a draft page', { status: 'draft' }],
    ['a private page', { visibility: 'private' }],
    ['an id not in the approved set', { approved_identity: { featured_work: [{ artifact_id: B, content_sha256: 'x' }] } }],
    ['a page approved before featured work', { approved_identity: { title: 'x' } }],
  ])('null for %s, without reading any piece', async (_label, extra) => {
    mockPage.mockResolvedValue(page(extra));
    await expect(getPublicFeaturedPiece('s', A)).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('null when the piece changed after approval, and when the slug does not exist', async () => {
    mockPage.mockResolvedValue(page());
    mockQuery.mockResolvedValueOnce([row(A, { ...CASE, sections: [] })]);
    await expect(getPublicFeaturedPiece('s', A)).resolves.toBeNull();
    mockPage.mockResolvedValue(null);
    await expect(getPublicFeaturedPiece('nobody', A)).resolves.toBeNull();
  });
});
