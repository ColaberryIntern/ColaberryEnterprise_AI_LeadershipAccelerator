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
import IntelligenceDecision from '../../models/IntelligenceDecision';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import { logAiEvent } from '../../services/aiEventService';

// ─── Insight Dedup Window ────────────────────────────────────────────────────
// Before inserting a new insight, check if an identical problem_detected exists
// within the last 60 minutes. If so, update observation_count + last_seen_at
// instead of creating a duplicate row.

const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

async function upsertInsight(attrs: Record<string, any>): Promise<boolean> {
  const existing = await IntelligenceDecision.findOne({
    where: {
      problem_detected: attrs.problem_detected,
      timestamp: { [Op.gte]: new Date(Date.now() - DEDUP_WINDOW_MS) },
    },
    order: [['timestamp', 'DESC']],
  });

  if (existing) {
    await existing.update({
      observation_count: (existing.observation_count || 1) + 1,
      last_seen_at: new Date(),
    });
    return false; // not a new row
  }

  await IntelligenceDecision.create(attrs as any);
  return true; // new row created
}

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

  // ─── Persist insights to intelligence_decisions table ──────────────────────
  const traceId = uuidv4();
  let persistedCount = 0;

  try {
    const sharedContext = {
      overview: { risk_areas: overview.risk_areas, opportunity_areas: overview.opportunity_areas, fleet: overview.agent_fleet_health },
      revenue: { bottleneck: revenue.bottleneck, at_risk: revenue.estimated_revenue_at_risk },
      governance: { compliant: governance.compliant, violations_count: governance.violations.length },
    };

    // Persist each risk area as a decision (deduped within 60min window)
    for (const risk of overview.risk_areas) {
      const isNew = await upsertInsight({
        trace_id: traceId,
        problem_detected: `Risk detected: ${risk}`,
        analysis_summary: executiveSummary.join('. '),
        risk_score: Math.min(80, 40 + overview.risk_areas.length * 10),
        confidence_score: 70,
        risk_tier: overview.risk_areas.length > 3 ? 'risky' : 'moderate',
        execution_status: 'proposed',
        reasoning: `Identified during strategic cycle. ${overview.risk_areas.length} total risks detected.`,
        action_details: sharedContext,
      });
      if (isNew) persistedCount++;
    }

    // Persist revenue bottleneck (deduped)
    if (revenue.bottleneck) {
      const isNew = await upsertInsight({
        trace_id: traceId,
        problem_detected: `Revenue bottleneck: ${revenue.bottleneck}`,
        analysis_summary: `Estimated revenue at risk: $${revenue.estimated_revenue_at_risk}`,
        recommended_action: 'update_campaign_config',
        risk_score: revenue.estimated_revenue_at_risk > 10000 ? 70 : 40,
        confidence_score: 65,
        risk_tier: revenue.estimated_revenue_at_risk > 10000 ? 'moderate' : 'safe',
        execution_status: 'proposed',
        reasoning: `Revenue funnel analysis detected bottleneck. ${revenue.recommendations.length} recommendations available.`,
        action_details: { bottleneck: revenue.bottleneck, recommendations: revenue.recommendations, funnel_stages: revenue.funnel_stages },
      });
      if (isNew) persistedCount++;
    }

    // Persist experiment proposals (deduped)
    for (const experiment of experiments) {
      const isNew = await upsertInsight({
        trace_id: traceId,
        problem_detected: `Experiment proposed: ${experiment.hypothesis || 'Growth experiment'}`,
        analysis_summary: `${experiment.hypothesis} — ${experiment.metric} over ${experiment.duration_hours}h (${experiment.control} vs ${experiment.variant})`,
        recommended_action: 'launch_ab_test',
        risk_score: 20,
        confidence_score: 60,
        risk_tier: 'safe',
        execution_status: 'proposed',
        reasoning: `Growth experiment agent proposed this experiment during strategic cycle.`,
        action_details: experiment,
      });
      if (isNew) persistedCount++;
    }

    // Persist governance violations (deduped)
    for (const violation of governance.violations) {
      const isNew = await upsertInsight({
        trace_id: traceId,
        problem_detected: `Governance violation: ${typeof violation === 'string' ? violation : JSON.stringify(violation)}`,
        analysis_summary: `Governance compliance check failed. ${governance.violations.length} violation(s) detected.`,
        risk_score: 75,
        confidence_score: 90,
        risk_tier: 'risky',
        execution_status: 'proposed',
        reasoning: `Governance agent flagged this violation during strategic cycle.`,
        action_details: { violation, metrics: governance.metrics },
      });
      if (isNew) persistedCount++;
    }

    if (persistedCount > 0) {
      await logAiEvent('AICOOStrategicCycle', 'insights_persisted', 'intelligence_decisions', traceId, {
        count: persistedCount,
        risks: overview.risk_areas.length,
        experiments: experiments.length,
        violations: governance.violations.length,
        has_bottleneck: !!revenue.bottleneck,
      });
      console.log(`[AI COO] Persisted ${persistedCount} insights to intelligence_decisions (trace: ${traceId})`);
    }
  } catch (err) {
    console.error('[AI COO] Failed to persist insights:', err);
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
