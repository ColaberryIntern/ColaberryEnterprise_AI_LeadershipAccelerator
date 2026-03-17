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

/**
 * Create a project for an enrollment. Uses findOrCreate to prevent duplicates.
 * Pulls organization_name and industry from UserCurriculumProfile if available.
 */
export async function createProjectForEnrollment(enrollmentId: string): Promise<Project> {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    include: [
      { model: Cohort, as: 'cohort' },
      { model: UserCurriculumProfile, as: 'curriculumProfile' },
    ],
  });

  if (!enrollment) {
    throw new Error(`Enrollment not found: ${enrollmentId}`);
  }

  const cohort = (enrollment as any).cohort as Cohort | null;
  if (!cohort?.program_id) {
    throw new Error(`Enrollment ${enrollmentId} has no associated program via cohort`);
  }

  const profile = (enrollment as any).curriculumProfile as UserCurriculumProfile | null;

  const [project] = await Project.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: {
      enrollment_id: enrollmentId,
      program_id: cohort.program_id,
      organization_name: profile?.company_name || enrollment.company || undefined,
      industry: profile?.industry || undefined,
      project_stage: 'discovery',
      project_variables: {},
    },
  });

  return project;
}

/**
 * Get the project for an enrollment, or null if none exists.
 */
export async function getProjectByEnrollment(enrollmentId: string): Promise<Project | null> {
  return Project.findOne({ where: { enrollment_id: enrollmentId } });
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
