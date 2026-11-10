/**
 * Who a Hire record lists, as the admin sees it (hireAdminPerson), and the hire portfolio
 * a stranger can reach (hirePortfolio). Every boundary is mocked at its module.
 */
jest.mock('../../career/caseStudyLinkedPerson', () => ({ linkedPeopleForCaseStudy: jest.fn() }));
jest.mock('../../career/careerEvidenceAdapters', () => ({ identityAdapter: jest.fn() }));
jest.mock('../../career/careerPortfolioPageService', () => ({ getPortfolioPreview: jest.fn(), getPublicPortfolioBySlug: jest.fn() }));
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));
jest.mock('../hireListingSettings', () => ({ readHireListingSettings: jest.fn() }));
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { linkedPeopleForCaseStudy } from '../../career/caseStudyLinkedPerson';
import { identityAdapter } from '../../career/careerEvidenceAdapters';
import { getPortfolioPreview, getPublicPortfolioBySlug } from '../../career/careerPortfolioPageService';
import { loadHireIndex } from '../hireTalentIndex';
import { readHireListingSettings } from '../hireListingSettings';
import CaseStudy from '../../../models/CaseStudy';
import { pickPage, withHirePerson, withLinkedPerson } from '../hireAdminPerson';
import { builderPortfolioSlugForCaseStudySlug, getHirePortfolio } from '../hirePortfolio';

const m = (f: unknown) => f as jest.Mock;
const page = (portfolioSlug: string, status: string, visibility: string) =>
  ({ enrollmentId: 'e-' + portfolioSlug, portfolioSlug, status, visibility });
const card = (slug: string) => ({ slug, title: 'T', summary: null, industry: null, featured: false, publishedAt: '2026-11-01', heroMetric: { value: '3', label: 'x' }, outcomes: [{ value: '3', label: 'x' }] });

beforeEach(() => {
  jest.restoreAllMocks();
  [linkedPeopleForCaseStudy, identityAdapter, getPortfolioPreview, getPublicPortfolioBySlug, loadHireIndex, readHireListingSettings].forEach((f) => m(f).mockReset());
  m(CaseStudy.findOne).mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('pickPage - the page a listing would show', () => {
  it('prefers a listed page, then a reachable one, then any, never inventing one', () => {
    expect(pickPage([page('a', 'draft', 'private'), page('b', 'published', 'unlisted'), page('c', 'published', 'public')])?.portfolioSlug).toBe('c');
    expect(pickPage([page('a', 'draft', 'private'), page('b', 'published', 'unlisted')])?.portfolioSlug).toBe('b');
    expect(pickPage([page('a', 'draft', 'private')])?.portfolioSlug).toBe('a');
    expect(pickPage([])).toBeNull();
  });
});

describe('withHirePerson - the HIRE publish row', () => {
  it('names the person and says whether they are listed', async () => {
    m(linkedPeopleForCaseStudy).mockResolvedValue([page('ann-lee', 'published', 'public')]);
    m(identityAdapter).mockResolvedValue({ full_name: 'Ann Lee' });
    expect((await withHirePerson({ caseStudy: {} }, 'cs1')).hirePerson).toEqual({ name: 'Ann Lee', portfolioSlug: 'ann-lee', listed: true });
  });

  it('is null when the record resolves to nobody', async () => {
    m(linkedPeopleForCaseStudy).mockResolvedValue([]);
    expect((await withHirePerson({}, 'cs1')).hirePerson).toBeNull();
  });

  it('never breaks the detail: a lookup failure is logged and reads as null', async () => {
    m(linkedPeopleForCaseStudy).mockRejectedValue(new Error('db down'));
    const out = await withHirePerson({ caseStudy: { id: 'cs1' } }, 'cs1');
    expect(out.hirePerson).toBeNull();
    expect(out.caseStudy).toEqual({ id: 'cs1' });
  });
});

describe('withLinkedPerson - the HIRE preview band', () => {
  it('passes every other surface through untouched, with no lookup', async () => {
    const preview = { surfaceKey: 'enterprise', projection: null };
    expect(await withLinkedPerson(preview, 'cs1')).toBe(preview);
    expect(linkedPeopleForCaseStudy).not.toHaveBeenCalled();
  });

  it('builds the band from the reviewer-preview projection and the page settings', async () => {
    m(linkedPeopleForCaseStudy).mockResolvedValue([page('ann-lee', 'published', 'public')]);
    m(getPortfolioPreview).mockResolvedValue({ portfolio: {
      identity: { full_name: 'Ann Lee', avatar_data_url: null, headline: 'Architect', cohort_name: 'July 2026' },
      capabilities: [{ name: 'A', proven: true }, { name: 'B' }], verified_commits: [{}, {}], stats: { files_committed: 412 },
    } });
    m(readHireListingSettings).mockResolvedValue({ availability: { status: 'open', label: 'Open' }, spotlight: true });
    m(loadHireIndex).mockResolvedValue([{ cases: [card('a'), card('b')] }]);
    const out = await withLinkedPerson({ surfaceKey: 'hire' }, 'cs1');
    expect(out.linkedPerson).toMatchObject({
      name: 'Ann Lee', role: 'Architect', listed: true, spotlight: true, availability: { kind: 'open', label: 'Open' },
      proof: { publishedCaseStudies: 2, verifiedCommits: 2, capabilitiesProven: 1, filesCommitted: 412 },
    });
  });

  it('is null (the refusal band) when the record resolves to nobody, and on a lookup failure', async () => {
    m(linkedPeopleForCaseStudy).mockResolvedValue([]);
    expect((await withLinkedPerson({ surfaceKey: 'hire' }, 'cs1')).linkedPerson).toBeNull();
    m(linkedPeopleForCaseStudy).mockRejectedValue(new Error('down'));
    expect((await withLinkedPerson({ surfaceKey: 'hire' }, 'cs1')).linkedPerson).toBeNull();
  });
});

describe('getHirePortfolio - reachable, not only listed', () => {
  const entry = (visibility: string) => ({
    page: { slug: 'ann-lee', visibility }, facts: { availabilityStatus: null, availabilityLabel: null, hireSpotlight: false },
    cases: [card('a')],
  });

  it('is null for anyone not reachable on Hire, and asks for public OR unlisted', async () => {
    m(loadHireIndex).mockResolvedValue([]);
    expect(await getHirePortfolio('ann-lee')).toBeNull();
    expect(loadHireIndex).toHaveBeenCalledWith(['public', 'unlisted'], 'ann-lee');
  });

  it('resolves links against hire, and is indexable only for an explicit public page', async () => {
    m(loadHireIndex).mockResolvedValue([entry('unlisted')]);
    m(getPublicPortfolioBySlug).mockResolvedValue({ portfolio: { identity: {} }, indexable: false });
    const out = await getHirePortfolio('ann-lee');
    expect(getPublicPortfolioBySlug).toHaveBeenCalledWith('ann-lee', expect.any(Date), 'hire');
    expect(out?.hire.indexable).toBe(false);
    m(loadHireIndex).mockResolvedValue([entry('public')]);
    m(getPublicPortfolioBySlug).mockResolvedValue({ portfolio: { identity: {} }, indexable: true });
    expect((await getHirePortfolio('ann-lee'))?.hire.indexable).toBe(true);
  });

  it('lists the case studies without their metric payloads, and picks the signature', async () => {
    m(loadHireIndex).mockResolvedValue([entry('public')]);
    m(getPublicPortfolioBySlug).mockResolvedValue({ portfolio: { identity: {} }, indexable: true });
    const out = await getHirePortfolio('ann-lee');
    expect(out?.hire.caseStudies[0]).not.toHaveProperty('outcomes');
    expect(out?.hire.signature?.slug).toBe('a');
  });

  it('never carries the email address on Hire, and leaves the rest of the identity alone', async () => {
    m(loadHireIndex).mockResolvedValue([entry('public')]);
    const identity = { full_name: 'Ann Lee', headline: 'Architect', email: 'ann@example.com', linkedin_url: 'https://linkedin.com/in/ann' };
    m(getPublicPortfolioBySlug).mockResolvedValue({ portfolio: { identity, projects: [] }, indexable: true });
    const out: any = await getHirePortfolio('ann-lee');
    expect(out.portfolio.identity.email).toBeNull();
    expect(JSON.stringify(out)).not.toContain('ann@example.com');
    expect(out.portfolio.identity).toMatchObject({ full_name: 'Ann Lee', headline: 'Architect', linkedin_url: 'https://linkedin.com/in/ann' });
    expect(out.portfolio.projects).toEqual([]);
    // The source object is not mutated: the enterprise read keeps its email.
    expect(identity.email).toBe('ann@example.com');
    // Idempotent: a second read is the same answer.
    expect(JSON.stringify(await getHirePortfolio('ann-lee'))).toBe(JSON.stringify(out));
  });

  it('is null, not a partial payload, when the portfolio cannot be read', async () => {
    m(loadHireIndex).mockResolvedValue([entry('public')]);
    m(getPublicPortfolioBySlug).mockResolvedValue(null);
    expect(await getHirePortfolio('ann-lee')).toBeNull();
  });
});

describe('builderPortfolioSlugForCaseStudySlug - the "Built by" link', () => {
  it('links only a reachable person, and never throws', async () => {
    m(CaseStudy.findOne).mockResolvedValue({ id: 'cs1' });
    m(linkedPeopleForCaseStudy).mockResolvedValue([page('ann-lee', 'published', 'unlisted')]);
    expect(await builderPortfolioSlugForCaseStudySlug('claims')).toBe('ann-lee');
    m(linkedPeopleForCaseStudy).mockResolvedValue([page('ann-lee', 'draft', 'public')]);
    expect(await builderPortfolioSlugForCaseStudySlug('claims')).toBeNull();
    m(CaseStudy.findOne).mockRejectedValue(new Error('down'));
    expect(await builderPortfolioSlugForCaseStudySlug('claims')).toBeNull();
  });
});
