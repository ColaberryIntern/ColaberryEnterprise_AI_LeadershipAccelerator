/**
 * caseStudySurfaceProfiles - the four surface profiles, as DATA (spec §21).
 *
 * Split out of `caseStudyFilterService.ts` to keep both files inside CLAUDE.md's
 * size targets, on the same precedent as `caseStudySnapshotBuilder` + `…Sections`
 * and `caseStudyReadinessService` + `…Rubric`. The dependency runs one way: this
 * file imports contracts only, and the engine imports this. Nothing here imports
 * the engine.
 *
 * ALL FOUR KEYS EXIST FROM DAY ONE. That is what makes "adding Training is a
 * publication row, not a schema change" a real property rather than an
 * aspiration. Only `enterprise` is `publishable` in Phase 1, and the publish gate
 * (T012) refuses the other three independently of this flag - a contract that
 * admits a surface is not the same as a system that will publish to it.
 *
 * LEAF MODULE: type-only imports, no I/O, nothing that can fail.
 */

import type { CaseStudySurfaceKey } from '../../types/caseStudy';
import type { CaseStudySurfaceProfile } from '../../types/caseStudyFilters';
import type { PublicVerificationClass } from '../../types/caseStudyPublic';

const SECTION_ORDER = [
  'hero', 'situation', 'build', 'architecture', 'measurement',
  'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
] as const;

/**
 * Spec §14: the production list hides `pending` and `illustrative` by default.
 * `pending` cannot even be represented publicly, so this line is about
 * `illustrative` - a sample record stays reachable by an explicit
 * `?verification=illustrative`, and never appears on the default index.
 */
const PROVEN_ONLY: readonly PublicVerificationClass[] = ['verified', 'anonymized'];

function profile(
  surfaceKey: CaseStudySurfaceKey,
  brandLabel: string,
  publishable: boolean,
  hero: { eyebrow: string; title: string; description: string },
  cta: { eyebrow: string; heading: string; buttonLabel: string; href: string },
  emphasis: readonly string[],
): CaseStudySurfaceProfile {
  return {
    surfaceKey,
    brandLabel,
    publishable,
    hero,
    defaultFilters: { surface: surfaceKey, verificationClass: PROVEN_ONLY },
    defaultSort: 'featured',
    sectionOrder: SECTION_ORDER,
    hiddenSections: [],
    cta: { key: `${surfaceKey}-default`, ...cta },
    emphasis,
  };
}

export const CASE_STUDY_SURFACE_PROFILES: Readonly<
  Record<CaseStudySurfaceKey, CaseStudySurfaceProfile>
> = Object.freeze({
  enterprise: profile(
    'enterprise', 'Colaberry Enterprise', true,
    {
      eyebrow: 'Enterprise · shipped work',
      title: 'What we shipped, and who built it.',
      description:
        'Every published project is assembled from repository evidence, Refactored project '
        + 'records, and approved verification. The proof behind a number matters as much as '
        + 'the number.',
    },
    {
      eyebrow: 'Same shape, different workflow',
      heading: 'Bring us a workflow worth improving.',
      buttonLabel: 'Map an opportunity',
      href: '/lab',
    },
    ['business problem', 'team capability', 'outcome', 'measurement', 'architecture',
      'roadmap', 'ownership'],
  ),
  training: profile(
    'training', 'Colaberry Training', false,
    {
      eyebrow: 'Training · learner work',
      title: 'What our learners built.',
      description: 'Projects assembled from the repositories and artifacts learners shipped.',
    },
    {
      eyebrow: 'Build one of these',
      heading: 'Start the program that produced this work.',
      buttonLabel: 'See the program',
      href: '/programs',
    },
    ['who built it', 'what they learned', 'skills', 'stack', 'artifacts', 'portfolio proof'],
  ),
  'ai-flotation': profile(
    'ai-flotation', 'AI Flotation', false,
    {
      eyebrow: 'AI Flotation · delivery',
      title: 'What we put into production.',
      description: 'Delivery records assembled from repository evidence and production proof.',
    },
    {
      eyebrow: 'Same workflow, your systems',
      heading: 'Talk to the team that shipped it.',
      buttonLabel: 'Start a conversation',
      href: '/contact',
    },
    ['workflow', 'what shipped', 'architecture', 'delivery', 'production', 'technical proof'],
  ),
  refactored: profile(
    'refactored', 'Refactored', false,
    {
      eyebrow: 'Refactored · project records',
      title: 'The work behind the platform.',
      description: 'Project records assembled from platform facts and repository evidence.',
    },
    {
      eyebrow: 'See how it was built',
      heading: 'Explore the platform that produced this.',
      buttonLabel: 'Explore Refactored',
      href: '/refactored',
    },
    ['project facts', 'build timeline', 'architecture', 'ownership'],
  ),
});

export function getCaseStudySurfaceProfile(
  surfaceKey: CaseStudySurfaceKey,
): CaseStudySurfaceProfile {
  return CASE_STUDY_SURFACE_PROFILES[surfaceKey];
}
