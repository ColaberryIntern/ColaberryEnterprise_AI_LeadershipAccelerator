import type { Brand } from '../../models';
import { JourneyProgram, JourneyPath } from '../../models';
import { resolveBrandBySlug } from '../../modules/tenancy/tenantResolver';
import {
  JOURNEY_PROGRAMS,
  pathsForProgram,
  type JourneyProgramDefinition,
} from './journeyProgramDefinitions';

/**
 * Seed §5's four journey programs, their paths, and each brand's default
 * pointer (T212).
 *
 * ─── WHAT IT WRITES, AND WHAT IT REFUSES TO WRITE ───────────────────────────
 *
 *   CREATES        a `journey_programs` row per brand, status `draft`
 *   CREATES        a `journey_paths` row per family the brand is ALLOWED
 *   SETS           `brands.default_journey_program_id`, ONLY when it is null
 *
 *   NEVER WRITES   `status`, on a program or a path, once the row exists. An
 *                  operator's pause survives every boot -- the
 *                  `seedExplorerGrowthCampaigns` precedent.
 *   NEVER WRITES   a default pointer that is already set. A human pointing a
 *                  brand at a different programme has made a decision, and the
 *                  next boot must not quietly undo it.
 *
 * ─── ONE FAILURE MODE THIS DOES NOT DISTINGUISH ─────────────────────────────
 *
 * `resolveBrandBySlug` returns `null` for a missing tenant, a missing brand AND
 * a database error - it is fail-soft by design. So a database outage at boot
 * lands every brand in `skipped_brands` and logs "brands absent", which is the
 * wrong label for an outage. It is safe (nothing is written, the next boot
 * retries) and it is shared with T202's policy seed, but it is stated here so
 * the count is not read as evidence that four brands are genuinely missing.
 *
 * ─── THE PROGRAMME IS THE SWITCH; THE PATHS ARE NOT ─────────────────────────
 *
 * Programs are seeded `draft` and paths `active`. That looks inconsistent and is
 * deliberate: T203 refuses to resolve any programme whose status is not
 * `active`, so the programme is a single switch that holds the whole journey
 * shut. Seeding paths draft as well would mean five more deliberate actions to
 * turn one brand on, with no additional safety -- the programme gate already
 * stops everything beneath it. A path's own status exists to retire ONE offer
 * path later, which is a different decision.
 *
 * The consequence, stated rather than discovered: after this seed,
 * `resolveDefaultJourney` returns `program_not_active` for every brand. That is
 * the intended resting state. Turning a journey on is a human action.
 *
 * ─── NOTHING HERE CAN SEND ANYTHING ─────────────────────────────────────────
 *
 * These rows describe structure. No campaign row, no sequence enrolment, no
 * message. And a path existing does not mean an offer may be made: T202's
 * eligibility gate is a separate check that the brand-offer policy still has to
 * permit at the moment of use.
 */

export interface SeedJourneyProgramsResult {
  programs_created: number;
  programs_existing: number;
  paths_created: number;
  paths_existing: number;
  defaults_set: number;
  /** A default pointer left alone because a human had already set one. */
  defaults_left_alone: number;
  /** Brand named in §5 but absent from this database. */
  skipped_brands: string[];
  failed: { target: string; error: string }[];
}

async function seedPaths(
  programId: string,
  def: JourneyProgramDefinition,
  result: SeedJourneyProgramsResult,
): Promise<void> {
  const families = pathsForProgram(def);

  for (const [index, offerFamily] of families.entries()) {
    try {
      const existing = await JourneyPath.findOne({
        where: { program_id: programId, offer_family: offerFamily },
      });
      if (existing) {
        result.paths_existing += 1;
        continue;
      }
      await JourneyPath.create({
        program_id: programId,
        offer_family: offerFamily,
        name: offerFamily
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        status: 'active',
        // Catalog order, so re-running produces the same priorities rather than
        // depending on the order the definitions happened to be written in.
        priority: index,
      });
      result.paths_created += 1;
    } catch (err: unknown) {
      result.failed.push({
        target: `${def.brand_slug}:path:${offerFamily}`,
        error: (err as { message?: string })?.message ?? 'unknown',
      });
    }
  }
}

async function setBrandDefault(
  brand: Brand,
  programId: string,
  result: SeedJourneyProgramsResult,
): Promise<void> {
  if (brand.default_journey_program_id) {
    // Already pointed somewhere. Even if it points at a DIFFERENT programme,
    // that is a human's choice and this seed does not arbitrate it.
    result.defaults_left_alone += 1;
    return;
  }
  await brand.update({ default_journey_program_id: programId });
  result.defaults_set += 1;
}

export async function seedJourneyPrograms(): Promise<SeedJourneyProgramsResult> {
  const result: SeedJourneyProgramsResult = {
    programs_created: 0,
    programs_existing: 0,
    paths_created: 0,
    paths_existing: 0,
    defaults_set: 0,
    defaults_left_alone: 0,
    skipped_brands: [],
    failed: [],
  };

  for (const def of JOURNEY_PROGRAMS) {
    const label = `${def.tenant_slug}/${def.brand_slug}`;
    try {
      const brand = await resolveBrandBySlug(def.tenant_slug, def.brand_slug);
      if (!brand) {
        result.skipped_brands.push(label);
        continue;
      }

      // Keyed on (brand_id, slug) — the same pair T201's unique index enforces,
      // so a concurrent boot cannot produce a second row.
      let program = await JourneyProgram.findOne({
        where: { brand_id: brand.id, slug: def.slug },
      });

      if (program) {
        result.programs_existing += 1;
      } else {
        program = await JourneyProgram.create({
          tenant_id: brand.tenant_id,
          brand_id: brand.id,
          slug: def.slug,
          name: def.name,
          kind: def.kind,
          // Stated explicitly rather than inherited from the column default:
          // the safe value is the one that must survive a change to that
          // default, which is the lesson `seedExplorerGrowthCampaigns` records
          // about `is_active`.
          status: 'draft',
          description: def.description,
        });
        result.programs_created += 1;
      }

      await seedPaths(program.id, def, result);
      await setBrandDefault(brand, program.id, result);
    } catch (err: unknown) {
      result.failed.push({ target: label, error: (err as { message?: string })?.message ?? 'unknown' });
    }
  }

  return result;
}

export default seedJourneyPrograms;
