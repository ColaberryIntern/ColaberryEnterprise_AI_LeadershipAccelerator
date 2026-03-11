// ─── AI COO ──────────────────────────────────────────────────────────────────
// Strategic orchestrator that runs every 30 minutes. Coordinates strategy
// agents to produce a holistic report: problems, priorities, cost savings,
// experiments, and governance compliance.

import { gatherStrategicIntelligence, type StrategicOverview } from '../agents/StrategicIntelligenceAgent';
import { analyzeRevenueFunnel, type RevenueInsight } from '../agents/RevenueOptimizationAgent';
import { analyzeCostEfficiency, type CostInsight } from '../agents/CostOptimizationAgent';
import { proposeGrowthExperiments, type ExperimentProposal } from '../agents/GrowthExperimentAgent';
import { enforceGovernance, type GovernanceReport } from '../agents/GovernanceAgent';
import { getVectorMemory } from '../memory/vectorMemory';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StrategicReport {
  timestamp: string;
  overview: StrategicOverview;
  revenue: RevenueInsight;
  cost: CostInsight;
  experiments: ExperimentProposal[];
  governance: GovernanceReport;
  executive_summary: string[];
  duration_ms: number;
}

// ─── Cached Report ──────────────────────────────────────────────────────────

let _lastReport: StrategicReport | null = null;

/**
 * Return the most recent strategic report without triggering a new cycle.
 */
export function getLatestStrategicReport(): StrategicReport | null {
  return _lastReport;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Run the full strategic cycle coordinating all strategy agents.
 */
export async function runStrategicCycle(): Promise<StrategicReport> {
  const start = Date.now();

  // Run strategy agents in parallel where possible
  const [overviewResult, revenueResult, costResult, experimentsResult, governanceResult] =
    await Promise.allSettled([
      gatherStrategicIntelligence(),
      analyzeRevenueFunnel(),
      analyzeCostEfficiency(),
      proposeGrowthExperiments(),
      enforceGovernance(),
    ]);

  const overview = overviewResult.status === 'fulfilled'
    ? overviewResult.value
    : { entity_kpis: {}, systemic_patterns: [], risk_areas: [], opportunity_areas: [], agent_fleet_health: { total: 0, healthy: 0, errored: 0, paused: 0 } };

  const revenue = revenueResult.status === 'fulfilled'
    ? revenueResult.value
    : { funnel_stages: [], bottleneck: null, estimated_revenue_at_risk: 0, recommendations: [] };

  const cost = costResult.status === 'fulfilled'
    ? costResult.value
    : { inefficient_agents: [], total_compute_minutes: 0, recommendations: [] };

  const experiments = experimentsResult.status === 'fulfilled'
    ? experimentsResult.value
    : [];

  const governance = governanceResult.status === 'fulfilled'
    ? governanceResult.value
    : { compliant: true, violations: [], metrics: { auto_executions_last_hour: 0, risk_budget_used: 0, pending_proposals: 0, active_monitoring: 0 }, actions_taken: [] };

  // Build executive summary
  const executiveSummary: string[] = [];

  const fleet = overview.agent_fleet_health;
  executiveSummary.push(`Agent fleet: ${fleet.healthy}/${fleet.total} healthy, ${fleet.errored} errored`);

  if (overview.risk_areas.length > 0) {
    executiveSummary.push(`Risks: ${overview.risk_areas.slice(0, 2).join('; ')}`);
  }

  if (revenue.bottleneck) {
    executiveSummary.push(`Revenue bottleneck: ${revenue.bottleneck}`);
  }

  if (cost.inefficient_agents.length > 0) {
    executiveSummary.push(`${cost.inefficient_agents.length} agents flagged for efficiency review`);
  }

  if (experiments.length > 0) {
    executiveSummary.push(`${experiments.length} experiment(s) proposed`);
  }

  if (!governance.compliant) {
    executiveSummary.push(`Governance: ${governance.violations.length} violation(s)`);
  }

  const durationMs = Date.now() - start;

  // Store summary in vector memory
  try {
    const memory = getVectorMemory();
    await memory.store('insight', `Strategic Report: ${executiveSummary.join('. ')}`, {
      type: 'strategic_report',
      timestamp: new Date().toISOString(),
      risk_count: overview.risk_areas.length,
      opportunity_count: overview.opportunity_areas.length,
      governance_compliant: governance.compliant,
    });
  } catch {
    // Non-critical
  }

  if (executiveSummary.length > 0) {
    console.log(`[AI COO] Strategic cycle: ${executiveSummary.join(' | ')} [${durationMs}ms]`);
  }

  const report: StrategicReport = {
    timestamp: new Date().toISOString(),
    overview,
    revenue,
    cost,
    experiments,
    governance,
    executive_summary: executiveSummary,
    duration_ms: durationMs,
  };

  _lastReport = report;
  return report;
}
