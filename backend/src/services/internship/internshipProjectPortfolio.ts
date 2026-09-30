/**
 * internshipProjectPortfolio — an intern's own projects, as the student sees them.
 *
 * ── WHY THIS EXISTS, AND WHY IT REUSES THE ADMIN CALCULATION ────────────────
 *
 * The admin delivery board (`getProjectDelivery`) already computes readiness,
 * risk, repo state, stage and the active-project flag for every project, with a
 * calculation the management side trusts. A student's Projects view must agree
 * with that calculation to the number — an acceptance criterion of the dashboard
 * plan is "readiness components match admin calculation." So this service does
 * NOT re-derive readiness; it calls the same function scoped to one enrollment
 * (server-side, never the admin-wide payload filtered in the browser) and adds
 * only what the student view needs on top.
 *
 * ── THE ONE THING IT ADDS: VERIFIED vs SELF-REPORTED, KEPT SEPARATE ─────────
 *
 * `ProjectRow` reports `tasks_complete` — stories the student marked complete.
 * That is self-reported, and it is what the build/readiness percentage is
 * computed from. It is NOT proof the work was checked. This service counts
 * `verified_at` (platform-confirmed) independently and reports both side by
 * side. The two are never swapped: readiness keeps its self-reported
 * denominator, and "verified" is shown as its own, smaller, honest number.
 *
 * ── AND HOW IT REPRESENTS TWO ACTIVE PROJECTS ──────────────────────────────
 *
 * A single `active_project_id` can name only one project, so the internship's
 * two-simultaneous-projects reality cannot be read off that pointer alone. Rather
 * than invent a second flag or mislabel the other build "dormant", this lists
 * every owned live project and marks exactly the one the pointer names as
 * `active`; the rest are `owned` — legitimately theirs, never implied abandoned.
 * Archived projects are `archived`: history, not workload.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  getProjectDelivery,
  ProjectRow,
  ProjectReadiness,
  DONE_TASK_STATUSES,
} from '../projectDeliveryService';

export interface InternProjectStories {
  total: number;
  /** Self-reported: `status = 'complete'`. This is the denominator the readiness /
   *  build percentage is computed from. It is a claim, not a verification. */
  self_reported_complete: number;
  /** Platform-confirmed: `verified_at` is set. Counted independently and shown
   *  ALONGSIDE `self_reported_complete`, never substituted for it. */
  verified: number;
  /** Marked complete but not yet verified — the gap between the claim and the
   *  check. `self_reported_complete` minus the complete-and-verified overlap. */
  awaiting_verification: number;
}

export interface InternProject {
  project_id: string;
  name: string | null;
  /**
   * 'active'   — the student's single `active_project_id`.
   * 'owned'    — a live project they own that is not the active pointer (a
   *              legitimately concurrent or spare build; never implied abandoned).
   * 'archived' — soft-deleted; history, not active workload.
   */
  role: 'active' | 'owned' | 'archived';
  stage: string;
  has_repo: boolean;
  repo_url: string | null;
  /** External Command Center (GitHub Pages at the repo root). Null until published. */
  command_center_url: string | null;
  /** The admin readiness model, unchanged — score, components and gaps. */
  readiness: ProjectReadiness;
  stories: InternProjectStories;
  artifacts: number;
  already_case_study: boolean;
  /** Portfolio risk state and its plain-language reason, from the shared model. */
  risk_state: string;
  risk_reason: string;
}

export interface InternProjectPortfolio {
  enrollment_id: string;
  projects: InternProject[];
  /** How many projects are the active pointer. 0 or 1 by construction — surfaced
   *  so the UI can say "no active project yet" honestly rather than guessing. */
  active_count: number;
  /** True when at least one live (non-archived) project exists. */
  has_live_project: boolean;
}

const ROLE_ORDER: Record<InternProject['role'], number> = { active: 0, owned: 1, archived: 2 };

/**
 * Fold delivery rows + verified/awaiting counts into the student portfolio.
 *
 * Pure: no I/O, so the role assignment, the verified-vs-complete split and the
 * ordering are all unit-testable without a database.
 */
export function assembleProjectPortfolio(
  enrollmentId: string,
  rows: readonly ProjectRow[],
  verifiedByProject: ReadonlyMap<string, number>,
  awaitingByProject: ReadonlyMap<string, number>,
): InternProjectPortfolio {
  const projects: InternProject[] = rows.map((r) => {
    const role: InternProject['role'] = r.archived_at
      ? 'archived'
      : r.is_active_project
        ? 'active'
        : 'owned';
    return {
      project_id: r.project_id,
      name: r.name,
      role,
      stage: r.stage,
      has_repo: r.has_repo,
      repo_url: r.repo_url,
      command_center_url: r.command_center_url,
      readiness: r.readiness,
      stories: {
        total: r.tasks_total,
        self_reported_complete: r.tasks_complete,
        verified: verifiedByProject.get(r.project_id) ?? 0,
        awaiting_verification: awaitingByProject.get(r.project_id) ?? 0,
      },
      artifacts: r.artifacts,
      already_case_study: r.already_case_study,
      risk_state: r.risk.state,
      risk_reason: r.risk.reason,
    };
  });

  // Student ordering: their active build first, then other owned by readiness,
  // archived history last. (getProjectDelivery sorts case-study-ready first,
  // which is the admin's question, not the student's.)
  projects.sort((a, b) => {
    if (ROLE_ORDER[a.role] !== ROLE_ORDER[b.role]) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return b.readiness.score - a.readiness.score;
  });

  return {
    enrollment_id: enrollmentId,
    projects,
    active_count: projects.filter((p) => p.role === 'active').length,
    has_live_project: projects.some((p) => p.role !== 'archived'),
  };
}

/**
 * The intern's project portfolio for the given enrollment.
 *
 * `enrollmentId` is resolved from the authenticated session by the caller — it is
 * never accepted from the client. Returns an empty portfolio (not an error) for
 * an intern who has no project yet.
 */
export async function internProjectPortfolio(enrollmentId: string): Promise<InternProjectPortfolio> {
  // A missing id must never fall through to getProjectDelivery's unfiltered
  // (cohort-wide) query — that would hand one intern the whole board. Guard it
  // here so no caller can trip the leak by passing an empty string.
  if (!enrollmentId) {
    return { enrollment_id: enrollmentId, projects: [], active_count: 0, has_live_project: false };
  }
  const rows = await getProjectDelivery({ enrollmentId });
  if (!rows.length) {
    return { enrollment_id: enrollmentId, projects: [], active_count: 0, has_live_project: false };
  }

  const ids = rows.map((r) => r.project_id);
  // Two independent counts, consistent with ProjectRow's own tallies because they
  // use the SAME done-status set: `verified` is verified_at regardless of status,
  // `awaiting` is complete-but-unverified. Neither is derived by subtraction, so
  // they cannot underflow if a task is verified without being marked complete.
  const counts = await sequelize.query<{ project_id: string; verified: number; awaiting: number }>(
    `SELECT project_id,
            COUNT(*) FILTER (WHERE verified_at IS NOT NULL)::int                       AS verified,
            COUNT(*) FILTER (WHERE status IN (:done) AND verified_at IS NULL)::int      AS awaiting
       FROM student_tasks
      WHERE project_id IN (:ids)
      GROUP BY project_id`,
    { replacements: { ids, done: [...DONE_TASK_STATUSES] }, type: QueryTypes.SELECT },
  );
  const verifiedByProject = new Map(counts.map((c) => [c.project_id, Number(c.verified)]));
  const awaitingByProject = new Map(counts.map((c) => [c.project_id, Number(c.awaiting)]));

  return assembleProjectPortfolio(enrollmentId, rows, verifiedByProject, awaitingByProject);
}
