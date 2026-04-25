/**
 * Project Setup Service — User-Driven Input Flow
 *
 * Handles the 3-step setup process:
 * 1. Upload requirements document
 * 2. Provide CLAUDE.md
 * 3. Connect GitHub repository
 *
 * Nothing activates until all 3 are provided and the user clicks "Activate."
 */
import Project from '../models/Project';
import { RequirementsMap } from '../models';
import { createProjectForEnrollment, getProjectByEnrollment } from './projectService';
import { connectRepo, fullSync } from './githubService';
import { parseRequirements, matchRequirementsToRepo } from './requirementsMatchingService';

const INITIAL_SETUP_STATUS = {
  requirements_loaded: false,
  claude_md_loaded: false,
  github_connected: false,
  activated: false,
};

// ---------------------------------------------------------------------------
// 1. Ensure project exists with setup_status
// ---------------------------------------------------------------------------

async function ensureProject(enrollmentId: string): Promise<Project> {
  let project = await getProjectByEnrollment(enrollmentId);
  if (project) {
    // If legacy project (no setup_status), leave it alone
    if (project.setup_status === null || project.setup_status === undefined) {
      // Set setup_status for the first time if user hits setup flow
      project.setup_status = { ...INITIAL_SETUP_STATUS };
      // Preserve any existing state
      if (project.requirements_document) project.setup_status.requirements_loaded = true;
      if (project.claude_md_content) project.setup_status.claude_md_loaded = true;
      if (project.github_repo_url) project.setup_status.github_connected = true;
      await project.save();
    }
    return project;
  }

  // Create new project via existing service
  project = await createProjectForEnrollment(enrollmentId);
  project.setup_status = { ...INITIAL_SETUP_STATUS };
  await project.save();
  return project;
}

// ---------------------------------------------------------------------------
// 2. Upload Requirements Document
// ---------------------------------------------------------------------------

export async function uploadRequirements(
  enrollmentId: string,
  content: string
): Promise<{ success: boolean; content_length: number; requirements_preview: number }> {
  const project = await ensureProject(enrollmentId);

  project.requirements_document = content;
  const status = { ...(project.setup_status || INITIAL_SETUP_STATUS) };
  status.requirements_loaded = true;
  project.setup_status = status;
  await project.save();

  // Quick parse to show count
  const parsed = parseRequirements(content);

  return {
    success: true,
    content_length: content.length,
    requirements_preview: parsed.length,
  };
}

// ---------------------------------------------------------------------------
// 3. Upload CLAUDE.md
// ---------------------------------------------------------------------------

export async function uploadClaudeMd(
  enrollmentId: string,
  content: string
): Promise<{ success: boolean; content_length: number }> {
  const project = await ensureProject(enrollmentId);

  project.claude_md_content = content;
  const status = { ...(project.setup_status || INITIAL_SETUP_STATUS) };
  status.claude_md_loaded = true;
  project.setup_status = status;
  await project.save();

  return { success: true, content_length: content.length };
}

// ---------------------------------------------------------------------------
// 4. Connect GitHub Repository
// ---------------------------------------------------------------------------

export async function connectGitHub(
  enrollmentId: string,
  repoUrl: string,
  accessToken?: string
): Promise<{ success: boolean; repo_url: string }> {
  const project = await ensureProject(enrollmentId);

  // Use existing githubService
  await connectRepo(enrollmentId, repoUrl, accessToken);

  project.github_repo_url = repoUrl;
  const status = { ...(project.setup_status || INITIAL_SETUP_STATUS) };
  status.github_connected = true;
  project.setup_status = status;
  await project.save();

  return { success: true, repo_url: repoUrl };
}

// ---------------------------------------------------------------------------
// 5. Activate Project
// ---------------------------------------------------------------------------

export async function activateProject(enrollmentId: string): Promise<{
  success: boolean;
  requirements_count: number;
  matched_count: number;
  file_count: number;
}> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const status = project.setup_status;
  if (!status) throw new Error('Project has no setup status');
  if (!status.requirements_loaded) throw new Error('Requirements document not uploaded yet');
  // claude_md_loaded no longer required for activation (hidden from user flow)
  if (!status.github_connected) throw new Error('GitHub repository not connected yet');

  let requirementsCount = 0;
  let matchedCount = 0;
  let fileCount = 0;

  // Step 1: Parse requirements into RequirementsMap
  if (project.requirements_document) {
    const parsed = parseRequirements(project.requirements_document);
    requirementsCount = parsed.length;

    // Clear any existing requirements for this project
    await RequirementsMap.destroy({ where: { project_id: project.id } });

    // Create RequirementsMap rows
    for (const req of parsed) {
      await RequirementsMap.create({
        project_id: project.id,
        requirement_key: req.key,
        requirement_text: req.text,
        status: 'unmatched',
        github_file_paths: [],
        confidence_score: 0,
      } as any);
    }
  }

  // Step 1b: Cluster requirements into Capability → Feature hierarchy
  try {
    const { parseRequirementsWithSections } = require('./requirementsParserService');
    const { clusterRequirements, persistHierarchy } = require('./requirementClusteringService');
    const parsedWithSections = parseRequirementsWithSections(project.requirements_document);
    const hierarchy = await clusterRequirements(project.id, parsedWithSections, enrollmentId);
    await persistHierarchy(project.id, hierarchy);
  } catch (err) {
    console.warn('[ProjectSetup] Clustering failed (non-critical):', (err as Error).message);
  }

  // Step 2: Sync GitHub file tree
  try {
    const syncResult = await fullSync(enrollmentId);
    fileCount = syncResult.fileCount;
  } catch (err) {
    console.warn('[ProjectSetup] GitHub sync failed (non-critical):', (err as Error).message);
  }

  // Step 3: Match requirements to repo files
  try {
    const matchResult = await matchRequirementsToRepo(project.id);
    matchedCount = (matchResult as any)?.matched || 0;
  } catch (err) {
    console.warn('[ProjectSetup] Requirements matching failed (non-critical):', (err as Error).message);
  }

  // Step 4: Activate
  project.setup_status = { ...status, activated: true };
  project.project_stage = 'implementation';
  await project.save();

  return { success: true, requirements_count: requirementsCount, matched_count: matchedCount, file_count: fileCount };
}

// ---------------------------------------------------------------------------
// 6. Get Setup Status
// ---------------------------------------------------------------------------

export async function getSetupStatus(enrollmentId: string): Promise<{
  has_project: boolean;
  setup_status: typeof INITIAL_SETUP_STATUS | null;
}> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) {
    return { has_project: false, setup_status: null };
  }
  return {
    has_project: true,
    setup_status: project.setup_status || null,
  };
}
