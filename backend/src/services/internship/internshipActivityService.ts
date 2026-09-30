import Enrollment from '../../models/Enrollment';
import CaseStudy from '../../models/CaseStudy';
import { getStudentWeekBreakdown } from '../curriculumCompletionService';
import { getProjectProgressField } from '../studentSuccessSnapshot/projectProgressSource';
import { getCertReadinessField } from '../studentSuccessSnapshot/certReadinessSource';
import { listProjectsForEnrollment } from '../projectService';
import { meetingAttendanceSummary } from './internshipAttendanceService';

/**
 * Everything an intern is DOING, for the reviewer's admin view — keyed by the
 * enrollment (an intern is a normal student enrollment with a secondary internship
 * membership, so all the student progress signals already exist; this gathers the
 * few a manager cares about into one read).
 *
 * Read-only and deterministic. Each area is fetched by its existing, canonical
 * source function rather than recomputed here, so the admin view can never disagree
 * with the student's own progress. The AI "dig into the project" review is a
 * separate call (internshipProjectReview) — this is just the facts.
 *
 * ── THE FIRST-3-WEEKS GATE ─────────────────────────────────────────────────
 * The internship's training phase is weeks 1-3; clearing them is the "basic
 * understanding" bar before a project is assigned. A week counts done at the same
 * 30% threshold the rest of the platform uses (curriculumCompletionService), so
 * "ready for a project" here means exactly what "week done" means everywhere else.
 */
const TRAINING_WEEKS = [1, 2, 3] as const;

export interface WeekProgress {
  week: number;
  published: number;
  completed: number;
  completed_pct: number;
  done: boolean;
}

export interface InternActivity {
  /** So the admin view can deep-link to this intern's full Student Success 360. */
  enrollment_id: string;
  training: {
    weeks: WeekProgress[];
    first_three_weeks: { done: number; total: number; ready: boolean };
  } | null;
  project: {
    name: string;
    stage: string | null;
    requirements_pct: number | null;
    repo_connected: boolean;
    total_stories: number;
    verified_stories: number;
  } | null;
  cert_prep: {
    state: string;
    overall_scaled: number | null;
    evidence_coverage_pct: number | null;
    computed_at: string | null;
  } | null;
  case_studies: Array<{ id: string; title: string; status: string; slug: string }>;
  /** Session attendance across the required meetings. */
  attendance: { total: number; by_meeting: Record<string, number>; last_attended_at: string | null };
}

export async function internActivity(enrollmentId: string): Promise<InternActivity> {
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'cohort_id'] });
  const cohortId = (enrollment as any)?.cohort_id ?? null;

  const [breakdown, projectField, certField, projects, attendance] = await Promise.all([
    cohortId ? getStudentWeekBreakdown(cohortId, enrollmentId) : Promise.resolve(null),
    getProjectProgressField(enrollmentId),
    getCertReadinessField(enrollmentId),
    listProjectsForEnrollment(enrollmentId),
    meetingAttendanceSummary(enrollmentId),
  ]);

  // ── Training: per-week completion + the first-3-weeks gate ────────────────
  let training: InternActivity['training'] = null;
  if (breakdown && Array.isArray((breakdown as any).rows)) {
    // The breakdown already applies the 30% WEEK_DONE_THRESHOLD and hands back
    // `weekDone` / `completedPct` per week; trust those rather than recomputing, so
    // "week done" here means exactly what it means on the student's own progress.
    const weeks: WeekProgress[] = (breakdown as any).rows
      .filter((r: any) => r.week != null)
      .map((r: any) => ({
        week: Number(r.week),
        published: Number(r.publishedCardCount) || 0,
        completed: Number(r.completed) || 0,
        completed_pct: Math.round(Number(r.completedPct) || 0),
        done: !!r.weekDone,
      }));
    const doneInFirstThree = TRAINING_WEEKS.filter(
      (w) => weeks.find((x) => x.week === w)?.done,
    ).length;
    training = {
      weeks,
      first_three_weeks: {
        done: doneInFirstThree,
        total: TRAINING_WEEKS.length,
        ready: doneInFirstThree === TRAINING_WEEKS.length,
      },
    };
  }

  // ── Project ───────────────────────────────────────────────────────────────
  const pv = projectField.value as any;
  const project = pv
    ? {
      name: pv.name,
      stage: pv.stage ?? null,
      requirements_pct: pv.requirementsCompletionPct ?? null,
      repo_connected: !!pv.repoConnected,
      total_stories: Number(pv.totalStories) || 0,
      verified_stories: Number(pv.verifiedStories) || 0,
    }
    : null;

  // ── Cert prep ─────────────────────────────────────────────────────────────
  const cv = certField.value as any;
  const cert_prep = cv
    ? {
      state: cv.overallState ?? 'not_measured',
      overall_scaled: cv.overallScaled ?? null,
      evidence_coverage_pct: cv.evidenceCoveragePct ?? null,
      computed_at: (certField as any).observedAt ?? null,
    }
    : null;

  // ── Case studies (reached enrollment -> projects -> project_id) ───────────
  const projectIds = projects.map((p) => (p as any).id);
  let case_studies: InternActivity['case_studies'] = [];
  if (projectIds.length) {
    const rows = await CaseStudy.findAll({
      where: { project_id: projectIds },
      attributes: ['id', 'title', 'status', 'slug'],
      order: [['updated_at', 'DESC']],
    });
    case_studies = rows.map((r) => ({
      id: (r as any).id,
      title: (r as any).title,
      status: (r as any).status,
      slug: (r as any).slug,
    }));
  }

  return { enrollment_id: enrollmentId, training, project, cert_prep, case_studies, attendance };
}
