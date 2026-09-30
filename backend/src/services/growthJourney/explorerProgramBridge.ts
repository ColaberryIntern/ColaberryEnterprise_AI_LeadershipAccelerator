import { ExplorerJourneyProfile, JourneyProgram, GrowthJourneyEnrollment } from '../../models';
import { subjectRef } from '../../models/GrowthJourneyEnrollment';
import { resolveBrandBySlug } from '../../modules/tenancy/tenantResolver';
import { PROGRAM_SLUGS } from '../../seeds/growthJourney/journeyProgramDefinitions';

/**
 * Map the existing Explorer population onto the generic programme (T205).
 *
 * Explorer Growth becomes the first journey programme on the shared framework,
 * and this is the step that makes that true of the DATA rather than only of the
 * design: every `explorer_journey_profiles` row gets a
 * `growth_journey_enrollments` row on Colaberry Training's learner programme.
 *
 * ─── EXPLORER IS READ. NOTHING ELSE. ────────────────────────────────────────
 *
 * AD-1 is the hard stop of this whole run: no `explorer_*` table renamed,
 * altered or copied. This module reads `ExplorerJourneyProfile` and writes only
 * `growth_journey_enrollments`. Explorer keeps running untouched, which is the
 * condition the execution contract puts on the seam — "Explorer keeps running
 * untouched; the seam tests keep their meaning".
 *
 * A test asserts no write reaches any Explorer model, because "I did not intend
 * to write there" is not a property a reader can check.
 *
 * ─── IT REUSES T212'S SLUG CONSTANT, WHICH IS THE WHOLE POINT OF IT ─────────
 *
 * The plan has this task "seed registering Explorer as program #1 on
 * colaberry-training". T212 already created that programme. If this module wrote
 * its own slug literal, that brand would end up with TWO programmes — and the
 * unique index on `(brand_id, slug)` would NOT catch it, because two different
 * slugs are two legal rows. So it imports `PROGRAM_SLUGS.colaberryTraining` and
 * RESOLVES the existing programme rather than creating one. If the programme is
 * missing, the backfill refuses rather than inventing it: a backfill that
 * creates its own destination cannot tell "the seed has not run" from "the seed
 * ran and I disagreed with it".
 *
 * ─── IDEMPOTENT BY DATABASE INDEX, NOT BY INTENTION ─────────────────────────
 *
 * Keyed on `(program_id, subject_ref)`, unique in the DDL. Running this twice
 * over 217 profiles produces 217 rows, not 434 — and that holds under a
 * concurrent second run, which an application-level "already done?" check would
 * not. A unique-violation on insert is treated as "another run got there first",
 * counted as skipped rather than failed, because it is the index doing its job.
 *
 * ─── THE PATH IS LEFT NULL, DELIBERATELY ────────────────────────────────────
 *
 * A participation row can name a `journey_paths` row, and this backfill does
 * not. An Explorer profile carries no offer-family signal, so choosing one would
 * be inventing an offer for 217 real people — and §4's eligibility gate would
 * then be asked about a path nobody chose. Left null; the journey assigns a path
 * when there is something real to base it on.
 */

/** Explorer's own programme identity: Colaberry Training's learner journey. */
export const EXPLORER_PROGRAM = {
  tenantSlug: 'colaberry',
  brandSlug: 'colaberry-training',
  programSlug: PROGRAM_SLUGS.colaberryTraining,
} as const;

export const BACKFILL_SOURCE = 'explorer_backfill';

export interface BackfillResult {
  /** `explorer_journey_profiles` rows examined. */
  profiles_scanned: number;
  enrollments_created: number;
  /** Already present — the idempotent path. */
  enrollments_existing: number;
  /** Lost a race to a concurrent run; the unique index refused the duplicate. */
  enrollments_raced: number;
  /** Profile carried neither an enrollment id nor a lead id (§6.2). */
  skipped_no_anchor: number;
  failed: { subject_ref: string; error: string }[];
  /** Set when the programme could not be resolved; nothing was written. */
  refused?: 'program_not_found' | 'brand_not_found';
}

const emptyResult = (): BackfillResult => ({
  profiles_scanned: 0,
  enrollments_created: 0,
  enrollments_existing: 0,
  enrollments_raced: 0,
  skipped_no_anchor: 0,
  failed: [],
});

function isUniqueViolation(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { parent?: { code?: string } })?.parent?.code ?? '';
  return name === 'SequelizeUniqueConstraintError' || code === '23505';
}

/**
 * Backfill every Explorer profile onto the generic programme.
 *
 * Reads Explorer, writes `growth_journey_enrollments`, and refuses outright if
 * the destination programme does not exist.
 */
export async function backfillExplorerEnrollments(): Promise<BackfillResult> {
  const result = emptyResult();

  const brand = await resolveBrandBySlug(EXPLORER_PROGRAM.tenantSlug, EXPLORER_PROGRAM.brandSlug);
  if (!brand) {
    result.refused = 'brand_not_found';
    return result;
  }

  const program = await JourneyProgram.findOne({
    where: { brand_id: brand.id, slug: EXPLORER_PROGRAM.programSlug },
  });
  if (!program) {
    // Refuse rather than create. See the header: a backfill that creates its
    // own destination cannot distinguish "the seed has not run yet" from "the
    // seed ran and I disagreed with it".
    result.refused = 'program_not_found';
    return result;
  }

  // Only the columns needed. A profile carries scores, overlays and signal
  // summaries that this step has no business reading.
  const profiles = await ExplorerJourneyProfile.findAll({
    attributes: ['enrollment_id', 'lead_id'],
  });
  result.profiles_scanned = profiles.length;

  for (const profile of profiles) {
    const ref = subjectRef({
      enrollmentId: profile.enrollment_id,
      leadId: profile.lead_id,
    });

    if (!ref) {
      // Cannot happen while `enrollment_id` is the profile's primary key, and
      // counted rather than assumed away so that a future schema change shows
      // up as a number instead of a silently dropped person.
      result.skipped_no_anchor += 1;
      continue;
    }

    try {
      const existing = await GrowthJourneyEnrollment.findOne({
        where: { program_id: program.id, subject_ref: ref },
      });
      if (existing) {
        result.enrollments_existing += 1;
        continue;
      }

      await GrowthJourneyEnrollment.create({
        tenant_id: brand.tenant_id,
        brand_id: brand.id,
        program_id: program.id,
        // Left null deliberately — see the header.
        path_id: null,
        subject_ref: ref,
        lead_id: profile.lead_id ?? null,
        enrollment_id: profile.enrollment_id,
        status: 'active',
        source: BACKFILL_SOURCE,
      });
      result.enrollments_created += 1;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        // The index did its job against a concurrent run. Not a failure.
        result.enrollments_raced += 1;
        continue;
      }
      // `subject_ref` is `enrollment:<uuid>` or `lead:<id>` — an identifier, not
      // an email, so there is nothing here to redact.
      result.failed.push({
        subject_ref: ref,
        error: (err as { message?: string })?.message ?? 'unknown',
      });
    }
  }

  return result;
}

/**
 * Reconciliation count: participations on the Explorer programme versus
 * Explorer profiles.
 *
 * Exists because "the backfill reported 217 created" and "217 people are
 * actually on the programme" are different claims, and this run has already
 * shipped one nightly job that reported `succeeded: 152, failed: 0` while 60
 * learners were invisible to it. A count taken from the destination is the one
 * worth trusting.
 */
export interface ReconciliationResult {
  profiles: number;
  enrollments: number;
  matched: boolean;
  /**
   * TRUE when there were no profiles to map, so `matched` is `0 === 0` and
   * proves nothing.
   *
   * This is not hypothetical: `accelerator_dev1` holds **zero**
   * `explorer_journey_profiles` — the 217 are in production — so a dev1
   * reconciliation reports `matched: true` while having back-filled nobody.
   * Without this flag that reads identically to success, which is the precise
   * shape of vacuous pass this programme has already been bitten by more than
   * once. A caller must treat `vacuous: true` as "not yet proven".
   */
  vacuous: boolean;
  refused?: 'program_not_found' | 'brand_not_found';
}

export async function reconcileExplorerBackfill(): Promise<ReconciliationResult> {
  const brand = await resolveBrandBySlug(EXPLORER_PROGRAM.tenantSlug, EXPLORER_PROGRAM.brandSlug);
  if (!brand) {
    return { profiles: 0, enrollments: 0, matched: false, vacuous: true, refused: 'brand_not_found' };
  }

  const program = await JourneyProgram.findOne({
    where: { brand_id: brand.id, slug: EXPLORER_PROGRAM.programSlug },
  });
  if (!program) {
    return { profiles: 0, enrollments: 0, matched: false, vacuous: true, refused: 'program_not_found' };
  }

  const profiles = await ExplorerJourneyProfile.count();
  const enrollments = await GrowthJourneyEnrollment.count({
    where: { program_id: program.id, source: BACKFILL_SOURCE },
  });

  return {
    profiles,
    enrollments,
    matched: profiles === enrollments,
    vacuous: profiles === 0,
  };
}

export default backfillExplorerEnrollments;
