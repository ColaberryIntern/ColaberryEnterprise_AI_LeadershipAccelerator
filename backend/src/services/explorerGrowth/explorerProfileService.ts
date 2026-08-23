import { ExplorerJourneyProfile, ExplorerScoreSnapshot } from '../../models';
import { env } from '../../config/env';
import { isExplorerFeatureEnabled } from '../../config/explorerGrowthFlags';
import { readLearnerSignals } from './explorerSignalReader';
import { scoreLearner } from './explorerScoringService';
import { classify } from './explorerStateMachine';
import {
  hasFullCurriculumAccess,
  isStaffEnrollment,
  activeCompEnrollmentIds,
} from '../access/contentEntitlement';
import { Cohort, Enrollment } from '../../models';
import { getSubscription } from '../subscriptionService';
import { redactForLogs } from '../../utils/piiRedaction';
import type {
  ExplorerAffinity,
  ExplorerContactability,
} from '../../types/explorerGrowth';

/**
 * Explorer Growth OS — profile recompute. Plan §7, §8; EPIC 3 T005.
 *
 * Composes the epic: read signals → score → classify → persist. Writes
 * `explorer_journey_profiles` (current state) and one
 * `explorer_score_snapshots` row per learner per day (point-in-time history).
 *
 * IDEMPOTENCY IS THE WHOLE POINT (CLAUDE.md, non-negotiable). Scores are
 * recomputed WHOLESALE, never incremented, so running twice with the same
 * `asOf` produces byte-identical output. That is what makes shadow mode
 * trustworthy: if a recompute could drift on re-run, no comparison against a
 * holdout would mean anything.
 *
 * THIS SERVICE NEVER SENDS ANYTHING. It scores and classifies. The Journey
 * Governor that acts on a state is EPIC 4, gated by its own separate flag.
 *
 * AFFINITY AND CONTACTABILITY ARE INJECTED, not fetched here, and default to
 * empty. Their services (T002, T003) are not built yet. Empty is CORRECT rather
 * than a placeholder: with no affinity data, INTERNSHIP_READY simply does not
 * fire, which is the honest outcome. When T002/T003 land they pass their real
 * values in and nothing about this file changes.
 */

export interface RecomputeOptions {
  asOf?: Date;
  /** Compute and return without writing. Used to preview a change safely. */
  dryRun?: boolean;
  affinities?: ExplorerAffinity[];
  contactability?: ExplorerContactability;
}

export interface RecomputeResult {
  enrollment_id: string;
  written: boolean;
  e_score: number;
  i_score: number;
  f_score: number;
  primary_state: string;
  overlays: string[];
}

/**
 * Entitlement for the CONVERTED rule.
 *
 * Uses `hasFullCurriculumAccess` DIRECTLY, assembling cohort, staff status and
 * comp state the same way `isFreePreviewTier` does.
 *
 * IT MUST NOT USE `resolveContentPageAccess`. That helper looks like the right
 * thing - it returns `{ isStaff, hasFullAccess }` and does this assembly for you
 * - but it FAILS OPEN by design, returning `hasFullAccess: true` when the
 * content gate flag is off, when the enrollment is missing, and on ANY error.
 * That is correct for its real job: it is a UI gate, and if the check breaks it
 * should show the lesson rather than lock a paying student out of content they
 * bought.
 *
 * As a CONVERSION predicate, failing open means "assume they paid". Using it
 * here marked ALL 153 production Explorers as CONVERTED - and CONVERTED is
 * terminal, so every free user would have been permanently excluded from the
 * campaign this system exists to run. Verified on production 2026-08-22.
 *
 * This function fails CLOSED, and unlike the previous version that claim is
 * true: each half is independently caught, and a failure yields `false`.
 */
async function resolveEntitlement(
  enrollmentId: string,
): Promise<{ hasFullCurriculumAccess: boolean; hasActiveNonCompSubscription: boolean }> {
  let fullAccess = false;
  let hasActiveNonCompSubscription = false;

  try {
    const enrollment = await Enrollment.findByPk(enrollmentId, {
      attributes: ['id', 'payment_status', 'cohort_id', 'access_starts_at'],
    });
    if (enrollment) {
      const cohortId = (enrollment as any).cohort_id;
      const cohort = cohortId
        ? await Cohort.findByPk(cohortId, { attributes: ['id', 'cohort_type'] })
        : null;
      const [isStaff, compIds] = await Promise.all([
        isStaffEnrollment(enrollmentId),
        activeCompEnrollmentIds([enrollmentId]),
      ]);
      fullAccess = hasFullCurriculumAccess(enrollment as any, cohort as any, {
        isStaff,
        hasActiveComp: compIds.has(enrollmentId),
      });
    }
    // A missing enrollment leaves fullAccess false: no record is not evidence
    // of purchase.
  } catch (err: any) {
    console.warn(
      redactForLogs(
        JSON.stringify({
          event: 'explorer.entitlement_read_failed',
          service: 'explorer-growth',
          level: 'warn',
          outcome: 'failure',
          error_class: err?.name || 'EntitlementError',
          enrollment_id: enrollmentId,
        }),
      ),
    );
  }

  try {
    const view = await getSubscription(enrollmentId);
    const sub = (view as any)?.subscription;
    // "Active AND non-comp". A comped subscription is not a conversion - it is
    // exactly the population EPIC 4 still needs to convert.
    hasActiveNonCompSubscription =
      !!sub && sub.status === 'active' && sub.plan !== 'comp';
  } catch (err: any) {
    console.warn(
      redactForLogs(
        JSON.stringify({
          event: 'explorer.subscription_read_failed',
          service: 'explorer-growth',
          level: 'warn',
          outcome: 'failure',
          error_class: err?.name || 'SubscriptionError',
          enrollment_id: enrollmentId,
        }),
      ),
    );
  }

  return { hasFullCurriculumAccess: fullAccess, hasActiveNonCompSubscription };
}

/** YYYY-MM-DD in UTC. The snapshot's daily key. */
function asOfDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Recompute one learner. Idempotent for a fixed `asOf`. */
export async function recomputeExplorerProfile(
  enrollmentId: string,
  options: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const asOf = options.asOf ?? new Date();

  const profile = await ExplorerJourneyProfile.findByPk(enrollmentId);
  if (!profile) {
    throw new Error(`no explorer_journey_profiles row for ${enrollmentId}`);
  }

  const readout = await readLearnerSignals(enrollmentId, { asOf });
  const scores = scoreLearner(readout);
  const entitlement = await resolveEntitlement(enrollmentId);

  const result = classify({
    previousProfile: {
      primary_state: profile.primary_state,
      state_entered_at: profile.state_entered_at,
    },
    scores,
    readout,
    affinities: options.affinities ?? [],
    entitlement,
    // The 72h activation clock measures from when the Explorer enrolled. The
    // profile row's own created_at is the EPIC 1 backfill date, not the
    // enrollment date, so it must not be used here.
    enrollment: { createdAt: profile.created_at },
    asOf,
  });

  const daysSinceActivity = readout.lastEngagementAt
    ? Math.floor((asOf.getTime() - readout.lastEngagementAt.getTime()) / 86_400_000)
    : null;

  if (options.dryRun) {
    return {
      enrollment_id: enrollmentId,
      written: false,
      e_score: scores.e,
      i_score: scores.i,
      f_score: scores.f,
      primary_state: result.primary_state,
      overlays: result.overlays,
    };
  }

  // Column-scoped update, NOT a whole-row replace: `lead_id` is EPIC 1's
  // identity bridge and `last_contacted_at` belongs to EPIC 4. Overwriting the
  // row wholesale would silently drop both.
  await profile.update({
    primary_state: result.primary_state,
    overlays: result.overlays,
    e_score: Math.round(scores.e),
    i_score: Math.round(scores.i),
    f_score: Math.round(scores.f),
    affinities: options.affinities ?? [],
    contactability: options.contactability ?? {},
    signal_summary: {
      recentIntentTier: readout.recentIntentTier,
      highestIntentTier: readout.highestIntentTier,
      engagement: scores.bands.engagement,
    },
    days_since_last_activity: daysSinceActivity,
    state_entered_at: result.state_entered_at,
    scores_computed_at: asOf,
  });

  // One snapshot per learner per day. The EPIC 1 UNIQUE index on
  // (enrollment_id, as_of_date) is the real guarantee; this upsert makes a
  // second run of the same day update rather than throw.
  const as_of_date = asOfDate(asOf);
  const existing = await ExplorerScoreSnapshot.findOne({
    where: { enrollment_id: enrollmentId, as_of_date },
  });
  const snapshot = {
    e_score: Math.round(scores.e),
    i_score: Math.round(scores.i),
    f_score: Math.round(scores.f),
    primary_state: result.primary_state,
    overlays: result.overlays,
  };
  if (existing) {
    await existing.update(snapshot);
  } else {
    await ExplorerScoreSnapshot.create({
      enrollment_id: enrollmentId,
      as_of_date,
      ...snapshot,
    } as never);
  }

  return {
    enrollment_id: enrollmentId,
    written: true,
    e_score: scores.e,
    i_score: scores.i,
    f_score: scores.f,
    primary_state: result.primary_state,
    overlays: result.overlays,
  };
}

export interface BatchResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ enrollment_id: string; error: string }>;
}

/**
 * Recompute every Explorer that has a profile row.
 *
 * One learner's failure NEVER aborts the batch — a single bad row must not
 * leave 152 others stale. Failures are collected and reported.
 */
export async function recomputeAllExplorers(
  options: RecomputeOptions & { limit?: number } = {},
): Promise<BatchResult> {
  const rows = await ExplorerJourneyProfile.findAll({
    attributes: ['enrollment_id'],
    ...(options.limit ? { limit: options.limit } : {}),
  });

  const out: BatchResult = { attempted: rows.length, succeeded: 0, failed: 0, errors: [] };

  for (const row of rows) {
    const id = (row as any).enrollment_id as string;
    try {
      await recomputeExplorerProfile(id, options);
      out.succeeded += 1;
    } catch (err: any) {
      out.failed += 1;
      out.errors.push({ enrollment_id: id, error: err?.message ?? 'unknown' });
    }
  }
  return out;
}

/**
 * Flag-gated entry point for the cron (T006).
 *
 * Read through `isExplorerFeatureEnabled` so BOTH the master flag and
 * `journeyIntelligence` must be on — a direct sub-flag read would let this run
 * with the master switch off, and a guard test scans backend source for exactly
 * that. The operator script calls `recomputeAllExplorers` directly instead,
 * because a human running it deliberately is its own authorisation.
 */
export async function runScheduledRecompute(
  options: RecomputeOptions = {},
): Promise<BatchResult | { skipped: true }> {
  if (!isExplorerFeatureEnabled('journeyIntelligence', env.explorerGrowth)) {
    return { skipped: true };
  }
  return recomputeAllExplorers(options);
}
