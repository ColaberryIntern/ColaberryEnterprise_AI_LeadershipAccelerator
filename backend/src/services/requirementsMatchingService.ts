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
  verified: number;
}> {
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Get GitHub file tree
  const connection = await getConnection(project.enrollment_id);
  const fileTree: string[] = extractFilePaths(connection?.file_tree_json);

  if (fileTree.length === 0) {
    return { total: 0, matched: 0, partial: 0, unmatched: 0, verified: 0 };
  }

  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId },
  });

  let matched = 0;
  let partial = 0;
  let unmatched = 0;

  // Noise files that should NOT count as real implementations
  const NOISE = new Set(['[id]', 'next-env.d.ts', '.gitignore', '.prettierrc', '.sequelizerc', '.env.example', '.env.production.example', 'package.json', 'tsconfig.json', 'README.md', 'package-lock.json', '.eslintrc.cjs', '.prettierignore', '.dockerignore']);
  const isRealImpl = (f: string) => {
    const name = f.split('/').pop() || f;
    if (NOISE.has(name) || name.startsWith('.')) return false;
    if (/^\d{14}/.test(name)) return false; // migration files
    if (f.includes('node_modules/') || f.includes('dist/') || f.includes('.github/')) return false;
    // Real implementation: source code in recognized patterns across ANY architecture
    // (monolith, microservices, Next.js, Python, Go, etc.)
    const isImplPath = /\/(service|route|controller|handler|gateway|api|server|resolver|model|schema|entity|component|page|view|screen|agent|intelligence|automation|worker|middleware|util|helper|lib|src)\b/i.test(f);
    const isSourceFile = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|cs)$/.test(name);
    return isImplPath && isSourceFile;
  };

  let verified = 0;

  // Pre-filter to implementation files BEFORE keyword matching.
  // This prevents noise files (.gitignore, .eslintrc) from matching on
  // keywords like "error" or "config" and drowning out real matches.
  const implFileTree = fileTree.filter(isRealImpl);
  console.log(`[ReqMatch] ${requirements.length} reqs, ${fileTree.length} total files, ${implFileTree.length} impl files`);

  for (const req of requirements) {
    const { matchedFiles, score } = matchRequirementToFiles(req.requirement_text, implFileTree);

    req.github_file_paths = matchedFiles;
    req.confidence_score = score;

    // Auto-promote to verified if high confidence AND real implementation files exist
    const realFiles = matchedFiles.filter(isRealImpl);
    if (score >= 0.7 && realFiles.length > 0) {
      req.status = 'verified';
      req.verified_by = 'auto-verified';
      verified++;
    } else if (score >= 0.7) {
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

  return { total: requirements.length, matched, partial, unmatched, verified };
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
  projectId: string,
  requirementMapId: string,
  filePaths: string[]
): Promise<RequirementsMap> {
  const req = await RequirementsMap.findOne({ where: { id: requirementMapId, project_id: projectId } });
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

export function parseRequirements(docText: string): Array<{ key: string; text: string }> {
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

    // Extract bold key-value pairs as requirements (skip metadata labels)
    const kvMatch = trimmed.match(/^\*\*(.+?)\*\*:\s*(.+)/);
    if (kvMatch && kvMatch[2].length > 10) {
      const label = kvMatch[1].toLowerCase();
      // Skip common document metadata labels that aren't requirements
      const metadataLabels = new Set([
        'status', 'status code', 'priority', 'dependencies', 'notes', 'input', 'output',
        'components', 'criteria', 'edge cases', 'error', 'demographics', 'goals',
        'technology', 'healthcare', 'manufacturing', 'market demand', 'competitive pressure',
        'purpose', 'implementation', 'user actions', 'ticket', 'session', 'record',
        'entity', 'field', 'table', 'column', 'type', 'description', 'example',
        'response', 'request', 'endpoint', 'method', 'parameters', 'returns',
        'risk', 'impact', 'severity', 'category', 'source', 'target', 'format',
      ]);
      if (metadataLabels.has(label)) continue;
      // Also skip if the value is very short (< 6 words) — likely a label definition, not a requirement
      if (kvMatch[2].split(/\s+/).length < 6) continue;
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
