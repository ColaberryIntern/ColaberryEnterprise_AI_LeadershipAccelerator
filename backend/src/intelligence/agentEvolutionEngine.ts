/**
 * Agent Evolution Engine — detects gaps and suggests improvements per business process.
 */
import Capability from '../models/Capability';
import AiAgent from '../models/AiAgent';

export interface AgentRecommendation {
  agent_name: string;
  status: 'active' | 'missing' | 'errored';
  recommendations: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface EvolutionReport {
  process_id: string;
  process_name: string;
  overall_maturity: number;
  agent_recommendations: AgentRecommendation[];
  missing_monitoring: string[];
  missing_frontend: string[];
  improvement_areas: string[];
}

export async function analyzeProcessEvolution(processId: string): Promise<EvolutionReport> {
  const process = await Capability.findByPk(processId);
  if (!process) throw new Error('Process not found');

  const scores = process.strength_scores || {};
  const overall = scores.overall || 0;
  const agents = process.linked_agents || [];
  const frontend = process.linked_frontend_components || [];

  // Check agent health
  const agentRecords = await AiAgent.findAll();
  const agentMap = new Map(agentRecords.map(a => [a.agent_name, a]));

  const recommendations: AgentRecommendation[] = [];
  for (const name of agents) {
    const agent = agentMap.get(name);
    if (!agent) {
      recommendations.push({ agent_name: name, status: 'missing', recommendations: ['Create this agent — it is referenced but does not exist in the registry'], priority: 'high' });
    } else if ((agent as any).status === 'error') {
      recommendations.push({ agent_name: name, status: 'errored', recommendations: ['Fix errors in this agent', 'Add retry logic', 'Improve error handling'], priority: 'high' });
    } else {
      const recs: string[] = [];
      if ((agent as any).error_count > 5) recs.push('Reduce error rate — add input validation');
      if (!(agent as any).schedule) recs.push('Add scheduled execution for proactive monitoring');
      if (recs.length > 0) recommendations.push({ agent_name: name, status: 'active', recommendations: recs, priority: 'medium' });
    }
  }

  // Identify missing monitoring
  const missing_monitoring: string[] = [];
  if ((scores.observability || 0) < 50) missing_monitoring.push('Add KPI tracking for this process');
  if ((scores.observability || 0) < 30) missing_monitoring.push('Add anomaly detection alerts');

  // Identify missing frontend
  const missing_frontend: string[] = [];
  if ((scores.ux_exposure || 0) < 40) missing_frontend.push('Create admin dashboard panel for this process');
  if (frontend.length === 0) missing_frontend.push('No frontend components — users cannot interact with this process');

  // General improvement areas
  const improvement_areas: string[] = [];
  if ((scores.determinism || 0) < 50) improvement_areas.push('Increase determinism: move logic from LLM to code');
  if ((scores.reliability || 0) < 50) improvement_areas.push('Improve reliability: add retry logic and fallbacks');
  if ((scores.automation || 0) < 50) improvement_areas.push('Increase automation: convert manual steps to agent-driven');
  if ((scores.ai_maturity || 0) < 50) improvement_areas.push('Enhance AI: add learning loops and memory');
  if ((scores.human_dependency || 0) > 70) improvement_areas.push('Reduce human dependency: lower approval thresholds');

  return { process_id: processId, process_name: process.name, overall_maturity: overall, agent_recommendations: recommendations, missing_monitoring, missing_frontend, improvement_areas };
}
