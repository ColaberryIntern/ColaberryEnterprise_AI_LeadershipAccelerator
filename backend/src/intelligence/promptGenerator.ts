/**
 * Prompt Generator — project-aware, Claude Code compatible prompts.
 *
 * Prompts are dynamically built from the project's own repo structure,
 * system prompt, and process metadata. No hardcoded file paths or
 * framework assumptions — the repo tree tells Claude where things live.
 */
import Capability from '../models/Capability';
import { analyzeProcessEvolution } from './agentEvolutionEngine';

export type PromptTarget = 'backend_improvement' | 'frontend_exposure' | 'agent_enhancement' | 'hitl_adjustment' | 'autonomy_upgrade' | 'monitoring_gap' | 'requirement_implementation' | 'add_database' | 'improve_reliability' | 'verify_requirements' | 'optimize_performance';

export interface GeneratedPrompt {
  target: PromptTarget;
  title: string;
  prompt_text: string;
  estimated_complexity: 'small' | 'medium' | 'large';
  affected_files: string[];
}

export interface ProjectContext {
  repoFileTree?: string[];
  systemPrompt?: string;
  repoUrl?: string;
  projectName?: string;
}

function buildCodebaseSection(ctx: ProjectContext): string {
  if (!ctx.repoFileTree || ctx.repoFileTree.length === 0) {
    return '# CODEBASE\n\nNo repo file tree available. Study the codebase manually before making changes.\n';
  }
  const tree = ctx.repoFileTree;
  // Show top-level directories + key files for orientation
  const dirs = new Set<string>();
  const keyFiles: string[] = [];
  for (const f of tree) {
    const parts = f.split('/');
    if (parts.length >= 2) dirs.add(parts[0] + '/');
    const name = parts[parts.length - 1] || '';
    if (/^(package\.json|Dockerfile|docker-compose|\.env|README|CLAUDE\.md|Cargo\.toml|requirements\.txt|pyproject\.toml|go\.mod|Makefile)/i.test(name)) {
      keyFiles.push(f);
    }
  }
  // Summarize file counts per top-level dir
  const dirCounts: Record<string, number> = {};
  for (const f of tree) {
    const top = f.split('/')[0] + '/';
    dirCounts[top] = (dirCounts[top] || 0) + 1;
  }
  const dirSummary = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([d, c]) => `  ${d} (${c} files)`)
    .join('\n');

  return `# CODEBASE STRUCTURE (${tree.length} files)\n\nTop-level directories:\n${dirSummary}\n\nKey files:\n${keyFiles.slice(0, 20).map(f => `  ${f}`).join('\n')}\n\nStudy the existing patterns, naming conventions, and framework choices before making changes. Follow what already exists.\n`;
}

function buildProjectSection(ctx: ProjectContext): string {
  const parts: string[] = [];
  if (ctx.projectName) parts.push(`Project: ${ctx.projectName}`);
  if (ctx.repoUrl) parts.push(`Repo: ${ctx.repoUrl}`);
  if (ctx.systemPrompt) parts.push(`\n## Project System Prompt\n\n${ctx.systemPrompt}`);
  return parts.length > 0 ? `# PROJECT CONTEXT\n\n${parts.join('\n')}\n` : '';
}

function buildPreamble(): string {
  return `You are operating in Claude Code PLAN MODE.\n\nDO NOT start coding immediately. Study the codebase first, then produce a detailed implementation plan.\n\n`;
}

function buildConstraints(): string {
  return `\n\n# CONSTRAINTS\n- Follow existing patterns in the codebase — do not introduce new frameworks or conventions\n- DO NOT break existing functionality\n- All changes must be additive\n- Match the language, style, and conventions already used in the repo\n- Study the codebase structure before proposing file paths\n`;
}

function buildValidation(processName: string): string {
  return `\n\n# VALIDATION REPORT (REQUIRED AT END)\n\nAfter implementation, output this EXACT format so the system can sync:\n\n\`\`\`\nVALIDATION REPORT\n\nFiles Created:\n- path/to/file1\n- path/to/file2\n\nRoutes:\n- GET /api/...\n- POST /api/...\n\nDatabase:\n- TableName (if any)\n\nStatus: COMPLETE\n\`\`\`\n\nThen run:\n\`\`\`\ngit add .\ngit commit -m "Implement ${processName}"\ngit push origin main\n\`\`\`\n`;
}

function describeExisting(backend: string[], frontend: string[], agents: string[]): string {
  const parts: string[] = [];
  if (backend.length > 0) parts.push(`Existing backend files: ${backend.slice(0, 10).join(', ')}`);
  if (frontend.length > 0) parts.push(`Existing frontend files: ${frontend.slice(0, 10).join(', ')}`);
  if (agents.length > 0) parts.push(`Existing agents: ${agents.slice(0, 10).join(', ')}`);
  return parts.length > 0 ? parts.join('\n') : 'No existing implementation files detected yet.';
}

export async function generateImprovementPrompt(
  processId: string,
  target: PromptTarget,
  extraContext?: any,
  projectContext?: ProjectContext,
): Promise<GeneratedPrompt> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');

  const ctx = projectContext || {};
  const scores = process.strength_scores || {};
  const agents = process.linked_agents || [];
  const backend = process.linked_backend_services || [];
  const frontend = process.linked_frontend_components || [];
  const evolution = await analyzeProcessEvolution(processId);

  const preamble = buildPreamble();
  const codebase = buildCodebaseSection(ctx);
  const project = buildProjectSection(ctx);
  const constraints = buildConstraints();
  const validation = buildValidation(process.name);
  const existing = describeExisting(backend, frontend, agents);

  const generators: Record<PromptTarget, () => GeneratedPrompt> = {
    backend_improvement: () => ({
      target: 'backend_improvement',
      title: `Build backend for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nBuild the backend services and API routes for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n${existing}\nDeterminism: ${scores.determinism || 0}/10, Reliability: ${scores.reliability || 0}/10\nGaps: ${evolution.improvement_areas.slice(0, 5).join('; ') || 'None identified'}\n\n# WHAT TO BUILD\n\n1. Study the existing backend structure in the repo and follow its patterns\n2. Create a new service with core business logic for this process\n3. Create API routes following the existing routing pattern\n4. Create database model(s) if needed, following the existing ORM pattern\n5. Register routes in the appropriate router file\n6. Add structured logging for observability${constraints}${validation}`,
      estimated_complexity: 'medium',
      affected_files: [],
    }),

    frontend_exposure: () => ({
      target: 'frontend_exposure',
      title: `Build UI for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nCreate the frontend UI for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n${existing}\n\n# WHAT TO BUILD\n\n1. Study the existing frontend structure and component patterns\n2. Create a page component following the existing page pattern\n3. Add a route in the existing router configuration\n4. Add a navigation link if the app has a sidebar or nav\n5. Connect to the backend API using the existing API client pattern\n\n# UI GUIDELINES\n\n- Match the existing design system and component library used in the repo\n- Follow the existing layout patterns (sidebar, cards, tables, etc.)\n- Ensure responsive design${constraints}${validation}`,
      estimated_complexity: 'medium',
      affected_files: [],
    }),

    agent_enhancement: () => ({
      target: 'agent_enhancement',
      title: `Add AI agent for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nBuild an AI agent to automate the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n${existing}\nAgent gaps: ${evolution.agent_recommendations.map(r => r.agent_name + ': ' + r.recommendations[0]).join('; ') || 'None identified'}\n\n# WHAT TO BUILD\n\n1. Study existing agent patterns in the repo (if any)\n2. Create an agent that automates the core logic of this process\n3. Register it in any existing agent registry or configuration\n4. Ensure it logs its activity for observability\n5. Implement error handling and retry logic\n6. Make operations idempotent (safe to rerun)${constraints}${validation}`,
      estimated_complexity: 'large',
      affected_files: [],
    }),

    hitl_adjustment: () => ({
      target: 'hitl_adjustment',
      title: `Adjust HITL controls for ${process.name}`,
      prompt_text: `${project}${codebase}# OBJECTIVE\n\nAdjust the Human-in-the-Loop controls for "${process.name}".\n\nCurrent HITL config: ${JSON.stringify(process.hitl_config || {})}\nCurrent autonomy level: ${process.autonomy_level}\nApproval dependency: ${((process.approval_dependency_pct || 0) * 100).toFixed(0)}%\n\nRecommendations:\n- If approval rate is too high, consider raising auto-approve confidence threshold\n- If failure rate is high, add more checkpoints\n- Ensure external actions always require approval`,
      estimated_complexity: 'small',
      affected_files: [],
    }),

    autonomy_upgrade: () => ({
      target: 'autonomy_upgrade',
      title: `Upgrade autonomy for ${process.name}`,
      prompt_text: `${project}${codebase}# OBJECTIVE\n\nUpgrade the autonomy level of "${process.name}" from ${process.autonomy_level}.\n\nCurrent metrics:\n- Success rate: ${((process.success_rate || 0) * 100).toFixed(0)}%\n- Failure rate: ${((process.failure_rate || 0) * 100).toFixed(0)}%\n- Confidence: ${((process.confidence_score || 0) * 100).toFixed(0)}%\n\nTo qualify for next level, improve:\n1. Success rate above threshold\n2. Better error handling to reduce failures\n3. Better monitoring to catch issues early\n4. Rollback capability for all agent actions`,
      estimated_complexity: 'medium',
      affected_files: [],
    }),

    monitoring_gap: () => ({
      target: 'monitoring_gap',
      title: `Close monitoring gaps for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nAdd monitoring and observability for "${process.name}".\n\nCurrent Observability score: ${scores.observability || 0}/100\n\nGaps:\n${evolution.missing_monitoring.map(m => `- ${m}`).join('\n')}\n\n# WHAT TO BUILD\n\n1. Study existing monitoring/logging patterns in the repo\n2. Add KPI tracking for this process\n3. Add anomaly detection or alerting if the repo has that pattern\n4. Ensure all actions are logged for audit\n5. Add health check or status endpoint if applicable${constraints}${validation}`,
      estimated_complexity: 'medium',
      affected_files: [],
    }),

    add_database: () => ({
      target: 'add_database' as PromptTarget,
      title: `Add database models for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nAdd database models and data layer for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# WHAT TO BUILD\n\n1. Study the existing ORM/database pattern in the repo\n2. Create model(s) following the existing pattern (primary keys, timestamps, associations)\n3. Add migration if the project uses migrations\n4. Register the model in the appropriate index or config file\n\n# DO NOT\n\n- Drop or recreate existing tables\n- Modify existing model files unless adding associations${constraints}${validation}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    improve_reliability: () => ({
      target: 'improve_reliability' as PromptTarget,
      title: `Improve reliability for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nImprove reliability and error handling for the "${process.name}" business process.\n\n# CURRENT STATE\n\n${existing}\nReliability score: ${scores.reliability || 0}/10\n\n# WHAT TO IMPROVE\n\n1. Add error handling with meaningful error messages\n2. Add input validation at API boundaries\n3. Add retry logic for external calls\n4. Add proper HTTP status codes\n5. Add request/response logging\n6. Add database transactions where needed\n\n# DO NOT\n\n- Rebuild existing services from scratch\n- Change API contracts${constraints}${validation}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    verify_requirements: () => ({
      target: 'verify_requirements' as PromptTarget,
      title: `Verify requirements for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nVerify that auto-matched requirements for "${process.name}" are actually implemented correctly.\n\n# CURRENT STATE\n\n${existing}\n\n# WHAT TO DO\n\n1. Review each auto-matched requirement\n2. Check if the matched file actually fulfills the requirement\n3. For verified matches, confirm the implementation is complete\n4. For gaps, identify what's missing and implement it\n5. Run any existing tests to validate\n\n# DO NOT\n\n- Skip verification — check each match manually\n- Create new infrastructure — only fill gaps in existing code${constraints}${validation}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    optimize_performance: () => ({
      target: 'optimize_performance' as PromptTarget,
      title: `Optimize performance for ${process.name}`,
      prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nOptimize system performance for the "${process.name}" business process.\n\n# CURRENT STATE\n\n${existing}\nQuality: ${Object.entries(scores).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Unknown'}\n\n# WHAT TO IMPROVE\n\n1. Database query optimization (indexes, eager loading)\n2. Caching where appropriate\n3. API response payload optimization\n4. Pagination for list endpoints\n5. Frontend bundle size review\n6. Performance monitoring\n\n# DO NOT\n\n- Premature optimization — measure first\n- Break existing functionality${constraints}${validation}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    requirement_implementation: () => {
      const reqList = extraContext?.unmappedRequirements || [];
      const reqText = reqList.length > 0
        ? reqList.map((r: any, i: number) => `${i + 1}. ${r.requirement_text}`).join('\n')
        : 'No specific requirements loaded — check the Requirements tab for details.';
      return {
        target: 'requirement_implementation' as PromptTarget,
        title: `Implement requirements for ${process.name}`,
        prompt_text: `${preamble}${project}${codebase}# OBJECTIVE\n\nImplement the unmapped requirements for the "${process.name}" business process.\n\nThe project already has existing code. Do NOT rebuild infrastructure. Extend what exists to cover these specific requirements.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# UNMAPPED REQUIREMENTS TO IMPLEMENT\n\n${reqText}\n\n# CURRENT STATE\n\n${existing}\n\n# APPROACH\n\n1. Study the existing codebase structure first\n2. Identify which existing files need to be extended (NOT recreated)\n3. Add new endpoints, services, or components ONLY where they don't exist\n4. Map each requirement to a specific implementation change\n5. Update existing tests or add new ones\n\n# DO NOT\n\n- Create duplicate services or routes that already exist\n- Rebuild the database schema from scratch\n- Create new standalone projects\n- Ignore existing patterns in the codebase${constraints}${validation}`,
        estimated_complexity: 'medium' as const,
        affected_files: [],
      };
    },
  };

  const result = generators[target]();

  try {
    const { getApplicableBlocks } = require('./acceleration/systemBlocks');
    const blocks = getApplicableBlocks(target);
    if (blocks.length > 0) {
      const blockText = blocks.map((b: any) => b.prompt_fragment).join('\n\n');
      result.prompt_text = result.prompt_text.replace(
        '# CONSTRAINTS',
        `${blockText}\n\n# CONSTRAINTS`
      );
    }
  } catch { /* acceleration layer not loaded — non-critical */ }

  return result;
}

export async function generateAllPrompts(processId: string, projectContext?: ProjectContext): Promise<GeneratedPrompt[]> {
  const targets: PromptTarget[] = ['backend_improvement', 'frontend_exposure', 'agent_enhancement', 'hitl_adjustment', 'autonomy_upgrade', 'monitoring_gap'];
  const prompts: GeneratedPrompt[] = [];
  for (const target of targets) {
    try { prompts.push(await generateImprovementPrompt(processId, target, undefined, projectContext)); } catch {}
  }
  return prompts;
}
