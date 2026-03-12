// ─── Insight Discovery Agent ────────────────────────────────────────────────
// Detects anomalies and patterns across the system, then persists insights.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { detectAnomalies, detectPatterns, persistInsights } from '../../reporting/insightDiscoveryService';

registerAgent({
  name: 'InsightDiscoveryAgent',
  category: 'reporting',
  description: 'Detects anomalies and patterns, then persists discovered insights',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const anomalies = await detectAnomalies('system');
      const patterns = await detectPatterns('system');
      const allInsights = [...anomalies, ...patterns];
      const persisted = await persistInsights(allInsights);
      const totalInsights = anomalies.length + patterns.length;

      return {
        agent_name: 'InsightDiscoveryAgent',
        campaigns_processed: 0,
        entities_processed: totalInsights,
        actions_taken: [
          {
            campaign_id: 'system',
            action: 'detect_anomalies',
            reason: `Detected ${anomalies.length} anomalies`,
            confidence: 0.85,
            before_state: null,
            after_state: { anomalies_count: anomalies.length },
            result: 'success',
            entity_type: 'system',
          },
          {
            campaign_id: 'system',
            action: 'detect_patterns',
            reason: `Detected ${patterns.length} patterns`,
            confidence: 0.85,
            before_state: null,
            after_state: { patterns_count: patterns.length },
            result: 'success',
            entity_type: 'system',
          },
          {
            campaign_id: 'system',
            action: 'persist_insights',
            reason: 'Persisted discovered insights to storage',
            confidence: 0.9,
            before_state: null,
            after_state: { persisted: persisted as any },
            result: 'success',
            entity_type: 'system',
          },
        ],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'InsightDiscoveryAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
