/**
 * Where each surface's call to action actually sends a reader.
 *
 * These hrefs are the weak link in the surface profiles, and they failed silently for
 * exactly the reason weak links usually do: they are resolved on a DIFFERENT site than the
 * one that stores them. The training surface shipped `href: '/programs'`, and
 * training.colaberry.com has no `/programs` route. Every student-project page carried a
 * primary CTA reading "See the program" that 404'd, and nothing in this repository could
 * notice — the string is well-formed, the profile is valid, the API returns 200, and the
 * page renders. It was found by a person clicking it.
 *
 * A unit test cannot follow a link into another repository's router, so this does the one
 * thing it can: pins each href to a route someone has verified, next to the site it
 * resolves against. That converts a silent breakage into a deliberate edit — changing a
 * target now means changing this file and saying which page you checked.
 *
 * WHEN THIS FAILS, do not just update the expectation. Load the URL. The expectation is a
 * record that someone once did; a blind update turns it back into a guess.
 */
import { CASE_STUDY_SURFACE_PROFILES } from '../caseStudySurfaceProfiles';

/**
 * Verified live on 2026-09-09 by requesting each URL.
 *   training.colaberry.com/accelerator  200   (was /programs -> 404, the bug)
 *   enterprise.colaberry.ai/lab         200
 * The two below are recorded from the profiles rather than probed, because those surfaces
 * are not yet serving case-study pages — flagged so nobody reads them as checked.
 */
const EXPECTED_CTA: Record<string, { href: string; site: string; verified: boolean }> = {
  training: { href: '/accelerator', site: 'https://training.colaberry.com', verified: true },
  enterprise: { href: '/lab', site: 'https://enterprise.colaberry.ai', verified: true },
  'ai-flotation': { href: '/contact', site: 'https://aiflotation.com', verified: false },
  refactored: { href: '/refactored', site: 'https://refactored.ai', verified: false },
};

describe('surface CTA hrefs', () => {
  const slugs = Object.keys(CASE_STUDY_SURFACE_PROFILES);

  it('covers every surface, so a new one cannot be added without recording its target', () => {
    expect(slugs.sort()).toEqual(Object.keys(EXPECTED_CTA).sort());
  });

  it.each(Object.entries(EXPECTED_CTA))(
    '%s sends readers to a route that exists on its own site',
    (slug, expected) => {
      const cta = (CASE_STUDY_SURFACE_PROFILES as Record<string, { cta?: { href?: string } }>)[slug]?.cta;
      expect(cta?.href).toBe(expected.href);
    }
  );

  it('never points the training surface at /programs, which does not exist there', () => {
    // Named explicitly rather than left to the table above. This is the regression: the
    // route is absent from training.colaberry.com and a generic "href is a string" check
    // passed happily while every student-project CTA was dead.
    const training = (CASE_STUDY_SURFACE_PROFILES as Record<string, { cta?: { href?: string } }>).training;
    expect(training?.cta?.href).not.toBe('/programs');
  });

  it('keeps every href a site-relative path, since each resolves on its own domain', () => {
    for (const slug of slugs) {
      const href = (CASE_STUDY_SURFACE_PROFILES as Record<string, { cta?: { href?: string } }>)[slug]?.cta?.href;
      expect(href).toMatch(/^\//);
      // An absolute URL here would send a training reader to a different brand's site,
      // which is the same mistake as the canonical the profiles already guard against.
      expect(href).not.toMatch(/^https?:/);
    }
  });
});
