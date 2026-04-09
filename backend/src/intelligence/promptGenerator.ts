/**
 * Prompt Generator — template-based, Claude Code compatible prompts for system improvements.
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

export async function generateImprovementPrompt(processId: string, target: PromptTarget, extraContext?: any): Promise<GeneratedPrompt> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');

  const scores = process.strength_scores || {};
  const agents = process.linked_agents || [];
  const backend = process.linked_backend_services || [];
  const frontend = process.linked_frontend_components || [];
  const evolution = await analyzeProcessEvolution(processId);

  const preamble = `You are operating in Claude Code PLAN MODE.\n\nDO NOT start coding immediately. Study the codebase first, then produce a detailed implementation plan.\n\n`;
  const constraints = `\n\n# CONSTRAINTS\n- Follow existing patterns in the codebase\n- DO NOT break existing functionality\n- All changes must be additive\n- Use TypeScript with strict types\n- Follow Bootstrap 5 design system with var(--color-*) tokens\n- Target audience: enterprise executives (clean, professional UI)\n`;
  const validationSection = `\n\n# VALIDATION REPORT (REQUIRED AT END)\n\nAfter implementation, output this EXACT format so the system can sync:\n\n\`\`\`\nVALIDATION REPORT\n\nFiles Created:\n- path/to/file1.ts\n- path/to/file2.ts\n\nRoutes:\n- GET /api/...\n- POST /api/...\n\nDatabase:\n- TableName (if any)\n\nStatus: COMPLETE\n\`\`\`\n\nThen run:\n\`\`\`\ngit add .\ngit commit -m "Implement ${process.name}"\ngit push origin main\n\`\`\`\n`;

  const generators: Record<PromptTarget, () => GeneratedPrompt> = {
    backend_improvement: () => ({
      target: 'backend_improvement',
      title: `Build backend for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nBuild the backend services and API routes for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n- Existing backend services: ${backend.join(', ') || 'NONE — this is a new build'}\n- Current readiness: ${scores.determinism || 0}/10 determinism, ${scores.reliability || 0}/10 reliability\n- Gaps: ${evolution.improvement_areas.slice(0, 5).join('; ') || 'No specific gaps identified'}\n\n# WHAT TO BUILD\n\n1. Create a new service file: \`backend/src/services/${process.name.replace(/[^a-zA-Z]/g, '')}Service.ts\`\n   - Core business logic for this process\n   - Input validation and error handling\n   - Retry logic with exponential backoff\n\n2. Create API routes: \`backend/src/routes/admin/${process.name.replace(/[^a-zA-Z]/g, '').toLowerCase()}Routes.ts\`\n   - RESTful endpoints (GET list, GET detail, POST create, PUT update)\n   - Use \`requireAdmin\` middleware from \`../../middlewares/authMiddleware\`\n   - Follow lazy import pattern: \`const { Service } = await import('../../services/...')\`\n\n3. Create database model if needed: \`backend/src/models/${process.name.replace(/[^a-zA-Z]/g, '')}.ts\`\n   - Sequelize model with UUID primary key\n   - \`sync({ alter: true })\` compatible\n\n4. Register routes in \`backend/src/routes/adminRoutes.ts\`\n\n5. Add structured logging for observability${constraints}${validationSection}`,
      estimated_complexity: 'medium',
      affected_files: [`backend/src/services/${process.name.replace(/[^a-zA-Z]/g, '')}Service.ts`, `backend/src/routes/admin/${process.name.replace(/[^a-zA-Z]/g, '').toLowerCase()}Routes.ts`],
    }),

    frontend_exposure: () => ({
      target: 'frontend_exposure',
      title: `Build UI for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nCreate the frontend UI for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n- Existing frontend components: ${frontend.join(', ') || 'NONE — this is a new build'}\n- Backend API: ${backend.length > 0 ? 'EXISTS (' + backend.join(', ') + ')' : 'NOT YET BUILT — build backend first'}\n\n# WHAT TO BUILD\n\n1. Create page component: \`frontend/src/pages/admin/${process.name.replace(/[^a-zA-Z]/g, '')}Page.tsx\`\n   - React functional component with hooks\n   - Use \`api\` from \`../../utils/api\` for API calls\n   - Bootstrap 5 layout with \`card border-0 shadow-sm\` pattern\n\n2. Add route in \`frontend/src/routes/adminRoutes.tsx\`\n   - Lazy load: \`const Page = lazy(() => import(...))\`\n\n3. Add navigation link in admin sidebar\n\n# UI REQUIREMENTS\n\n- Cards with \`border-0 shadow-sm\` and \`card-header bg-white fw-semibold\`\n- Tables with \`table-responsive > table table-hover mb-0\`\n- Buttons: always \`btn-sm\` in admin UI\n- Colors: use \`var(--color-primary)\`, \`var(--color-accent)\`, etc.\n- Design for enterprise executives aged 35-60: clean, calm, authoritative${constraints}${validationSection}`,
      estimated_complexity: 'medium',
      affected_files: [`frontend/src/pages/admin/${process.name.replace(/[^a-zA-Z]/g, '')}Page.tsx`],
    }),

    agent_enhancement: () => ({
      target: 'agent_enhancement',
      title: `Add AI agent for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nBuild an AI agent to automate the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n- Existing agents: ${agents.join(', ') || 'NONE'}\n- Agent gaps: ${evolution.agent_recommendations.map(r => r.agent_name + ': ' + r.recommendations[0]).join('; ') || 'No specific gaps'}\n\n# WHAT TO BUILD\n\n1. Create agent: \`backend/src/intelligence/agents/${process.name.replace(/[^a-zA-Z]/g, '')}Agent.ts\`\n   - Follow pattern from existing agents (e.g., ActionPlannerAgent.ts)\n   - Export an async executor function\n   - Register in \`agentRegistry.ts\` with category and department\n\n2. Agent must:\n   - Accept structured input (config object)\n   - Return \`AgentExecutionResult\` with success/failure\n   - Log activity to \`AiAgentActivityLog\`\n   - Handle errors gracefully with retry logic\n\n3. Add to agent seed: \`backend/src/services/agentRegistrySeed.ts\`\n   - agent_name, agent_type, department, trigger_type\n\n# AGENT PATTERNS\n\n- Use \`callLLMWithAudit()\` for LLM calls\n- Use \`AiAgentActivityLog.create()\` for execution logging\n- Implement idempotent operations (safe to rerun)${constraints}${validationSection}`,
      estimated_complexity: 'large',
      affected_files: [`backend/src/intelligence/agents/${process.name.replace(/[^a-zA-Z]/g, '')}Agent.ts`],
    }),

    hitl_adjustment: () => ({
      target: 'hitl_adjustment',
      title: `Adjust HITL controls for ${process.name}`,
      prompt_text: `You are adjusting the Human-in-the-Loop controls for "${process.name}".\n\nCurrent HITL config: ${JSON.stringify(process.hitl_config || {})}\nCurrent autonomy level: ${process.autonomy_level}\nApproval dependency: ${((process.approval_dependency_pct || 0) * 100).toFixed(0)}%\n\nRecommendations:\n- If approval rate is too high, consider raising auto-approve confidence threshold\n- If failure rate is high, add more checkpoints\n- Ensure external actions always require approval\n\nUpdate the hitl_config in the database via the admin API.`,
      estimated_complexity: 'small',
      affected_files: ['backend/src/intelligence/hitl/hitlEngine.ts'],
    }),

    autonomy_upgrade: () => ({
      target: 'autonomy_upgrade',
      title: `Upgrade autonomy for ${process.name}`,
      prompt_text: `You are upgrading the autonomy level of "${process.name}" from ${process.autonomy_level}.\n\nCurrent metrics:\n- Success rate: ${((process.success_rate || 0) * 100).toFixed(0)}%\n- Failure rate: ${((process.failure_rate || 0) * 100).toFixed(0)}%\n- Confidence: ${((process.confidence_score || 0) * 100).toFixed(0)}%\n\nTo qualify for next level, improve:\n1. Success rate above threshold\n2. Add better error handling to reduce failures\n3. Improve monitoring to catch issues early\n4. Add rollback capability for all agent actions`,
      estimated_complexity: 'medium',
      affected_files: ['backend/src/intelligence/autonomyProgressionEngine.ts'],
    }),

    monitoring_gap: () => ({
      target: 'monitoring_gap',
      title: `Close monitoring gaps for ${process.name}`,
      prompt_text: `You are adding monitoring and observability for "${process.name}".\n\nCurrent Observability score: ${scores.observability || 0}/100\n\nGaps:\n${evolution.missing_monitoring.map(m => `- ${m}`).join('\n')}\n\nTasks:\n1. Add KPI definitions for this process to kpiService.ts\n2. Add anomaly detection rules\n3. Add alert thresholds for key metrics\n4. Ensure all agent actions are logged to activity trail\n5. Add dashboard widget showing process health`,
      estimated_complexity: 'medium',
      affected_files: ['backend/src/services/reporting/kpiService.ts', 'backend/src/services/risk/anomalyDetectionService.ts'],
    }),

    add_database: () => ({
      target: 'add_database' as PromptTarget,
      title: `Add database models for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nAdd database models and data layer for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# WHAT TO BUILD\n\n1. Create Sequelize model: \`backend/src/models/${process.name.replace(/[^a-zA-Z]/g, '')}.ts\`\n   - UUID primary key\n   - Proper data types and validations\n   - Timestamps (createdAt, updatedAt)\n   - Associations to related models\n\n2. Add migration if needed\n\n3. Ensure model is registered in \`backend/src/models/index.ts\`\n\n# DO NOT\n\n- Drop or recreate existing tables\n- Modify existing model files unless adding associations${constraints}${validationSection}`,
      estimated_complexity: 'medium' as const,
      affected_files: [`backend/src/models/${process.name.replace(/[^a-zA-Z]/g, '')}.ts`],
    }),

    improve_reliability: () => ({
      target: 'improve_reliability' as PromptTarget,
      title: `Improve reliability for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nImprove reliability and error handling for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# CURRENT STATE\n\n- Existing services: ${backend.join(', ') || 'Check backend/src/services/'}\n- Reliability score: ${scores.reliability || 0}/10\n\n# WHAT TO IMPROVE\n\n1. Add try-catch blocks with meaningful error messages\n2. Add input validation at API boundaries\n3. Add retry logic with exponential backoff for external calls\n4. Add proper HTTP status codes (400, 404, 409, 500)\n5. Add request/response logging for debugging\n6. Add database transaction support where needed\n\n# DO NOT\n\n- Rebuild existing services from scratch\n- Change API contracts (keep backward compatibility)${constraints}${validationSection}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    verify_requirements: () => ({
      target: 'verify_requirements' as PromptTarget,
      title: `Verify requirements for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nVerify that auto-matched requirements for "${process.name}" are actually implemented correctly.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# WHAT TO DO\n\n1. Review each auto-matched requirement\n2. Check if the matched implementation file actually fulfills the requirement\n3. For each verified requirement, confirm the implementation is complete\n4. For gaps, identify what's missing and implement it\n5. Run any existing tests to validate\n\n# CURRENT STATE\n\n- Existing backend: ${backend.join(', ') || 'Check backend/src/services/'}\n- Existing frontend: ${frontend.join(', ') || 'Check frontend/src/components/'}\n\n# DO NOT\n\n- Skip verification — check each match manually\n- Create new infrastructure — only fill gaps in existing code${constraints}${validationSection}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    optimize_performance: () => ({
      target: 'optimize_performance' as PromptTarget,
      title: `Optimize performance for ${process.name}`,
      prompt_text: `${preamble}# OBJECTIVE\n\nOptimize system performance for the "${process.name}" business process.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# WHAT TO IMPROVE\n\n1. Add database query optimization (indexes, eager loading)\n2. Add caching where appropriate (in-memory or Redis)\n3. Optimize API response payloads (select only needed fields)\n4. Add pagination for list endpoints\n5. Review and optimize frontend bundle size\n6. Add performance monitoring and alerts\n\n# CURRENT STATE\n\n- Existing services: ${backend.join(', ') || 'Check backend/src/services/'}\n- Quality score: ${Object.entries(scores).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Unknown'}\n\n# DO NOT\n\n- Premature optimization — measure first\n- Break existing functionality${constraints}${validationSection}`,
      estimated_complexity: 'medium' as const,
      affected_files: [],
    }),

    requirement_implementation: () => {
      // Use unmapped requirements passed via extraContext
      const reqList = extraContext?.unmappedRequirements || [];
      const reqText = reqList.length > 0
        ? reqList.map((r: any, i: number) => `${i + 1}. ${r.requirement_text}`).join('\n')
        : 'No specific requirements loaded — check the Requirements tab for details.';
      return {
        target: 'requirement_implementation' as PromptTarget,
        title: `Implement requirements for ${process.name}`,
        prompt_text: `${preamble}# OBJECTIVE\n\nImplement the unmapped requirements for the "${process.name}" business process.\n\nThe project already has backend services, frontend components, and database models.\nDo NOT rebuild existing infrastructure. Instead, extend the existing codebase to cover these specific requirements.\n\n# BUSINESS CONTEXT\n\n${process.description || 'No description available.'}\n\n# UNMAPPED REQUIREMENTS TO IMPLEMENT\n\n${reqText}\n\n# CURRENT STATE\n\n- Existing backend: ${backend.join(', ') || 'Check backend/src/services/ and backend/src/routes/'}\n- Existing frontend: ${frontend.join(', ') || 'Check frontend/src/pages/ and frontend/src/components/'}\n- Existing agents: ${agents.join(', ') || 'Check backend/src/intelligence/agents/'}\n\n# APPROACH\n\n1. Study the existing codebase structure first\n2. Identify which existing files need to be extended (NOT recreated)\n3. Add new endpoints, services, or components ONLY where they don't exist\n4. Map each requirement to a specific implementation change\n5. Update existing tests or add new ones\n\n# DO NOT\n\n- Create duplicate services or routes that already exist\n- Rebuild the database schema from scratch\n- Create new standalone projects\n- Ignore existing patterns in the codebase${constraints}${validationSection}`,
        estimated_complexity: 'medium' as const,
        affected_files: [],
      };
    },
  };

  return generators[target]();
}

export async function generateAllPrompts(processId: string): Promise<GeneratedPrompt[]> {
  const targets: PromptTarget[] = ['backend_improvement', 'frontend_exposure', 'agent_enhancement', 'hitl_adjustment', 'autonomy_upgrade', 'monitoring_gap'];
  const prompts: GeneratedPrompt[] = [];
  for (const target of targets) {
    try { prompts.push(await generateImprovementPrompt(processId, target)); } catch {}
  }
  return prompts;
}
