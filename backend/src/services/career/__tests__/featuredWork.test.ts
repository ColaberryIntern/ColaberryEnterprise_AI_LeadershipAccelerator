/**
 * C130 featured work. The rule (Ali, 11 Nov 2026, "After review"): the learner's live set shows on Preview; a stranger sees a piece
 * only when it is in the set frozen at review AND still featured AND unchanged (title + content). Unfeaturing takes effect at once
 * (independent verifier, attempt 1). Nothing is public by default.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockPage = jest.fn();
jest.mock('../careerPortfolioPageAccess', () => ({
  findPageBySlug: (s: string) => mockPage(s),
  publicViewDecision: jest.requireActual('../careerPortfolioPageAccess').publicViewDecision,
}));

import {
  featuredSource, featuredWorkFor, featureStatus, freezeFeatured, frozenFeaturedOf, getPublicFeaturedPiece, MAX_FEATURED,
  pieceHash, publicPieces, setFeatured, toPublicPiece,
} from '../featuredWork';

const A = '11111111-2222-4333-8444-000000000001';
const B = '11111111-2222-4333-8444-000000000002';
const CASE = { sections: [{ heading: 'Overview', body: 'Text' }], skills_demonstrated: ['Critical Thinking'] };
const row = (id: string, content: Record<string, unknown> = CASE, kind = 'case_study', title = 'Week 2 Evaluation Case Study') =>
  ({ id, kind, title, created_at: '2026-08-25T15:00:00Z', competencies: [], content });
const frozenOf = (...rows: ReturnType<typeof row>[]) => rows.map((r) => ({ artifact_id: r.id, content_sha256: pieceHash(r) }));
const live = (...ids: string[]) => ids.map((artifact_id) => ({ artifact_id }));

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

  it('public = approved AND still featured AND unchanged, in the approved order', () => {
    const a = row(A);
    const b = row(B);
    expect(publicPieces([a, b], frozenOf(b, a), [A, B]).map((r) => r.id)).toEqual([B, A]);
    expect(publicPieces([a, b], frozenOf(a, b), [B]).map((r) => r.id)).toEqual([B]); // A unfeatured after approval
    expect(publicPieces([a], frozenOf(a), [])).toEqual([]);
    expect(publicPieces([row(A, { ...CASE, sections: [] })], frozenOf(a), [A])).toEqual([]); // content changed
    expect(publicPieces([row(A, CASE, 'case_study', 'Retitled')], frozenOf(a), [A])).toEqual([]); // title changed
    expect(publicPieces([a], frozenOf(b), [A, B])).toEqual([]); // featured live but never approved
  });
});

describe('setFeatured', () => {
  it("another learner's piece is not_found and writes nothing", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(setFeatured('enr-9', A, true)).resolves.toBe('not_found');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/id = :artifactId AND enrollment_id = :enrollmentId/);
  });

  it('featuring is insert-or-nothing (idempotent) and unfeaturing is delete', async () => {
    mockQuery.mockResolvedValueOnce([{ id: A }]).mockResolvedValueOnce([]).mockResolvedValueOnce(undefined).mockResolvedValueOnce(live(A));
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

describe('freeze and the public section', () => {
  it('freezes the live set with the hash of the title + content being approved, skipping ids that no longer exist', async () => {
    mockQuery.mockResolvedValueOnce(live(A, B)).mockResolvedValueOnce([row(A)]);
    await expect(freezeFeatured('enr-9')).resolves.toEqual(frozenOf(row(A)));
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({ enrollmentId: 'enr-9', ids: [A, B] });
  });

  it('lists only approved, still-featured, unchanged pieces, in named fields', async () => {
    mockQuery.mockResolvedValueOnce(live(A)).mockResolvedValueOnce([row(A)]);
    const list = await featuredWorkFor('enr-9', { featured_work: frozenOf(row(A)) });
    expect(list).toEqual([{ id: A, group: 'written', title: 'Week 2 Evaluation Case Study', from: 'Case study', created_at: '2026-08-25T15:00:00.000Z' }]);
  });

  it('a piece unfeatured after approval leaves the public section at once', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([row(A)]);
    await expect(featuredWorkFor('enr-9', { featured_work: frozenOf(row(A)) })).resolves.toEqual([]);
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

describe('featureStatus: what the learner is told', () => {
  const pageRow = { status: 'published', visibility: 'unlisted', approved_identity: { featured_work: frozenOf(row(A)) } };

  it('approved, then unfeatured: not featured and NOT on the public page (the Feature card says "only you", truthfully)', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(featureStatus('enr-9', A)).resolves.toEqual({ featured: false, onPublicPage: false });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('featured and approved and unchanged: on the public page', async () => {
    mockQuery.mockResolvedValueOnce(live(A)).mockResolvedValueOnce([pageRow]).mockResolvedValueOnce([row(A)]);
    await expect(featureStatus('enr-9', A)).resolves.toEqual({ featured: true, onPublicPage: true });
  });

  it('featured but not yet approved: Preview only', async () => {
    mockQuery.mockResolvedValueOnce(live(B)).mockResolvedValueOnce([pageRow]);
    await expect(featureStatus('enr-9', B)).resolves.toEqual({ featured: true, onPublicPage: false });
  });
});

describe('getPublicFeaturedPiece', () => {
  const page = (extra: Record<string, unknown> = {}) => ({ enrollment_id: 'enr-9', slug: 's', status: 'published', visibility: 'unlisted',
    approved_identity: { featured_work: frozenOf(row(A)) }, ...extra });

  it('serves an approved, still-featured, unchanged piece on a viewable page, keeping noindex for unlisted', async () => {
    mockPage.mockResolvedValue(page());
    mockQuery.mockResolvedValueOnce(live(A)).mockResolvedValueOnce([row(A)]);
    const hit = await getPublicFeaturedPiece('s', A);
    expect(hit?.piece.id).toBe(A);
    expect(hit?.indexable).toBe(false);
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({ enrollmentId: 'enr-9', ids: [A] });
  });

  it('null for a piece unfeatured after approval (the route\'s plain 404)', async () => {
    mockPage.mockResolvedValue(page());
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([row(A)]);
    await expect(getPublicFeaturedPiece('s', A)).resolves.toBeNull();
  });

  it.each([
    ['a draft page', { status: 'draft' }],
    ['a private page', { visibility: 'private' }],
    ['an id not in the approved set', { approved_identity: { featured_work: frozenOf(row(B)) } }],
    ['a page approved before featured work', { approved_identity: { title: 'x' } }],
  ])('null for %s, without reading any piece', async (_label, extra) => {
    mockPage.mockResolvedValue(page(extra));
    await expect(getPublicFeaturedPiece('s', A)).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('null when the piece changed after approval, and when the slug does not exist', async () => {
    mockPage.mockResolvedValue(page());
    mockQuery.mockResolvedValueOnce(live(A)).mockResolvedValueOnce([row(A, { ...CASE, sections: [] })]);
    await expect(getPublicFeaturedPiece('s', A)).resolves.toBeNull();
    mockPage.mockResolvedValue(null);
    await expect(getPublicFeaturedPiece('nobody', A)).resolves.toBeNull();
  });
});
