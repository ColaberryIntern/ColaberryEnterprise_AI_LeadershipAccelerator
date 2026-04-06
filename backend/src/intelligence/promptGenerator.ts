/**
 * Prompt Generator — template-based, Claude Code compatible prompts for system improvements.
 */
import Capability from '../models/Capability';
import { analyzeProcessEvolution } from './agentEvolutionEngine';

export type PromptTarget = 'backend_improvement' | 'frontend_exposure' | 'agent_enhancement' | 'hitl_adjustment' | 'autonomy_upgrade' | 'monitoring_gap';

export interface GeneratedPrompt {
  target: PromptTarget;
  title: string;
  prompt_text: string;
  estimated_complexity: 'small' | 'medium' | 'large';
  affected_files: string[];
}

export async function generateImprovementPrompt(processId: string, target: PromptTarget): Promise<GeneratedPrompt> {
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
