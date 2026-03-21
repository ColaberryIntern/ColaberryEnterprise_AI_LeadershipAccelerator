import { ArtifactDefinition, AssignmentSubmission, ProjectArtifact } from '../../models';

interface RequirementRow {
  id: string;
  project_id: string;
  requirement_key: string;
  requirement_text: string;
  source_artifact_id?: string | null;
  github_file_paths?: string[];
  confidence_score?: number;
  status: string;
}

export type ActionType = 'create_artifact' | 'update_artifact' | 'build_feature' | 'fix_issue';

export interface GeneratedAction {
  title: string;
  action_type: ActionType;
  reason: string;
  files_suggested: string[];
  related_artifacts: string[];
  confidence_score: number;
  requirement_key: string;
}

// ---------------------------------------------------------------------------
// Generate an action for a given requirement
// ---------------------------------------------------------------------------

export async function generateAction(
  requirement: RequirementRow,
  projectId: string,
  fileTree: string[]
): Promise<GeneratedAction> {
  const { requirement_key, requirement_text, source_artifact_id, status, github_file_paths } = requirement;

  // Check if there's a linked artifact and its submission state
  let linkedArtifact: ArtifactDefinition | null = null;
  let hasSubmission = false;

  if (source_artifact_id) {
    linkedArtifact = await ArtifactDefinition.findByPk(source_artifact_id);
    if (linkedArtifact) {
      // Check if there's a project artifact with a submission
      const projectArtifact = await ProjectArtifact.findOne({
        where: { project_id: projectId, artifact_definition_id: source_artifact_id },
      });
      if (projectArtifact?.submission_id) {
        const submission = await AssignmentSubmission.findByPk(projectArtifact.submission_id);
        hasSubmission = !!(submission && (submission.status === 'submitted' || submission.status === 'reviewed'));
      }
    }
  }

  // Determine action type
  let action_type: ActionType;
  let title: string;
  let reason: string;
  let confidence_score: number;

  if (!linkedArtifact) {
    // No linked artifact exists for this requirement
    action_type = 'create_artifact';
    title = `Create artifact for: ${truncate(requirement_text, 80)}`;
    reason = `Requirement ${requirement_key} has no linked artifact. An artifact must be created to address this requirement.`;
    confidence_score = 0.9;
  } else if (!hasSubmission) {
    // Artifact exists but no valid submission yet
    action_type = 'update_artifact';
    title = `Complete artifact "${linkedArtifact.name}" for ${requirement_key}`;
    reason = `Artifact "${linkedArtifact.name}" exists but has no completed submission. Submit work to fulfill requirement ${requirement_key}.`;
    confidence_score = 0.85;
  } else if (status === 'unmatched') {
    // Has artifact + submission, but no matching code in GitHub
    action_type = 'build_feature';
    title = `Build feature: ${truncate(requirement_text, 80)}`;
    reason = `Requirement ${requirement_key} is documented but has no matching implementation in the GitHub repository. Code needs to be written.`;
    confidence_score = 0.75;
  } else {
    // status === 'partial' — some implementation exists
    action_type = 'fix_issue';
    title = `Complete implementation: ${truncate(requirement_text, 80)}`;
    reason = `Requirement ${requirement_key} has partial implementation. Confidence: ${Math.round((requirement.confidence_score || 0) * 100)}%. Additional code or fixes needed.`;
    confidence_score = 0.7;
  }

  // Suggest relevant files from GitHub tree
  const files_suggested = suggestFiles(requirement_text, fileTree, github_file_paths || []);

  // Related artifacts
  const related_artifacts: string[] = [];
  if (linkedArtifact) {
    related_artifacts.push(linkedArtifact.name);
  }

  console.log(
    `[NextAction:Generator] ${requirement_key} → ${action_type} (confidence: ${confidence_score})`
  );

  return {
    title,
    action_type,
    reason,
    files_suggested,
    related_artifacts,
    confidence_score,
    requirement_key,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}

function suggestFiles(
  requirementText: string,
  fileTree: string[],
  existingMatches: string[]
): string[] {
  if (existingMatches.length > 0) return existingMatches.slice(0, 5);
  if (fileTree.length === 0) return [];

  // Simple keyword matching to suggest relevant files
  const keywords = requirementText
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const scored: Array<{ path: string; score: number }> = [];
  for (const filePath of fileTree) {
    const pathLower = filePath.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (pathLower.includes(kw)) score++;
    }
    if (score > 0) scored.push({ path: filePath, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.path);
}
