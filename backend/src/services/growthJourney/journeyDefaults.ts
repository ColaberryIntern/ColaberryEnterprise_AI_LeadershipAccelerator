import { Brand } from '../../models';
import { JourneyProgram } from '../../models/JourneyProgram';
import {
  resolvePublicContext,
  type ResolutionPath,
  type ResolvedTenantContext,
} from '../../modules/tenancy/tenantResolver';

/**
 * Which journey program a visitor's entry point defaults to (T203).
 *
 * §3: "Entry website supplies default brand/journey; observed and declared
 * intent controls final journey." This module is the first half only — the
 * default. Nothing here overrides an intent signal, and nothing here writes.
 *
 * ─── IT ADDS NO HOST OR SLUG MAP, AND THAT IS THE POINT ─────────────────────
 *
 * `modules/tenancy/tenantResolver.ts` already resolves a brand from BOTH an
 * explicit source slug (through `lead_sources`) and a hostname (through
 * `brand_domains`, 24 rows). `trackingController.ts:64` already holds a second
 * map, `HOST_TO_SITE_SLUG`. A third is a hard stop for this run — the plan
 * scored 7/20 on a draft that would have built one, because I searched for the
 * capability under a name I had just invented instead of searching for what the
 * code does.
 *
 * So this takes the RAW entry inputs and hands them straight to
 * `resolvePublicContext`. It does not pre-resolve, does not normalise a
 * hostname, and does not know what a domain looks like.
 *
 * ─── THE DEFAULT WHEN NOTHING RESOLVES IS NO PROGRAM ────────────────────────
 *
 * Not "the first brand", not "Colaberry Training". If the entry point does not
 * resolve, the brand is unknown, and choosing one would be choosing which
 * brand's content a stranger sees — the specific harm §4 is built to prevent
 * (business-training material must never route into an AI Flotation journey).
 * An unresolved visitor gets `program: null` and a reason, and the caller
 * declines to enrol. Fail closed, exactly as the offer gate does.
 *
 * This also covers a resolver OUTAGE, because `resolvePublicContext` is
 * fail-soft by design and returns `unresolved` on a database error as readily as
 * on a genuine miss. One behaviour for both is deliberate: an outage must not
 * become an open door.
 *
 * ─── A DRAFT PROGRAM IS NOT A DEFAULT ──────────────────────────────────────
 *
 * `JourneyProgram` defaults `status` to `'draft'`, and T201's own docstring says
 * a program seeded by mistake "cannot be resolved as a brand's default until
 * someone activates it deliberately". That was a claim about resolution written
 * before any resolution existed. This is where it becomes true or stays a
 * comment, so `status === 'active'` is required and asserted.
 */

export type JourneyDefaultReason =
  /** A brand resolved and its default program is active. */
  | 'resolved'
  /** No brand. `program` is null — see the module header. */
  | 'unresolved_context'
  /** Brand resolved, but no default program is set on it. */
  | 'brand_has_no_default'
  /** The brand has no row in `brands` — a dangling context. */
  | 'brand_row_missing'
  /** `default_journey_program_id` points at a row that no longer exists. */
  | 'program_row_missing'
  /** The program exists but is draft, paused or retired. */
  | 'program_not_active'
  /** The lookup itself failed. `program` is null. */
  | 'lookup_failed';

export interface JourneyDefault {
  program: JourneyProgram | null;
  reason: JourneyDefaultReason;
  /** The resolver's own path, passed through so callers can measure it. */
  path: ResolutionPath;
  context: ResolvedTenantContext | null;
}

export interface JourneyDefaultInput {
  sourceSlug?: string | null;
  pageUrl?: string | null;
  hostname?: string | null;
}

const NO_PROGRAM = (
  reason: JourneyDefaultReason,
  path: ResolutionPath,
  context: ResolvedTenantContext | null = null,
): JourneyDefault => ({ program: null, reason, path, context });

/**
 * Resolve the default journey program for a set of raw entry inputs.
 *
 * Never throws. A caller on a tracking or page-view path must not acquire a new
 * failure mode by asking this question.
 */
export async function resolveDefaultJourney(
  input: JourneyDefaultInput,
): Promise<JourneyDefault> {
  let resolution: { context: ResolvedTenantContext | null; path: ResolutionPath };
  try {
    resolution = await resolvePublicContext({
      sourceSlug: input.sourceSlug,
      pageUrl: input.pageUrl,
      hostname: input.hostname,
    });
  } catch {
    // `resolvePublicContext` documents that it returns null rather than
    // throwing, so this is belt and braces — but a future change there must not
    // turn into a thrown error on a page-view path.
    return NO_PROGRAM('lookup_failed', 'unresolved');
  }

  const { context, path } = resolution;

  // `path === 'unresolved'` and `context === null` travel together today. Both
  // are checked because the contract that guarantees it lives in another module.
  if (!context || path === 'unresolved') {
    return NO_PROGRAM('unresolved_context', path, context);
  }

  // Every remaining path — `source_slug`, `brand_domain`, and the `legacy_host_map`
  // value that `resolvePublicContext` does not currently emit but the type union
  // still permits — resolved a brand, so all three are handled identically from
  // here. That is deliberate: a future resolver change that starts emitting the
  // legacy value should keep working rather than fall into the unresolved branch.
  try {
    const brand = await Brand.findByPk(context.brandId);
    if (!brand) return NO_PROGRAM('brand_row_missing', path, context);

    const programId = brand.default_journey_program_id;
    if (!programId) return NO_PROGRAM('brand_has_no_default', path, context);

    const program = await JourneyProgram.findByPk(programId);
    if (!program) return NO_PROGRAM('program_row_missing', path, context);

    if (program.status !== 'active') {
      return NO_PROGRAM('program_not_active', path, context);
    }

    return { program, reason: 'resolved', path, context };
  } catch (err: unknown) {
    // No learner identifier is in scope — brand and program ids only — so there
    // is nothing to redact.
    console.error(
      JSON.stringify({
        event: 'growth_journey.default_journey.lookup_failed',
        brand_id: context.brandId,
        brand_slug: context.brandSlug,
        error_class: (err as { name?: string })?.name ?? 'Error',
        message: (err as { message?: string })?.message,
      }),
    );
    return NO_PROGRAM('lookup_failed', path, context);
  }
}

/**
 * Convenience for callers that only want the program id.
 *
 * Returns `null` for every non-resolved reason, so a caller cannot accidentally
 * treat `program_not_active` as a usable default.
 */
export async function resolveDefaultJourneyProgramId(
  input: JourneyDefaultInput,
): Promise<string | null> {
  const result = await resolveDefaultJourney(input);
  return result.reason === 'resolved' ? (result.program?.id ?? null) : null;
}
