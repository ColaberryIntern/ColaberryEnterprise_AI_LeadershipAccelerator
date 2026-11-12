/**
 * The Phase 2 extras on GET /api/public/portfolios/:slug?surface=hire: `hire.intro`,
 * `hire.caseStudyOrder` and `hire.booking`. Each is optional to the page: a failure is logged
 * and the profile renders as before. No email or work authorization ever rides along.
 */
jest.mock('../../career/caseStudyLinkedPerson', () => ({ linkedPeopleForCaseStudy: jest.fn() }));
jest.mock('../../career/careerPortfolioPageService', () => ({ getPublicPortfolioBySlug: jest.fn() }));
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));
jest.mock('../hireStudioSettings', () => ({ readPublicIntro: jest.fn(), readCaseStudyOrder: jest.fn() }));
jest.mock('../hireInterviews', () => ({ bookingSummary: jest.fn() }));
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { getPublicPortfolioBySlug } from '../../career/careerPortfolioPageService';
import { loadHireIndex } from '../hireTalentIndex';
import { readCaseStudyOrder, readPublicIntro } from '../hireStudioSettings';
import { bookingSummary } from '../hireInterviews';
import { getHirePortfolio } from '../hirePortfolio';

const m = (f: unknown) => f as jest.Mock;
const E1 = '11111111-1111-4111-8111-111111111111';
const card = (slug: string) => ({ slug, title: 'T', summary: null, industry: null, featured: false, publishedAt: '2026-11-01', heroMetric: null, outcomes: [], look: {} });
const ENTRY = {
  page: { enrollment_id: E1, slug: 'ann-lee', visibility: 'public' },
  facts: { availabilityStatus: null, availabilityLabel: null, hireSpotlight: false },
  cases: [card('a'), card('b')],
};
const INTRO = { answers: [{ key: 'team', question: 'Q', text: 'A' }], roles: ['FDE'], setups: ['remote'], earliestStart: null, video: null };
const BOOKING = { enabled: true, nextSlots: ['2026-11-16T15:00:00.000Z'], formats: [{ id: 'intro', name: 'Intro call', minutes: 20 }] };

beforeEach(() => {
  m(loadHireIndex).mockReset().mockResolvedValue([ENTRY]);
  m(getPublicPortfolioBySlug).mockReset().mockResolvedValue({ portfolio: { identity: { email: 'ann@example.com' }, projects: [] }, indexable: true });
  m(readPublicIntro).mockReset().mockResolvedValue(INTRO);
  m(readCaseStudyOrder).mockReset().mockResolvedValue(['b', 'gone', 'a']);
  m(bookingSummary).mockReset().mockResolvedValue(BOOKING);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('adds the intro, the order (published slugs only) and the booking, read for the page\'s own enrollment', async () => {
  const out = await getHirePortfolio('ann-lee', new Date('2026-11-12T16:00:00Z'));
  expect(out?.hire.intro).toEqual(INTRO);
  expect(out?.hire.caseStudyOrder).toEqual(['b', 'a']);
  expect(out?.hire.booking).toEqual(BOOKING);
  expect(readPublicIntro).toHaveBeenCalledWith(E1);
  expect(bookingSummary).toHaveBeenCalledWith(E1, new Date('2026-11-12T16:00:00Z'));
  expect(JSON.stringify(out)).not.toMatch(/@|work_?auth/i);
});

it('renders the profile as before when an extra cannot be read (logged, never a 500)', async () => {
  m(readPublicIntro).mockRejectedValue(new Error('relation "hire_profile_intro" does not exist'));
  m(bookingSummary).mockRejectedValue(new Error('timeout'));
  const out = await getHirePortfolio('ann-lee');
  expect(out?.hire.intro).toBeNull();
  expect(out?.hire.booking).toEqual({ enabled: false, nextSlots: [], formats: [] });
  expect(out?.hire.caseStudyOrder).toEqual(['b', 'a']);
  const events = (console.warn as jest.Mock).mock.calls.map((c) => JSON.parse(String(c[0])));
  expect(events.map((e) => e.context.what).sort()).toEqual(['booking', 'intro']);
});
