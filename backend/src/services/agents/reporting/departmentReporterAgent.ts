// ─── Department Reporter Agent ──────────────────────────────────────────────
// Parametric agent: reads config.department and snapshots KPIs for that department.

import { registerAgent } from '../../../intelligence/agents/agentRegistry';
import type { AgentExecutionResult } from '../types';
import { snapshotKPIs } from '../../reporting/kpiService';

registerAgent({
  name: 'DepartmentReporterAgent',
  category: 'reporting',
  description: 'Parametric agent that snapshots KPIs for a configured department',
  executor: async (_agentId, config): Promise<AgentExecutionResult> => {
    const start = Date.now();
    const department: string = config.department ?? 'general';
    const agentName = config.agent_name ?? `${department.charAt(0).toUpperCase() + department.slice(1)}ReportingAgent`;

    try {
      const snapshot = await snapshotKPIs('department', department, department, 'daily', agentName);
      return {
        agent_name: agentName,
        campaigns_processed: 0,
        entities_processed: (snapshot as any)?.kpi_count ?? 1,
        actions_taken: [{
          campaign_id: 'system',
          action: 'snapshot_department_kpis',
          reason: `Daily KPI snapshot for ${department} department`,
          confidence: 0.9,
          before_state: null,
          after_state: snapshot as any,
          result: 'success',
          entity_type: 'system',
          entity_id: department,
        }],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: agentName,
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
