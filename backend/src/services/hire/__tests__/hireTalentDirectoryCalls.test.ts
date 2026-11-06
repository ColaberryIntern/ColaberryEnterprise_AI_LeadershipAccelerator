/**
 * The directory's whole path, by call count (SPEC §4.1: "never make N+1 calls to
 * loadPublishedRecordBySlug for a list"). The gate is batched in hireTalentIndex; the cards
 * must not re-run it per person. The portfolio service is mocked at its boundary, and the
 * assertion is on the argument that tells it to resolve no case-study links.
 */
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));
jest.mock('../../career/careerPortfolioPageService', () => ({ getPublicPortfolioBySlug: jest.fn() }));
jest.mock('../../caseStudy/caseStudyPublicStore', () => ({ loadPublishedRecordBySlug: jest.fn(), loadSurfacePublications: jest.fn() }));

import { loadHireIndex } from '../hireTalentIndex';
import { getPublicPortfolioBySlug } from '../../career/careerPortfolioPageService';
import { loadPublishedRecordBySlug } from '../../caseStudy/caseStudyPublicStore';
import { getHireTalentDirectory, resetHireCardCache } from '../hireTalentDirectory';

const entry = (slug: string) => ({
  page: { slug }, facts: { slug, availabilityStatus: null, availabilityLabel: null, hireSpotlight: false },
  cases: [{ slug: `${slug}-case`, title: 'T', summary: null, industry: 'Insurance', featured: false, publishedAt: '2026-11-01', heroMetric: null, outcomes: [] }],
});
const portfolio = (name: string) => ({
  portfolio: { identity: { full_name: name, headline: 'Architect' }, capabilities: [], verified_commits: [] }, indexable: true,
});

beforeEach(() => {
  resetHireCardCache();
  (loadHireIndex as jest.Mock).mockReset();
  (getPublicPortfolioBySlug as jest.Mock).mockReset();
  (loadPublishedRecordBySlug as jest.Mock).mockReset();
});

describe('getHireTalentDirectory - no per-person gate', () => {
  it('builds every card WITHOUT case-study link resolution, and never calls loadPublishedRecordBySlug', async () => {
    (loadHireIndex as jest.Mock).mockResolvedValue([entry('ann'), entry('bo'), entry('cy')]);
    (getPublicPortfolioBySlug as jest.Mock).mockImplementation(async (slug: string) => portfolio(slug));
    const d = await getHireTalentDirectory({});
    expect(d.talent).toHaveLength(3);
    expect(getPublicPortfolioBySlug).toHaveBeenCalledTimes(3);
    for (const call of (getPublicPortfolioBySlug as jest.Mock).mock.calls) expect(call[2]).toBeNull();
    expect(loadPublishedRecordBySlug).not.toHaveBeenCalled();
    expect(loadHireIndex).toHaveBeenCalledTimes(1);
    expect(loadHireIndex).toHaveBeenCalledWith(['public']);
  });

  it('serves a repeat within 120s from the card cache, but recomputes the gate every time', async () => {
    (loadHireIndex as jest.Mock).mockResolvedValue([entry('ann')]);
    (getPublicPortfolioBySlug as jest.Mock).mockResolvedValue(portfolio('Ann'));
    await getHireTalentDirectory({});
    await getHireTalentDirectory({});
    expect(getPublicPortfolioBySlug).toHaveBeenCalledTimes(1);
    expect(loadHireIndex).toHaveBeenCalledTimes(2);
  });

  it('drops a withdrawn person on the very next request, cache or not', async () => {
    (loadHireIndex as jest.Mock).mockResolvedValueOnce([entry('ann')]).mockResolvedValueOnce([]);
    (getPublicPortfolioBySlug as jest.Mock).mockResolvedValue(portfolio('Ann'));
    expect((await getHireTalentDirectory({})).talent).toHaveLength(1);
    expect((await getHireTalentDirectory({})).talent).toHaveLength(0);
  });

  it('drops one person whose portfolio fails, and keeps the rest', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (loadHireIndex as jest.Mock).mockResolvedValue([entry('ann'), entry('bo')]);
    (getPublicPortfolioBySlug as jest.Mock).mockImplementation(async (slug: string) => {
      if (slug === 'ann') throw new Error('profile read failed');
      return portfolio(slug);
    });
    expect((await getHireTalentDirectory({})).talent.map((t) => t.slug)).toEqual(['bo']);
  });
});
