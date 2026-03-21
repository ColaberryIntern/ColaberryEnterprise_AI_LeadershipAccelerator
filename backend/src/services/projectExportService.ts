import { Project, ProjectArtifact, AssignmentSubmission, ArtifactDefinition, RequirementsMap } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getConnection } from './githubService';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// 1. Export Project State
// ---------------------------------------------------------------------------

export async function exportProjectState(enrollmentId: string): Promise<{
  metadata: any;
  artifacts: any[];
  compiled_documents: any[];
  requirements_map: any[];
  github_status: any;
}> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found for this enrollment');

  // Metadata
  const metadata = {
    project_id: project.id,
    enrollment_id: project.enrollment_id,
    organization_name: project.organization_name,
    industry: project.industry,
    primary_business_problem: project.primary_business_problem,
    selected_use_case: project.selected_use_case,
    automation_goal: project.automation_goal,
    project_stage: project.project_stage,
    project_variables: project.project_variables,
    maturity_score: project.maturity_score,
    requirements_completion_pct: project.requirements_completion_pct,
    readiness_score_breakdown: project.readiness_score_breakdown,
    exported_at: new Date().toISOString(),
  };

  // Project artifacts with submission content
  const projectArtifacts = await ProjectArtifact.findAll({
    where: { project_id: project.id },
    include: [
      { model: ArtifactDefinition, as: 'artifactDefinition' },
      { model: AssignmentSubmission, as: 'submission' },
    ],
  });

  const artifacts = projectArtifacts.map((pa: any) => ({
    artifact_name: pa.artifactDefinition?.name,
    artifact_type: pa.artifactDefinition?.artifact_type,
    artifact_category: pa.artifact_category,
    artifact_stage: pa.artifact_stage,
    version: pa.version,
    submission_title: pa.submission?.title,
    submission_content: pa.submission?.content_json,
    submission_status: pa.submission?.status,
    submission_score: pa.submission?.score,
  }));

  // Compiled documents
  const compiledArtifacts = await ArtifactDefinition.findAll({
    where: { artifact_type: 'system_compiled' },
  });
  const compiledIds = compiledArtifacts.map((a) => a.id);
  const compiledSubmissions = compiledIds.length > 0
    ? await AssignmentSubmission.findAll({
        where: {
          enrollment_id: enrollmentId,
          artifact_definition_id: { [Op.in]: compiledIds },
          is_latest: true,
        },
      })
    : [];

  const compiled_documents = compiledSubmissions.map((s) => ({
    document_type: compiledArtifacts.find((a) => a.id === s.artifact_definition_id)?.name?.replace('compiled_', ''),
    content: s.content_json?.text || '',
    compiled_at: s.content_json?.compiled_at,
    version: s.version_number,
  }));

  // Requirements map
  const reqMaps = await RequirementsMap.findAll({
    where: { project_id: project.id },
    order: [['requirement_key', 'ASC']],
  });

  const requirements_map = reqMaps.map((r) => ({
    key: r.requirement_key,
    text: r.requirement_text,
    status: r.status,
    confidence: r.confidence_score,
    file_paths: r.github_file_paths,
    verified_by: r.verified_by,
  }));

  // GitHub status
  const connection = await getConnection(enrollmentId);
  const github_status = connection ? {
    repo_url: connection.repo_url,
    repo_owner: connection.repo_owner,
    repo_name: connection.repo_name,
    language: connection.repo_language,
    file_count: connection.file_count,
    last_sync: connection.last_sync_at,
    recent_commits: (connection.commit_summary_json || []).slice(0, 5),
  } : null;

  return { metadata, artifacts, compiled_documents, requirements_map, github_status };
}

// ---------------------------------------------------------------------------
// 2. Import Project State (Admin Only)
// ---------------------------------------------------------------------------

export async function importProjectState(
  enrollmentId: string,
  stateJson: any
): Promise<{ updated: boolean; variablesRestored: number }> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found for this enrollment');

  const { metadata } = stateJson;
  if (!metadata) throw new Error('Invalid state: missing metadata');

  // Restore project variables and metadata (not stage — that's governed)
  let variablesRestored = 0;
  if (metadata.project_variables && typeof metadata.project_variables === 'object') {
    project.project_variables = {
      ...project.project_variables,
      ...metadata.project_variables,
    };
    variablesRestored = Object.keys(metadata.project_variables).length;
  }

  if (metadata.organization_name) project.organization_name = metadata.organization_name;
  if (metadata.industry) project.industry = metadata.industry;
  if (metadata.primary_business_problem) project.primary_business_problem = metadata.primary_business_problem;
  if (metadata.selected_use_case) project.selected_use_case = metadata.selected_use_case;
  if (metadata.automation_goal) project.automation_goal = metadata.automation_goal;

  await project.save();

  return { updated: true, variablesRestored };
}
