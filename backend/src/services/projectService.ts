import { Op } from 'sequelize';
import Project, { ProjectStage } from '../models/Project';
import ProjectArtifact from '../models/ProjectArtifact';
import { Enrollment, Cohort, UserCurriculumProfile, ArtifactDefinition, AssignmentSubmission } from '../models';
import { sequelize } from '../config/database';
import { PROTECTED_PROJECT_IDS } from './projects/protectedProjects';

/**
 * "Not archived" — the clause every read of a student's projects must carry.
 *
 * Written once and reused so the three separate "newest remaining project"
 * fallbacks in this file cannot drift apart. They did not exist as a set
 * originally; they accumulated, and the archive feature is the first thing that
 * makes a divergence between them user-visible (a project that vanishes from
 * the list but gets silently re-adopted as the active build).
 */
const LIVE = { archived_at: null as null };

/**
 * The projects an enrollment may be automatically MOVED ONTO when its active
 * pointer needs a new home: live, and never platform infrastructure.
 *
 * The `notIn` is the load-bearing half. `enrollments.active_project_id` has no
 * foreign key and no ON DELETE behaviour, so when the pointer stops resolving,
 * the fallback below picks the newest remaining row. On the one enrollment that
 * owns a platform project, "newest remaining" can resolve to
 * `fcce50ef-fe01-471d-a3ff-cd6948d092c2` — the platform's own ~144k-row record —
 * and silently make it that student's active build. This is not hypothetical:
 * it is the exact mechanism written up in the T4 delete-closure note, which is
 * why the project had to be created before the old one was deleted.
 */
const adoptableWhere = (enrollmentId: string) => ({
  enrollment_id: enrollmentId,
  ...LIVE,
  id: { [Op.notIn]: [...PROTECTED_PROJECT_IDS] },
});

const ALLOWED_TRANSITIONS: Record<ProjectStage, ProjectStage | null> = {
  discovery: 'architecture',
  architecture: 'implementation',
  implementation: 'portfolio',
  portfolio: 'complete',
  complete: null,
};

async function loadEnrollmentForProject(enrollmentId: string): Promise<Enrollment> {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [
      { model: Cohort, as: 'cohort' },
      { model: UserCurriculumProfile, as: 'curriculumProfile' },
    ],
  });
  if (!enrollment) throw new Error(`Enrollment not found: ${enrollmentId}`);
  return enrollment;
}

/** Create a fresh project row + mark it the enrollment's active project. */
async function buildAndActivateProject(enrollment: Enrollment): Promise<Project> {
  const cohort = (enrollment as any).cohort as Cohort | null;
  if (!cohort?.program_id) {
    throw new Error(`Enrollment ${enrollment.id} has no associated program via cohort`);
  }
  const profile = (enrollment as any).curriculumProfile as UserCurriculumProfile | null;
  const project = await Project.create({
    enrollment_id: enrollment.id,
    program_id: cohort.program_id,
    organization_name: profile?.company_name || enrollment.company || undefined,
    industry: profile?.industry || undefined,
    project_stage: 'discovery',
    project_variables: {},
    setup_status: { requirements_loaded: false, claude_md_loaded: false, github_connected: false, activated: false },
  } as any);
  (enrollment as any).active_project_id = project.id;
  await enrollment.save();
  return project;
}

/**
 * Ensure the enrollment has a CURRENT (active) project to work on, creating one
 * if none exists. Returns the active project. Used by the build flows
 * (generate / architect-build / setup) so they all operate on the same project.
 * Multi-project: to start a NEW project use createNewProjectForEnrollment.
 */
export async function createProjectForEnrollment(enrollmentId: string): Promise<Project> {
  const enrollment = await loadEnrollmentForProject(enrollmentId);
  const activeId = (enrollment as any).active_project_id;
  if (activeId) {
    const active = await Project.findByPk(activeId);
    // An ARCHIVED active project is not a valid answer. Returning it here would
    // resurrect a project the student removed the moment any build flow ran.
    if (active && (active as any).archived_at == null) return active;
  }
  // Legacy accounts created before active_project_id: adopt their existing
  // project. Scoped to adoptable rows — see adoptableWhere for why the
  // platform-record exclusion is not optional on this path.
  const existing = await Project.findOne({
    where: adoptableWhere(enrollmentId),
    order: [['created_at', 'DESC']],
  });
  if (existing) {
    (enrollment as any).active_project_id = existing.id;
    await enrollment.save();
    return existing;
  }
  return buildAndActivateProject(enrollment);
}

/** Always create a NEW project and make it active (the "+ New project" action). */
export async function createNewProjectForEnrollment(enrollmentId: string): Promise<Project> {
  const enrollment = await loadEnrollmentForProject(enrollmentId);
  return buildAndActivateProject(enrollment);
}

/** The enrollment's CURRENT (active) project, or null. */
export async function getProjectByEnrollment(enrollmentId: string): Promise<Project | null> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return null;
  const activeId = (enrollment as any).active_project_id;
  if (activeId) {
    const active = await Project.findByPk(activeId);
    // Archived projects are not the active project, even when the pointer still
    // names one. `archiveProject` repoints deliberately, but this is the second
    // line of defence: any other route that archives, or a pointer written by an
    // older build, must not resurrect a removed project as the student's build.
    if (active && (active as any).archived_at == null) return active;
  }
  // Fallback for legacy accounts without an active pointer set yet — and for the
  // moment just after the active project was archived. Adoptable rows only.
  return Project.findOne({
    where: adoptableWhere(enrollmentId),
    order: [['created_at', 'DESC']],
  });
}

/**
 * List all LIVE projects owned by an enrollment, newest first.
 *
 * Archived projects are excluded here rather than at each call site, because
 * this one function is the choke point for `GET /api/portal/projects` (served by
 * `projectsPortalRoutes.ts`) plus `listEnrollmentProjectsSummary`. Filtering here
 * is what makes an archived project disappear from every listing at once instead
 * of from whichever one someone remembered to patch.
 *
 * `projectRoutes.ts` used to declare a SECOND handler for that same path and,
 * being mounted first, won every request — which is what kept
 * `requireContentEntitlement('projects')` and the `projectApiEnabled` flag from
 * ever running on it. That duplicate is gone; see the note at its old site.
 *
 * The platform record is deliberately NOT excluded here: this function also
 * backs staff/inventory reads, and hiding infrastructure from every consumer of
 * a general-purpose list would be a different (and surprising) change. It is
 * excluded from the ARCHIVABLE list and refused by the archive handler, which is
 * where the protection belongs.
 */
export async function listProjectsForEnrollment(enrollmentId: string): Promise<Project[]> {
  return Project.findAll({
    where: { enrollment_id: enrollmentId, ...LIVE },
    order: [['created_at', 'DESC']],
  });
}

/**
 * The projects this student is allowed to archive.
 *
 * FIRST of the two required server-side exclusions of the platform record (the
 * second is in the archive handler itself). A project absent from this list can
 * never be offered by any client, including one the platform did not write.
 *
 * Already-archived projects are excluded too: archiving twice is not an error
 * the student should have to think about, and the idempotent handler treats a
 * repeat as a no-op rather than a failure.
 */
export async function listArchivableProjectsForEnrollment(enrollmentId: string): Promise<Project[]> {
  return Project.findAll({
    where: {
      enrollment_id: enrollmentId,
      ...LIVE,
      id: { [Op.notIn]: [...PROTECTED_PROJECT_IDS] },
    },
    order: [['created_at', 'DESC']],
  });
}

/** The projects this student has archived, most recently archived first. */
export async function listArchivedProjectsForEnrollment(enrollmentId: string): Promise<Project[]> {
  return Project.findAll({
    where: { enrollment_id: enrollmentId, archived_at: { [Op.ne]: null } },
    order: [['archived_at', 'DESC']],
  });
}

/** Switch the active project (must belong to the enrollment). Returns it or null. */
export async function setActiveProject(enrollmentId: string, projectId: string): Promise<Project | null> {
  // `...LIVE` makes "switch to this project" refuse an archived one, so the
  // switcher cannot be used as a back door that un-archives by side effect.
  // Restoring is its own explicit action.
  const project = await Project.findOne({ where: { id: projectId, enrollment_id: enrollmentId, ...LIVE } });
  if (!project) return null;
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (enrollment) {
    (enrollment as any).active_project_id = projectId;
    await enrollment.save();
  }
  return project;
}

/**
 * Update the project stage with transition validation.
 * Only allows forward transitions in the defined sequence.
 */
export async function updateProjectStage(projectId: string, newStage: ProjectStage): Promise<Project> {
  const project = await Project.findByPk(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const allowedNext = ALLOWED_TRANSITIONS[project.project_stage];
  if (allowedNext !== newStage) {
    throw new Error(
      `Invalid stage transition: ${project.project_stage} → ${newStage}. ` +
      `Allowed: ${project.project_stage} → ${allowedNext || '(none — already complete)'}`
    );
  }

  project.project_stage = newStage;
  await project.save();
  return project;
}

/**
 * Attach an artifact submission to a project.
 * Uses the submission's version_number when available (from artifact versioning engine),
 * otherwise falls back to MAX(version)+1 for backwards compatibility.
 */
export async function attachArtifactToProject(
  projectId: string,
  submissionId: string,
): Promise<ProjectArtifact> {
  const submission = await AssignmentSubmission.findByPk(submissionId);
  if (!submission) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  const artifactDefinitionId = submission.artifact_definition_id;
  if (!artifactDefinitionId) {
    throw new Error(`Submission ${submissionId} has no artifact_definition_id`);
  }

  const project = await Project.findByPk(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Use submission's version_number if set, otherwise fallback to MAX+1
  let version: number;
  if (submission.version_number && submission.version_number > 0) {
    version = submission.version_number;
  } else {
    const maxVersion = await ProjectArtifact.max('version', {
      where: {
        project_id: projectId,
        artifact_definition_id: artifactDefinitionId,
      },
    }) as number | null;
    version = (maxVersion || 0) + 1;
  }

  return ProjectArtifact.create({
    project_id: projectId,
    artifact_definition_id: artifactDefinitionId,
    submission_id: submissionId,
    artifact_stage: project.project_stage,
    version,
  });
}

/**
 * Get a project with all its linked artifacts, including definitions and submissions.
 */
export async function getProjectWithArtifacts(projectId: string): Promise<Project | null> {
  return Project.findByPk(projectId, {
    include: [
      {
        model: ProjectArtifact,
        as: 'projectArtifacts',
        include: [
          { model: ArtifactDefinition, as: 'artifactDefinition' },
          { model: AssignmentSubmission, as: 'submission' },
        ],
      },
    ],
  });
}
