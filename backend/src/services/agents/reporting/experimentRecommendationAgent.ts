// ─── Experiment Recommendation Agent ────────────────────────────────────────
// Proposes experiments based on recent high-scoring insights.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult, AgentAction } from '../types';
import { detectAnomalies } from '../../reporting/insightDiscoveryService';
import { proposeExperiment } from '../../reporting/experimentService';

registerAgent({
  name: 'ExperimentRecommendationAgent',
  category: 'reporting',
  description: 'Proposes experiments based on recent high-scoring insights',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const insights = await detectAnomalies('system');
      const highScoring = Array.isArray(insights)
        ? insights.filter((i: any) => (i.score ?? i.confidence ?? 0) >= 0.7)
        : [];

      const actions: AgentAction[] = [];
      const errors: string[] = [];

      for (const insight of highScoring) {
        try {
          const experiment = await proposeExperiment(insight);
          actions.push({
            campaign_id: 'system',
            action: 'propose_experiment',
            reason: `Proposed experiment for insight: ${(insight as any).title ?? (insight as any).id ?? 'unknown'}`,
            confidence: 0.75,
            before_state: { insight: insight as any },
            after_state: { experiment: experiment as any },
            result: 'success',
            entity_type: 'system',
          });
        } catch (err: any) {
          errors.push(`Failed to propose experiment for insight: ${err.message}`);
        }
      }

      return {
        agent_name: 'ExperimentRecommendationAgent',
        campaigns_processed: 0,
        entities_processed: highScoring.length,
        actions_taken: actions,
        errors,
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'ExperimentRecommendationAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
