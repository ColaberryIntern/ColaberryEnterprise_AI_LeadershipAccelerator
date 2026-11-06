import type { CaseStudySurfaceKey } from '../../../services/caseStudyAdminTypes';
import type { CaseStudySectionKey, PublicSurfaceView } from '../../../services/caseStudyPublicTypes';

/*
 * Surface-view fixtures, split out of `caseStudyAdminFixtures.ts` (523 lines, over the
 * 500-line ceiling) before the `hire` surface was added to them. Re-exported from there,
 * so every existing import keeps working.
 */

/**
 * The five surface orders, mirroring
 * `backend/src/services/caseStudy/caseStudySurfaceProfiles.ts`.
 *
 * MIRRORED, NOT IMPORTED, for the reason the whole of `caseStudyAdminTypes.ts`
 * mirrors: the frontend has no path to `backend/src`. What matters for the
 * suites is that they are genuinely DIFFERENT from each other — a fixture that
 * gave four lenses one order would let the lens model regress to four identical
 * pages with every test still green, which is precisely the state this work
 * exists to leave behind.
 */
export const SURFACE_ORDERS: Readonly<
  Record<CaseStudySurfaceKey, readonly CaseStudySectionKey[]>
> = Object.freeze({
  enterprise: ['hero', 'situation', 'build', 'architecture', 'measurement',
    'roadmap', 'contributors', 'artifacts', 'repositories', 'cta'],
  training: ['hero', 'situation', 'contributors', 'build', 'artifacts',
    'architecture', 'measurement', 'roadmap', 'repositories', 'cta'],
  'ai-flotation': ['hero', 'architecture', 'build', 'repositories', 'measurement',
    'situation', 'roadmap', 'artifacts', 'contributors', 'cta'],
  refactored: ['hero', 'build', 'architecture', 'repositories', 'artifacts',
    'roadmap', 'measurement', 'situation', 'contributors', 'cta'],
  hire: ['hero', 'contributors', 'build', 'measurement', 'artifacts',
    'repositories', 'architecture', 'situation', 'roadmap', 'cta'],
});

/** The attribution floor, identical on all five surfaces. */
export const REQUIRED_SECTIONS: readonly CaseStudySectionKey[] =
  Object.freeze(['contributors', 'repositories', 'cta'] as CaseStudySectionKey[]);

const SURFACE_BRANDS: Readonly<Record<CaseStudySurfaceKey, string>> = Object.freeze({
  enterprise: 'Colaberry Enterprise',
  training: 'Colaberry Training',
  'ai-flotation': 'AI Flotation',
  refactored: 'Refactored',
  hire: 'Hire · Refactored',
});

export function surfaceViewFixture(
  key: CaseStudySurfaceKey = 'enterprise',
  over: Partial<PublicSurfaceView> = {},
): PublicSurfaceView {
  return {
    key,
    brandLabel: SURFACE_BRANDS[key],
    hero: { eyebrow: `${key} · shipped work`, title: 'What we shipped.', description: 'Assembled from repository evidence.' },
    cta: {
      eyebrow: 'Same shape, different workflow',
      heading: 'Bring us a workflow worth improving.',
      buttonLabel: 'Map an opportunity',
      href: '/lab',
    },
    sectionOrder: SURFACE_ORDERS[key],
    hiddenSections: [],
    requiredSections: REQUIRED_SECTIONS,
    emphasis: ['outcome', 'measurement'],
    defaultSort: 'featured',
    ...over,
  };
}
