// ─── Revenue Opportunity Agent ──────────────────────────────────────────────
// Scans for revenue opportunities across the system.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { scanForOpportunities } from '../../reporting/revenueOpportunityService';

registerAgent({
  name: 'RevenueOpportunityAgent',
  category: 'reporting',
  description: 'Scans for revenue opportunities across the system',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const result = await scanForOpportunities();
      const count = result.opportunities_found;

      return {
        agent_name: 'RevenueOpportunityAgent',
        campaigns_processed: 0,
        entities_processed: count,
        actions_taken: [{
          campaign_id: 'system',
          action: 'scan_revenue_opportunities',
          reason: `Found ${count} revenue opportunities`,
          confidence: 0.8,
          before_state: null,
          after_state: { opportunities_count: count },
          result: 'success',
          entity_type: 'system',
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'RevenueOpportunityAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
