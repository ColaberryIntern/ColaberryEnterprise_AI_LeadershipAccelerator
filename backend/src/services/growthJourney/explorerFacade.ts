import { GrowthJourneyEnrollment } from '../../models';
import {
  getLearnerProfile,
  getLearnerScores,
  getLearnerSignals,
  getLearnerDecisions,
  getEligibility,
  type LearnerProfile,
  type LearnerSignals,
  type LearnerDecisionSummary,
  type LearnerEligibility,
  type ScorePoint,
} from '../explorerGrowth/explorerLearnerService';
import { getExplorerWhy, type ExplorerWhy } from '../explorerGrowth/explorerWhyService';
import { resolveSubject, type SubjectAnchor, type SubjectResolution } from './subjectResolver';
import { BACKFILL_SOURCE } from './explorerProgramBridge';

/**
 * The Explorer compatibility facade (T206).
 *
 * Generic callers think in SUBJECTS (T204) and PROGRAM PARTICIPATIONS (T205).
 * Explorer thinks in one key: `enrollmentId`. This module is the translation
 * between the two, and it is deliberately nothing more than that.
 *
 * ─── WHAT MAKES AD-1's "ADDITIVE" REAL RATHER THAN ASPIRATIONAL ─────────────
 *
 * The four Command Center read services — `explorerOverviewService`,
 * `explorerDecisionsService`, `explorerLearnerService`, `explorerWhyService` —
 * and the twelve admin read endpoints behind them are UNTOUCHED. This file
 * imports their functions and calls them; it does not reimplement, wrap with
 * new logic, or reach past them into Explorer's models. A facade that
 * re-derived a score or re-read a profile table would be a second Explorer,
 * and the moment the two disagreed nobody could say which was right.
 *
 * The test for this is not "the facade returns the right shape". It is that
 * Explorer's entire existing suite — 52 suites, 1,233 tests — passes with ZERO
 * edits after this module exists, and that this module performs no writes.
 *
 * ─── A SUBJECT WITHOUT AN ENROLLMENT IS NOT AN ERROR ────────────────────────
 *
 * A business lead, a visitor, an org member with no learner enrollment — all
 * are valid subjects with nothing in Explorer. The result is discriminated so
 * that `not_a_learner` is a first-class answer rather than a null that a caller
 * has to guess the meaning of, and so that it can never be confused with
 * `unresolved` (we do not know who this is) or with a learner who exists but
 * has no history yet.
 *
 * ─── IT READS. NOTHING ELSE. ────────────────────────────────────────────────
 *
 * Every call here goes to a read function. The subject resolver is read-only by
 * contract (T204), the Explorer services are read-only by inspection (zero
 * `create`/`update`/`upsert`/`destroy` across all four), and the one model read
 * here is a `findAll`. A source-scan test pins all three facts.
 */

export type LearnerJourneyView =
  | {
      status: 'learner';
      enrollment_id: string;
      profile: LearnerProfile;
      eligibility: LearnerEligibility | null;
      /** The generic participation rows this subject holds, if any. */
      participations: ParticipationSummary[];
    }
  /** A real subject with no learner enrollment — a lead, a visitor, an org member. */
  | { status: 'not_a_learner'; participations: ParticipationSummary[] }
  /** An enrollment id exists but Explorer has no profile for it yet. */
  | { status: 'learner_without_profile'; enrollment_id: string; participations: ParticipationSummary[] }
  | { status: 'unresolved'; reason: Extract<SubjectResolution, { status: 'unresolved' }>['reason'] };

export interface ParticipationSummary {
  id: string;
  tenant_id: string;
  brand_id: string;
  program_id: string;
  path_id: string | null;
  status: string;
  source: string;
  enrolled_at: Date;
  /** True when this row came from the Explorer backfill rather than a live enrolment. */
  from_explorer_backfill: boolean;
}

/**
 * Generic participations for a subject, from T205's table.
 *
 * Read by the derived key rather than by lead or enrollment id directly, so a
 * subject keyed on `enrollment:<id>` and one keyed on `lead:<id>` cannot both
 * claim the same row.
 */
async function participationsFor(
  resolution: Extract<SubjectResolution, { status: 'resolved' }>,
): Promise<ParticipationSummary[]> {
  const refs: string[] = [];
  if (resolution.subject.enrollment_id) refs.push(`enrollment:${resolution.subject.enrollment_id}`);
  if (resolution.subject.lead_id !== null) refs.push(`lead:${resolution.subject.lead_id}`);
  if (refs.length === 0) return [];

  const rows = await GrowthJourneyEnrollment.findAll({ where: { subject_ref: refs } });
  return rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    brand_id: r.brand_id,
    program_id: r.program_id,
    path_id: r.path_id,
    status: r.status,
    source: r.source,
    enrolled_at: r.enrolled_at,
    from_explorer_backfill: r.source === BACKFILL_SOURCE,
  }));
}

/**
 * The learner journey for a subject, as Explorer sees it.
 *
 * Resolves the subject first (T204), then hands the enrollment id — and only
 * that — to Explorer's own read services.
 */
export async function getLearnerJourney(anchor: SubjectAnchor): Promise<LearnerJourneyView> {
  const resolution = await resolveSubject(anchor);
  if (resolution.status !== 'resolved') {
    return { status: 'unresolved', reason: resolution.reason };
  }

  const participations = await participationsFor(resolution);
  const enrollmentId = resolution.subject.enrollment_id;
  if (!enrollmentId) return { status: 'not_a_learner', participations };

  const profile = await getLearnerProfile(enrollmentId);
  if (!profile) return { status: 'learner_without_profile', enrollment_id: enrollmentId, participations };

  const eligibility = await getEligibility(enrollmentId);
  return { status: 'learner', enrollment_id: enrollmentId, profile, eligibility, participations };
}

/** Explorer's score series for a subject. `null` when the subject is not a learner Explorer knows. */
export async function getLearnerScoreSeries(
  anchor: SubjectAnchor,
  days: number,
): Promise<{ enrollment_id: string; series: ScorePoint[] } | null> {
  const enrollmentId = await enrollmentIdFor(anchor);
  return enrollmentId ? getLearnerScores(enrollmentId, days) : null;
}

/** Explorer's signal summary for a subject. */
export async function getLearnerSignalSummary(
  anchor: SubjectAnchor,
  days: number,
): Promise<LearnerSignals | null> {
  const enrollmentId = await enrollmentIdFor(anchor);
  return enrollmentId ? getLearnerSignals(enrollmentId, days) : null;
}

/** Explorer's decision history for a subject. */
export async function getLearnerDecisionHistory(
  anchor: SubjectAnchor,
  limit: number,
  offset: number,
): Promise<{ rows: LearnerDecisionSummary[]; total: number; limit: number; offset: number } | null> {
  const enrollmentId = await enrollmentIdFor(anchor);
  return enrollmentId ? getLearnerDecisions(enrollmentId, limit, offset) : null;
}

/**
 * Explorer's "why" explanation for a subject.
 *
 * `getExplorerWhy` never returns null — it returns an `ExplorerWhy` whose own
 * shape says whether anything was found — so this only short-circuits on the
 * subject side.
 */
export async function getLearnerWhy(
  anchor: SubjectAnchor,
  date?: string,
): Promise<ExplorerWhy | null> {
  const enrollmentId = await enrollmentIdFor(anchor);
  return enrollmentId ? getExplorerWhy(enrollmentId, date) : null;
}

/**
 * The single translation step every read above shares: subject → enrollment id.
 *
 * Returns null for anything that is not a resolved learner, so no Explorer
 * service is ever called with an anchor it does not understand.
 */
async function enrollmentIdFor(anchor: SubjectAnchor): Promise<string | null> {
  const resolution = await resolveSubject(anchor);
  if (resolution.status !== 'resolved') return null;
  return resolution.subject.enrollment_id;
}
