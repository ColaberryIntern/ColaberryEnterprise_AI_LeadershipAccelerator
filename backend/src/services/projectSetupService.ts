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
import { RequirementsMap, Capability } from '../models';
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
// 4b. Finalize a generated requirements document (shared by the Workflow
//     build poller, the architect-status poll, and any server-side completion).
//     Saves the doc, flips requirements_loaded, then runs build-out. Idempotent:
//     skips the save if already loaded, skips activation if already activated.
//     activateProject throws on a 0-capability result, so a transient clustering
//     failure leaves the project un-activated and the caller can retry.
// ---------------------------------------------------------------------------

export async function finalizeRequirementsDocument(
  enrollmentId: string,
  project: Project,
  document: string,
): Promise<void> {
  const ss = (project as any).setup_status || {};
  if (!ss.requirements_loaded) {
    if (!document || document.trim().length < 100) {
      throw new Error('Requirements document too short to finalize');
    }
    (project as any).requirements_document = document;
    (project as any).setup_status = { ...ss, requirements_loaded: true };
    (project as any).changed('setup_status', true);
    (project as any).changed('requirements_document', true);
    await project.save();
  }
  const refreshed = (project as any).setup_status || {};
  if (refreshed.requirements_loaded && !refreshed.activated) {
    await activateProject(enrollmentId);
  }
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
  // No repo required: the Workflow tier (and any no-repo build) clusters the
  // document into capabilities without a connected repo. The repo-dependent
  // steps (file sync + matching) below are skipped when there's no connection.
  const hasRepo = !!status.github_connected;

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

  // Step 1b: Cluster requirements into Capability → Feature hierarchy.
  // Clustering is an LLM call that can fail or return nothing on large docs —
  // this previously produced silently "activated" projects with 0 capabilities
  // (the worst outcome after a ~15-min build). Retry once if it yields no
  // capabilities; a persistent 0 is treated as a hard failure below.
  let capabilityCount = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { parseRequirementsWithSections } = require('./requirementsParserService');
      const { clusterRequirements, persistHierarchy } = require('./requirementClusteringService');
      const parsedWithSections = parseRequirementsWithSections(project.requirements_document);
      const hierarchy = await clusterRequirements(project.id, parsedWithSections, enrollmentId);
      await persistHierarchy(project.id, hierarchy);
    } catch (err) {
      console.warn(`[ProjectSetup] Clustering attempt ${attempt} failed:`, (err as Error).message);
    }
    capabilityCount = await Capability.count({ where: { project_id: project.id } });
    if (capabilityCount > 0) break;
    if (attempt < 2) console.warn('[ProjectSetup] Clustering yielded 0 capabilities — retrying once');
  }

  // Steps 2 & 3 only apply when a repo is connected (Full / Autonomous tiers).
  // The Workflow tier has no repo, so we skip file sync + matching entirely.
  if (hasRepo) {
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
  }

  // Step 4: Activate — but only if build-out actually produced capabilities.
  // A 0-capability "activated" project strands the user on an empty system, so
  // leave it un-activated and surface a clear failure the caller can retry.
  if (capabilityCount === 0) {
    throw new Error('Activation produced 0 capabilities — clustering did not yield a hierarchy. Project left un-activated for retry.');
  }
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
