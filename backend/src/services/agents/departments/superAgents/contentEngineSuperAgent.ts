/**
 * Content Engine Super Agent — supervises the `marketing` agent group.
 *
 * REPOINTED 2026-10-07 from `content_engine` to `marketing`, and the reason is worth keeping.
 *
 * `content_engine` could never have members. AGENT_GROUP_MAP defined it as a duplicate subset of
 * `campaign_ops` (ContentOptimizationAgent, ConversationOptimizationAgent appeared under both),
 * and `assignAgentGroups` only writes where `agent_group IS NULL`, so `campaign_ops` claimed both
 * agents first and the second listing was a silent no-op. Since `agent_group` is a single column,
 * a group defined as a subset of another is structurally empty by construction. This agent
 * therefore wrote 9,412 consecutive "0/0 healthy" reports between 2026-03-17 and 2026-10-06 and
 * nothing failed.
 *
 * Meanwhile the `marketing` group now exists with a real member and NO supervisor — all eight
 * super agents pointed elsewhere. So an idle supervisor sat beside an unsupervised department.
 *
 * Three scripts (coryProductionBoot, finalActivation, goLiveOrchestration) already declare this
 * agent as `department: 'Marketing'`, so this makes the code agree with its own stated intent
 * rather than inventing a new arrangement.
 *
 * The `agent_name` is deliberately UNCHANGED. `ai_agents` rows are keyed on it, so renaming would
 * mint a new row and orphan this one's 9,412 historical reports and its run counters. The name is
 * now historical; that is cheaper than a migration to make a label read better. Its DepartmentReport
 * `department` does change to "Marketing", which is what the COO dashboard card renders.
 */

import { runSuperAgentCycle } from './superAgentBase';

export async function executeContentEngineSuperAgent(agentId: string, config: Record<string, any>) {
  const start = Date.now();
  const result = await runSuperAgentCycle('marketing', 'Marketing', 'ContentEngineSuperAgent');
  return {
    agent_name: 'ContentEngineSuperAgent',
    duration_ms: Date.now() - start,
    actions_taken: [{ campaign_id: '', action: 'department_report', reason: `${result.department} health check`, confidence: 1, before_state: null, after_state: { anomalies: result.anomalies.length }, result: 'success' as const }],
    campaigns_processed: 0,
    errors: [],
  };
}
