// ─── Visualization Agent ────────────────────────────────────────────────────
// No-op agent — visualization specs are generated on-demand by the frontend.
// This agent exists only to satisfy the registry; it returns a success stub.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';

registerAgent({
  name: 'VisualizationAgent',
  category: 'reporting',
  description: 'On-demand agent that generates chart visualization specs from data',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    return {
      agent_name: 'VisualizationAgent',
      campaigns_processed: 0,
      entities_processed: 0,
      actions_taken: [{
        campaign_id: 'system',
        action: 'visualization_noop',
        reason: 'Visualization specs are generated on-demand; no periodic work needed',
        confidence: 1.0,
        before_state: null,
        after_state: { status: 'noop' },
        result: 'success',
        entity_type: 'system',
      }],
      errors: [],
      duration_ms: Date.now() - start,
    };
  },
});
