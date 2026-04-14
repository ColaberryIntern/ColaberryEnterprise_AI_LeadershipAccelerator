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

    const students = [];
    for (const e of enrollments) {
      const project = await Project.findOne({ where: { enrollment_id: e.id } });
      const artifactCount = project ? await ProjectArtifact.count({ where: { project_id: project.id } }) : 0;

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
        github_connected: project ? !!(project as any).github_repo_url : false,
        requirements_loaded: project ? !!(project as any).requirements_document : false,
        maturity_score: project ? (project as any).maturity_score : null,
        artifact_count: artifactCount,
        created_at: (e as any).created_at,
      });
    }

    res.json({ students });
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
