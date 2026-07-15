/**
 * studentPromptService — generates per-task Claude Code prompts scoped to
 * the student's project and GitHub repo.
 *
 * Adapts runMyDayPromptService: strips all BC/Ali-specific tools
 * (sendWithBcAttach, cb-context-walker, Gmail MCP, Drive MCP, Calendar MCP)
 * and replaces them with: student GitHub repo, curriculum docs, local files.
 *
 * Design: deterministic templates per requirement category. No LLM.
 */

export type ReqCategory = 'build' | 'integrate' | 'deploy' | 'test' | 'design' | 'default';

export interface RequirementForPrompt {
  id: string;
  requirement_key: string;
  requirement_text: string;
  status: string;
  category: ReqCategory;
  urgency_score: number;
  github_file_paths: string[];
  github_repo_url: string | null;
  project_name: string | null;
  organization_name: string | null;
}

const FALLBACK_REPO = 'your project GitHub repo';

const CURRICULUM_DOCS = [
  'STUDENT_PLATFORM_BUILD_SPEC.md — 12-week build checklist',
  'STUDENT_PLATFORM_STRATEGY.md — operating model + week themes',
  'STUDENT_PLATFORM_BLUEPRINT.html — system architecture reference',
];

function buildWhatYouHave(repoUrl: string | null): string {
  const repo = repoUrl || FALLBACK_REPO;
  const cloneHint = repoUrl
    ? `  (if not cloned locally: \`git clone ${repoUrl}\`, then open that folder in Claude Code)`
    : '  (connect your GitHub repo at advisor.colaberry.ai to get the clone URL)';
  return [
    '## What you have access to in this session',
    `- Project repository: ${repo}`,
    cloneHint,
    '- Your local project files — Claude Code reads these automatically',
    '- Program curriculum reference (at advisor.colaberry.ai / your program portal):',
    ...CURRICULUM_DOCS.map((d) => `  - ${d}`),
    '- Claude Code built-in tools: file read/write, bash, web search',
  ].join('\n');
}

function filePathsLine(filePaths: string[]): string {
  if (!filePaths.length) return '';
  return `\n   Relevant files: ${filePaths.join(', ')}`;
}

const ACTION_BLOCKS: Record<ReqCategory, (text: string, filePaths: string[]) => string> = {
  build: (text, fps) => `## What I want you to do
1. Read the existing codebase to understand the patterns in use.${filePathsLine(fps)}
2. Implement this requirement: ${text}
3. Follow the existing patterns — no new dependencies without confirming with me first.
4. Write a test if the logic is non-trivial (happy path minimum).
5. Commit: \`feat: <what you built>\`
6. Push to GitHub when done.`,

  integrate: (text, fps) => `## What I want you to do
1. Check whether any relevant env vars or API credentials are already configured in the project.${filePathsLine(fps)}
2. Implement this integration: ${text}
3. Add an explicit timeout (30s max) and an error handler on the external call.
4. Test the happy path locally — confirm the API responds correctly.
5. Commit: \`feat: integrate <service name>\`
6. Push to GitHub when done.`,

  deploy: (text, fps) => `## What I want you to do
1. Review the current Dockerfile and docker-compose if present.${filePathsLine(fps)}
2. Set up deployment for: ${text}
3. Test that the container builds cleanly (\`docker build .\`).
4. Commit: \`chore: add deployment config for <service>\`
5. Push to GitHub when done.`,

  test: (text, fps) => `## What I want you to do
1. Identify the function or module to test.${filePathsLine(fps)}
2. Write tests for: ${text}
   - Happy path: expected inputs produce expected outputs.
   - One failure path: bad input or dependency error.
3. Run tests locally to confirm they pass.
4. Commit: \`test: add coverage for <what you tested>\`
5. Push to GitHub when done.`,

  design: (text, fps) => `## What I want you to do
1. Identify the component or page that needs this design work.${filePathsLine(fps)}
2. Build the UI for: ${text}
3. Use existing component patterns — no new design system or external dependencies.
4. Verify it renders correctly on a 1280px viewport.
5. Commit: \`feat(ui): <what you built>\`
6. Push to GitHub when done.`,

  default: (text, fps) => `## What I want you to do
1. Read the codebase to understand the context for this requirement.${filePathsLine(fps)}
2. Complete this requirement: ${text}
3. Verify it works as described before committing.
4. Commit your changes with a descriptive message.
5. Push to GitHub when done.`,
};

const STOP_CONDITIONS = `## Stop conditions
- Stop and ask me if: you cannot find the file or context referenced, or the requirement is ambiguous.
- Stop and ask me if: the change would delete or overwrite existing data, tests, or configuration.
- Do NOT push to GitHub until local tests pass.`;

export function generateStudentPrompt(req: RequirementForPrompt): string {
  const whatYouHave = buildWhatYouHave(req.github_repo_url);
  const safeText = req.requirement_text.replace(/"/g, '\\"');
  const actionBlock = ACTION_BLOCKS[req.category](safeText, req.github_file_paths);

  const projectParts: string[] = [];
  if (req.organization_name) projectParts.push(req.organization_name);
  if (req.project_name) projectParts.push(req.project_name);
  const projectLine = projectParts.length
    ? `- Project: **${projectParts.join(' — ')}**`
    : '';

  return [
    `# Student task: ${req.requirement_key}`,
    '',
    '## Requirement context',
    projectLine,
    `- Requirement: ${req.requirement_text}`,
    `- Status: ${req.status}`,
    `- Urgency: ${req.urgency_score}/100`,
    `- Category: ${req.category}`,
    '',
    whatYouHave,
    '',
    actionBlock,
    '',
    STOP_CONDITIONS,
    '',
    'Start now.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
