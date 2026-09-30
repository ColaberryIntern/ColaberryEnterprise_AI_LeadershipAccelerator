import type { JourneyProgramKind } from '../../models/JourneyProgram';
import type { OfferFamilySlug } from '../../models/OfferFamily';
import { allowedFamiliesFor } from './offerPolicyDefinitions';

/**
 * §5's four journey programs, as data (T212).
 *
 * ─── WHY THIS TASK EXISTS ───────────────────────────────────────────────────
 *
 * T201 built the program registry, T202 the brand-offer policy, T203 resolves
 * `brands.default_journey_program_id`. Nothing wrote either the programs or the
 * pointer, so T203 resolved nothing.
 *
 * My first note on this claimed no task in the plan creates a `journey_programs`
 * row. That was wrong, and an independent review caught it: `plan.md:191` has
 * T205 seeding Explorer as program #1 on `colaberry-training`. The real gap is
 * narrower and was confirmed by grep rather than argument:
 *
 *   1. only `colaberry-training` gets a program, so CPN, Colaberry Enterprise
 *      and AI Flotation get none;
 *   2. `default_journey_program_id` appears EXACTLY ONCE in the whole plan —
 *      line 119, in T203's own file list — so no task writes the pointer.
 *
 * ─── THE SLUG CONSTANTS ARE THE ANTI-DUPLICATE MECHANISM ────────────────────
 *
 * T205 will seed a program on `colaberry-training` too. If that task invents its
 * own slug there will be two programs on that brand, the unique index on
 * `(brand_id, slug)` will not catch it — two different slugs are two legal rows
 * — and the brand's default will point at whichever landed first. A duplicate
 * that the database is happy with is the worst kind.
 *
 * So the slug is exported, per brand, and T205 MUST IMPORT `PROGRAM_SLUGS`
 * rather than write a literal. One constant, not two literals in two files.
 *
 * ─── SEEDED `draft`, DELIBERATELY ───────────────────────────────────────────
 *
 * T201 defaults a program to `draft` so that one seeded by mistake cannot be
 * resolved as a brand's default until someone activates it, and T203 enforces
 * that by refusing any status other than `active`. This seed does not undo
 * either: it builds the structure and stops.
 *
 * The consequence is intended and worth stating plainly — after this seed runs,
 * `resolveDefaultJourney` returns `program_not_active` for every brand until a
 * human activates the programme. The pointer is wiring; switching a journey on
 * is a decision, and it stays one.
 */

export interface JourneyProgramDefinition {
  /** Brand slugs are unique per tenant, so both are required. */
  tenant_slug: string;
  brand_slug: string;
  slug: string;
  name: string;
  kind: JourneyProgramKind;
  description: string;
}

/**
 * One slug per brand, exported so no second file has to spell it.
 *
 * `learner` for both learner brands rather than `cpn-learner` /
 * `training-learner`, because uniqueness is scoped to the BRAND (T201's
 * `journey_programs_brand_slug_unique` is `(brand_id, slug)`), so the same slug
 * on two brands is two distinct programmes and reads better than a slug that
 * repeats its own brand name.
 */
export const PROGRAM_SLUGS = {
  cpn: 'learner',
  colaberryTraining: 'learner',
  colaberryEnterprise: 'business-growth',
  aiFlotation: 'service-growth',
} as const;

export const JOURNEY_PROGRAMS: readonly JourneyProgramDefinition[] = [
  {
    tenant_slug: 'cpn',
    brand_slug: 'cpn',
    slug: PROGRAM_SLUGS.cpn,
    name: 'CPN Learner Journey',
    kind: 'learner',
    description:
      '§5.1: activate eligible people into free learning and approved community pathways, then route permitted training progression to the correct Colaberry relationship.',
  },
  {
    tenant_slug: 'colaberry',
    brand_slug: 'colaberry-training',
    slug: PROGRAM_SLUGS.colaberryTraining,
    name: 'Colaberry Training Learner Journey',
    kind: 'learner',
    description:
      '§5.2: activate free learners, improve momentum, support them through friction, connect them to community and certification, and identify paid enrolment readiness. Explorer Growth is the first implementation on this programme (T205).',
  },
  {
    tenant_slug: 'colaberry',
    brand_slug: 'colaberry-enterprise',
    slug: PROGRAM_SLUGS.colaberryEnterprise,
    name: 'Colaberry Business Growth Journey',
    kind: 'business',
    description:
      '§5.3: develop business leads into qualified opportunities across business training, AI consulting, workflow automation, application builds, AI projects and paid discovery.',
  },
  {
    tenant_slug: 'ai-flotation',
    brand_slug: 'ai-flotation',
    slug: PROGRAM_SLUGS.aiFlotation,
    name: 'AI Flotation Growth Journey',
    kind: 'consulting',
    description:
      '§5.4: develop consulting and AI build leads into paid discovery and projects. Never business training or learner programmes (§4:287).',
  },
];

/**
 * The paths a programme gets: exactly the families its brand is allowed.
 *
 * DERIVED FROM T202'S POLICY, never listed again. This is the join that makes
 * §4 and §5 one system rather than two — a family added to a brand's policy
 * becomes a path on its programme without anyone editing this file, and a family
 * DENIED to AI Flotation can never appear as an AI Flotation path, because the
 * denial is subtracted before the list is returned.
 *
 * The alternative — a literal path list per programme — is how AI Flotation
 * would eventually acquire a `business_training` path that the eligibility gate
 * then refuses at runtime: a contradiction that reads as a policy bug rather
 * than as two lists drifting.
 */
export function pathsForProgram(def: JourneyProgramDefinition): OfferFamilySlug[] {
  return allowedFamiliesFor(def.tenant_slug, def.brand_slug);
}
