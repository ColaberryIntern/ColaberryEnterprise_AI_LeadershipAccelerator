// ─── Knowledge Graph Builder Agent ──────────────────────────────────────────
// Builds the Cory knowledge graph from system entities and relationships.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { buildGraph } from '../../reporting/coryKnowledgeGraphService';

registerAgent({
  name: 'KnowledgeGraphBuilderAgent',
  category: 'reporting',
  description: 'Builds the Cory knowledge graph from system entities and relationships',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const result = await buildGraph();
      return {
        agent_name: 'KnowledgeGraphBuilderAgent',
        campaigns_processed: 0,
        entities_processed: (result as any)?.nodes_created ?? 0,
        actions_taken: [{
          campaign_id: 'system',
          action: 'build_knowledge_graph',
          reason: 'Periodic knowledge graph rebuild',
          confidence: 0.9,
          before_state: null,
          after_state: result as any,
          result: 'success',
          entity_type: 'system',
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'KnowledgeGraphBuilderAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
