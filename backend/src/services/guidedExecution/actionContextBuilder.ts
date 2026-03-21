import { NextAction, RequirementsMap, ArtifactDefinition } from '../../models';
import { getProjectByEnrollment } from '../projectService';
import { getConnection } from '../githubService';
import { getRequirementsStatus } from '../requirementsMatchingService';

export interface ActionContext {
  tech_stack: string[];
  missing_components: string[];
  related_artifacts: string[];
  difficulty_level: 'low' | 'medium' | 'high';
  project_stage: string;
  repo_language: string | null;
  file_count: number;
  requirement_text: string;
  files_suggested: string[];
  action_type: string;
}

const DIFFICULTY_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  create_artifact: 'low',
  update_artifact: 'medium',
  build_feature: 'high',
  fix_issue: 'high',
};

export async function buildActionContext(
  enrollmentId: string,
  actionId: string
): Promise<ActionContext> {
  const action = await NextAction.findByPk(actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);

  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  // GitHub connection for tech stack info
  const connection = await getConnection(enrollmentId);
  const repoLanguage = connection?.repo_language || null;
  const fileCount = connection?.file_count || 0;

  // Infer tech stack from repo
  const techStack = inferTechStack(connection?.file_tree_json, repoLanguage);

  // Get unmatched requirements for missing components
  const reqStatus = await getRequirementsStatus(project.id);
  const missingComponents = reqStatus.requirements
    .filter((r: any) => r.status === 'unmatched' || r.status === 'partial')
    .slice(0, 5)
    .map((r: any) => r.requirement_text);

  // Related artifacts from action metadata + lookup
  const relatedArtifacts = action.metadata?.related_artifacts || [];

  // Get requirement text for this action
  const reqKey = action.metadata?.requirement_key;
  let requirementText = '';
  if (reqKey) {
    const req = reqStatus.requirements.find((r: any) => r.requirement_key === reqKey);
    if (req) requirementText = (req as any).requirement_text || '';
  }

  console.log(
    `[GuidedExecution:Context] Built context for action ${actionId}: ${techStack.join(', ')} | ${DIFFICULTY_MAP[action.action_type] || 'medium'}`
  );

  return {
    tech_stack: techStack,
    missing_components: missingComponents,
    related_artifacts: relatedArtifacts,
    difficulty_level: DIFFICULTY_MAP[action.action_type] || 'medium',
    project_stage: project.project_stage,
    repo_language: repoLanguage,
    file_count: fileCount,
    requirement_text: requirementText,
    files_suggested: action.metadata?.files_suggested || [],
    action_type: action.action_type,
  };
}

function inferTechStack(fileTreeJson: any, repoLanguage: string | null): string[] {
  const stack: Set<string> = new Set();

  if (repoLanguage) stack.add(repoLanguage);

  if (!fileTreeJson?.tree) return Array.from(stack);

  const files = fileTreeJson.tree as Array<{ path: string; type: string }>;
  const hasFile = (name: string) => files.some((f) => f.path?.endsWith(name));

  if (hasFile('package.json')) stack.add('Node.js');
  if (hasFile('tsconfig.json')) stack.add('TypeScript');
  if (hasFile('requirements.txt') || hasFile('setup.py') || hasFile('pyproject.toml')) stack.add('Python');
  if (hasFile('Dockerfile') || hasFile('docker-compose.yml')) stack.add('Docker');
  if (hasFile('.github/workflows')) stack.add('GitHub Actions');
  if (hasFile('Makefile')) stack.add('Make');
  if (hasFile('go.mod')) stack.add('Go');
  if (hasFile('Cargo.toml')) stack.add('Rust');

  // Detect frameworks from file patterns
  const paths = files.map((f) => f.path || '');
  if (paths.some((p) => p.includes('src/components/') || p.includes('.tsx'))) stack.add('React');
  if (paths.some((p) => p.includes('express') || p.includes('server.ts'))) stack.add('Express');
  if (paths.some((p) => p.includes('next.config'))) stack.add('Next.js');
  if (paths.some((p) => p.includes('django') || p.includes('manage.py'))) stack.add('Django');
  if (paths.some((p) => p.includes('flask'))) stack.add('Flask');

  return Array.from(stack);
}
