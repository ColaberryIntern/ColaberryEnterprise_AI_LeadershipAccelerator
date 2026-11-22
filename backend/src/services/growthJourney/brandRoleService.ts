import { Brand } from '../../models';
import { JourneyProgram, type JourneyProgramKind } from '../../models/JourneyProgram';

/**
 * What the growth agent is CALLED on a given brand.
 *
 * Ali's own framing, 2026-11-22: "for the Colaberry Training brand, Maya is an
 * Enrollment specialist, but for Colaberry Enterprise, she is a Business
 * Development Specialist. She will still have job of reaching out to new
 * accounts, but her role and job will change depending on the brand."
 *
 * ─── DISPLAY AND COPY ONLY. IT CHANGES NO BEHAVIOUR. ────────────────────────
 *
 * Nothing reads this to decide what an agent may do, which tool it may call, or
 * what it may say. No prompt builder imports this module, and a test asserts
 * that - by pattern across every Maya and agent file, not by directory, because
 * `admissionsMayaService.ts` sits loose under `services/` and is where
 * `MAYA_ADMISSIONS_VOICE` actually lives.
 *
 * The reason is the whole security posture of this build: a stored string that
 * reaches a prompt is a stored string that can rewrite an agent's persona, and
 * this build is read-only plus ONE configuration write. A role title that an
 * operator types must not become an instruction an agent follows.
 *
 * ─── WHERE IT IS STORED, AND THE CLOBBER THIS REPO HAS ALREADY PAID FOR ─────
 *
 * `journey_programs.metadata`, beside `terminology`. §13 designated that column
 * for exactly this kind of per-programme vocabulary, and `journeyTerminology.ts`
 * already establishes it, so a new column would be a schema change for a field
 * that belongs with its sibling.
 *
 * Which makes the write dangerous in one specific way. `metadata` today holds
 * exactly one key. A naive `program.update({ metadata: { role } })` DESTROYS
 * `terminology`; `terminologyOf` then returns null, the caller falls back to
 * neutral words, and every Growth Journey tab silently rebrands from
 * "learner / enrolment / path" to "subject / relationship / pipeline". Nothing
 * errors. Nobody is told.
 *
 * So the write is read-modify-write with a spread, and it guards the same three
 * shapes `seedJourneyPrograms.seedTerminology` guards (null, non-object, array
 * all collapse to `{}`), because that helper is this repo's own solution to
 * this exact bug and copying it is cheaper than re-deriving it.
 *
 * ─── THE SEEDED DEFAULT IS KEYED BY KIND, NOT BY BRAND SLUG ─────────────────
 *
 * `plan.md` keyed the defaults by brand slug and gave CPN and AI Flotation a
 * neutral placeholder. This keys them by programme KIND instead, which produces
 * both of Ali's named values exactly (Colaberry Training is `learner`,
 * Colaberry Enterprise is `business`) while adding no brand-slug map.
 *
 * That follows `journeyTerminology.ts`, which made the same call for the same
 * reason and wrote it down: the words follow the machine, so "a fifth brand of
 * an existing kind inherits them with no edit here". A slug-keyed table would
 * also have had to live next to `journeyProgramDefinitions.ts` or repeat its
 * slugs, and importing that seed from a service a route reaches drags in
 * `offerPolicyDefinitions` -> `models/OfferFamily` -> a real database
 * connection, which is the trap `journeyTerminology.ts` was moved out of the
 * seed tree to avoid.
 *
 * The consequence, stated rather than buried: CPN defaults to "Enrollment
 * Specialist" rather than a neutral placeholder, because CPN runs a learner
 * journey and enrolment is what that journey does. Every default is overridable
 * per brand, which is the point of the feature.
 *
 * American spelling is deliberate and does NOT match `terminology`'s
 * `enrolment`. These are Ali's words for a job title; that is the vocabulary
 * the subject of a journey is called. Do not "fix" one to match the other.
 */

export interface BrandRole {
  title: string;
  description: string;
  /** ISO-8601. Absent on a default that has never been written. */
  updated_at: string | null;
}

/** The metadata key. One spelling, one file, same discipline as `TERMINOLOGY_METADATA_KEY`. */
export const ROLE_METADATA_KEY = 'role';

/**
 * The starting value per journey kind. Overridable per brand; see the header for
 * why this is keyed by kind.
 */
export const ROLE_DEFAULTS: Readonly<Record<JourneyProgramKind, Omit<BrandRole, 'updated_at'>>> =
  Object.freeze({
    learner: Object.freeze({
      title: 'Enrollment Specialist',
      description:
        'Reaches out to new learners, answers questions about the program, and identifies who is ready to enroll.',
    }),
    business: Object.freeze({
      title: 'Business Development Specialist',
      description:
        'Reaches out to new accounts, qualifies what the business needs, and develops the relationship toward an opportunity.',
    }),
    consulting: Object.freeze({
      title: 'Engagement Specialist',
      description:
        'Reaches out to prospective clients, scopes the work they are asking for, and develops it toward a paid engagement.',
    }),
  });

/** The role a programme's metadata carries, or null. Never a guess from its kind. */
export function roleOf(metadata: unknown): BrandRole | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[ROLE_METADATA_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { title, description, updated_at } = value as Record<string, unknown>;
  if (typeof title !== 'string' || typeof description !== 'string') return null;
  return {
    title,
    description,
    updated_at: typeof updated_at === 'string' ? updated_at : null,
  };
}

/**
 * Four honest outcomes, and `ambiguous_programme` is not hypothetical bookkeeping.
 *
 * `journey_programs` is unique on `(brand_id, slug)`, NOT on `brand_id`, so a
 * brand may legally carry more than one programme. Today none does. "Take the
 * first" would therefore work on every row that exists and bind an arbitrary
 * programme the day one does not - the same class of failure
 * `explorerBrandScope` exists to prevent, so it is refused rather than guessed.
 */
export type BrandRoleResolution =
  | { status: 'set'; brand_id: string; role: BrandRole; source: 'stored' }
  | {
      status: 'default';
      brand_id: string;
      role: BrandRole;
      source: 'kind_default';
      kind: JourneyProgramKind;
    }
  /** The brand has no journey programme, so there is nowhere to store a role. */
  | { status: 'no_programme'; brand_id: string; role: null }
  | { status: 'ambiguous_programme'; brand_id: string; role: null };

export type BrandRoleWriteResult =
  | { status: 'saved'; brand_id: string; role: BrandRole }
  | { status: 'no_programme'; brand_id: string; role: null }
  | { status: 'ambiguous_programme'; brand_id: string; role: null };

function logRole(event: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'growth-journey-admin',
      event,
      outcome: 'success',
      ...fields,
    })
  );
}

/**
 * Which programme holds this brand's role.
 *
 * The brand's own default pointer wins when it is set and resolves, because
 * that is the pointer `resolveDefaultJourney` already treats as authoritative.
 * Falling back to "the brand's single programme" covers a brand seeded before
 * the pointer was written. Zero and many are both refused, distinctly.
 */
async function programmeFor(
  brandId: string
): Promise<
  | { ok: true; program: JourneyProgram }
  | { ok: false; reason: 'no_programme' | 'ambiguous_programme' }
> {
  const brand = await Brand.findByPk(brandId);
  if (brand?.default_journey_program_id) {
    const pointed = await JourneyProgram.findByPk(brand.default_journey_program_id);
    // A pointer at a programme on a DIFFERENT brand is a dangling pointer, not a
    // licence to read that brand's row.
    if (pointed && pointed.brand_id === brandId) return { ok: true, program: pointed };
  }

  const programs = await JourneyProgram.findAll({ where: { brand_id: brandId } });
  if (programs.length === 1) return { ok: true, program: programs[0] };
  if (programs.length === 0) return { ok: false, reason: 'no_programme' };

  logRole('brand_role_programme_ambiguous', { brand_id: brandId, programme_count: programs.length });
  return { ok: false, reason: 'ambiguous_programme' };
}

/** Read a brand's role: what is stored, or the default for its journey kind. */
export async function getBrandRole(brandId: string): Promise<BrandRoleResolution> {
  const found = await programmeFor(brandId);
  if (!found.ok) return { status: found.reason, brand_id: brandId, role: null };

  const stored = roleOf(found.program.metadata);
  if (stored) return { status: 'set', brand_id: brandId, role: stored, source: 'stored' };

  const kind = found.program.kind;
  const fallback = ROLE_DEFAULTS[kind];
  return {
    status: 'default',
    brand_id: brandId,
    // `updated_at: null` is the honest marker of "nobody has set this", and it is
    // what the UI reads to show the value as a default rather than a choice.
    role: { ...fallback, updated_at: null },
    source: 'kind_default',
    kind,
  };
}

/**
 * Write a brand's role, preserving every other key in `metadata`.
 *
 * The prior `metadata` is logged BEFORE the write so a bad value is restorable
 * from the log without a backup, through this same guarded path. That is safe to
 * log because the column holds operator configuration only - terminology and
 * this role - and carries no personal data by construction.
 */
export async function setBrandRole(
  brandId: string,
  input: { title: string; description: string }
): Promise<BrandRoleWriteResult> {
  const found = await programmeFor(brandId);
  if (!found.ok) return { status: found.reason, brand_id: brandId, role: null };

  const program = found.program;
  const metadata = program.metadata;
  const existing =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : null;

  const role: BrandRole = {
    title: input.title,
    description: input.description,
    updated_at: new Date().toISOString(),
  };

  logRole('brand_role_write', {
    brand_id: brandId,
    journey_program_id: program.id,
    prior_metadata: existing,
    next_role: role,
  });

  // The spread, not a replacement. See the header: a bare `{ role }` here
  // destroys `terminology` and five tabs silently rebrand.
  await program.update({ metadata: { ...(existing ?? {}), [ROLE_METADATA_KEY]: role } });

  return { status: 'saved', brand_id: brandId, role };
}
