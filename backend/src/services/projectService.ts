import Project, { ProjectStage } from '../models/Project';
import ProjectArtifact from '../models/ProjectArtifact';
import { Enrollment, Cohort, UserCurriculumProfile, ArtifactDefinition, AssignmentSubmission } from '../models';
import { sequelize } from '../config/database';

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
    if (active) return active;
  }
  // Legacy accounts created before active_project_id: adopt their existing project.
  const existing = await Project.findOne({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']] });
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
    if (active) return active;
  }
  // Fallback for legacy accounts without an active pointer set yet.
  return Project.findOne({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']] });
}

/** List all projects owned by an enrollment, newest first. */
export async function listProjectsForEnrollment(enrollmentId: string): Promise<Project[]> {
  return Project.findAll({ where: { enrollment_id: enrollmentId }, order: [['created_at', 'DESC']] });
}

/** Switch the active project (must belong to the enrollment). Returns it or null. */
export async function setActiveProject(enrollmentId: string, projectId: string): Promise<Project | null> {
  const project = await Project.findOne({ where: { id: projectId, enrollment_id: enrollmentId } });
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
