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
