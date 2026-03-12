// ─── Governance Agent ────────────────────────────────────────────────────────
// Enforces guardrails: max actions/hour, risk budget, resource caps.
// Runs every 10 minutes to check compliance.

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { registerAgent } from './agentRegistry';
import { Op } from 'sequelize';
import { resolveGlobalConfig, HARDCODED_DEFAULTS } from '../../services/governanceResolutionService';

// ─── Guardrails (hardcoded fallback — DB values preferred via resolveGlobalConfig) ─

const GUARDRAILS_FALLBACK = {
  max_auto_executions_per_hour: HARDCODED_DEFAULTS.max_auto_executions_per_hour,
  max_risk_budget_per_hour: HARDCODED_DEFAULTS.max_risk_budget_per_hour,
  max_proposed_pending: HARDCODED_DEFAULTS.max_proposed_pending,
  max_concurrent_monitoring: HARDCODED_DEFAULTS.max_concurrent_monitoring,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GovernanceReport {
  compliant: boolean;
  violations: string[];
  metrics: {
    auto_executions_last_hour: number;
    risk_budget_used: number;
    pending_proposals: number;
    active_monitoring: number;
  };
  actions_taken: string[];
}

// ─── Enforcement ─────────────────────────────────────────────────────────────

/**
 * Check governance guardrails and enforce limits.
 */
export async function enforceGovernance(): Promise<GovernanceReport> {
  const violations: string[] = [];
  const actionsTaken: string[] = [];

  // Resolve guardrails from governance DB (falls back to hardcoded on error)
  let GUARDRAILS = GUARDRAILS_FALLBACK;
  try {
    const config = await resolveGlobalConfig();
    GUARDRAILS = {
      max_auto_executions_per_hour: config.max_auto_executions_per_hour,
      max_risk_budget_per_hour: config.max_risk_budget_per_hour,
      max_proposed_pending: config.max_proposed_pending,
      max_concurrent_monitoring: config.max_concurrent_monitoring,
    };
  } catch {
    // Fall back to hardcoded defaults
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // 1. Count auto-executions in last hour
  let autoExecutions = 0;
  let riskBudget = 0;
  try {
    const recentExecutions = await IntelligenceDecision.findAll({
      where: {
        executed_by: 'auto',
        executed_at: { [Op.gte]: oneHourAgo },
      },
      attributes: ['risk_score'],
    });
    autoExecutions = recentExecutions.length;
    riskBudget = recentExecutions.reduce((sum, d) => sum + (d.get('risk_score') as number || 0), 0);
  } catch {
    // Table may not exist
  }

  if (autoExecutions > GUARDRAILS.max_auto_executions_per_hour) {
    violations.push(`Auto-executions exceed limit: ${autoExecutions}/${GUARDRAILS.max_auto_executions_per_hour}`);
  }

  if (riskBudget > GUARDRAILS.max_risk_budget_per_hour) {
    violations.push(`Risk budget exceeded: ${riskBudget}/${GUARDRAILS.max_risk_budget_per_hour}`);
  }

  // 2. Count pending proposals
  let pendingProposals = 0;
  try {
    pendingProposals = await IntelligenceDecision.count({
      where: { execution_status: 'proposed' },
    });
  } catch {
    // Table may not exist
  }

  if (pendingProposals > GUARDRAILS.max_proposed_pending) {
    violations.push(`Too many pending proposals: ${pendingProposals}/${GUARDRAILS.max_proposed_pending}`);
    // Auto-reject oldest proposals beyond limit
    try {
      const oldest = await IntelligenceDecision.findAll({
        where: { execution_status: 'proposed' },
        order: [['timestamp', 'ASC']],
        limit: pendingProposals - GUARDRAILS.max_proposed_pending,
      });
      for (const d of oldest) {
        await d.update({ execution_status: 'rejected', reasoning: (d.get('reasoning') || '') + '\n[Governance] Auto-rejected: proposal queue overflow' });
      }
      actionsTaken.push(`Auto-rejected ${oldest.length} stale proposals`);
    } catch {
      // Non-critical
    }
  }

  // 3. Count active monitoring
  let activeMonitoring = 0;
  try {
    activeMonitoring = await IntelligenceDecision.count({
      where: { execution_status: 'monitoring' },
    });
  } catch {
    // Table may not exist
  }

  if (activeMonitoring > GUARDRAILS.max_concurrent_monitoring) {
    violations.push(`Too many active monitors: ${activeMonitoring}/${GUARDRAILS.max_concurrent_monitoring}`);
  }

  const compliant = violations.length === 0;

  if (!compliant) {
    console.log(`[GovernanceAgent] ${violations.length} violation(s): ${violations.join('; ')}`);
  }

  return {
    compliant,
    violations,
    metrics: {
      auto_executions_last_hour: autoExecutions,
      risk_budget_used: riskBudget,
      pending_proposals: pendingProposals,
      active_monitoring: activeMonitoring,
    },
    actions_taken: actionsTaken,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'GovernanceAgent',
  category: 'strategy',
  description: 'Enforce guardrails: max actions/hour, risk budget, resource caps',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const report = await enforceGovernance();
      return {
        agent_name: 'GovernanceAgent',
        campaigns_processed: 0,
        actions_taken: report.violations.map((v) => ({
          campaign_id: 'system',
          action: 'governance_violation',
          reason: v,
          confidence: 1,
          before_state: null,
          after_state: report.metrics as any,
          result: report.compliant ? ('success' as const) : ('failed' as const),
          entity_type: 'system' as const,
        })),
        errors: report.compliant ? [] : report.violations,
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'GovernanceAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
