/**
 * gatherOptionalEvidence's `surfaceKey`: which surface a project's case-study link must be
 * published on - and `null`, which resolves NO links. The hire directory builds one card per
 * listed person and never shows those links, so resolving them there was a per-person,
 * per-row loadPublishedRecordBySlug (an N+1 the hire spec forbids). Every other caller keeps
 * the enterprise default exactly.
 */
jest.mock('../portfolioCaseStudyLinks', () => ({ caseStudyLinksForProjects: jest.fn().mockResolvedValue({ p1: 'cs' }) }));
jest.mock('../portfolioVerifiedCommits', () => ({
  verifiedCommitsForEnrollment: jest.fn().mockResolvedValue([]), VERIFIED_COMMITS_SQL: 'SQL',
}));
jest.mock('../portfolioRepoReachability', () => ({ reachablePublicRepos: jest.fn().mockResolvedValue(new Set()) }));

import { caseStudyLinksForProjects } from '../portfolioCaseStudyLinks';
import { gatherOptionalEvidence } from '../portfolioOptionalEvidence';

const links = caseStudyLinksForProjects as unknown as jest.Mock;
const args = (surfaceKey?: string | null) => ({
  enrollmentId: 'e1', projects: [{ id: 'p1' }], repoUrls: [], query: async () => [], now: new Date(), surfaceKey,
});

beforeEach(() => links.mockClear());

describe('gatherOptionalEvidence - surfaceKey', () => {
  it('keeps the default for every existing caller (no surfaceKey passed)', async () => {
    const out = await gatherOptionalEvidence(args());
    expect(links).toHaveBeenCalledWith([{ id: 'p1' }], undefined);
    expect(out.caseStudyByProject).toEqual({ p1: 'cs' });
  });

  it('resolves links against the surface it is given', async () => {
    await gatherOptionalEvidence(args('hire'));
    expect(links).toHaveBeenCalledWith([{ id: 'p1' }], 'hire');
  });

  it('resolves NO links, and asks nothing, when surfaceKey is null', async () => {
    const out = await gatherOptionalEvidence(args(null));
    expect(links).not.toHaveBeenCalled();
    expect(out.caseStudyByProject).toEqual({});
  });
});
