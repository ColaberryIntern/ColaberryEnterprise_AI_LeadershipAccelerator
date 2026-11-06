/**
 * The listing predicate (SPEC §1) as a pure intersection, and the SPEC §8 rows it owns.
 *
 * `buildHireIndex` takes every input already loaded, so each adversarial case is a fixture
 * rather than a database: enterprise-only, unlisted, archived, draft, two case studies for
 * one person, a project the public page does not show.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([[]]) } }));
jest.mock('../../career/portfolioCaseStudyLinks', () => ({ queryLinkedCaseStudyRows: jest.fn().mockResolvedValue([]) }));
jest.mock('../../caseStudy/caseStudyPublicStore', () => ({ loadSurfacePublications: jest.fn().mockResolvedValue([]) }));

import { sequelize } from '../../../config/database';
import { queryLinkedCaseStudyRows } from '../../career/portfolioCaseStudyLinks';
import { loadSurfacePublications } from '../../caseStudy/caseStudyPublicStore';
import { approvedProjectIds, buildHireIndex, loadHireIndex, type HirePageRow } from '../hireTalentIndex';
import type { HireCaseStudyCard } from '../hireTalentProjection';

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockLinks = queryLinkedCaseStudyRows as unknown as jest.Mock;
const mockPubs = loadSurfacePublications as unknown as jest.Mock;

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const page = (slug: string, projects: string[], over: Partial<HirePageRow> = {}): HirePageRow => ({
  enrollment_id: 'e-' + slug, slug, status: 'published', visibility: 'public',
  approved_identity: { projects: projects.map((id) => ({ id, name: 'p' })) },
  availability_status: null, availability_label: null, hire_spotlight: false, ...over,
});
const record = (slug: string, over: Record<string, unknown> = {}) => ({
  candidate: {
    slug, surfaceKey: 'hire', publicationStatus: 'published', hasApprovedSnapshot: true,
    archived: false, caseStudyStatus: 'approved', ...over,
  },
  content: {}, publication: { featured: false, publishedAt: '2026-11-01T00:00:00.000Z' },
});
const card = (r: any): HireCaseStudyCard => ({
  slug: r.candidate.slug, title: 'T ' + r.candidate.slug, summary: null, industry: null,
  featured: false, publishedAt: '2026-11-01', heroMetric: null, outcomes: [],
});
const visible = (...slugs: string[]) => new Map(slugs.map((s) => [s, record(s) as any]));

describe('buildHireIndex - the gate as an intersection', () => {
  it('lists a person whose project links to a visible hire case study', () => {
    const out = buildHireIndex([page('ann', [P1])], [{ project_id: P1, slug: 'cs-a' }], visible('cs-a'), card);
    expect(out.map((e) => e.page.slug)).toEqual(['ann']);
    expect(out[0].cases.map((c) => c.slug)).toEqual(['cs-a']);
  });

  it('does NOT list a person whose case study is published elsewhere only (absent from the hire map)', () => {
    expect(buildHireIndex([page('ann', [P1])], [{ project_id: P1, slug: 'cs-a' }], visible(), card)).toEqual([]);
  });

  it('gives one entry, two case studies, for a person with two', () => {
    const out = buildHireIndex([page('ann', [P1, P2])],
      [{ project_id: P1, slug: 'cs-b' }, { project_id: P2, slug: 'cs-a' }, { project_id: P1, slug: 'cs-a' }],
      visible('cs-a', 'cs-b'), card);
    expect(out).toHaveLength(1);
    expect(out[0].cases.map((c) => c.slug)).toEqual(['cs-a', 'cs-b']);
  });

  it('never carries a draft (non-visible) case study into the entry', () => {
    const out = buildHireIndex([page('ann', [P1])],
      [{ project_id: P1, slug: 'cs-live' }, { project_id: P1, slug: 'cs-draft' }], visible('cs-live'), card);
    expect(out[0].cases.map((c) => c.slug)).toEqual(['cs-live']);
  });

  it('ignores a link to a project the APPROVED public page does not show', () => {
    expect(buildHireIndex([page('ann', [P1])], [{ project_id: P2, slug: 'cs-a' }], visible('cs-a'), card)).toEqual([]);
  });

  it('drops one unprojectable person and keeps the rest', () => {
    const onDrop = jest.fn();
    const boom = (r: any) => { if (r.candidate.slug === 'cs-bad') throw new Error('bad content'); return card(r); };
    const out = buildHireIndex([page('ann', [P1]), page('bo', [P2])],
      [{ project_id: P1, slug: 'cs-bad' }, { project_id: P2, slug: 'cs-ok' }], visible('cs-bad', 'cs-ok'), boom, onDrop);
    expect(out.map((e) => e.page.slug)).toEqual(['bo']);
    expect(onDrop).toHaveBeenCalledWith('ann', expect.any(Error));
  });

  it('reads spotlight and availability off the page row', () => {
    const out = buildHireIndex([page('ann', [P1], { hire_spotlight: true, availability_status: 'open', availability_label: 'Open to FDE roles' })],
      [{ project_id: P1, slug: 'cs-a' }], visible('cs-a'), card);
    expect(out[0].facts).toEqual({ slug: 'ann', availabilityStatus: 'open', availabilityLabel: 'Open to FDE roles', hireSpotlight: true });
  });
});

describe('approvedProjectIds', () => {
  it('reads uuids from the frozen approved set and ignores anything else', () => {
    expect(approvedProjectIds({ projects: [{ id: P1 }, { id: 'nope' }, {}, null] })).toEqual([P1]);
    expect(approvedProjectIds(null)).toEqual([]);
    expect(approvedProjectIds({ projects: 'x' })).toEqual([]);
  });
});

describe('loadHireIndex - three reads, then the intersection', () => {
  beforeEach(() => { mockQuery.mockReset(); mockLinks.mockReset(); mockPubs.mockReset(); });

  it('selects only published pages at the requested visibilities, by bind, never by interpolation', async () => {
    mockQuery.mockResolvedValue([[]]);
    await loadHireIndex(['public']);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'published' AND visibility = ANY\(\$1::text\[\]\)/);
    expect(opts).toEqual({ bind: [['public']] });
    await loadHireIndex(['public', 'unlisted'], "ann'; drop table x;--");
    expect(mockQuery.mock.calls[1][1]).toEqual({ bind: [['public', 'unlisted'], "ann'; drop table x;--"] });
    expect(mockQuery.mock.calls[1][0]).not.toMatch(/drop table/);
  });

  it('applies isCandidatePubliclyVisible: an archived or unapproved record lists nobody', async () => {
    mockQuery.mockResolvedValue([[page('ann', [P1])]]);
    mockLinks.mockResolvedValue([{ project_id: P1, slug: 'cs-a' }]);
    mockPubs.mockResolvedValue([record('cs-a', { archived: true })]);
    expect(await loadHireIndex(['public'])).toEqual([]);
    mockPubs.mockResolvedValue([record('cs-a', { caseStudyStatus: 'draft' })]);
    expect(await loadHireIndex(['public'])).toEqual([]);
  });

  it('asks for the hire surface, once, and batches every project into one link query', async () => {
    mockQuery.mockResolvedValue([[page('ann', [P1]), page('bo', [P2])]]);
    mockLinks.mockResolvedValue([]);
    mockPubs.mockResolvedValue([]);
    await loadHireIndex(['public']);
    expect(mockPubs).toHaveBeenCalledTimes(1);
    expect(mockPubs).toHaveBeenCalledWith('hire');
    expect(mockLinks).toHaveBeenCalledTimes(1);
    expect(mockLinks.mock.calls[0][0].sort()).toEqual([P1, P2]);
  });

  it('propagates a database failure (the route answers 500)', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    await expect(loadHireIndex(['public'])).rejects.toThrow('connection refused');
  });
});
