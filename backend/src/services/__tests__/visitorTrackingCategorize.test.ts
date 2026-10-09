jest.mock('../../models', () => ({
  Visitor: {},
  VisitorSession: {},
  PageEvent: {},
  Lead: {},
  Activity: {},
  EventLedger: {},
}));

import { categorizePagePath } from '../visitorTrackingService';

/**
 * `categorizePagePath` and the Case Study category (T019 AC2, defect D-1).
 *
 * THE BUG THIS PINS. The map has always contained `'/case-studies'`, but the
 * canonical public route is `/stories` and `/case-studies` merely REDIRECTS to
 * it. A redirect means the browser reports the resolved path, so the tracked
 * `page_path` was `/stories`, which matched no key, hit no prefix rule, and
 * fell through to `'other'`. The `case_studies` category has therefore never
 * been produced by a real visit, and six consumers that branch on it have been
 * dead code in production:
 *
 *   behavioralSignalService        the deep_scroll_case_study signal, strength 20
 *   admissionsMayaService          the "reviewing success stories" greeting
 *   admissionsPageContextAgent     the case_studies page-context branch
 *   chatService                    case-studies chat context
 *   admissionsKnowledgeService     case_studies -> outcomes knowledge routing
 *   visitorFlowGraphService        the "Case Studies" node in the flow graph
 *
 * Every one of them reads `page_category` and does nothing else to decide, so
 * this function returning `case_studies` is the whole of the fix and the whole
 * of the proof. The near-miss cases are here because the obvious repair - a
 * bare `startsWith('/stories')` - also matches `/stories-of-x`, which would
 * mislabel unrelated pages and inflate a strength-20 lead signal.
 */

describe('categorizePagePath - the canonical /stories route (AC2)', () => {
  it('categorises the index', () => {
    expect(categorizePagePath('/stories')).toBe('case_studies');
  });

  it('categorises a detail page', () => {
    expect(categorizePagePath('/stories/some-slug')).toBe('case_studies');
  });

  it('categorises a detail page with a deeper segment', () => {
    expect(categorizePagePath('/stories/some-slug/evidence')).toBe('case_studies');
  });

  it('categorises the legacy /case-studies URL identically', () => {
    // Kept deliberately: a direct hit logged before the redirect resolves must
    // not change category mid-session.
    expect(categorizePagePath('/case-studies')).toBe('case_studies');
  });

  it('survives the normalisation the function applies first', () => {
    expect(categorizePagePath('/stories/')).toBe('case_studies');
    expect(categorizePagePath('/stories?industry=insurance')).toBe('case_studies');
    expect(categorizePagePath('/stories/some-slug/?utm_source=li')).toBe('case_studies');
  });
});

describe('categorizePagePath - near misses must NOT match (AC2)', () => {
  it.each([
    '/stories-of-x',
    '/storiesboard',
    '/stories-index',
    '/our-stories',
    '/portal/stories',
  ])('%s is not a Case Study page', (path) => {
    expect(categorizePagePath(path)).not.toBe('case_studies');
  });

  it('/portal/stories stays with the portal, because prefix order decides', () => {
    expect(categorizePagePath('/portal/stories')).toBe('portal');
  });
});

describe('categorizePagePath - the pre-existing map is untouched', () => {
  it.each([
    ['/', 'homepage'],
    ['/pricing', 'pricing'],
    ['/program', 'program'],
    ['/enroll', 'enroll'],
    ['/contact', 'contact'],
    ['/referrals/anything', 'referrals'],
    ['/admin/leads', 'admin'],
    ['/definitely-not-a-route', 'other'],
  ])('%s -> %s', (path, expected) => {
    expect(categorizePagePath(path)).toBe(expected);
  });
});

/**
 * Hosted landing pages, `/p/:brand/:slug`.
 *
 * WHY A CATEGORY AT ALL, given the lesson above. The `case_studies` story was a category with
 * six consumers that nothing ever produced. The opposite mistake - producing a category nothing
 * reads - would be just as useless, so the consumer was checked first: `visitorAnalyticsService`
 * groups `page_events` by `page_category` generically (`group: ['page_category']`, with a
 * `?? 'uncategorized'` fallback), so a new category becomes its own row in the breakdown without
 * anything else being registered. Without this rule every campaign destination would land in
 * `'other'`, which is the one bucket that answers no question - and a landing-page view is the
 * most interesting event in a campaign funnel.
 */
describe('categorizePagePath - hosted landing pages', () => {
  it('categorises a landing page under its brand', () => {
    expect(categorizePagePath('/lp/colaberry-training/six-week-build')).toBe('landing_page');
  });

  it('survives the normalisation, including the UTM query a real click carries', () => {
    expect(categorizePagePath('/lp/colaberry-training/six-week-build/')).toBe('landing_page');
    expect(categorizePagePath('/lp/colaberry-training/six-week-build?utm_source=li')).toBe('landing_page');
  });

  it.each([
    '/portfolio',
    '/pricing',
    '/program',
    '/lpanel',
  ])('%s is not a landing page - the trailing slash in the prefix is load-bearing', (path) => {
    // A bare startsWith('/lp') would swallow every route beginning with those letters.
    expect(categorizePagePath(path)).not.toBe('landing_page');
  });

  /**
   * THE COLLISION THIS GUARDS. The rule shipped as `/p/` and `/p/` is the public career
   * portfolio route - so every portfolio view was being counted as a landing page view. It
   * wrote no bad rows (zero `landing_page` events in production on 2026-10-02) only because no
   * portfolio view happened to be tracked first.
   */
  it.each([
    '/p/jane-doe',
    '/p/jane-doe/',
    '/p/jane-doe?ref=li',
  ])('%s is a CAREER PORTFOLIO, not a landing page', (path) => {
    expect(categorizePagePath(path)).not.toBe('landing_page');
  });

  it('does not claim a bare /lp', () => {
    expect(categorizePagePath('/lp')).not.toBe('landing_page');
  });
});
