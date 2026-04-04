/**
 * Process Scoring Engine — 7 dimensions (0-100 each)
 */
import Capability from '../models/Capability';
import AiAgent from '../models/AiAgent';
import { SYSTEM_PLATFORM_PROJECT_ID } from '../services/businessProcessSeedService';

export interface ProcessScores {
  determinism: number;
  reliability: number;
  observability: number;
  ux_exposure: number;
  automation: number;
  ai_maturity: number;
  human_dependency: number;
  overall: number;
}

export async function scoreProcess(processId: string): Promise<ProcessScores> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');

  const agents = process.linked_agents || [];
  const backend = process.linked_backend_services || [];
  const frontend = process.linked_frontend_components || [];

  // 1. Determinism: based on number of services (more code = more deterministic logic)
  const determinism = Math.min(100, backend.length * 15 + 20);

  // 2. Reliability: based on agent count and existing health data
  let reliability = 50;
  if (agents.length > 0) {
    const agentRecords = await AiAgent.findAll({ where: { status: 'active' } });
    const linkedActive = agentRecords.filter(a => agents.includes(a.agent_name));
    reliability = linkedActive.length > 0 ? Math.min(100, (linkedActive.length / agents.length) * 80 + 20) : 30;
  }

  // 3. Observability: based on having backend services (logging) and agents (monitoring)
  const observability = Math.min(100, backend.length * 10 + agents.length * 15 + 10);

  // 4. UX Exposure: based on frontend components
  const ux_exposure = Math.min(100, frontend.length * 20 + 10);

  // 5. Automation: based on agent count and autonomy level
  const autonomyBonus = { manual: 0, assisted: 15, supervised: 30, autonomous: 50 }[process.autonomy_level] || 0;
  const automation = Math.min(100, agents.length * 12 + autonomyBonus);

  // 6. AI Maturity: based on having agents + LLM usage + learning
  const ai_maturity = Math.min(100, agents.length * 15 + (process.autonomy_level !== 'manual' ? 20 : 0) + (process.success_rate ? process.success_rate * 30 : 0));

  // 7. Human Dependency: inverse of automation and approval rate
  const approvalRate = process.approval_dependency_pct || 0.5;
  const human_dependency = Math.max(0, Math.min(100, 100 - (automation * 0.5 + (1 - approvalRate) * 50)));

  const scores: ProcessScores = {
    determinism: Math.round(determinism),
    reliability: Math.round(reliability),
    observability: Math.round(observability),
    ux_exposure: Math.round(ux_exposure),
    automation: Math.round(automation),
    ai_maturity: Math.round(ai_maturity),
    human_dependency: Math.round(human_dependency),
    overall: 0,
  };
  scores.overall = Math.round(Object.values(scores).reduce((sum, v) => sum + v, 0) / 7);

  // Cache on process
  process.strength_scores = scores as any;
  process.last_evaluated_at = new Date();
  await process.save();

  return scores;
}

export async function scoreAllProcesses(): Promise<Array<{ id: string; name: string; scores: ProcessScores }>> {
  const processes = await Capability.findAll({ where: { process_type: 'platform_process' } });
  const results = [];
  for (const p of processes) {
    try {
      const scores = await scoreProcess(p.id);
      results.push({ id: p.id, name: p.name, scores });
    } catch {}
  }
  return results;
}
