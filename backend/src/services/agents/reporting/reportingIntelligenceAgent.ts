// ─── Reporting Intelligence Agent ───────────────────────────────────────────
// Runs a full system scan via the reporting orchestration service.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { runSystemScan } from '../../reporting/reportingOrchestrationService';

registerAgent({
  name: 'ReportingIntelligenceAgent',
  category: 'reporting',
  description: 'Runs a full system scan and produces reporting intelligence',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const result = await runSystemScan();
      return {
        agent_name: 'ReportingIntelligenceAgent',
        campaigns_processed: 0,
        entities_processed: (result as any)?.scans_completed ?? 0,
        actions_taken: [{
          campaign_id: 'system',
          action: 'system_scan',
          reason: 'Periodic reporting intelligence scan',
          confidence: 0.85,
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
        agent_name: 'ReportingIntelligenceAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
