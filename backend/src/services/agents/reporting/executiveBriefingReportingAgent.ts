// ─── Executive Briefing Reporting Agent ─────────────────────────────────────
// Aggregates system KPIs and top insights, then generates an executive summary.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { snapshotKPIs } from '../../reporting/kpiService';
import { detectAnomalies } from '../../reporting/insightDiscoveryService';
import { generateExecutiveSummary } from '../../reporting/narrativeService';

registerAgent({
  name: 'ExecutiveBriefingReportingAgent',
  category: 'reporting',
  description: 'Aggregates system KPIs and top insights into an executive summary',
  executor: async (_agentId, _config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    try {
      const kpis = await snapshotKPIs('system', 'all', 'all', 'daily', 'ExecutiveBriefingReportingAgent');
      const insights = await detectAnomalies('system');
      const summary = await generateExecutiveSummary(insights, kpis);

      return {
        agent_name: 'ExecutiveBriefingReportingAgent',
        campaigns_processed: 0,
        entities_processed: 1,
        actions_taken: [{
          campaign_id: 'system',
          action: 'generate_executive_briefing',
          reason: 'Daily executive briefing with KPIs and top insights',
          confidence: 0.85,
          before_state: null,
          after_state: { summary_length: (summary as any)?.length ?? 0, kpi_count: (kpis as any)?.kpi_count ?? 0 },
          result: 'success',
          entity_type: 'system',
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'ExecutiveBriefingReportingAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
