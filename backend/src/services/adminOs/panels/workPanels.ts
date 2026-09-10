import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * What a person BUILT: projects, case studies, capstones, portfolio, cert prep.
 *
 * The evidence a learner produces is the thing the programme exists to create,
 * and it was entirely absent from the 360. A reader could see that someone
 * completed 217 cards and not that those cards produced two named projects for
 * a real client.
 *
 * ── CASE STUDIES REACH A PERSON THROUGH THEIR PROJECT ───────────────────────
 *
 * case_studies has no enrollment_id. It joins projects, and projects carry the
 * enrolment. That indirection is why the family of sixteen case-study tables
 * never appeared in any person-keyed audit before this one.
 *
 * ── CERT PREP IS REPORTED AS BARELY USED, BECAUSE IT IS ─────────────────────
 *
 * Platform-wide on 2026-09-09: cert_sessions 3, cert_responses 0,
 * cert_readiness_snapshots 0, cert_evidence_mappings 30. The panel says so
 * rather than rendering an empty state that reads like a broken query. A
 * feature nobody uses and a feature that is broken look identical otherwise.
 */

export interface ProjectRow {
  id: string;
  name: string | null;
  organizationName: string | null;
  industry: string | null;
  stage: string | null;
  businessProblem: string | null;
  useCase: string | null;
  maturityScore: number | null;
  healthScore: number | null;
  velocityScore: number | null;
  stabilityScore: number | null;
  requirementsCompletionPct: number | null;
  githubRepoUrl: string | null;
  portfolioUrl: string | null;
  openTasks: number;
  doneTasks: number;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
}

export interface CaseStudyRow {
  id: string;
  slug: string | null;
  title: string | null;
  status: string | null;
  visibility: string | null;
  organizationDisplayName: string | null;
  organizationIsAnonymised: boolean | null;
  industry: string | null;
  primaryCapability: string | null;
  approvedAt: string | null;
  publishedCount: number;
  snapshotCount: number;
  projectName: string | null;
}

export interface CapstoneRow {
  id: string;
  slug: string | null;
  status: string | null;
  visibility: string | null;
  version: number | null;
  publishedAt: string | null;
  projectName: string | null;
}

export interface PortfolioRow {
  kind: string;
  title: string | null;
  status: string | null;
  at: string | null;
}

export interface CertPrepPanel {
  sessions: Array<{
    trackId: string | null;
    status: string | null;
    scaledScore: number | null;
    correctCount: number | null;
    totalCount: number | null;
    completedAt: string | null;
  }>;
  evidenceMapped: number;
  evidenceVerified: number;
  /** Stated so an empty panel reads as "unused", not "broken". */
  platformUsageNote: string | null;
}

export interface WorkPanel {
  projects: ProjectRow[];
  caseStudies: CaseStudyRow[];
  capstones: CapstoneRow[];
  portfolio: PortfolioRow[];
  certPrep: CertPrepPanel;
  /** Client organisations named on this person's projects. */
  clientOrganisations: string[];
}

export async function loadWork(enrollmentIds: string[]): Promise<WorkPanel | null> {
  if (enrollmentIds.length === 0) return null;
  const replacements = { ids: enrollmentIds };

  const [projects, caseStudies, capstones, portfolio, certSessions, certEvidence] = await Promise.all([
    sequelize.query<ProjectRow & { open_tasks: string; done_tasks: string }>(
      `SELECT p.id, p.name, p.organization_name AS "organizationName", p.industry,
              p.project_stage::text AS stage,
              p.primary_business_problem AS "businessProblem",
              p.selected_use_case AS "useCase",
              p.maturity_score AS "maturityScore", p.health_score AS "healthScore",
              p.velocity_score AS "velocityScore", p.stability_score AS "stabilityScore",
              p.requirements_completion_pct AS "requirementsCompletionPct",
              p.github_repo_url AS "githubRepoUrl", p.portfolio_url AS "portfolioUrl",
              p.created_at AS "createdAt", p.updated_at AS "updatedAt",
              p.archived_at AS "archivedAt",
              (SELECT COUNT(*) FROM student_task_lists stl
                WHERE stl.project_id = p.id AND stl.status <> 'done')::text AS open_tasks,
              (SELECT COUNT(*) FROM student_task_lists stl
                WHERE stl.project_id = p.id AND stl.status = 'done')::text AS done_tasks
       FROM projects p WHERE p.enrollment_id IN (:ids)
       ORDER BY p.created_at DESC`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<CaseStudyRow & { published_count: string; snapshot_count: string }>(
      `SELECT cs.id, cs.slug, cs.title, cs.status, cs.visibility,
              cs.organization_display_name AS "organizationDisplayName",
              cs.organization_is_anonymized AS "organizationIsAnonymised",
              cs.industry, cs.primary_capability AS "primaryCapability",
              cs.approved_at AS "approvedAt", p.name AS "projectName",
              (SELECT COUNT(*) FROM case_study_publications cp
                WHERE cp.case_study_id = cs.id)::text AS published_count,
              (SELECT COUNT(*) FROM case_study_snapshots css
                WHERE css.case_study_id = cs.id)::text AS snapshot_count
       FROM case_studies cs
       JOIN projects p ON p.id = cs.project_id
       WHERE p.enrollment_id IN (:ids)
       ORDER BY cs.created_at DESC`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<CapstoneRow>(
      `SELECT cr.id, cr.slug, cr.status, cr.visibility, cr.version,
              cr.published_at AS "publishedAt", p.name AS "projectName"
       FROM capstone_records cr
       LEFT JOIN projects p ON p.id = cr.project_id
       WHERE cr.enrollment_id IN (:ids)
       ORDER BY cr.created_at DESC`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<PortfolioRow>(
      `SELECT 'career_page' AS kind, slug AS title, status, updated_at AS at
       FROM career_portfolio_pages WHERE enrollment_id IN (:ids)
       UNION ALL
       SELECT COALESCE(kind, 'artifact') AS kind, title, NULL AS status, created_at AS at
       FROM runtime_portfolio_artifacts WHERE enrollment_id IN (:ids)
       ORDER BY at DESC NULLS LAST LIMIT 40`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{
      trackId: string | null; status: string | null; scaledScore: number | null;
      correctCount: number | null; totalCount: number | null; completedAt: string | null;
    }>(
      `SELECT track_id AS "trackId", status, scaled_score AS "scaledScore",
              correct_count AS "correctCount", total_count AS "totalCount",
              completed_at AS "completedAt"
       FROM cert_sessions WHERE enrollment_id IN (:ids)
       ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<{ mapped: string; verified: string }>(
      `SELECT COUNT(*)::text AS mapped,
              COUNT(*) FILTER (WHERE verified_at IS NOT NULL)::text AS verified
       FROM cert_evidence_mappings WHERE enrollment_id IN (:ids)`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  const ev = certEvidence[0];
  const clients = Array.from(
    new Set(
      projects
        .map((p) => p.organizationName)
        .filter((n): n is string => !!n && n.trim().length > 0),
    ),
  );

  return {
    projects: projects.map((p) => ({
      ...p,
      openTasks: Number(p.open_tasks ?? 0),
      doneTasks: Number(p.done_tasks ?? 0),
    })),
    caseStudies: caseStudies.map((c) => ({
      ...c,
      publishedCount: Number(c.published_count ?? 0),
      snapshotCount: Number(c.snapshot_count ?? 0),
    })),
    capstones,
    portfolio,
    certPrep: {
      sessions: certSessions,
      evidenceMapped: Number(ev?.mapped ?? 0),
      evidenceVerified: Number(ev?.verified ?? 0),
      platformUsageNote:
        certSessions.length === 0
          ? 'Certification prep is barely used platform-wide: 3 sessions exist in total, and '
            + 'no responses or readiness snapshots have ever been recorded. An empty panel here '
            + 'means the feature is unused, not that this person skipped it.'
          : null,
    },
    clientOrganisations: clients,
  };
}
