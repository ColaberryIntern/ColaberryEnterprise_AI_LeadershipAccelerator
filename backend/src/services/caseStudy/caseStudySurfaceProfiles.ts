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

import type { CaseStudySectionKey, CaseStudySurfaceKey } from '../../types/caseStudy';
import type { CaseStudySurfaceProfile } from '../../types/caseStudyFilters';
import type { PublicVerificationClass } from '../../types/caseStudyPublic';

/* ────────────────────────────────────────────────────── the four lenses ──── */

/**
 * A LENS REORDERS. IT DOES NOT DROP.
 *
 * Every one of the four orders below contains all ten section keys. That is the
 * rule the four differ under, and it is deliberate: `hiddenSections` stays `[]`
 * on all four surfaces because "this audience does not get to see the
 * measurement" is an editorial decision nobody has made, while "this audience
 * meets the architecture first" is the decision the lens model exists to
 * express. A record's evidence is not audience-dependent
 * (SURFACE_LENS_MODEL §7.2); the sequence it is met in is.
 *
 * `hero` leads and `cta` closes on all four — the hero carries the `h1` and the
 * CTA carries its own heading from `profile.cta`, so moving either is a page
 * structure change rather than a framing one.
 *
 * Until 2026-08-26 these were ONE shared constant, so `sectionOrder` was a
 * mechanism that had never been given two different values. Four identical
 * lenses do not prove a lens model; they prove a field exists.
 */

/**
 * ENTERPRISE — "Can you help my organization respond to this change?"
 *
 * DELIBERATELY UNCHANGED, and it is the one order in this file that is not new.
 * Two reasons, both recorded in STORY_STUDIO_PLAN §3 C-entry-2.
 *
 * 1. Enterprise is the only publishable surface, so its order is what the
 *    public `/stories/:slug` page renders TODAY. Reordering it is a production
 *    change wearing an admin-lab change's clothes.
 * 2. SURFACE_LENS_MODEL §3.1 proposes leading with `measurement`, and on the
 *    pilot record `heroMetrics[0]` and `measurement.metrics[0]` are the same
 *    metric — a deliberate subset relationship pinned by
 *    `storyDetailV2HeroInvariant.test.ts`. Putting `measurement` directly under
 *    the hero therefore prints the same metric card twice inside one screen.
 *    Resolving that duplication is a precondition of the change, and it is not
 *    resolved.
 *
 * It is also the control. Three lenses moving against a fixed fourth is how an
 * operator can see that the difference is the lens and not the record.
 */
const ENTERPRISE_ORDER = [
  'hero', 'situation', 'build', 'architecture', 'measurement',
  'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
] as const;

/**
 * TRAINING — "Will this prepare me for the work AI is creating?"
 *
 * The learner's question is about THEMSELVES, so `contributors` (who did this,
 * and were they like me) and `build` (what did the work actually consist of)
 * rise to meet it, and `artifacts` — the thing a learner would put in a
 * portfolio — comes before the architecture that produced it.
 *
 * TRUTH RISK IS HIGHEST HERE and it is structural, not editorial. This profile's
 * hero title is "What our learners built"; the pilot record's `builtBy` is
 * `colaberry_team`. Leading with `contributors` over a staff-built record makes
 * a false implication out of nothing but section order. `requiredSections` is
 * what stops the inverse failure (hiding attribution); what stops THIS one is
 * that `builtBy` travels on the record and prints in the hero facts on every
 * surface. Do not make that hero fact surface-conditional.
 */
const TRAINING_ORDER = [
  'hero', 'situation', 'contributors', 'build', 'artifacts',
  'architecture', 'measurement', 'roadmap', 'repositories', 'cta',
] as const;

/**
 * AI FLOTATION — "Can you actually design and deliver sophisticated AI-native
 * systems?"
 *
 * The delivery buyer's question is about CAPABILITY, so `architecture` (was this
 * designed or assembled) leads and `repositories` (can I read the source) rises
 * from the closing band to third. This is the lens that most wants the source
 * link early, and the one that most needs the floor below.
 *
 * CONSTRAINT: AI Flotation must not imply it originally built this platform.
 * The record already refuses the claim — `builtBy` is `colaberry_team` and
 * `ai_flotation_team` is a separate enum member, so attribution travels with the
 * record rather than with the surface. The failure mode this order gets close to
 * is an architecture-led page under an AI Flotation masthead with `contributors`
 * suppressed. `requiredSections` makes that unexpressible.
 */
const AI_FLOTATION_ORDER = [
  'hero', 'architecture', 'build', 'repositories', 'measurement',
  'situation', 'roadmap', 'artifacts', 'contributors', 'cta',
] as const;

/**
 * REFACTORED — "How was this build architected, governed and verified?"
 *
 * This reader wants METHOD, so `build` (the chronology, assembled from
 * repository evidence) leads and `repositories` follows the architecture that
 * the evidence supports. `situation` — the business problem — falls to eighth,
 * because it is the one lens for which the problem is context rather than
 * subject.
 *
 * CONSTRAINT, AND IT IS AN EDITORIAL RULE ON TWO STRINGS RATHER THAN A
 * MECHANISM: Refactored must not imply it governed work that predates it. No
 * field on the record dates the governance relationship — `builtBy` says who
 * built, and nothing says who governed — so no predicate can enforce this. What
 * Refactored may truthfully claim is about the RECORD, not the WORK: that the
 * timeline was assembled from repository evidence and the provenance was
 * resolved by the platform, both true of the record whenever it was produced.
 *
 * The eyebrow and CTA below may describe how the record was produced. They may
 * NOT use governance verbs — "we governed", "built under", "delivered by" —
 * about the project. If a field ever records when a project came under platform
 * governance, this comment becomes a predicate. Until then it is this comment.
 */
const REFACTORED_ORDER = [
  'hero', 'build', 'architecture', 'repositories', 'artifacts',
  'roadmap', 'measurement', 'situation', 'contributors', 'cta',
] as const;

/**
 * The attribution floor, identical on all four surfaces (SURFACE_LENS_MODEL
 * §5.4). Subtracted from `hiddenSections` before the section walk, so no
 * profile can hide who built the work, where the source is, or the offer being
 * made.
 *
 * It is the same on all four ON PURPOSE. A per-surface floor would be a floor
 * the surface sets for itself, which is not a floor.
 */
const REQUIRED_SECTIONS = ['contributors', 'repositories', 'cta'] as const;

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
  sectionOrder: readonly CaseStudySectionKey[],
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
    sectionOrder,
    // Empty on all four, and that is the point: the lens model is proved by
    // ORDER, not by suppression. See the block comment on the four orders.
    hiddenSections: [],
    requiredSections: REQUIRED_SECTIONS,
    cta: { key: `${surfaceKey}-default`, ...cta },
    emphasis,
  };
}

export const CASE_STUDY_SURFACE_PROFILES: Readonly<
  Record<CaseStudySurfaceKey, CaseStudySurfaceProfile>
> = Object.freeze({
  enterprise: profile(
    'enterprise', 'Colaberry Enterprise', true, ENTERPRISE_ORDER,
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
    'training', 'Colaberry Training', false, TRAINING_ORDER,
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
    'ai-flotation', 'AI Flotation', false, AI_FLOTATION_ORDER,
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
    'refactored', 'Refactored', false, REFACTORED_ORDER,
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
