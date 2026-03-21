import { RequirementsMap, Project, AssignmentSubmission, ArtifactDefinition } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getConnection } from './githubService';

// ---------------------------------------------------------------------------
// 1. Extract Requirements from compiled requirements.md
// ---------------------------------------------------------------------------

export async function extractRequirements(projectId: string): Promise<{
  total: number;
  created: number;
  updated: number;
}> {
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Find the compiled requirements document
  const systemArtifact = await ArtifactDefinition.findOne({
    where: { name: 'compiled_requirements', artifact_type: 'system_compiled' },
  });

  if (!systemArtifact) {
    throw new Error('Requirements document has not been compiled yet. Run compile first.');
  }

  const submission = await AssignmentSubmission.findOne({
    where: {
      enrollment_id: project.enrollment_id,
      artifact_definition_id: systemArtifact.id,
      is_latest: true,
    },
  });

  if (!submission || !submission.content_json?.text) {
    throw new Error('No compiled requirements document found. Run compile first.');
  }

  const docText: string = submission.content_json.text;

  // Parse requirements from markdown headings and bullets
  const requirements = parseRequirements(docText);

  let created = 0;
  let updated = 0;

  for (const req of requirements) {
    const [record, wasCreated] = await RequirementsMap.findOrCreate({
      where: { project_id: projectId, requirement_key: req.key },
      defaults: {
        project_id: projectId,
        requirement_key: req.key,
        requirement_text: req.text,
        status: 'unmatched',
        confidence_score: 0,
      },
    });

    if (wasCreated) {
      created++;
    } else if (record.requirement_text !== req.text) {
      record.requirement_text = req.text;
      await record.save();
      updated++;
    }
  }

  return { total: requirements.length, created, updated };
}

// ---------------------------------------------------------------------------
// 2. Match Requirements to GitHub Repo
// ---------------------------------------------------------------------------

export async function matchRequirementsToRepo(projectId: string): Promise<{
  total: number;
  matched: number;
  partial: number;
  unmatched: number;
}> {
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Get GitHub file tree
  const connection = await getConnection(project.enrollment_id);
  const fileTree: string[] = extractFilePaths(connection?.file_tree_json);

  if (fileTree.length === 0) {
    return { total: 0, matched: 0, partial: 0, unmatched: 0 };
  }

  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId },
  });

  let matched = 0;
  let partial = 0;
  let unmatched = 0;

  for (const req of requirements) {
    const { matchedFiles, score } = matchRequirementToFiles(req.requirement_text, fileTree);

    req.github_file_paths = matchedFiles;
    req.confidence_score = score;

    if (score >= 0.7) {
      req.status = 'matched';
      req.verified_by = 'auto';
      matched++;
    } else if (score >= 0.3) {
      req.status = 'partial';
      req.verified_by = 'auto';
      partial++;
    } else {
      req.status = 'unmatched';
      unmatched++;
    }

    await req.save();
  }

  return { total: requirements.length, matched, partial, unmatched };
}

// ---------------------------------------------------------------------------
// 3. Requirements Status
// ---------------------------------------------------------------------------

export async function getRequirementsStatus(projectId: string): Promise<{
  total: number;
  matched: number;
  partial: number;
  unmatched: number;
  verified: number;
  overallScore: number;
  requirements: RequirementsMap[];
}> {
  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId },
    order: [['requirement_key', 'ASC']],
  });

  const matched = requirements.filter((r) => r.status === 'matched').length;
  const partial = requirements.filter((r) => r.status === 'partial').length;
  const unmatched = requirements.filter((r) => r.status === 'unmatched').length;
  const verified = requirements.filter((r) => r.status === 'verified').length;
  const total = requirements.length;

  const overallScore = total > 0
    ? (matched + verified + partial * 0.5) / total
    : 0;

  return { total, matched, partial, unmatched, verified, overallScore, requirements };
}

// ---------------------------------------------------------------------------
// 4. Manual Match
// ---------------------------------------------------------------------------

export async function manualMatch(
  requirementMapId: string,
  filePaths: string[]
): Promise<RequirementsMap> {
  const req = await RequirementsMap.findByPk(requirementMapId);
  if (!req) throw new Error(`Requirement not found: ${requirementMapId}`);

  req.github_file_paths = filePaths;
  req.status = filePaths.length > 0 ? 'verified' : 'unmatched';
  req.verified_by = 'manual';
  req.confidence_score = filePaths.length > 0 ? 1.0 : 0;
  await req.save();

  return req;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRequirements(docText: string): Array<{ key: string; text: string }> {
  const requirements: Array<{ key: string; text: string }> = [];
  const lines = docText.split('\n');
  let reqIndex = 0;
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Track section headers
    const h2Match = trimmed.match(/^##\s+(.+)/);
    if (h2Match) {
      currentSection = h2Match[1].replace(/[^a-zA-Z0-9]+/g, '_').substring(0, 30);
      continue;
    }

    // Extract bullet points as requirements
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch && bulletMatch[1].length > 10) {
      reqIndex++;
      const key = `REQ-${String(reqIndex).padStart(3, '0')}`;
      requirements.push({ key, text: bulletMatch[1] });
      continue;
    }

    // Extract bold key-value pairs as requirements
    const kvMatch = trimmed.match(/^\*\*(.+?)\*\*:\s*(.+)/);
    if (kvMatch && kvMatch[2].length > 10) {
      reqIndex++;
      const key = `REQ-${String(reqIndex).padStart(3, '0')}`;
      requirements.push({ key, text: `${kvMatch[1]}: ${kvMatch[2]}` });
    }
  }

  return requirements;
}

function extractFilePaths(fileTreeJson: any): string[] {
  if (!fileTreeJson) return [];
  if (Array.isArray(fileTreeJson)) {
    // GitHub tree API returns { tree: [{ path, type }] }
    return fileTreeJson.map((item: any) => item.path || item).filter(Boolean);
  }
  if (fileTreeJson.tree && Array.isArray(fileTreeJson.tree)) {
    return fileTreeJson.tree.map((item: any) => item.path).filter(Boolean);
  }
  return [];
}

function matchRequirementToFiles(
  requirementText: string,
  filePaths: string[]
): { matchedFiles: string[]; score: number } {
  // Tokenize requirement into keywords
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'must', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'and', 'or', 'but', 'not', 'no', 'that', 'this', 'it', 'its', 'all',
    'each', 'every', 'any', 'some', 'which', 'who', 'what', 'when', 'where',
    'how', 'than', 'then', 'also', 'very', 'just', 'about', 'up', 'out',
  ]);

  const keywords = requirementText
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) return { matchedFiles: [], score: 0 };

  const matchedFiles: string[] = [];

  for (const filePath of filePaths) {
    const pathLower = filePath.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const pathTokens = pathLower.split(/\s+/);

    let matchCount = 0;
    for (const keyword of keywords) {
      if (pathTokens.some((t) => t.includes(keyword) || keyword.includes(t))) {
        matchCount++;
      }
    }

    const overlap = matchCount / keywords.length;
    if (overlap >= 0.3) {
      matchedFiles.push(filePath);
    }
  }

  const score = matchedFiles.length > 0
    ? Math.min(1.0, matchedFiles.length / Math.max(1, keywords.length * 0.3))
    : 0;

  return { matchedFiles: matchedFiles.slice(0, 20), score: Math.round(score * 100) / 100 };
}
