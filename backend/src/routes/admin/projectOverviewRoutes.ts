import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { Cohort, Enrollment } from '../../models';
import Project from '../../models/Project';
import ProjectArtifact from '../../models/ProjectArtifact';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

const router = Router();

/**
 * GET /api/admin/projects/overview
 * Aggregate project statistics across all cohorts for the admin dashboard.
 */
router.get('/api/admin/projects/overview', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const cohorts = await Cohort.findAll({ order: [['created_at', 'DESC']] });

    const cohortStats = [];

    for (const cohort of cohorts) {
      const enrollments = await Enrollment.findAll({
        where: { cohort_id: cohort.id },
        attributes: ['id'],
      });
      const enrollmentIds = enrollments.map(e => e.id);

      if (enrollmentIds.length === 0) continue;

      // Find projects for these enrollments
      const projects = await Project.findAll({
        where: { enrollment_id: { [Op.in]: enrollmentIds } },
      });

      // Phase distribution
      const phaseDistribution: Record<string, number> = {};
      let maturitySum = 0;
      let maturityCount = 0;

      for (const project of projects) {
        const stage = project.project_stage || 'discovery';
        phaseDistribution[stage] = (phaseDistribution[stage] || 0) + 1;

        if (project.maturity_score != null) {
          maturitySum += project.maturity_score;
          maturityCount++;
        }
      }

      // Count artifacts
      const projectIds = projects.map(p => p.id);
      let artifactCount = 0;
      let requirementsCount = 0;

      if (projectIds.length > 0) {
        artifactCount = await ProjectArtifact.count({
          where: { project_id: { [Op.in]: projectIds } },
        });

        // Count requirements documents specifically
        const { ArtifactDefinition } = await import('../../models');
        const reqDef = await ArtifactDefinition.findOne({
          where: { name: 'System Requirements Specification' },
        });
        if (reqDef) {
          requirementsCount = await ProjectArtifact.count({
            where: {
              project_id: { [Op.in]: projectIds },
              artifact_definition_id: reqDef.id,
            },
          });
        }
      }

      cohortStats.push({
        cohort_id: cohort.id,
        cohort_name: cohort.name,
        total_students: enrollmentIds.length,
        students_with_projects: projects.length,
        phase_distribution: phaseDistribution,
        avg_maturity_score: maturityCount > 0 ? Math.round(maturitySum / maturityCount) : null,
        total_artifacts: artifactCount,
        requirements_generated: requirementsCount,
      });
    }

    res.json({ cohorts: cohortStats });
  } catch (err: any) {
    console.error('[AdminProjectOverview] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/projects/cohort/:cohortId/students
 * List all students in a cohort with their project details.
 */
router.get('/api/admin/projects/cohort/:cohortId/students', requireAdmin, async (req: Request, res: Response) => {
  try {
    const enrollments = await Enrollment.findAll({
      where: { cohort_id: req.params.cohortId },
      order: [['created_at', 'DESC']],
    });

    const { Capability } = await import('../../models');
    const { RequirementsMap } = await import('../../models');

    const students = [];
    for (const e of enrollments) {
      const project = await Project.findOne({ where: { enrollment_id: e.id } });
      const artifactCount = project ? await ProjectArtifact.count({ where: { project_id: project.id } }) : 0;

      // Progress metrics
      let bpCount = 0, bpCompleted = 0, reqTotal = 0, reqMatched = 0, readiness = 0;
      if (project) {
        const caps = await Capability.findAll({ where: { project_id: project.id }, attributes: ['id'] });
        bpCount = caps.length;
        const capIds = caps.map((c: any) => c.id);
        if (capIds.length > 0) {
          const reqs = await RequirementsMap.findAll({ where: { project_id: project.id }, attributes: ['status'] });
          reqTotal = reqs.length;
          reqMatched = reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified').length;
        }
        readiness = (project as any).readiness_score_breakdown
          ? Math.round(((project as any).requirements_completion_pct || 0))
          : reqTotal > 0 ? Math.round((reqMatched / reqTotal) * 100) : 0;
      }

      students.push({
        enrollment_id: e.id,
        full_name: (e as any).full_name,
        email: (e as any).email,
        company: (e as any).company || '',
        title: (e as any).title || '',
        status: (e as any).status,
        portal_enabled: (e as any).portal_enabled,
        payment_status: (e as any).payment_status,
        project_id: project?.id || null,
        project_stage: project ? (project as any).project_stage : null,
        organization_name: project ? (project as any).organization_name : null,
        github_repo_url: project ? (project as any).github_repo_url : null,
        github_connected: project ? !!(project as any).github_repo_url : false,
        requirements_loaded: project ? !!(project as any).requirements_document : false,
        maturity_score: project ? (project as any).maturity_score : null,
        target_mode: project ? (project as any).target_mode : null,
        artifact_count: artifactCount,
        bp_count: bpCount,
        bp_completed: bpCompleted,
        req_total: reqTotal,
        req_matched: reqMatched,
        readiness_pct: readiness,
        created_at: (e as any).created_at,
      });
    }

    res.json({ students });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/projects/:id/detail
 * Full project detail for admin drill-down.
 */
router.get('/api/admin/projects/:id/detail', requireAdmin, async (req: Request, res: Response) => {
  try {
    const project = await Project.findByPk(req.params.id as string);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const { Capability } = await import('../../models');
    const { RequirementsMap } = await import('../../models');
    const { Feature } = await import('../../models');
    const { GitHubConnection } = await import('../../models');

    // Get enrollment
    const enrollment = await Enrollment.findByPk((project as any).enrollment_id);

    // Get business processes with requirement counts
    const caps = await Capability.findAll({
      where: { project_id: project.id },
      order: [['sort_order', 'ASC']],
      attributes: ['id', 'name', 'source', 'sort_order', 'frontend_route', 'modes', 'autonomy_level', 'lifecycle_status'],
    });

    const bpDetails = [];
    for (const cap of caps) {
      const reqs = await RequirementsMap.findAll({ where: { capability_id: cap.id }, attributes: ['status'] });
      const total = reqs.length;
      const matched = reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified').length;
      const unmatched = reqs.filter((r: any) => r.status === 'unmatched' || r.status === 'not_started').length;
      bpDetails.push({
        id: cap.id,
        name: cap.name,
        source: cap.source,
        frontend_route: (cap as any).frontend_route,
        modes: (cap as any).modes,
        req_total: total,
        req_matched: matched,
        req_unmatched: unmatched,
        coverage_pct: total > 0 ? Math.round((matched / total) * 100) : 0,
        lifecycle_status: (cap as any).lifecycle_status,
      });
    }

    // GitHub info
    const gh = await GitHubConnection.findOne({ where: { enrollment_id: (project as any).enrollment_id } });

    // Artifacts
    const artifacts = await ProjectArtifact.findAll({ where: { project_id: project.id } });

    res.json({
      project: {
        id: project.id,
        organization_name: (project as any).organization_name,
        industry: (project as any).industry,
        project_stage: (project as any).project_stage,
        target_mode: (project as any).target_mode || 'production',
        primary_business_problem: (project as any).primary_business_problem,
        github_repo_url: (project as any).github_repo_url,
        portfolio_url: (project as any).portfolio_url,
        requirements_completion_pct: (project as any).requirements_completion_pct || 0,
        maturity_score: (project as any).maturity_score,
        health_score: (project as any).health_score,
        velocity_score: (project as any).velocity_score,
        created_at: (project as any).created_at,
      },
      student: enrollment ? {
        full_name: (enrollment as any).full_name,
        email: (enrollment as any).email,
        company: (enrollment as any).company,
        title: (enrollment as any).title,
      } : null,
      github: gh ? {
        repo_url: (gh as any).repo_url,
        file_count: (gh as any).file_count,
        last_synced: (gh as any).last_synced_at,
      } : null,
      business_processes: bpDetails,
      artifacts,
      summary: {
        total_bps: bpDetails.length,
        code_bps: bpDetails.filter(b => b.source !== 'frontend_page').length,
        page_bps: bpDetails.filter(b => b.source === 'frontend_page').length,
        total_reqs: bpDetails.reduce((s, b) => s + b.req_total, 0),
        matched_reqs: bpDetails.reduce((s, b) => s + b.req_matched, 0),
        overall_coverage: (() => {
          const t = bpDetails.reduce((s, b) => s + b.req_total, 0);
          const m = bpDetails.reduce((s, b) => s + b.req_matched, 0);
          return t > 0 ? Math.round((m / t) * 100) : 0;
        })(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/projects/:id/import
 * Import project state (admin only).
 */
router.post('/api/admin/projects/:id/import', requireAdmin, async (req: Request, res: Response) => {
  try {
    const project = await Project.findByPk(req.params.id as string);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const { importProjectState } = await import('../../services/projectExportService');
    const result = await importProjectState(project.enrollment_id, req.body);
    res.json(result);
  } catch (err: any) {
    console.error('[AdminProjectOverview] POST /import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
