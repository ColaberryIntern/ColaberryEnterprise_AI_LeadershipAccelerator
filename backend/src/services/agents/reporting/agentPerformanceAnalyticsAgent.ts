// ─── Agent Performance Analytics Agent ──────────────────────────────────────
// Computes agent KPIs and creates insights for low-performing agents.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult, AgentAction } from '../types';
import { computeAgentKPIs } from '../../reporting/agentPerformanceService';

registerAgent({
  name: 'AgentPerformanceAnalyticsAgent',
  category: 'reporting',
  description: 'Computes agent KPIs and flags low-performing agents',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const kpis = await computeAgentKPIs();
      const agentKPIs = Array.isArray(kpis) ? kpis : [];
      const actions: AgentAction[] = [];

      // Flag low-performing agents
      for (const agentKpi of agentKPIs) {
        const successRate = (agentKpi as any).success_rate ?? 1;
        const agentId = (agentKpi as any).agent_name ?? (agentKpi as any).id ?? 'unknown';

        if (successRate < 0.7) {
          actions.push({
            campaign_id: 'system',
            action: 'flag_low_performance',
            reason: `Agent ${agentId} has ${Math.round(successRate * 100)}% success rate`,
            confidence: 0.85,
            before_state: { success_rate: successRate },
            after_state: { flagged: true, agent: agentId },
            result: 'flagged',
            entity_type: 'agent',
            entity_id: String(agentId),
          });
        }
      }

      // Add summary action
      actions.push({
        campaign_id: 'system',
        action: 'compute_agent_kpis',
        reason: `Analyzed ${agentKPIs.length} agents, flagged ${actions.length} low performers`,
        confidence: 0.9,
        before_state: null,
        after_state: { total_agents: agentKPIs.length, flagged: actions.length },
        result: 'success',
        entity_type: 'system',
      });

      return {
        agent_name: 'AgentPerformanceAnalyticsAgent',
        campaigns_processed: 0,
        entities_processed: agentKPIs.length,
        actions_taken: actions,
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'AgentPerformanceAnalyticsAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
