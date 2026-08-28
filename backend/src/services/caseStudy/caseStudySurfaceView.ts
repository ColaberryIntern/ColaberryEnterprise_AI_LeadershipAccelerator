/**
 * caseStudySurfaceView — the wire shape of a surface profile, and the ONE
 * function that builds it.
 *
 * EXTRACTED FROM `routes/publicCaseStudyRoutes.ts`, WHERE IT WAS PRIVATE.
 * The admin surface-lens lab needs the same object the public detail response
 * carries, because `visibleSections()` on the client takes a `PublicSurfaceView`
 * and nothing else. There were two honest ways to get it there: export the
 * helper from the route module, or lift it here. The route module builds an
 * Express router and registers rate limiters at import time, and it imports the
 * Case Study services — so importing it back from a service would close a
 * routes → services → routes cycle and drag router construction into a service's
 * import graph. CLAUDE.md forbids the cycle; this file is the third module both
 * sides depend on.
 *
 * The alternative — letting the admin preview assemble its own surface view —
 * is refused for the same reason the admin preview does not have its own
 * projection (`caseStudyAdminPreview.ts` header): a preview that renders through
 * a second implementation is reviewing a different artifact from the one that
 * ships.
 *
 * LEAF MODULE: type-only imports, no I/O, nothing that can fail.
 */

import type {
  CaseStudySectionKey, CaseStudySurfaceKey,
} from '../../types/caseStudy';
import type {
  CaseStudySortKey, CaseStudySurfaceProfile,
} from '../../types/caseStudyFilters';

/**
 * What a client is told about the surface it is being served.
 *
 * `publishable` and `defaultFilters` are deliberately NOT on here.
 * `defaultFilters` would tell a caller which filters were pre-applied, which is
 * a server decision; `publishable` is a write-side flag and putting it on a read
 * response invites a client to treat it as a read gate, which it is not
 * (`caseStudyFilterService.ts` gates reads on publication status, not on this).
 */
export interface PublicSurfaceView {
  readonly key: CaseStudySurfaceKey;
  readonly brandLabel: string;
  readonly hero: { readonly eyebrow: string; readonly title: string; readonly description: string };
  readonly cta: {
    readonly eyebrow: string; readonly heading: string;
    readonly buttonLabel: string; readonly href: string;
  };
  readonly sectionOrder: readonly CaseStudySectionKey[];
  readonly hiddenSections: readonly CaseStudySectionKey[];
  /**
   * The attribution floor. A lens may reorder and may hide, but it may not hide
   * these — `visibleSections()` subtracts this set from `hiddenSections` before
   * it walks the order. It is on the wire rather than being a client constant
   * because the floor is a property of the surface contract, and a client-side
   * copy is a second source of truth that can drift silently.
   *
   * A band on the floor still hides when the RECORD has nothing to say. The
   * floor constrains the lens, never the data.
   */
  readonly requiredSections: readonly CaseStudySectionKey[];
  readonly emphasis: readonly string[];
  readonly defaultSort: CaseStudySortKey;
}

/** Built field by field. `publishable` and `defaultFilters` stay internal. */
export function surfaceView(profile: CaseStudySurfaceProfile): PublicSurfaceView {
  return {
    key: profile.surfaceKey,
    brandLabel: profile.brandLabel,
    hero: {
      eyebrow: profile.hero.eyebrow,
      title: profile.hero.title,
      description: profile.hero.description,
    },
    cta: {
      eyebrow: profile.cta.eyebrow,
      heading: profile.cta.heading,
      buttonLabel: profile.cta.buttonLabel,
      href: profile.cta.href,
    },
    sectionOrder: profile.sectionOrder,
    hiddenSections: profile.hiddenSections,
    requiredSections: profile.requiredSections,
    emphasis: profile.emphasis,
    defaultSort: profile.defaultSort,
  };
}
