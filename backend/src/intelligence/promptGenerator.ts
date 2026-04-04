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

  const generators: Record<PromptTarget, () => GeneratedPrompt> = {
    backend_improvement: () => ({
      target: 'backend_improvement',
      title: `Improve backend for ${process.name}`,
      prompt_text: `You are improving the "${process.name}" business process.\n\nCurrent backend services: ${backend.join(', ') || 'None'}\nCurrent scores: Determinism ${scores.determinism || 0}/100, Reliability ${scores.reliability || 0}/100\n\nImprovements needed:\n${evolution.improvement_areas.map(a => `- ${a}`).join('\n')}\n\nTasks:\n1. Add input validation and error handling to existing services\n2. Add retry logic with exponential backoff\n3. Add structured logging for observability\n4. Write unit tests for critical paths\n\nDo NOT break existing functionality. All changes must be additive.`,
      estimated_complexity: 'medium',
      affected_files: backend.map(s => `backend/src/services/${s}.ts`),
    }),

    frontend_exposure: () => ({
      target: 'frontend_exposure',
      title: `Add UI for ${process.name}`,
      prompt_text: `You are adding frontend visibility for the "${process.name}" business process.\n\nCurrent frontend components: ${frontend.join(', ') || 'None'}\nCurrent UX Exposure score: ${scores.ux_exposure || 0}/100\n\nTasks:\n1. Create an admin panel showing process health, agent status, and recent activity\n2. Add status badges and progress indicators\n3. Follow Bootstrap 5 design system with var(--color-*) tokens\n4. Add to the Intelligence OS page as a new tab or panel\n\nDesign for enterprise executives (clean, scannable, professional).`,
      estimated_complexity: 'medium',
      affected_files: frontend.map(c => `frontend/src/components/${c}.tsx`),
    }),

    agent_enhancement: () => ({
      target: 'agent_enhancement',
      title: `Enhance agents for ${process.name}`,
      prompt_text: `You are enhancing the agents powering "${process.name}".\n\nLinked agents: ${agents.join(', ')}\nCurrent AI Maturity: ${scores.ai_maturity || 0}/100\n\nAgent gaps:\n${evolution.agent_recommendations.map(r => `- ${r.agent_name} (${r.status}): ${r.recommendations.join(', ')}`).join('\n')}\n\nTasks:\n1. Fix any errored agents\n2. Add missing agents\n3. Improve prompt quality for LLM-based agents\n4. Add memory/learning loops where applicable\n5. Register all new agents in agentRegistry.ts\n\nFollow existing agent patterns in backend/src/intelligence/agents/.`,
      estimated_complexity: 'large',
      affected_files: agents.map(a => `backend/src/intelligence/agents/${a}.ts`),
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
