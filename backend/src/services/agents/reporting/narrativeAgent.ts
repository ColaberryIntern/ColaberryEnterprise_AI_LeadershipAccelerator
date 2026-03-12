// ─── Narrative Agent ────────────────────────────────────────────────────────
// Generates human-readable narratives from recent insights.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { generateNarrative } from '../../reporting/narrativeService';

registerAgent({
  name: 'NarrativeAgent',
  category: 'reporting',
  description: 'Generates human-readable narratives from recent insights',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const narrative = await generateNarrative({});
      return {
        agent_name: 'NarrativeAgent',
        campaigns_processed: 0,
        entities_processed: 1,
        actions_taken: [{
          campaign_id: 'system',
          action: 'generate_narrative',
          reason: 'Generated narrative from recent insights',
          confidence: 0.8,
          before_state: null,
          after_state: { narrative_length: (narrative as any)?.length ?? 0 },
          result: 'success',
          entity_type: 'system',
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'NarrativeAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
