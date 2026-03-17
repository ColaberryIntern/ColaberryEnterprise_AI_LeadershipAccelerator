import { AssignmentSubmission, ArtifactDefinition } from '../models';
import { Op } from 'sequelize';

/**
 * Create a new version of an artifact submission.
 * Marks the previous latest as is_latest=false, creates a new submission
 * linked via parent_version_id with incremented version_number.
 */
export async function createNewVersion(
  enrollmentId: string,
  artifactDefinitionId: string,
  content: { content_json?: any; title?: string; file_path?: string; file_name?: string },
  changeSummary?: string,
): Promise<AssignmentSubmission> {
  // Find the current latest submission for this enrollment + artifact
  const previous = await AssignmentSubmission.findOne({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: artifactDefinitionId,
      is_latest: true,
    },
    order: [['version_number', 'DESC']],
  });

  const newVersionNumber = previous ? previous.version_number + 1 : 1;

  // Mark previous as no longer latest
  if (previous) {
    await previous.update({ is_latest: false });
  }

  // Compute diff if we have a previous version with content_json
  let diffJson: any = null;
  if (previous && content.content_json && previous.content_json) {
    diffJson = computeDiff(previous.content_json, content.content_json);
  }

  // Create new versioned submission
  const newSubmission = await AssignmentSubmission.create({
    enrollment_id: enrollmentId,
    artifact_definition_id: artifactDefinitionId,
    assignment_type: previous?.assignment_type || 'build_lab',
    title: content.title || previous?.title || 'Artifact Submission',
    content_json: content.content_json || null,
    file_path: content.file_path || null,
    file_name: content.file_name || null,
    status: 'submitted',
    submitted_at: new Date(),
    version_number: newVersionNumber,
    parent_version_id: previous?.id || null,
    is_latest: true,
    change_summary: changeSummary || null,
    diff_json: diffJson,
    session_id: previous?.session_id || null,
  } as any);

  return newSubmission;
}

/**
 * Get the full version history for an enrollment + artifact definition.
 * Returns ordered v1 → v2 → v3 chain.
 */
export async function getVersionHistory(
  enrollmentId: string,
  artifactDefinitionId: string,
): Promise<{
  id: string;
  version_number: number;
  created_at: Date;
  submitted_at: Date | null;
  score: number | null;
  status: string;
  change_summary: string | null;
  is_latest: boolean;
  parent_version_id: string | null;
}[]> {
  const submissions = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: artifactDefinitionId,
    },
    order: [['version_number', 'ASC']],
    attributes: [
      'id', 'version_number', 'created_at', 'submitted_at',
      'score', 'status', 'change_summary', 'is_latest', 'parent_version_id',
    ],
  });

  return submissions.map(s => ({
    id: s.id,
    version_number: s.version_number,
    created_at: s.created_at,
    submitted_at: s.submitted_at || null,
    score: s.score || null,
    status: s.status,
    change_summary: s.change_summary || null,
    is_latest: s.is_latest,
    parent_version_id: s.parent_version_id || null,
  }));
}

/**
 * Compare two submission versions by ID.
 * Returns a diff object showing field-level changes.
 */
export async function diffVersions(
  versionAId: string,
  versionBId: string,
): Promise<{
  versionA: { id: string; version_number: number };
  versionB: { id: string; version_number: number };
  changes: {
    content_json: any;
    file_changed: boolean;
    score_change: { from: number | null; to: number | null } | null;
  };
}> {
  const [a, b] = await Promise.all([
    AssignmentSubmission.findByPk(versionAId),
    AssignmentSubmission.findByPk(versionBId),
  ]);

  if (!a) throw new Error(`Version A not found: ${versionAId}`);
  if (!b) throw new Error(`Version B not found: ${versionBId}`);

  return {
    versionA: { id: a.id, version_number: a.version_number },
    versionB: { id: b.id, version_number: b.version_number },
    changes: {
      content_json: computeDiff(a.content_json, b.content_json),
      file_changed: (a.file_path || '') !== (b.file_path || ''),
      score_change: a.score !== b.score
        ? { from: a.score || null, to: b.score || null }
        : null,
    },
  };
}

/**
 * Get the artifact version history formatted for API response.
 * Alias for getVersionHistory — included for explicit endpoint naming.
 */
export async function getArtifactVersionHistory(
  enrollmentId: string,
  artifactDefinitionId: string,
) {
  return getVersionHistory(enrollmentId, artifactDefinitionId);
}

/**
 * Compute a simple field-level diff between two content_json objects.
 * Returns an object with added, removed, and changed keys.
 */
function computeDiff(oldContent: any, newContent: any): any {
  if (!oldContent && !newContent) return null;
  if (!oldContent) return { added: newContent, removed: null, changed: {} };
  if (!newContent) return { added: null, removed: oldContent, changed: {} };

  const allKeys = new Set([
    ...Object.keys(oldContent || {}),
    ...Object.keys(newContent || {}),
  ]);

  const added: Record<string, any> = {};
  const removed: Record<string, any> = {};
  const changed: Record<string, { from: any; to: any }> = {};

  for (const key of allKeys) {
    const oldVal = oldContent[key];
    const newVal = newContent[key];

    if (oldVal === undefined && newVal !== undefined) {
      added[key] = newVal;
    } else if (oldVal !== undefined && newVal === undefined) {
      removed[key] = oldVal;
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changed[key] = { from: oldVal, to: newVal };
    }
  }

  const hasChanges = Object.keys(added).length > 0 ||
    Object.keys(removed).length > 0 ||
    Object.keys(changed).length > 0;

  return hasChanges ? { added, removed, changed } : null;
}
